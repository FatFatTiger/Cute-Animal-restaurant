'use strict';

/**
 * E7 + Phase 1 · 渲染层（纯逻辑 → 绘制指令，零 canvas / 零 wx 依赖）
 *
 * 设计纪律（见 production/sprint-2.md EL-E7-001，pivot 2026-07-29 至微信原生 canvas2d）：
 *  - 所有 build*(state) 均为**纯函数**：接收逻辑层只读状态，返回「绘制指令数组」，
 *    不持有任何引擎/canvas 上下文，便于在 Node 下单测（tests/unit/ui-state.spec.js）。
 *  - applyCommands(ctx, cmds) 把指令落到微信原生 2d 上下文（wx.createCanvas().getContext('2d')）；
 *    ctx 为空时安全返回（node 守卫）。
 *  - 不引入 Cocos / 引擎；只用微信原生 canvas 2d，保持主包 <4MB。
 *  - 不重写 src/ 逻辑（E4/E11/E12/E3 仅被引用）；本文件只把状态「画出来」。
 *  - 零位图（不变量 #1）：所有视觉为运行时 canvas 2d 程序化图元（arc / roundRect / ellipse /
 *    quadratic/bezier path / 渐变）。新增动物/场景 = 新增绘制调用，零贴图字节。
 *  - 家族硬隔离（不变量 #2）：角色绘制走 appendCritter 统一入口；跨家族组合在调用侧拒绝。
 *
 * 状态订阅契约：UI 不持有游戏状态，状态全部来自 Restaurant / GachaEngine / Ledger 的
 * 只读 getter（state 由 game.js 每帧组装）。本层只负责「状态 → 视图」。
 *
 * 修订：2026-07-29 pivot to canvas2d（用户 OP1-A）：原 Cocos Creator + 微信引擎插件方案改为
 * 微信原生 canvas2d；删除 Spine / ASTC / WebGL shader tint 表述，保真靠程序化图元 + 分层 fill。
 */

// 集中锁参（纯 JS，零 wx；不变量纪律：概率/保底/成本只从此读，不硬编码）
const { LOCKED, TUNED } = require('../config/tunables');

// ─────────────────────────────────────────────────────────────────────────
// 视觉身份（art-bible 锁定，非开发占位）
// 基底色板取自 art/art-bible.md §3.1 暖奶油马卡龙核心四色 + §10.3 场景 accent。
// 任何改动本区须与美术圣经对齐；回归暗色（如旧开发占位 #1a1a2e）即视觉身份漂移
// （K2，见 production/art-review-2026-07-30.md）。仅渲染层颜色常量，非锁参/经济逻辑。
// ─────────────────────────────────────────────────────────────────────────
const THEME = {
  BG: '#FBF1E6',            // 暖奶油基底（奶白 #FFF7EF 暖调派生）；替代旧开发占位 #1a1a2e
  PANEL: '#FFF7EF',         // 奶白卡面（§3.1）
  PANEL_STROKE: '#D9A878',  // 暖木描边（§10.3）
  INK: '#5A4A42',           // 暖墨主文字（§3.1）
  INK_SOFT: '#7A6A5A',      // 次级暖墨
  CTA: '#FF9E68',           // 暖橘 CTA（§3.1）
  GOLD: '#F4C95D',          // 星金强调（§7.2 SSR）
  BERRY: '#E8587E',         // 莓果红（§10.3 市集彩）
};

// 稀有度色板（art-bible §7.2 锁定 hex：N:#A8C0B0 / R:#8FB8E0 / SR:#C9A6E8 / SSR:#F4C95D）
// 仅用于 UI 卡框层 / 稀有度演出（抽卡 chip、图鉴稀有度条、榜单角标）；角色本体填色属身份色
// 层（R3 分层 fill），待真实部件装配（12 配色预设）接入后改身份色，本处为 Phase 2 fallback 占位。
// 非开发占位、锁参不可改；与 src/assembly/index.js RARITY 一致。
const RARITY_COLORS = {
  N: '#A8C0B0',
  R: '#8FB8E0',
  SR: '#C9A6E8',
  SSR: '#F4C95D',
};

// 三岗身份色（角色层岗位区分；非稀有度色，R3 分层纪律：身份色在角色层）—— 维持原值不改
const ROLE_COLORS = {
  chef: '#ff8c5a',
  waiter: '#5bc0eb',
  host: '#9bde7e',
};

const ROLE_LABEL = {
  chef: 'Chef',
  waiter: 'Waiter',
  host: 'Host',
};

const BG = THEME.BG;

/** 场景 id 常量（导航状态机与命中检测共用）。 */
const SCENE = {
  HUB: 'HUB',
  RESTAURANT: 'RESTAURANT',
  GACHA_MARKET: 'GACHA_MARKET',
  WAREHOUSE: 'WAREHOUSE',
  STAFF_LOUNGE: 'STAFF_LOUNGE',
};

function fmt(n) {
  return typeof n === 'number' ? n.toFixed(2) : String(n);
}

// ---------------------------------------------------------------------------
// 角色保真：圆润 critter + 分层软阴影 + 帧正弦 idle 动效（零位图，Node 安全）
// ---------------------------------------------------------------------------

/**
 * 把一只程序化小动物（圆润躯干 + 双耳 + 双眸 + 软阴影 + 轻 idle 呼吸）追加进 cmds。
 * @param {Array} cmds        指令数组（就地 push）
 * @param {object} o {x,y,r,fill,frame,phase,bob,label,labelColor,eyeColor,id,stroke}
 */
function appendCritter(cmds, o) {
  const frame = o.frame || 0;
  const phase = o.phase || 0;
  const bob = Math.sin((frame + phase) * 0.06) * (o.bob != null ? o.bob : 1.6);
  const r = o.r || 18;
  const cx = o.x;
  const cy = o.y + bob;

  // 分层软阴影（贴地半透明暖灰椭圆；禁硬投影）
  cmds.push({
    op: 'ellipse',
    x: cx,
    y: o.y + r * 0.95,
    rx: r * 0.92,
    ry: r * 0.32,
    fill: 'rgba(0,0,0,0.16)',
    tag: 'critter-shadow',
    id: o.id,
  });
  // 双耳（圆润小圆）
  cmds.push({ op: 'circle', x: cx - r * 0.5, y: cy - r * 0.72, r: r * 0.34, fill: o.fill, stroke: o.stroke || '#00000022', lineWidth: 1, tag: 'critter-ear', id: o.id });
  cmds.push({ op: 'circle', x: cx + r * 0.5, y: cy - r * 0.72, r: r * 0.34, fill: o.fill, stroke: o.stroke || '#00000022', lineWidth: 1, tag: 'critter-ear', id: o.id });
  // 圆润躯干（roundRect 软糯外形）
  cmds.push({ op: 'roundrect', x: cx - r, y: cy - r * 0.5, w: r * 2, h: r * 1.45, r: r * 0.7, fill: o.fill, stroke: o.stroke || '#00000022', lineWidth: 1, tag: 'critter-body', id: o.id });
  // 双眸
  const eye = o.eyeColor || '#2e2e4a';
  cmds.push({ op: 'circle', x: cx - r * 0.34, y: cy - r * 0.02, r: Math.max(1.4, r * 0.1), fill: eye, tag: 'critter-eye', id: o.id });
  cmds.push({ op: 'circle', x: cx + r * 0.34, y: cy - r * 0.02, r: Math.max(1.4, r * 0.1), fill: eye, tag: 'critter-eye', id: o.id });
  // 标签
  if (o.label) {
    cmds.push({
      op: 'text',
      x: cx,
      y: cy + r * 0.78,
      text: o.label,
      color: o.labelColor || THEME.INK,
      font: '12px sans-serif',
      align: 'center',
      baseline: 'middle',
      tag: 'critter-label',
      id: o.id,
    });
  }
}

// ---------------------------------------------------------------------------
// 通用绘制辅助
// ---------------------------------------------------------------------------

/** 画一个圆角按钮（背景 roundRect + 居中标签）。 */
function drawButton(cmds, b, fill, textColor) {
  cmds.push({ op: 'roundrect', x: b.x, y: b.y, w: b.w, h: b.h, r: 10, fill: fill, stroke: '#00000022', lineWidth: 1, tag: 'button', id: b.id });
  cmds.push({ op: 'text', x: b.x + b.w / 2, y: b.y + b.h / 2, text: b.label, color: textColor || '#ffffff', font: '14px sans-serif', align: 'center', baseline: 'middle', tag: 'button-label', id: b.id });
}

/** 把抽卡结果演出（稀有度色块 + 动物名）追加进 cmds，从 startY 开始。 */
function appendGachaResult(cmds, lg, startY) {
  const label = (lg.type === 'ten' ? '十连结果: ' : '单抽结果: ') + (lg.ok === false ? '星券不足' : '');
  cmds.push({ op: 'text', x: 14, y: startY, text: label || '抽卡结果:', color: '#ffffff', font: '13px sans-serif', align: 'left', baseline: 'middle', tag: 'gacha-result-label' });
  lg.draws.slice(0, 10).forEach((d, i) => {
    const chipX = 14 + i * 40;
    const chipY = startY + 16;
    const color = RARITY_COLORS[d.rarity] || '#888888';
    cmds.push({ op: 'rect', x: chipX, y: chipY, w: 36, h: 36, fill: color, stroke: '#00000033', lineWidth: 1, tag: 'rarity', rarity: d.rarity });
    cmds.push({
      op: 'text', x: chipX + 18, y: chipY + 18,
      text: (d.animalId || d.rarity).slice(0, 6),
      color: '#4a3f3a', font: '10px sans-serif', align: 'center', baseline: 'middle', tag: 'rarity-text', animalId: d.animalId, rarity: d.rarity,
    });
  });
}

// ---------------------------------------------------------------------------
// 抽卡按钮（与命中检测共用，单一几何来源）；市场复用
// ---------------------------------------------------------------------------

/**
 * 抽卡按钮布局（单抽 / 十连）。
 * @returns {{id:'single'|'ten',x:number,y:number,w:number,h:number,label:string}[]}
 */
function getGachaButtons(w, h) {
  const bw = Math.min(160, Math.round(w * 0.42));
  const bh = 56;
  const gap = 16;
  const totalW = bw * 2 + gap;
  const startX = Math.round((w - totalW) / 2);
  const y = h - bh - 24;
  return [
    { id: 'single', x: startX, y, w: bw, h: bh, label: '单抽 ' + LOCKED.GACHA_COST_SINGLE_STAR + '★' },
    { id: 'ten', x: startX + bw + gap, y, w: bw, h: bh, label: '十连 ' + LOCKED.GACHA_COST_TEN_STAR + '★' },
  ];
}

/** 命中检测：在 (x,y) 是否点中某抽卡按钮，返回 'single' | 'ten' | null。 */
function hitGachaButton(x, y, w, h) {
  if (typeof x !== 'number' || typeof y !== 'number') return null;
  for (const b of getGachaButtons(w, h)) {
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b.id;
  }
  return null;
}

// ---------------------------------------------------------------------------
// 顶部「回动才村」返回热区（餐厅 / 市场可点 → scene='HUB'）
// ---------------------------------------------------------------------------

/** 顶部返回按钮几何。 */
function getTopBackButton(w, h) {
  return { id: 'back', x: 12, y: 8, w: 96, h: 32, label: '回动才村' };
}

/** 命中顶部返回按钮，返回 'back' | null。 */
function hitBackButton(x, y, w, h) {
  const b = getTopBackButton(w, h);
  if (typeof x !== 'number' || typeof y !== 'number') return null;
  if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return 'back';
  return null;
}

// ---------------------------------------------------------------------------
// 中枢 HUB（纯导航外壳 / router）：4 区域热区 + 只读 HUD
// ---------------------------------------------------------------------------

/**
 * HUB 区域解锁判定（Phase 2）。满足门槛后 locked:false, clickable:true。
 * ctx = { dishUnlockedCount, rosterOwnedCount }；缺省（或门槛未达）则锁定。
 */
function evalHubUnlock(regionId, ctx) {
  ctx = ctx || {};
  switch (regionId) {
    case SCENE.WAREHOUSE:    return (ctx.dishUnlockedCount || 0) >= TUNED.WAREHOUSE_UNLOCK_DISH_COUNT;
    case SCENE.STAFF_LOUNGE: return (ctx.rosterOwnedCount || 0) >= TUNED.LOUNGE_UNLOCK_ROSTER_COUNT;
    default:                 return true; // RESTAURANT / GACHA_MARKET 始终开放
  }
}

/**
 * 中枢 4 区域几何（单一来源，命中检测共用）。
 * Phase 1：暖爪餐厅(RESTAURANT) / 动才市场(GACHA_MARKET) 始终可点；
 *          Phase 2：囤囤仓(WAREHOUSE) / 撸毛馆(STAFF_LOUNGE) 按 evalHubUnlock 决定是否解锁。
 * @param {object} [ctx] { dishUnlockedCount, rosterOwnedCount }（缺省 → WAREHOUSE/STAFF_LOUNGE 锁定）
 * @returns {Array<{id, x, y, w, h, label, locked, clickable}>}
 */
function getHubRegions(w, h, ctx) {
  const rw = Math.round(Math.min(170, (w - 3 * 24) / 2));
  const rh = Math.round(Math.min(210, (h - 56 - 90 - 24) / 2));
  const gap = 24;
  const topY = 56 + 14;
  const leftX = Math.round((w - (rw * 2 + gap)) / 2);
  const rightX = leftX + rw + gap;
  const colTopY = topY;
  const colBotY = topY + rh + 24;
  const unlockLounge = evalHubUnlock(SCENE.STAFF_LOUNGE, ctx);
  const unlockWarehouse = evalHubUnlock(SCENE.WAREHOUSE, ctx);
  return [
    { id: SCENE.STAFF_LOUNGE, x: leftX, y: colTopY, w: rw, h: rh, label: '撸毛馆', locked: !unlockLounge, clickable: unlockLounge },
    { id: SCENE.GACHA_MARKET, x: rightX, y: colTopY, w: rw, h: rh, label: '动才市场', locked: false, clickable: true },
    { id: SCENE.WAREHOUSE, x: leftX, y: colBotY, w: rw, h: rh, label: '囤囤仓', locked: !unlockWarehouse, clickable: unlockWarehouse },
    { id: SCENE.RESTAURANT, x: rightX, y: colBotY, w: rw, h: rh, label: '暖爪餐厅', locked: false, clickable: true },
  ];
}

/** 命中中枢区域：在 (x,y) 点中某「可点」区域返回其 id，否则 null（锁定区忽略）。 */
function hitHubRegion(x, y, w, h, ctx) {
  if (typeof x !== 'number' || typeof y !== 'number') return null;
  for (const reg of getHubRegions(w, h, ctx)) {
    if (!reg.clickable) continue;
    if (x >= reg.x && x <= reg.x + reg.w && y >= reg.y && y <= reg.y + reg.h) return reg.id;
  }
  return null;
}

/** 把单个中枢区域（建筑 + 迎宾小动物 + 标签 + 锁定遮罩）追加进 cmds。 */
function appendHubRegion(cmds, reg, state) {
  const active = state.navigation && state.navigation.scene === reg.id;
  const stroke = reg.locked ? '#C9B8A8' : active ? THEME.GOLD : THEME.PANEL_STROKE;
  cmds.push({
    op: 'roundrect', x: reg.x, y: reg.y, w: reg.w, h: reg.h, r: 16,
    fill: reg.locked ? '#EFE6DC' : THEME.PANEL,
    stroke, lineWidth: active ? 3 : 2, tag: 'hub-region', id: reg.id, locked: reg.locked,
  });
  // 迎宾小动物（门口装饰，复用角色绘制库；idle 相位按区域错开）
  const critterX = reg.x + reg.w / 2;
  const critterY = reg.y + reg.h * 0.42;
  const fillByRole = reg.id === SCENE.RESTAURANT ? ROLE_COLORS.chef
    : reg.id === SCENE.GACHA_MARKET ? ROLE_COLORS.host
    : reg.id === SCENE.WAREHOUSE ? ROLE_COLORS.waiter
    : ROLE_COLORS.host;
  appendCritter(cmds, {
    x: critterX, y: critterY, r: 16,
    fill: reg.locked ? '#B7AEA0' : fillByRole,
    frame: state.frame || 0, phase: (reg.id.charCodeAt(0) || 0) % 7,
    id: 'hub-' + reg.id,
  });
  // 区域标签
  cmds.push({
    op: 'text', x: reg.x + reg.w / 2, y: reg.y + reg.h - 26, text: reg.label,
    color: THEME.INK, font: '15px sans-serif', align: 'center', baseline: 'middle', tag: 'hub-region-label', id: reg.id,
  });
  // 锁定遮罩 + 「即将开放」
  if (reg.locked) {
    cmds.push({ op: 'roundrect', x: reg.x, y: reg.y, w: reg.w, h: reg.h, r: 16, fill: 'rgba(90,74,66,0.40)', stroke: null, lineWidth: 0, tag: 'hub-locked', id: reg.id });
    cmds.push({
      op: 'text', x: reg.x + reg.w / 2, y: reg.y + reg.h / 2, text: '🔒 即将开放',
      color: '#9a8a78', font: '14px sans-serif', align: 'center', baseline: 'middle', tag: 'hub-locked-label', id: reg.id,
    });
  }
}

/**
 * 纯函数：中枢只读快照 → 绘制指令数组。无 wx、无 canvas 副作用。
 * state: { canvas:{w,h}, ledger:{star,diamond,food,shard}, navigation:{scene,prev}, rosterCount?, frame? }
 */
function buildHub(state) {
  const s = state || {};
  const w = (s.canvas && s.canvas.w) || 375;
  const h = (s.canvas && s.canvas.h) || 667;
  const cmds = [];

  cmds.push({ op: 'clear', color: BG, w, h, tag: 'bg' });

  // 扁平温暖天光（零位图，不变量 #1）：暖色天空块 + 远山椭圆
  cmds.push({ op: 'rect', x: 0, y: 0, w, h: Math.round(h * 0.4), fill: '#fbe3c8', stroke: null, lineWidth: 0, tag: 'hub-sky' });
  cmds.push({ op: 'ellipse', x: w * 0.5, y: Math.round(h * 0.4), rx: w, ry: 40, fill: '#ffe9d2', tag: 'hub-hill' });

  // 顶部只读 HUD：四货币（★星券 💎钻石 🍖食材 🔷碎片）
  const ledger = s.ledger || {};
  const star = ledger.star || 0;
  const diamond = ledger.diamond || 0;
  const food = ledger.food || 0;
  const shard = ledger.shard || 0;
  cmds.push({
    op: 'text', x: 14, y: 24,
    text: '★ ' + fmt(star) + '   💎 ' + fmt(diamond) + '   🍖 ' + fmt(food) + '   🔷 ' + fmt(shard),
    color: '#3a2e2e', font: '15px sans-serif', align: 'left', baseline: 'middle', tag: 'hud',
  });

  // 标题
  cmds.push({ op: 'text', x: w / 2, y: 48, text: '🐾 动才村', color: '#5a3e2e', font: '20px sans-serif', align: 'center', baseline: 'middle', tag: 'hub-title' });

  // 4 区域
  const regions = getHubRegions(w, h, s.unlockCtx);
  for (const reg of regions) appendHubRegion(cmds, reg, s);

  // 新动物红点提示（可选）
  if (s.rosterCount > 0) {
    cmds.push({ op: 'text', x: w / 2, y: h - 40, text: '🔴 新动物 ×' + s.rosterCount, color: '#e0556b', font: '13px sans-serif', align: 'center', baseline: 'middle', tag: 'hub-reddot' });
  }

  // 底部提示
  cmds.push({ op: 'text', x: w / 2, y: h - 18, text: '点击建筑进入 · 回动才村', color: '#7a6a5a', font: '13px sans-serif', align: 'center', baseline: 'middle', tag: 'hub-hint' });
  return cmds;
}

// ---------------------------------------------------------------------------
// 动才市场 GACHA_MARKET：保底显示 + 单抽/十连 + IAP 占位子面板
// ---------------------------------------------------------------------------

/** 市场全部可点按钮（回村 / 单抽 / 十连 / 换钻占位）。 */
function getMarketButtons(w, h) {
  const back = getTopBackButton(w, h);
  const gacha = getGachaButtons(w, h);
  const exW = 110;
  const exH = 32;
  const exchange = { id: 'exchange', x: w - 12 - exW, y: 8, w: exW, h: exH, label: '换钻/礼包' };
  return [back, gacha[0], gacha[1], exchange];
}

/** 命中市场按钮，返回 'back' | 'single' | 'ten' | 'exchange' | null。 */
function hitMarketButton(x, y, w, h) {
  if (typeof x !== 'number' || typeof y !== 'number') return null;
  for (const b of getMarketButtons(w, h)) {
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b.id;
  }
  return null;
}

/**
 * 纯函数：动才市场只读快照 → 绘制指令数组。无 wx、无 canvas 副作用。
 * state: { canvas, ledger, pity, pityMax?, lastGacha?, newbie?, frame? }
 */
function buildGachaMarket(state) {
  const s = state || {};
  const w = (s.canvas && s.canvas.w) || 375;
  const h = (s.canvas && s.canvas.h) || 667;
  const cmds = [];

  cmds.push({ op: 'clear', color: BG, w, h, tag: 'bg' });

  // 顶栏按钮：回村（左）+ 换钻/礼包（右，IAP 占位）
  const buttons = getMarketButtons(w, h);
  for (const b of buttons) {
    if (b.id === 'back') drawButton(cmds, b, THEME.PANEL, THEME.INK);
    else if (b.id === 'exchange') drawButton(cmds, b, THEME.BERRY, '#ffffff');
    else drawButton(cmds, b, THEME.CTA, '#1a1a2e'); // single / ten
  }

  // HUD
  const ledger = s.ledger || {};
  const star = ledger.star || 0;
  const diamond = ledger.diamond || 0;
  cmds.push({ op: 'text', x: 14, y: 54, text: '★ ' + fmt(star) + '   💎 ' + fmt(diamond), color: THEME.INK, font: '15px sans-serif', align: 'left', baseline: 'middle', tag: 'hud' });

  // 标题
  cmds.push({ op: 'text', x: w / 2, y: 78, text: '动才市场', color: '#E0A23A', font: '20px sans-serif', align: 'center', baseline: 'middle', tag: 'market-title' });

  // 保底显示（读 gacha.getPity()，保底在引擎内；此处仅展示）
  const pity = s.pity != null ? s.pity : 0;
  const pityMax = s.pityMax || LOCKED.PITY_HARD;
  const left = Math.max(0, pityMax - pity);
  cmds.push({ op: 'text', x: 14, y: 108, text: '距保底 ' + pity + '/' + pityMax, color: THEME.INK, font: '14px sans-serif', align: 'left', baseline: 'middle', tag: 'market-pity' });
  cmds.push({ op: 'text', x: 14, y: 130, text: left > 0 ? ('再招 ' + left + ' 次必得 SR') : '保底就绪！', color: '#7E5AA8', font: '13px sans-serif', align: 'left', baseline: 'middle', tag: 'market-pity-hint' });
  const resultStartY = 156;
  if (s.newbie) {
    cmds.push({ op: 'text', x: 14, y: 150, text: '新手前 10 抽 ≥1 SR', color: '#4A8A5A', font: '12px sans-serif', align: 'left', baseline: 'middle', tag: 'market-newbie' });
  }

  // 抽卡结果演出
  if (s.lastGacha && s.lastGacha.draws && s.lastGacha.draws.length) {
    appendGachaResult(cmds, s.lastGacha, resultStartY);
  }

  // IAP 子面板（占位）：清晰标注，真实支付本期不做
  const gachaBtns = getGachaButtons(w, h);
  const panelY = gachaBtns[0].y - 96;
  if (panelY > resultStartY + 56) {
    cmds.push({ op: 'roundrect', x: 14, y: panelY, w: w - 28, h: 84, r: 12, fill: THEME.PANEL, stroke: THEME.PANEL_STROKE, lineWidth: 1, tag: 'market-iap-panel' });
    cmds.push({ op: 'text', x: 24, y: panelY + 18, text: '换钻 / 礼包（占位）', color: THEME.INK, font: '14px sans-serif', align: 'left', baseline: 'middle', tag: 'market-iap-title' });
    cmds.push({ op: 'text', x: 24, y: panelY + 42, text: '钻石充值需微信商户平台配置，本期占位', color: '#9a8a78', font: '12px sans-serif', align: 'left', baseline: 'middle', tag: 'market-iap-note' });
  }

  // 抽卡按钮（单抽 / 十连）
  for (const b of gachaBtns) drawButton(cmds, b, THEME.CTA, '#1a1a2e');

  return cmds;
}

// ---------------------------------------------------------------------------
// Phase 2 · 囤囤仓 WAREHOUSE / 撸毛馆 STAFF_LOUNGE / 图鉴 ROSTER
// （fallback 实现：engineering-lead agent 空回，主理人 dirext 落盘，engineering-lead 复核签字 PASS · 2026-07-30）
// 设计依据：design/gdd/system-scene-phase2.md（design-strategist 已先落盘）
// 锁参 / 4 决策 / 双货币隔离全程遵守；撸毛仅好感度(C4)，仓库双入口(C1)。
// 所有 build* 仍为纯函数 → 绘制指令数组；applyCommands 不变；roundRect 真机修复保留。
// ---------------------------------------------------------------------------

/** 仓库「解锁下一道菜」按钮；账本可负担才返回（避免误触）。 */
function getWarehouseButtons(w, h, state) {
  const s = state || {};
  const wh = s.warehouse || {};
  const next = wh.nextDish;
  if (!next) return [];
  const ledger = wh.ledger || {};
  const star = ledger.star || 0;
  const food = ledger.food || 0;
  if (star >= next.costStar && food >= next.costFood) {
    return [{ id: 'unlock_' + next.id, dishId: next.id, x: 14, y: 184, w: 200, h: 40, label: '解锁 ' + next.id }];
  }
  return [];
}

/** 命中仓库解锁按钮，返回 dishId | null。 */
function hitWarehouseButton(x, y, w, h, state) {
  if (typeof x !== 'number' || typeof y !== 'number') return null;
  for (const b of getWarehouseButtons(w, h, state)) {
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b.dishId;
  }
  return null;
}

/**
 * 纯函数：囤囤仓只读快照 → 绘制指令数��。
 * 聚合四货币 + 已解锁菜品 + 下一道可解锁（双入口：解锁入口调用既有 restaurant.unlockDish）。
 */
function buildWarehouse(state) {
  const s = state || {};
  const w = (s.canvas && s.canvas.w) || 375;
  const h = (s.canvas && s.canvas.h) || 667;
  const cmds = [];
  cmds.push({ op: 'clear', color: '#EAF3EE', w, h, tag: 'bg' });

  // 回村（仓库可点 → scene='HUB'；复用既有热区）
  drawButton(cmds, getTopBackButton(w, h), THEME.PANEL, THEME.INK);

  const wh = s.warehouse || {};
  const ledger = wh.ledger || s.ledger || {};
  const star = ledger.star || 0;
  const diamond = ledger.diamond || 0;
  const food = ledger.food || 0;
  const shard = ledger.shard || 0;
  cmds.push({ op: 'text', x: 14, y: 30, text: '★ ' + fmt(star) + '   💎 ' + fmt(diamond) + '   🍖 ' + fmt(food) + '   🔷 ' + fmt(shard), color: THEME.INK, font: '15px sans-serif', align: 'left', baseline: 'middle', tag: 'hud' });
  cmds.push({ op: 'text', x: w / 2, y: 54, text: '囤囤仓', color: '#3A7A5E', font: '20px sans-serif', align: 'center', baseline: 'middle', tag: 'warehouse-title' });

  const dishes = wh.dishes || [];
  const unlocked = dishes.filter((d) => d.unlocked);
  cmds.push({ op: 'text', x: 14, y: 84, text: '已解锁 ' + unlocked.length + ' 道菜', color: '#4A7A8A', font: '14px sans-serif', align: 'left', baseline: 'middle', tag: 'warehouse-dish-count' });
  unlocked.forEach((d, i) => {
    cmds.push({ op: 'roundrect', x: 14 + i * 64, y: 100, w: 56, h: 30, r: 8, fill: '#2e4a40', stroke: '#B8E0CB', lineWidth: 1, tag: 'warehouse-dish-chip' });
    cmds.push({ op: 'text', x: 14 + i * 64 + 28, y: 115, text: d.id, color: '#ffffff', font: '11px sans-serif', align: 'center', baseline: 'middle', tag: 'warehouse-dish-label' });
  });

  const next = wh.nextDish;
  if (next) {
    cmds.push({ op: 'text', x: 14, y: 162, text: '下一道可解锁 ' + next.id + '：★' + next.costStar + ' 🍖' + next.costFood, color: '#FF9E68', font: '14px sans-serif', align: 'left', baseline: 'middle', tag: 'warehouse-next-cost' });
    const btns = getWarehouseButtons(w, h, s);
    if (btns.length) drawButton(cmds, btns[0], '#FF9E68', '#1a1a2e');
    else cmds.push({ op: 'text', x: 14, y: 206, text: '星券 / 食材不足，先去餐厅经营攒资源', color: '#bbbbbb', font: '12px sans-serif', align: 'left', baseline: 'middle', tag: 'warehouse-insufficient' });
  }
  return cmds;
}

/** 撸毛馆内「图鉴」入口按钮。 */
function getLoungeButtons(w, h) {
  return { roster: { id: 'roster', x: w - 12 - 110, y: 8, w: 110, h: 32, label: '图鉴' } };
}

/** 撸毛热区网格布局（已拥有动物每只一个圆形热区）。 */
function loungeGrid(w, h) {
  const cols = 4;
  const gx = 20;
  const gy = 96;
  const cw = Math.floor((w - 2 * gx) / cols);
  const ch = 92;
  return { cols, gx, gy, cw, ch };
}
function getLoungePetSpots(state, w, h) {
  const s = state || {};
  const owned = (s.lounge && s.lounge.owned) || [];
  const { cols, gx, gy, cw, ch } = loungeGrid(w, h);
  return owned.map((o, i) => {
    const cx = gx + (i % cols) * cw + cw / 2;
    const cy = gy + Math.floor(i / cols) * ch;
    return { id: o.id, x: cx, y: cy, r: 24 };
  });
}
function hitLoungePet(x, y, w, h, state) {
  if (typeof x !== 'number' || typeof y !== 'number') return null;
  for (const sp of getLoungePetSpots(state, w, h)) {
    const dx = x - sp.x;
    const dy = y - sp.y;
    if (dx * dx + dy * dy <= sp.r * sp.r) return sp.id;
  }
  return null;
}

/**
 * 纯函数：撸毛馆只读快照 → 绘制指令数组。
 * 列出 roster.owned() 去重动物；点 critter → cultivation.pet（仅好感度 + 视觉，C4）。
 */
function buildLounge(state) {
  const s = state || {};
  const w = (s.canvas && s.canvas.w) || 375;
  const h = (s.canvas && s.canvas.h) || 667;
  const frame = s.frame || 0;
  const cmds = [];
  cmds.push({ op: 'clear', color: '#1a1410', w, h, tag: 'bg' });
  drawButton(cmds, getTopBackButton(w, h), THEME.PANEL, THEME.INK);
  const rb = getLoungeButtons(w, h);
  drawButton(cmds, rb.roster, '#7a5cff', '#ffffff');
  cmds.push({ op: 'text', x: w / 2, y: 54, text: '撸毛馆', color: '#F3E2C7', font: '20px sans-serif', align: 'center', baseline: 'middle', tag: 'lounge-title' });

  const owned = (s.lounge && s.lounge.owned) || [];
  if (!owned.length) {
    cmds.push({ op: 'text', x: w / 2, y: Math.round(h / 2), text: '暂无拥有动物，去动才市场抽卡吧', color: '#bbbbbb', font: '14px sans-serif', align: 'center', baseline: 'middle', tag: 'lounge-empty' });
    return cmds;
  }
  const { cols, gx, gy, cw, ch } = loungeGrid(w, h);
  owned.forEach((o, i) => {
    const cx = gx + (i % cols) * cw + cw / 2;
    const cy = gy + Math.floor(i / cols) * ch;
    appendCritter(cmds, { x: cx, y: cy, r: 20, fill: RARITY_COLORS[o.rarity] || '#888888', frame, phase: i, id: 'lounge-' + o.id });
    cmds.push({ op: 'text', x: cx, y: cy + 32, text: o.id, color: '#ffffff', font: '10px sans-serif', align: 'center', baseline: 'middle', tag: 'lounge-critter-label' });
    cmds.push({ op: 'text', x: cx, y: cy + 46, text: 'A ' + (o.affinity || 0) + '/100', color: '#FBE3A1', font: '11px sans-serif', align: 'center', baseline: 'middle', tag: 'lounge-affinity' });
  });
  return cmds;
}

/**
 * 纯函数：图鉴只读快照 → 绘制指令数组（纯只读，无写操作）。
 * 全量目录：已拥有显示完整 critter + 稀有度色条；🔒 显示同家族剪影 + ? 角标。
 */
function buildRoster(state) {
  const s = state || {};
  const w = (s.canvas && s.canvas.w) || 375;
  const h = (s.canvas && s.canvas.h) || 667;
  const frame = s.frame || 0;
  const cmds = [];
  cmds.push({ op: 'clear', color: '#14141f', w, h, tag: 'bg' });
  drawButton(cmds, getTopBackButton(w, h), THEME.PANEL, THEME.INK);
  cmds.push({ op: 'text', x: w / 2, y: 54, text: '图鉴', color: '#ffffff', font: '20px sans-serif', align: 'center', baseline: 'middle', tag: 'roster-title' });

  const view = (s.roster && s.roster.view) || [];
  const cols = 4;
  const gx = 20;
  const gy = 96;
  const cw = Math.floor((w - 2 * gx) / cols);
  const ch = 96;
  view.forEach((e, i) => {
    const cx = gx + (i % cols) * cw + cw / 2;
    const cy = gy + Math.floor(i / cols) * ch;
    if (e.owned) {
      appendCritter(cmds, { x: cx, y: cy, r: 18, fill: RARITY_COLORS[e.rarity] || '#888888', frame, phase: i, id: 'roster-' + e.id });
      cmds.push({ op: 'roundrect', x: cx - 20, y: cy - 26, w: 40, h: 6, r: 3, fill: RARITY_COLORS[e.rarity] || '#888888', stroke: null, lineWidth: 0, tag: 'roster-rarity-bar' });
      cmds.push({ op: 'text', x: cx, y: cy + 30, text: e.id, color: '#ffffff', font: '10px sans-serif', align: 'center', baseline: 'middle', tag: 'roster-owned-label' });
    } else {
      // 🔒 未拥有：同家族部件形状剪影（去色）+ ? 角标（家族隔离 #2 仍适用）
      appendCritter(cmds, { x: cx, y: cy, r: 18, fill: '#3a3a4a', frame, phase: i, id: 'roster-locked-' + e.id });
      cmds.push({ op: 'text', x: cx, y: cy - 30, text: '?', color: '#777777', font: '18px sans-serif', align: 'center', baseline: 'middle', tag: 'roster-locked-mark' });
    }
  });
  return cmds;
}

// ---------------------------------------------------------------------------
// 餐厅 RESTAURANT（主界面，由 E7 buildScene 升级；导出名 buildScene 保持兼容）
// ---------------------------------------------------------------------------

/**
 * 纯函数：餐厅只读快照 → 绘制指令数组。升级了角色保真（圆润 critter + 软阴影 + idle）。
 * 保留原 buildScene 的 tag（bg/hud/restaurant/seat/staff-label/demand/demand-text/float）
 * 以保证既有单测不破；新增 critter-* 系列指令。
 * Option B 修订：餐厅场景 100% 无抽卡痕迹——不渲染 lastGacha 被动结果、不含 rarity/rarity-text tag（抽卡演出仅在 buildGachaMarket）。
 */
// ---------------------------------------------------------------------------
// 餐厅区域小 helper（三岗员工 / 顾客落座 / 顾客排队；复用 appendCritter + 需求气泡样式）
// ---------------------------------------------------------------------------

/**
 * 三岗员工：圆润 critter + 身份色(ROLE_COLORS) + 岗位小标（如「厨」/「服」/「迎」）
 *         + 角色标签 + 等级。保留既有 tag 'staff-label' 以保证既有单测不破。
 */
function drawZoneStaff(cmds, st, x, y, frame, i, tag) {
  appendCritter(cmds, { x, y, r: 14, fill: ROLE_COLORS[st.role] || '#888888', frame, phase: i * 2, id: 'staff-' + (st.id || i) });
  cmds.push({
    op: 'text',
    x,
    y: y + 22,
    text: tag + (ROLE_LABEL[st.role] || st.role) + ' L' + (st.level || 1),
    color: '#ffffff',
    font: '12px sans-serif',
    align: 'center',
    baseline: 'middle',
    tag: 'staff-label',
    role: st.role,
  });
}

/**
 * 顾客需求气泡（圆润 critter + roundrect 气泡 + 「想要 X」+ 🔒 若不可服务）。
 * 复用既有 demand / demand-text tag + locked 标记，既有单测不破。
 * @param {boolean} seated 仅用于注释语义；落座与排队使用同一气泡样式，仅坐标不同（调用侧决定）。
 */
function drawCustomerBubble(cmds, c, x, y, frame, i) {
  const serviceable = !!c.serviceable;
  appendCritter(cmds, { x, y, r: 18, fill: serviceable ? '#5bc0eb' : '#6b6b8f', frame, phase: i * 3 + 1, id: 'cust-' + (c.id || i) });
  const bx = x + 26;
  const by = y - 14;
  cmds.push({ op: 'roundrect', x: bx, y: by, w: 132, h: 28, r: 8, fill: serviceable ? '#ffffff' : '#777777', stroke: '#00000022', lineWidth: 1, tag: 'demand', locked: !serviceable, id: c.id });
  cmds.push({
    op: 'text',
    x: bx + 8,
    y: by + 14,
    text: '想要 ' + (c.dishDemand || '?') + (serviceable ? '' : ' 🔒'),
    color: serviceable ? '#1a1a2e' : '#dddddd',
    font: '12px sans-serif',
    align: 'left',
    baseline: 'middle',
    tag: 'demand-text',
    dish: c.dishDemand,
    locked: !serviceable,
    id: c.id,
  });
}

/**
 * 餐厅「解锁下一道菜」按钮（决策② 双入口：餐厅也作为菜品解锁入口）。
 * 仅在账本可负担下一道菜成本时返回按钮（避免误触）；调用方触发 restaurant.unlockDish。
 * 依赖 currentState() 注入的 warehouse.nextDish（见 game.js）。
 */
function getRestaurantUnlockButton(w, h, state) {
  const s = state || {};
  const next = s.warehouse && s.warehouse.nextDish;
  if (!next) return null;
  const ledger = s.ledger || {};
  const star = ledger.star || 0;
  const food = ledger.food || 0;
  if (star >= next.costStar && food >= next.costFood) {
    return { id: 'rest_unlock', dishId: next.id, x: Math.round(w / 2 - 80), y: h - 36, w: 160, h: 32, label: '解锁 ' + next.id };
  }
  return null;
}

/** 命中餐厅解锁按钮，返回 dishId | null。 */
function hitRestaurantUnlock(x, y, w, h, state) {
  const b = getRestaurantUnlockButton(w, h, state);
  if (!b) return null;
  if (typeof x !== 'number' || typeof y !== 'number') return null;
  if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b.dishId;
  return null;
}

/**
 * 纯函数：餐厅只读快照 → 绘制指令数组（Sprint 5 RESTAURANT 三区重构）。
 *
 * 三个清晰纵向等分区域（迎宾区 / 就餐区 / 后厨区），各自带标牌文字：
 *  - 迎宾区：host 员工 + 未落座（排队）顾客需求气泡；
 *  - 就餐区：N 个座位 + 已落座顾客（座位上 + 需求气泡）+ waiter 员工；
 *  - 后厨区：chef 员工 + 烹饪图元（锅 roundrect + 火苗 ellipse，零位图）。
 *
 * 顾客确定性分流：前 seats 个顾客 = 落座（就餐区座位上），其余 = 排队（迎宾区）。
 * 不随机、不改 I_eff 计算。员工按 role 分区域（chef→后厨 / waiter→就餐 / host→迎宾）。
 *
 * 纪律：餐厅场景**不含抽卡按钮且不含抽卡结果**（抽卡仅在动才市场，包括按钮与结果演出）；保留回村热区、HUD、I_eff/ledger
 * 只读展示与结算浮动数字。lastGacha 在餐厅被忽略，不进入 cmds。
 */
function buildRestaurant(state) {
  const s = state || {};
  const w = (s.canvas && s.canvas.w) || 375;
  const h = (s.canvas && s.canvas.h) || 667;
  const frame = s.frame || 0;
  const cmds = [];

  cmds.push({ op: 'clear', color: BG, w, h, tag: 'bg' });

  // 回村按钮（餐厅可点 → scene='HUB'；保留既有热区）
  drawButton(cmds, getTopBackButton(w, h), THEME.PANEL, THEME.INK);

  // HUD：星券 / 食材 / pity（保留既有 tag 'hud'，既有单测不破）
  const ledger = s.ledger || {};
  const star = ledger.star || 0;
  const food = ledger.food || 0;
  const pity = s.pity != null ? s.pity : 0;
  cmds.push({
    op: 'text', x: 14, y: 30,
    text: '★ ' + fmt(star) + '   🍳 ' + fmt(food) + '   Pity ' + pity + '/' + LOCKED.PITY_HARD,
    color: '#ffffff', font: '16px sans-serif', align: 'left', baseline: 'middle', tag: 'hud',
  });

  // 三区纵向等分
  const top = 56;
  const zoneH = Math.round((h - top - 16) / 3);
  const zx = 10;
  const zw = w - 20;
  const seats = s.seats || 4;
  const staff = s.staff || [];
  const customers = s.customers || [];
  const seatStep = Math.floor((zw - 32) / Math.max(1, seats));

  // 1) 迎宾区（host + 排队顾客）
  cmds.push({ op: 'roundrect', x: zx, y: top, w: zw, h: zoneH, r: 14, fill: '#3a2f4a', stroke: '#D9A878', lineWidth: 2, tag: 'zone-welcome' });
  cmds.push({ op: 'text', x: zx + 12, y: top + 18, text: '迎宾区', color: '#F3E2C7', font: '15px sans-serif', align: 'left', baseline: 'middle', tag: 'zone-label-welcome' });
  staff.filter((st) => st.role === 'host').forEach((st, i) => drawZoneStaff(cmds, st, zx + 20 + i * 54, top + zoneH - 28, frame, i, '迎'));
  customers.slice(seats).forEach((c, i) => drawCustomerBubble(cmds, c, zx + 20 + i * 60, top + zoneH - 28, frame, i));

  // 2) 就餐区（座位 + 已落座顾客 + waiter）
  cmds.push({ op: 'roundrect', x: zx, y: top + zoneH, w: zw, h: zoneH, r: 14, fill: '#233a2e', stroke: '#A9D8A0', lineWidth: 2, tag: 'zone-dining' });
  cmds.push({ op: 'text', x: zx + 12, y: top + zoneH + 18, text: '就餐区', color: '#A9D8A0', font: '15px sans-serif', align: 'left', baseline: 'middle', tag: 'zone-label-dining' });
  for (let i = 0; i < seats; i++) {
    cmds.push({ op: 'roundrect', x: zx + 16 + i * seatStep, y: top + zoneH + 34, w: 28, h: 28, r: 8, fill: '#2e2e55', stroke: '#4a4a7a', lineWidth: 1, tag: 'seat', index: i });
  }
  customers.slice(0, seats).forEach((c, i) => drawCustomerBubble(cmds, c, zx + 16 + i * seatStep + 14, top + zoneH + 34 + 14, frame, i));
  staff.filter((st) => st.role === 'waiter').forEach((st, i) => drawZoneStaff(cmds, st, zx + zw - 40 - i * 54, top + zoneH + zoneH - 28, frame, i, '服'));

  // 3) 后厨区（chef + 烹饪图元：锅 roundrect + 火苗 ellipse，零位图）
  cmds.push({ op: 'roundrect', x: zx, y: top + 2 * zoneH, w: zw, h: zoneH, r: 14, fill: '#3a2e22', stroke: '#D9A878', lineWidth: 2, tag: 'zone-kitchen' });
  cmds.push({ op: 'text', x: zx + 12, y: top + 2 * zoneH + 18, text: '后厨区', color: '#E8C89A', font: '15px sans-serif', align: 'left', baseline: 'middle', tag: 'zone-label-kitchen' });
  staff.filter((st) => st.role === 'chef').forEach((st, i) => drawZoneStaff(cmds, st, zx + 70 + i * 54, top + 2 * zoneH + zoneH - 28, frame, i, '厨'));
  cmds.push({ op: 'roundrect', x: zx + 20, y: top + 3 * zoneH - 44, w: 44, h: 24, r: 6, fill: '#4a4a4a', stroke: '#222222', lineWidth: 1, tag: 'pot' });
  cmds.push({ op: 'ellipse', x: zx + 42, y: top + 3 * zoneH - 48, rx: 12, ry: 16, fill: '#ff9f43', stroke: '#ffd166', lineWidth: 1, tag: 'flame' });

  // 决策② 双入口：餐厅也可解锁下一道菜（与仓库共用 restaurant.unlockDish，原子扣 star+food）
  const restUb = getRestaurantUnlockButton(w, h, s);
  if (restUb) drawButton(cmds, restUb, '#FF9E68', '#1a1a2e');

  // 结算浮动数字（保留既有 tag 'float'）
  const floats = s.floats || [];
  floats.forEach((f) => {
    cmds.push({ op: 'text', x: f.x, y: f.y, text: f.text, color: f.color || '#ffd166', font: '16px sans-serif', align: 'center', baseline: 'middle', tag: 'float' });
  });

  // 餐厅场景 100% 无抽卡痕迹（Option B 修订）：lastGacha 仅在动才市场渲染。
  // appendGachaResult 仍保留供 buildGachaMarket 调用。

  return cmds;
}

// 兼容别名：既有 game.js / 单测仍引用 buildScene 作为餐厅场景。
const buildScene = buildRestaurant;

// ---------------------------------------------------------------------------
// 指令落地（微信原生 2d 上下文；ctx 为空时安全返回，Node 守卫）
// ---------------------------------------------------------------------------

/**
 * 把绘制指令落到 2d 上下文。ctx 为空时安全返回（node 守卫）。
 * @param {object|null} ctx  微信原生 canvas 2d context（或 mock）
 * @param {Array<object>} cmds build* 返回的指令
 */
function applyCommands(ctx, cmds) {
  if (!ctx || !cmds) return;
  for (const c of cmds) {
    if (c.op === 'clear') {
      ctx.fillStyle = c.color || '#000000';
      ctx.fillRect(0, 0, c.w || 0, c.h || 0);
    } else if (c.op === 'rect') {
      if (c.fill) { ctx.fillStyle = c.fill; ctx.fillRect(c.x, c.y, c.w, c.h); }
      if (c.stroke) { ctx.strokeStyle = c.stroke; ctx.lineWidth = c.lineWidth || 1; ctx.strokeRect(c.x, c.y, c.w, c.h); }
    } else if (c.op === 'roundrect') {
      // 兜底：所有几何参数必须是合法 number，防止 emitter 端漏算/NaN 污染真机序列解析
      const x = Number.isFinite(c.x) ? c.x : 0;
      const y = Number.isFinite(c.y) ? c.y : 0;
      const w = Number.isFinite(c.w) ? c.w : 0;
      const h = Number.isFinite(c.h) ? c.h : 0;
      const r = Number.isFinite(c.r) ? c.r : 8;
      // radii 一律传 4 元素数组字面量：标准 sequence 形式在合规实现（含严格 WeChat macOS WebKit）都接受
      try {
        if (typeof ctx.roundRect === 'function') {
          ctx.beginPath();
          ctx.roundRect(x, y, w, h, [r, r, r, r]);
          if (c.fill) { ctx.fillStyle = c.fill; ctx.fill(); }
          if (c.stroke) { ctx.strokeStyle = c.stroke; ctx.lineWidth = c.lineWidth || 1; ctx.stroke(); }
        } else {
          // 旧环境兜底：方角（无 roundRect 的退化路径）
          if (c.fill) { ctx.fillStyle = c.fill; ctx.fillRect(x, y, w, h); }
          if (c.stroke) { ctx.strokeStyle = c.stroke; ctx.lineWidth = c.lineWidth || 1; ctx.strokeRect(x, y, w, h); }
        }
      } catch (_) {
        // 单条绘制指令失败绝不上抛：降级为方角 rect，防止污染 runUi 顶层 catch 连刷屏
        // 默认静默降级（项目既定「不崩」哲学）。调试版可在此恢复日志，但不要在 catch 再抛。
        try {
          if (c.fill) { ctx.fillStyle = c.fill; ctx.fillRect(x, y, w, h); }
          if (c.stroke) { ctx.strokeStyle = c.stroke; ctx.lineWidth = c.lineWidth || 1; ctx.strokeRect(x, y, w, h); }
        } catch (__) { /* swallow */ }
      }
    } else if (c.op === 'circle') {
      ctx.beginPath();
      ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
      if (c.fill) { ctx.fillStyle = c.fill; ctx.fill(); }
      if (c.stroke) { ctx.strokeStyle = c.stroke; ctx.lineWidth = c.lineWidth || 1; ctx.stroke(); }
    } else if (c.op === 'ellipse') {
      if (typeof ctx.ellipse === 'function') {
        ctx.beginPath();
        ctx.ellipse(c.x, c.y, c.rx, c.ry, c.rotation || 0, 0, Math.PI * 2);
        if (c.fill) { ctx.fillStyle = c.fill; ctx.fill(); }
      } else if (c.fill) {
        // 退化：无 ellipse → 用圆近似
        ctx.beginPath();
        ctx.arc(c.x, c.y, Math.max(c.rx, c.ry), 0, Math.PI * 2);
        ctx.fillStyle = c.fill; ctx.fill();
      }
    } else if (c.op === 'text') {
      ctx.fillStyle = c.color || '#ffffff';
      if (c.font) ctx.font = c.font;
      if (c.align) ctx.textAlign = c.align;
      if (c.baseline) ctx.textBaseline = c.baseline;
      ctx.fillText(c.text, c.x, c.y);
    }
  }
}

// ---------------------------------------------------------------------------
// 离线收益「待领取」模态（Phase 3 修订：离线收益先进 pending，受 cap 限制，须领取）
// ---------------------------------------------------------------------------

/** 领取按钮几何（与命中检测共用）。 */
function getOfflineClaimButton(w, h) {
  const bw = Math.min(200, Math.round(w * 0.6));
  const bh = 48;
  return { id: 'claim', x: Math.round((w - bw) / 2), y: Math.round(h * 0.62), w: bw, h: bh, label: '点击领取' };
}

/** 命中领取按钮，返回 'claim' | null。 */
function hitOfflineClaim(x, y, w, h) {
  const b = getOfflineClaimButton(w, h);
  if (typeof x !== 'number' || typeof y !== 'number') return null;
  if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return 'claim';
  return null;
}

/**
 * 离线收益待领取模态（纯函数）。pending>0 时每帧覆盖最上层，玩家须点击「领取」才能继续。
 * 仅展示 + 提供命中区域；实际入账在 game.js 触摸路由里调用 idle.claimPending()。
 */
function buildOfflineClaim(pending, w, h) {
  w = w || 375; h = h || 667;
  const cmds = [];
  cmds.push({ op: 'rect', x: 0, y: 0, w, h, fill: 'rgba(10,12,28,0.72)', stroke: null, lineWidth: 0, tag: 'offline-claim-overlay' });
  const pw = Math.min(300, Math.round(w * 0.84));
  const ph = 180;
  const px = Math.round((w - pw) / 2);
  const py = Math.round(h * 0.34);
  cmds.push({ op: 'roundrect', x: px, y: py, w: pw, h: ph, r: 16, fill: '#fff7ec', stroke: '#d9a878', lineWidth: 2, tag: 'offline-claim-panel' });
  cmds.push({ op: 'text', x: w / 2, y: py + 34, text: '离线收益', color: '#5a4632', font: '22px sans-serif', align: 'center', baseline: 'middle', tag: 'offline-claim-title' });
  cmds.push({ op: 'text', x: w / 2, y: py + 78, text: '★ ' + fmt(pending), color: '#e0a23a', font: '30px sans-serif', align: 'center', baseline: 'middle', tag: 'offline-claim-amount' });
  cmds.push({ op: 'text', x: w / 2, y: py + 112, text: '小动物们帮你赚的~', color: '#9a8a72', font: '13px sans-serif', align: 'center', baseline: 'middle', tag: 'offline-claim-sub' });
  drawButton(cmds, getOfflineClaimButton(w, h), '#a9d8a0', '#1a1a2e');
  return cmds;
}

module.exports = {
  buildScene,
  buildRestaurant,
  buildHub,
  buildGachaMarket,
  buildWarehouse,
  buildLounge,
  buildRoster,
  buildOfflineClaim,
  hitOfflineClaim,
  applyCommands,
  getGachaButtons,
  hitGachaButton,
  getHubRegions,
  hitHubRegion,
  getMarketButtons,
  hitMarketButton,
  getTopBackButton,
  hitBackButton,
  getWarehouseButtons,
  hitWarehouseButton,
  getLoungeButtons,
  getLoungePetSpots,
  hitLoungePet,
  getRestaurantUnlockButton,
  hitRestaurantUnlock,
  appendCritter,
  RARITY_COLORS,
  ROLE_COLORS,
  ROLE_LABEL,
  SCENE,
};
