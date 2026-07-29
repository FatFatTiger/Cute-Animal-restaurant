'use strict';

/**
 * E7 · 渲染层（纯逻辑 → 绘制指令，零 canvas / 零 wx 依赖）
 *
 * 设计纪律（见 production/sprint-2.md EL-E7-001）：
 *  - buildScene(state) 是**纯函数**：接收逻辑层只读状态，返回「绘制指令数组」，
 *    不持有任何引擎/canvas 上下文，便于在 Node 下单测（tests/unit/ui-state.spec.js）。
 *  - applyCommands(ctx, cmds) 把指令落到微信原生 2d 上下文（wx.createCanvas().getContext('2d')）；
 *    ctx 为空时安全返回（node 守卫）。
 *  - 不引入 Cocos / 引擎；只用微信原生 canvas 2d，保持主包 <4MB。
 *  - 不重写 src/ 逻辑（E4/E11/E12/E3 仅被引用）；本文件只把状态「画出来」。
 *
 * 状态订阅契约：UI 不持有游戏状态，状态全部来自 Restaurant / GachaEngine / Ledger 的
 * 只读 getter（state 由 game.js 每帧组装）。本层只负责「状态 → 视图」。
 */

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

/**
 * 抽卡按钮布局（与命中检测共用，单一几何来源）。
 * @param {number} w 场景宽
 * @param {number} h 场景高
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
    { id: 'single', x: startX, y, w: bw, h: bh, label: '单抽 100★' },
    { id: 'ten', x: startX + bw + gap, y, w: bw, h: bh, label: '十连 900★' },
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

function fmt(n) {
  return typeof n === 'number' ? n.toFixed(2) : String(n);
}

/**
 * 纯函数：逻辑层只读状态 → 绘制指令数组。
 * @param {object} state
 * @returns {Array<object>} 绘制指令（op: 'clear'|'rect'|'circle'|'text'，带 tag 便于测试）
 */
function buildScene(state) {
  const s = state || {};
  const w = (s.canvas && s.canvas.w) || 375;
  const h = (s.canvas && s.canvas.h) || 667;
  const cmds = [];

  // 背景
  cmds.push({ op: 'clear', color: BG, w, h, tag: 'bg' });

  // HUD：星券 / 食材 / pity
  const ledger = s.ledger || {};
  const star = ledger.star || 0;
  const food = ledger.food || 0;
  const pity = s.pity != null ? s.pity : 0;
  cmds.push({
    op: 'text',
    x: 14, y: 30,
    text: '★ ' + fmt(star) + '   🍳 ' + fmt(food) + '   Pity ' + pity + '/50',
    color: '#ffffff', font: '16px sans-serif', align: 'left', baseline: 'middle', tag: 'hud',
  });

  // 餐厅区
  const seats = s.seats || 4;
  const restX = 10;
  const restY = 56;
  const restW = w - 20;
  const restH = Math.round(h * 0.42);
  cmds.push({ op: 'rect', x: restX, y: restY, w: restW, h: restH, fill: '#232347', stroke: '#3a3a66', lineWidth: 2, tag: 'restaurant' });
  cmds.push({ op: 'text', x: restX + 10, y: restY + 18, text: 'Restaurant', color: '#b8b8e0', font: '14px sans-serif', align: 'left', baseline: 'middle', tag: 'restaurant-label' });

  // 座位占位
  const seatStartX = restX + 12;
  const seatY = restY + 34;
  const seatSize = 28;
  const seatGap = 8;
  for (let i = 0; i < seats; i++) {
    cmds.push({ op: 'rect', x: seatStartX + i * (seatSize + seatGap), y: seatY, w: seatSize, h: seatSize, fill: '#2e2e55', stroke: '#4a4a7a', lineWidth: 1, tag: 'seat', index: i });
  }

  // 三岗员工色块
  const staff = s.staff || [];
  const blockW = (restW - 24) / Math.max(1, staff.length);
  const blockY = seatY + seatSize + 14;
  const blockH = 46;
  staff.forEach((st, i) => {
    const bx = restX + 12 + i * blockW;
    const color = ROLE_COLORS[st.role] || '#888888';
    cmds.push({ op: 'rect', x: bx + 2, y: blockY, w: blockW - 4, h: blockH, fill: color, stroke: '#00000033', lineWidth: 1, tag: 'staff', role: st.role });
    cmds.push({
      op: 'text', x: bx + blockW / 2, y: blockY + blockH / 2,
      text: (ROLE_LABEL[st.role] || st.role) + ' L' + (st.level || 1),
      color: '#1a1a2e', font: '13px sans-serif', align: 'center', baseline: 'middle', tag: 'staff-label', role: st.role,
    });
  });

  // 顾客区
  const custY = restY + restH + 24;
  const customers = s.customers || [];
  customers.forEach((c, i) => {
    const cx = Math.round(w / 2);
    const cy = custY + 30 + i * 60;
    const serviceable = !!c.serviceable;
    cmds.push({ op: 'circle', x: cx, y: cy, r: 18, fill: '#3a3a66', stroke: '#5a5a8a', lineWidth: 1, tag: 'customer' });
    cmds.push({ op: 'text', x: cx, y: cy, text: '客', color: '#ffffff', font: '14px sans-serif', align: 'center', baseline: 'middle', tag: 'customer-icon' });
    const bubbleColor = serviceable ? '#ffffff' : '#777777';
    const bx = cx + 26;
    const by = cy - 14;
    cmds.push({ op: 'rect', x: bx, y: by, w: 132, h: 28, fill: bubbleColor, stroke: '#00000022', lineWidth: 1, tag: 'demand', locked: !serviceable });
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
    const label = (lg.type === 'ten' ? '十连结果: ' : '单抽结果: ') + (lg.ok === false ? '星券不足' : '');
    cmds.push({ op: 'text', x: 14, y: panelY, text: label || '抽卡结果:', color: '#ffffff', font: '13px sans-serif', align: 'left', baseline: 'middle', tag: 'gacha-result-label' });
    lg.draws.slice(0, 10).forEach((d, i) => {
      const chipX = 14 + i * 40;
      const chipY = panelY + 16;
      const color = RARITY_COLORS[d.rarity] || '#888888';
      cmds.push({ op: 'rect', x: chipX, y: chipY, w: 36, h: 36, fill: color, stroke: '#00000033', lineWidth: 1, tag: 'rarity', rarity: d.rarity });
      cmds.push({
        op: 'text', x: chipX + 18, y: chipY + 18,
        text: (d.animalId || d.rarity).slice(0, 6),
        color: '#1a1a2e', font: '10px sans-serif', align: 'center', baseline: 'middle', tag: 'rarity-text', animalId: d.animalId, rarity: d.rarity,
      });
    });
  }

  // 抽卡按钮
  getGachaButtons(w, h).forEach((b) => {
    cmds.push({ op: 'rect', x: b.x, y: b.y, w: b.w, h: b.h, fill: '#ff8c5a', stroke: '#ffd166', lineWidth: 2, tag: 'gacha-button', id: b.id });
    cmds.push({ op: 'text', x: b.x + b.w / 2, y: b.y + b.h / 2, text: b.label, color: '#1a1a2e', font: '15px sans-serif', align: 'center', baseline: 'middle', tag: 'gacha-button-label', id: b.id });
  });

  return cmds;
}

/**
 * 把绘制指令落到 2d 上下文。ctx 为空时安全返回（node 守卫）。
 * @param {object|null} ctx  微信原生 canvas 2d context（或 mock）
 * @param {Array<object>} cmds buildScene 返回的指令
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
    } else if (c.op === 'circle') {
      ctx.beginPath();
      ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
      if (c.fill) { ctx.fillStyle = c.fill; ctx.fill(); }
      if (c.stroke) { ctx.strokeStyle = c.stroke; ctx.lineWidth = c.lineWidth || 1; ctx.stroke(); }
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
  applyCommands,
  getGachaButtons,
  hitGachaButton,
  RARITY_COLORS,
  ROLE_COLORS,
  ROLE_LABEL,
};
