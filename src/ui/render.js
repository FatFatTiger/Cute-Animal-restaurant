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
const { LOCKED } = require('../config/tunables');

// 稀有度色板（身份色由角色层决定，此处仅 UI 卡面/演出用稀有度色，与 ADR-4 分层一致）
const RARITY_COLORS = {
  N: '#9aa0a6',
  R: '#5bc0eb',
  SR: '#c77dff',
  SSR: '#ffd166',
};

// 三岗色板（员工色块区分岗位）
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

const BG = '#1a1a2e';

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
      color: o.labelColor || '#ffffff',
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
      color: '#1a1a2e', font: '10px sans-serif', align: 'center', baseline: 'middle', tag: 'rarity-text', animalId: d.animalId, rarity: d.rarity,
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
 * 中枢 4 区域几何（单一来源，命中检测共用）。
 * Phase 1：暖爪餐厅(RESTAURANT) / 动才市场(GACHA_MARKET) 可点；
 *          囤囤仓(WAREHOUSE) / 撸毛馆(STAFF_LOUNGE) 锁定不可点（🔒「即将开放」）。
 * @returns {Array<{id, x, y, w, h, label, locked, clickable}>}
 */
function getHubRegions(w, h) {
  const rw = Math.round(Math.min(170, (w - 3 * 24) / 2));
  const rh = Math.round(Math.min(210, (h - 56 - 90 - 24) / 2));
  const gap = 24;
  const topY = 56 + 14;
  const leftX = Math.round((w - (rw * 2 + gap)) / 2);
  const rightX = leftX + rw + gap;
  const colTopY = topY;
  const colBotY = topY + rh + 24;
  return [
    { id: SCENE.STAFF_LOUNGE, x: leftX, y: colTopY, w: rw, h: rh, label: '撸毛馆', locked: true, clickable: false },
    { id: SCENE.GACHA_MARKET, x: rightX, y: colTopY, w: rw, h: rh, label: '动才市场', locked: false, clickable: true },
    { id: SCENE.WAREHOUSE, x: leftX, y: colBotY, w: rw, h: rh, label: '囤囤仓', locked: true, clickable: false },
    { id: SCENE.RESTAURANT, x: rightX, y: colBotY, w: rw, h: rh, label: '暖爪餐厅', locked: false, clickable: true },
  ];
}

/** 命中中枢区域：在 (x,y) 点中某「可点」区域返回其 id，否则 null（锁定区忽略）。 */
function hitHubRegion(x, y, w, h) {
  if (typeof x !== 'number' || typeof y !== 'number') return null;
  for (const reg of getHubRegions(w, h)) {
    if (!reg.clickable) continue;
    if (x >= reg.x && x <= reg.x + reg.w && y >= reg.y && y <= reg.y + reg.h) return reg.id;
  }
  return null;
}

/** 把单个中枢区域（建筑 + 迎宾小动物 + 标签 + 锁定遮罩）追加进 cmds。 */
function appendHubRegion(cmds, reg, state) {
  const active = state.navigation && state.navigation.scene === reg.id;
  const stroke = reg.locked ? '#5a5a7a' : active ? '#ffd166' : '#3a3a66';
  cmds.push({
    op: 'roundrect', x: reg.x, y: reg.y, w: reg.w, h: reg.h, r: 16,
    fill: reg.locked ? '#26264a' : '#2e2e55',
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
    fill: reg.locked ? '#6b6b8f' : fillByRole,
    frame: state.frame || 0, phase: (reg.id.charCodeAt(0) || 0) % 7,
    id: 'hub-' + reg.id,
  });
  // 区域标签
  cmds.push({
    op: 'text', x: reg.x + reg.w / 2, y: reg.y + reg.h - 26, text: reg.label,
    color: '#ffffff', font: '15px sans-serif', align: 'center', baseline: 'middle', tag: 'hub-region-label', id: reg.id,
  });
  // 锁定遮罩 + 「即将开放」
  if (reg.locked) {
    cmds.push({ op: 'roundrect', x: reg.x, y: reg.y, w: reg.w, h: reg.h, r: 16, fill: 'rgba(20,20,40,0.55)', stroke: null, lineWidth: 0, tag: 'hub-locked', id: reg.id });
    cmds.push({
      op: 'text', x: reg.x + reg.w / 2, y: reg.y + reg.h / 2, text: '🔒 即将开放',
      color: '#cfcfe6', font: '14px sans-serif', align: 'center', baseline: 'middle', tag: 'hub-locked-label', id: reg.id,
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
  const regions = getHubRegions(w, h);
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
    if (b.id === 'back') drawButton(cmds, b, '#3a3a66', '#ffffff');
    else if (b.id === 'exchange') drawButton(cmds, b, '#7a5cff', '#ffffff');
    else drawButton(cmds, b, '#ff8c5a', '#1a1a2e'); // single / ten
  }

  // HUD
  const ledger = s.ledger || {};
  const star = ledger.star || 0;
  const diamond = ledger.diamond || 0;
  cmds.push({ op: 'text', x: 14, y: 54, text: '★ ' + fmt(star) + '   💎 ' + fmt(diamond), color: '#ffffff', font: '15px sans-serif', align: 'left', baseline: 'middle', tag: 'hud' });

  // 标题
  cmds.push({ op: 'text', x: w / 2, y: 78, text: '动才市场', color: '#ffd166', font: '20px sans-serif', align: 'center', baseline: 'middle', tag: 'market-title' });

  // 保底显示（读 gacha.getPity()，保底在引擎内；此处仅展示）
  const pity = s.pity != null ? s.pity : 0;
  const pityMax = s.pityMax || LOCKED.PITY_HARD;
  const left = Math.max(0, pityMax - pity);
  cmds.push({ op: 'text', x: 14, y: 108, text: '距保底 ' + pity + '/' + pityMax, color: '#ffffff', font: '14px sans-serif', align: 'left', baseline: 'middle', tag: 'market-pity' });
  cmds.push({ op: 'text', x: 14, y: 130, text: left > 0 ? ('再招 ' + left + ' 次必得 SR') : '保底就绪！', color: '#c77dff', font: '13px sans-serif', align: 'left', baseline: 'middle', tag: 'market-pity-hint' });
  const resultStartY = 156;
  if (s.newbie) {
    cmds.push({ op: 'text', x: 14, y: 150, text: '新手前 10 抽 ≥1 SR', color: '#9bde7e', font: '12px sans-serif', align: 'left', baseline: 'middle', tag: 'market-newbie' });
  }

  // 抽卡结果演出
  if (s.lastGacha && s.lastGacha.draws && s.lastGacha.draws.length) {
    appendGachaResult(cmds, s.lastGacha, resultStartY);
  }

  // IAP 子面板（占位）：清晰标注，真实支付本期不做
  const gachaBtns = getGachaButtons(w, h);
  const panelY = gachaBtns[0].y - 96;
  if (panelY > resultStartY + 56) {
    cmds.push({ op: 'roundrect', x: 14, y: panelY, w: w - 28, h: 84, r: 12, fill: '#2a2a4a', stroke: '#4a4a7a', lineWidth: 1, tag: 'market-iap-panel' });
    cmds.push({ op: 'text', x: 24, y: panelY + 18, text: '换钻 / 礼包（占位）', color: '#ffffff', font: '14px sans-serif', align: 'left', baseline: 'middle', tag: 'market-iap-title' });
    cmds.push({ op: 'text', x: 24, y: panelY + 42, text: '钻石充值需微信商户平台配置，本期占位', color: '#b8b8e0', font: '12px sans-serif', align: 'left', baseline: 'middle', tag: 'market-iap-note' });
  }

  // 抽卡按钮（单抽 / 十连）
  for (const b of gachaBtns) drawButton(cmds, b, '#ff8c5a', '#1a1a2e');

  return cmds;
}

// ---------------------------------------------------------------------------
// 餐厅 RESTAURANT（主界面，由 E7 buildScene 升级；导出名 buildScene 保持兼容）
// ---------------------------------------------------------------------------

/**
 * 纯函数：餐厅只读快照 → 绘制指令数组。升级了角色保真（圆润 critter + 软阴影 + idle）。
 * 保留原 buildScene 的全部 tag（bg/hud/restaurant/seat/staff-label/demand/demand-text/float/rarity/rarity-text）
 * 以保证既有单测不破；新增 critter-* 系列指令。
 */
function buildRestaurant(state) {
  const s = state || {};
  const w = (s.canvas && s.canvas.w) || 375;
  const h = (s.canvas && s.canvas.h) || 667;
  const frame = s.frame || 0;
  const cmds = [];

  cmds.push({ op: 'clear', color: BG, w, h, tag: 'bg' });

  // 回村按钮（餐厅可点 → scene='HUB'）
  drawButton(cmds, getTopBackButton(w, h), '#3a3a66', '#ffffff');

  // HUD：星券 / 食材 / pity
  const ledger = s.ledger || {};
  const star = ledger.star || 0;
  const food = ledger.food || 0;
  const pity = s.pity != null ? s.pity : 0;
  cmds.push({
    op: 'text', x: 14, y: 30,
    text: '★ ' + fmt(star) + '   🍳 ' + fmt(food) + '   Pity ' + pity + '/' + LOCKED.PITY_HARD,
    color: '#ffffff', font: '16px sans-serif', align: 'left', baseline: 'middle', tag: 'hud',
  });

  // 餐厅区
  const seats = s.seats || 4;
  const restX = 10;
  const restY = 56;
  const restW = w - 20;
  const restH = Math.round(h * 0.42);
  cmds.push({ op: 'roundrect', x: restX, y: restY, w: restW, h: restH, r: 14, fill: '#232347', stroke: '#3a3a66', lineWidth: 2, tag: 'restaurant' });
  cmds.push({ op: 'text', x: restX + 10, y: restY + 18, text: 'Restaurant', color: '#b8b8e0', font: '14px sans-serif', align: 'left', baseline: 'middle', tag: 'restaurant-label' });

  // 座位占位（圆角）
  const seatStartX = restX + 12;
  const seatY = restY + 34;
  const seatSize = 28;
  const seatGap = 8;
  for (let i = 0; i < seats; i++) {
    cmds.push({ op: 'roundrect', x: seatStartX + i * (seatSize + seatGap), y: seatY, w: seatSize, h: seatSize, r: 8, fill: '#2e2e55', stroke: '#4a4a7a', lineWidth: 1, tag: 'seat', index: i });
  }

  // 三岗员工（圆润 critter + 等级标签）
  const staff = s.staff || [];
  const blockW = (restW - 24) / Math.max(1, staff.length);
  const blockY = seatY + seatSize + 14;
  const blockH = 46;
  staff.forEach((st, i) => {
    const bx = restX + 12 + i * blockW;
    const color = ROLE_COLORS[st.role] || '#888888';
    appendCritter(cmds, { x: bx + blockW / 2 - 18, y: blockY + blockH / 2, r: 14, fill: color, frame, phase: i * 2, id: 'staff-' + (st.id || i) });
    cmds.push({
      op: 'text', x: bx + blockW / 2 + 6, y: blockY + blockH / 2,
      text: (ROLE_LABEL[st.role] || st.role) + ' L' + (st.level || 1),
      color: '#ffffff', font: '13px sans-serif', align: 'center', baseline: 'middle', tag: 'staff-label', role: st.role,
    });
  });

  // 顾客区（圆润 critter + 需求气泡）
  const custY = restY + restH + 24;
  const customers = s.customers || [];
  customers.forEach((c, i) => {
    const cx = Math.round(w / 2);
    const cy = custY + 30 + i * 60;
    const serviceable = !!c.serviceable;
    appendCritter(cmds, { x: cx, y: cy, r: 18, fill: serviceable ? '#5bc0eb' : '#6b6b8f', frame, phase: i * 3 + 1, id: 'customer-' + (c.id || i), label: '客' });
    const bubbleColor = serviceable ? '#ffffff' : '#777777';
    const bx = cx + 26;
    const by = cy - 14;
    cmds.push({ op: 'roundrect', x: bx, y: by, w: 132, h: 28, r: 8, fill: bubbleColor, stroke: '#00000022', lineWidth: 1, tag: 'demand', locked: !serviceable });
    const demandText = '想要 ' + (c.dishDemand || '?') + (serviceable ? '' : ' 🔒');
    cmds.push({
      op: 'text', x: bx + 8, y: by + 14,
      text: demandText, color: serviceable ? '#1a1a2e' : '#dddddd',
      font: '12px sans-serif', align: 'left', baseline: 'middle', tag: 'demand-text', dish: c.dishDemand, locked: !serviceable,
    });
  });

  // 结算浮动数字
  const floats = s.floats || [];
  floats.forEach((f) => {
    cmds.push({ op: 'text', x: f.x, y: f.y, text: f.text, color: f.color || '#ffd166', font: '16px sans-serif', align: 'center', baseline: 'middle', tag: 'float' });
  });

  // 抽卡结果演出（稀有度色块 + 动物名）
  const lg = s.lastGacha;
  if (lg && lg.draws && lg.draws.length) {
    const panelY = custY + 24 + (customers.length ? customers.length * 60 : 0) + 10;
    appendGachaResult(cmds, lg, panelY);
  }

  // 抽卡按钮（保留 E7：餐厅内也可单抽/十连）
  for (const b of getGachaButtons(w, h)) drawButton(cmds, b, '#ff8c5a', '#1a1a2e');

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

module.exports = {
  buildScene,
  buildRestaurant,
  buildHub,
  buildGachaMarket,
  applyCommands,
  getGachaButtons,
  hitGachaButton,
  getHubRegions,
  hitHubRegion,
  getMarketButtons,
  hitMarketButton,
  getTopBackButton,
  hitBackButton,
  appendCritter,
  RARITY_COLORS,
  ROLE_COLORS,
  ROLE_LABEL,
  SCENE,
};
