'use strict';

/**
 * 真实程序化角色拼装（ENG-ASSET-B1B2 · Phase B 第一块）
 *
 * 从 DEPRECATED src/assembly/index.js 移植「纯逻辑」：Family / PART_FAMILY 索引家族判定 /
 * slotAllowed / validateFamily / FamilyIsolationError / 12 身份配色预设；**丢弃** ATLAS / tint /
 * ATLAS_BYTES。本模块只产「canvas2d 绘制指令数组」，零 wx / 零 canvas 依赖，纯函数可单测。
 *
 * 设计纪律（与 art-bible §3.1 / §4.4 / §7.2 / §8.4 对齐）：
 *  - 角色本体 fill 一律用 12 身份配色（COLOR_PRESETS[colorPresetId]），**绝不**用稀有度色。
 *    稀有度色仅在调用方 UI 卡框层（roster-rarity-bar / 抽卡 chip）出现（见 render.js 分层 fill）。
 *  - 零贴图：所有部件均为 canvas2d 契约基元（clear/rect/roundrect/circle/ellipse/text），
 *    无 gradient op；渐变用堆叠半透明 ellipse 伪造。
 *  - 家族硬隔离（不变量 #2）：assembleCritter 第一步即 validateFamily(spec)，跨家族 / 越界组合在
 *    调用侧运行时抛 FamilyIsolationError；图鉴 🔒 剪影仍用真实家族部件形状（仅单色去色），隔离依旧生效。
 *  - 本模块不 require tunables，不碰任何锁参 / 经济 / 玩法逻辑。
 */

const Family = Object.freeze({
  Mammal: 'mammal',
  Bird: 'bird',
  Round: 'round',
  Aquatic: 'aquatic',
});

class FamilyIsolationError extends Error {
  constructor(msg) {
    super(msg);
    this.name = 'FamilyIsolationError';
  }
}

// 每家族部件库大小（与 art-bible §4.4.1 / plan §2.2 一致：头6/身5/耳8/尾6/肢3）
const FAMILIES = Object.freeze({
  mammal:  { head: 6, body: 5, ear: 8, tail: 6, limb: 3 },
  bird:    { head: 6, body: 5, ear: 8, tail: 6, limb: 3 },
  round:   { head: 6, body: 5, ear: 8, tail: 6, limb: 3 },
  aquatic: { head: 6, body: 5, ear: 8, tail: 6, limb: 3 },
});

// 每个槽位索引 → 该索引的合法家族（硬隔离判定依据；plan §2.5）
//  index 含义：head 0-2 哺乳 / 3 鸟 / 4 圆团 / 5 水族；ear 0-4 哺乳 / 5 鸟冠 / 6 圆团芽 / 7 水族鳍(无)；
//            tail 0-2 哺乳 / 3 鸟羽 / 4 圆团小尾 / 5 鱼尾；body 0-1 哺乳 / 2 鸟 / 3 圆团 / 4 通用；
//            limb 0 双足(哺乳+鸟) / 1 四足(哺乳) / 2 短肢·鳍(圆团+水族)
const PART_FAMILY = Object.freeze({
  head: ['mammal', 'mammal', 'mammal', 'bird', 'round', 'aquatic'],
  body: ['mammal', 'mammal', 'bird', 'round', 'universal'],
  ear:  ['mammal', 'mammal', 'mammal', 'mammal', 'mammal', 'bird', 'round', 'aquatic'],
  tail: ['mammal', 'mammal', 'mammal', 'bird', 'round', 'aquatic'],
  limb: [['mammal', 'bird'], 'mammal', ['round', 'aquatic']],
});

const PART_TYPES = ['head', 'body', 'ear', 'tail', 'limb'];

function slotAllowed(slotFamily, family) {
  if (slotFamily === 'universal') return true;
  if (Array.isArray(slotFamily)) return slotFamily.includes(family);
  return slotFamily === family;
}

// 预计算每个家族在各部件上的「合法索引集合」，供 deriveSpecFromId / 目录校验复用
const FAMILY_PARTS = (function build() {
  const m = {};
  for (const fam of Object.keys(FAMILIES)) {
    m[fam] = {};
    for (const pt of PART_TYPES) {
      const allowed = [];
      for (let i = 0; i < PART_FAMILY[pt].length; i++) {
        if (slotAllowed(PART_FAMILY[pt][i], fam)) allowed.push(i);
      }
      m[fam][pt] = allowed;
    }
  }
  return m;
})();

// 12 身份配色（移植自 assembly COLOR_PRESETS / plan §2.3；丢弃 tint/atlas）
// 每家族绑定 4 套：mammal 0..3 / bird 4..7 / round 8..11（aquatic 复用 round 8..11，跨家族不串味）
const COLOR_PRESETS = Object.freeze([
  { family: 'mammal', fill: '#FFF1E0', shade: '#F2D9C2' }, // 0  m_cream
  { family: 'mammal', fill: '#F7C9D4', shade: '#E7A8B8' }, // 1  m_pink
  { family: 'mammal', fill: '#BEE6D2', shade: '#9BCFB4' }, // 2  m_mint
  { family: 'mammal', fill: '#E8C9A0', shade: '#D2AC7E' }, // 3  m_tan
  { family: 'bird',   fill: '#CFE6F2', shade: '#A9CDE0' }, // 4  b_sky
  { family: 'bird',   fill: '#F3CBD9', shade: '#E0A9BE' }, // 5  b_rose
  { family: 'bird',   fill: '#D7EAC0', shade: '#B9D49B' }, // 6  b_lime
  { family: 'bird',   fill: '#C9C2EC', shade: '#A99FDC' }, // 7  b_peri
  { family: 'round',  fill: '#FFF7EF', shade: '#EADFCF' }, // 8  r_white
  { family: 'round',  fill: '#FBE0C8', shade: '#EEC2A2' }, // 9  r_peach
  { family: 'round',  fill: '#E6D6F2', shade: '#CBB2E0' }, // 10 r_lav
  { family: 'round',  fill: '#D3E7F0', shade: '#AFCBDB' }, // 11 r_blue
]);

// 每家族的合法身份配色索引范围（art-bible §4.4.3 规则2：跨家族不串味）
const FAMILY_PRESET_RANGE = Object.freeze({
  mammal: [0, 3],
  bird: [4, 7],
  round: [8, 11],
  aquatic: [8, 11],
});

// 6 表情变体参数（art-bible §8.4：眼型 / 嘴弧 / 腮红透明度，复用同一套脸部件）
const EXPRESSIONS = Object.freeze([
  { id: 'happy',     eyeR: 1.00, eyeY:  0.00, blink: false, blush: 0.55, mouth: 'smile' },
  { id: 'shy',       eyeR: 0.90, eyeY: -0.02, blink: false, blush: 0.85, mouth: 'small' },
  { id: 'cute',      eyeR: 1.15, eyeY:  0.00, blink: false, blush: 0.60, mouth: 'small' },
  { id: 'satisfied', eyeR: 0.55, eyeY:  0.00, blink: true,  blush: 0.40, mouth: 'smile' },
  { id: 'surprise',  eyeR: 1.25, eyeY:  0.02, blink: false, blush: 0.20, mouth: 'open'  },
  { id: 'sleep',     eyeR: 0.45, eyeY:  0.00, blink: true,  blush: 0.30, mouth: 'line'  },
]);

// 家族 → 岗位映射（用户裁决：岗位区分以家族实现；供 B3 撸毛馆展示用，本任务只产数据不接场景）
// 哺乳类(猫/狗) → 服务员 / 鸟类 → 厨师 / 圆团类(兔等) → 接待 / 水族 → 服务员（兼顾）。
const FAMILY_JOB = Object.freeze({
  mammal: '服务员',
  bird:   '厨师',
  round:  '接待',
  aquatic: '服务员',
});
function familyToJob(family) {
  return FAMILY_JOB[family] || '服务员';
}

// ---- 静态兜底目录 CRITTER_CATALOG（roster 系统尚未落地时兜底；art-bible §4.4.2 策展式固定参数组）----
// 每条 CritterSpec：{ id, family, parts:{head,body,ear,tail,limb}, colorPresetId, expressionId, rarity, accessory }
// 所有条目均通过 validateFamily（部件索引落在所属家族合法集合内）。
function spec(family, parts, preset, expr, rarity, accessory) {
  return { family, parts, colorPresetId: preset, expressionId: expr, rarity, accessory };
}
const CRITTER_CATALOG = Object.freeze({
  // 哺乳（猫/狗系）
  c_m01: spec('mammal', { head: 0, body: 0, ear: 0, tail: 0, limb: 0 }, 0, 0, 'N',   0),
  c_m02: spec('mammal', { head: 1, body: 1, ear: 1, tail: 1, limb: 1 }, 1, 1, 'R',   1),
  c_m03: spec('mammal', { head: 2, body: 0, ear: 2, tail: 2, limb: 0 }, 2, 2, 'SR',  2),
  c_m04: spec('mammal', { head: 0, body: 1, ear: 3, tail: 0, limb: 1 }, 3, 3, 'SSR', 3),
  // 鸟类
  c_b01: spec('bird', { head: 3, body: 2, ear: 5, tail: 3, limb: 0 }, 4, 4, 'R',   4),
  c_b02: spec('bird', { head: 3, body: 2, ear: 5, tail: 3, limb: 0 }, 5, 5, 'SR',  5),
  c_b03: spec('bird', { head: 3, body: 2, ear: 5, tail: 3, limb: 0 }, 6, 0, 'SSR', 6),
  c_b04: spec('bird', { head: 3, body: 2, ear: 5, tail: 3, limb: 0 }, 7, 1, 'N',   7),
  // 圆团（兔等）
  c_r01: spec('round', { head: 4, body: 3, ear: 6, tail: 4, limb: 2 }, 8,  2, 'R',   0),
  c_r02: spec('round', { head: 4, body: 3, ear: 6, tail: 4, limb: 2 }, 9,  3, 'SR',  1),
  c_r03: spec('round', { head: 4, body: 3, ear: 6, tail: 4, limb: 2 }, 10, 4, 'SSR', 2),
  c_r04: spec('round', { head: 4, body: 3, ear: 6, tail: 4, limb: 2 }, 11, 5, 'N',   3),
  // 水族
  c_a01: spec('aquatic', { head: 5, body: 4, ear: 7, tail: 5, limb: 2 }, 8,  0, 'SR',  4),
  c_a02: spec('aquatic', { head: 5, body: 4, ear: 7, tail: 5, limb: 2 }, 9,  1, 'SSR', 5),
  c_a03: spec('aquatic', { head: 5, body: 4, ear: 7, tail: 5, limb: 2 }, 10, 2, 'R',   6),
});

// ---------------------------------------------------------------------------
// 部件绘制函数（全部仅用契约基元：rect/roundrect/circle/ellipse/text，无 gradient）
// 所有函数 push 进 out，标签分层：critter-shadow / critter-body / critter-limb /
// critter-tail / critter-head / critter-ear / critter-eye / critter-face / critter-accessory
// ---------------------------------------------------------------------------

function drawBody(out, g) {
  const { cx, cy, r, fill, shade, stroke, id, bodyIdx } = g;
  let w = r * 2.0, h = r * 1.5;
  if (bodyIdx === 1) { w = r * 1.7; h = r * 1.6; }       // 哺乳瘦
  else if (bodyIdx === 2) { w = r * 1.6; h = r * 1.7; }  // 鸟（蛋形）
  else if (bodyIdx === 3) { w = r * 2.1; h = r * 1.95; } // 圆团
  else if (bodyIdx === 4) { w = r * 1.9; h = r * 1.6; }  // 通用
  const by = cy + r * 0.1 - h / 2;
  out.push({
    op: 'roundrect', x: cx - w / 2, y: by, w, h,
    r: Math.min(w, h) * 0.42, fill, stroke, lineWidth: 1, tag: 'critter-body', id,
  });
}

function drawLimbs(out, g) {
  const { cx, cy, r, shade, stroke, id, limbIdx } = g;
  const fy = cy + r * 0.95;
  const feet = (oxs) => oxs.forEach((ox) =>
    out.push({ op: 'ellipse', x: cx + r * ox, y: fy, rx: r * 0.16, ry: r * 0.1, fill: shade, stroke, lineWidth: 1, tag: 'critter-limb', id }));
  if (limbIdx === 1) feet([-0.5, -0.18, 0.18, 0.5]);      // 四足
  else if (limbIdx === 2) feet([-0.3, 0.3]);               // 短肢/鳍
  else feet([-0.35, 0.35]);                                // 双足
}

function drawTail(out, g) {
  const { cx, cy, r, fill, stroke, id, tailIdx } = g;
  if (tailIdx === 5) { // 鱼尾
    out.push({ op: 'ellipse', x: cx + r * 1.0, y: cy + r * 0.1, rx: r * 0.3, ry: r * 0.34, fill, stroke, lineWidth: 1, tag: 'critter-tail', id });
    return;
  }
  const tx = cx + r * 0.95, ty = cy + r * 0.15;
  let rx = r * 0.3, ry = r * 0.18;
  if (tailIdx === 1) { rx = r * 0.4; ry = r * 0.3; }       // 蓬松
  else if (tailIdx === 2) { rx = r * 0.18; ry = r * 0.12; } // 短
  else if (tailIdx === 3) { rx = r * 0.16; ry = r * 0.34; } // 鸟羽
  else if (tailIdx === 4) { rx = r * 0.14; ry = r * 0.1; }  // 圆团小尾
  out.push({ op: 'ellipse', x: tx, y: ty, rx, ry, fill, stroke, lineWidth: 1, tag: 'critter-tail', id });
}

function drawHead(out, g) {
  const { cx, headY, r, fill, stroke, id, headIdx } = g;
  let rr = r * 0.62;
  if (headIdx === 3) rr = r * 0.5;        // 鸟
  else if (headIdx === 4) rr = r * 0.72;  // 圆团
  else if (headIdx === 5) rr = r * 0.55;  // 水族
  out.push({ op: 'circle', x: cx, y: headY, r: rr, fill, stroke, lineWidth: 1, tag: 'critter-head', id });
}

function drawEars(out, g) {
  const { cx, headY, r, fill, stroke, id, earIdx } = g;
  if (earIdx >= 7) return; // 水族无耳（鳍在 tail 表现）
  const ey = headY - r * 0.5;
  if (earIdx === 5) { // 鸟冠羽
    out.push({ op: 'ellipse', x: cx, y: headY - r * 0.62, rx: r * 0.18, ry: r * 0.3, fill, stroke, lineWidth: 1, tag: 'critter-ear', id });
    return;
  }
  if (earIdx === 6) { // 圆团芽耳
    const s = r * 0.16;
    out.push({ op: 'circle', x: cx - r * 0.28, y: ey, r: s, fill, stroke, lineWidth: 1, tag: 'critter-ear', id });
    out.push({ op: 'circle', x: cx + r * 0.28, y: ey, r: s, fill, stroke, lineWidth: 1, tag: 'critter-ear', id });
    return;
  }
  // 哺乳 0..4：长/圆/尖/垂/折 由位置与大小区分
  const sx = r * (0.42 + 0.04 * (earIdx % 3));
  const sy = ey - r * 0.04 * (earIdx % 2);
  const er = r * (0.26 - 0.02 * (earIdx % 3));
  out.push({ op: 'circle', x: cx - sx, y: sy, r: er, fill, stroke, lineWidth: 1, tag: 'critter-ear', id });
  out.push({ op: 'circle', x: cx + sx, y: sy, r: er, fill, stroke, lineWidth: 1, tag: 'critter-ear', id });
}

function drawFace(out, g) {
  const { cx, headY, r, eyeColor, id, expr } = g;
  const eyeY = headY + r * 0.02 + r * (expr.eyeY || 0);
  const eyeRx = Math.max(1.4, r * 0.1 * expr.eyeR);
  const eyeRy = expr.blink ? Math.max(0.8, r * 0.03) : eyeRx;
  out.push({ op: 'ellipse', x: cx - r * 0.2, y: eyeY, rx: eyeRx, ry: eyeRy, fill: eyeColor, tag: 'critter-eye', id });
  out.push({ op: 'ellipse', x: cx + r * 0.2, y: eyeY, rx: eyeRx, ry: eyeRy, fill: eyeColor, tag: 'critter-eye', id });
  // 腮红（半透明，堆叠 ellipse 伪造柔和感；无 gradient）
  const blushA = expr.blush != null ? expr.blush : 0.4;
  if (blushA > 0.01) {
    const bf = 'rgba(255,150,170,' + blushA.toFixed(2) + ')';
    out.push({ op: 'ellipse', x: cx - r * 0.42, y: headY + r * 0.16, rx: r * 0.16, ry: r * 0.1, fill: bf, tag: 'critter-face', id });
    out.push({ op: 'ellipse', x: cx + r * 0.42, y: headY + r * 0.16, rx: r * 0.16, ry: r * 0.1, fill: bf, tag: 'critter-face', id });
  }
  // 嘴
  const my = headY + r * 0.22;
  if (expr.mouth === 'open') {
    out.push({ op: 'circle', x: cx, y: my, r: Math.max(1.2, r * 0.09), fill: '#7a4a4a', tag: 'critter-face', id });
  } else if (expr.mouth === 'line') {
    out.push({ op: 'ellipse', x: cx, y: my, rx: r * 0.12, ry: Math.max(0.8, r * 0.02), fill: '#7a4a4a', tag: 'critter-face', id });
  } else if (expr.mouth === 'small') {
    out.push({ op: 'ellipse', x: cx, y: my, rx: r * 0.08, ry: r * 0.05, fill: '#7a4a4a', tag: 'critter-face', id });
  } else { // smile
    out.push({ op: 'ellipse', x: cx, y: my, rx: r * 0.13, ry: r * 0.07, fill: '#7a4a4a', tag: 'critter-face', id });
  }
}

function drawAccessory(out, g) {
  const { cx, headY, r, id, accIdx } = g;
  const ay = headY - r * 0.62;
  const accFill = ['#E8587E', '#FF9E68', '#8FB8E0', '#C9A6E8', '#A8C0B0', '#F4C95D', '#9BCFB4', '#E7A8B8'][accIdx % 8];
  out.push({ op: 'roundrect', x: cx - r * 0.22, y: ay - r * 0.08, w: r * 0.44, h: r * 0.16, r: r * 0.06, fill: accFill, stroke: '#00000022', lineWidth: 1, tag: 'critter-accessory', id });
  out.push({ op: 'circle', x: cx - r * 0.26, y: ay, r: r * 0.1, fill: accFill, stroke: '#00000022', lineWidth: 1, tag: 'critter-accessory', id });
  out.push({ op: 'circle', x: cx + r * 0.26, y: ay, r: r * 0.1, fill: accFill, stroke: '#00000022', lineWidth: 1, tag: 'critter-accessory', id });
}

// ---------------------------------------------------------------------------
// 家族硬隔离（不变量 #2）：运行时校验；跨家族 / 越界组合抛 FamilyIsolationError
// ---------------------------------------------------------------------------

function validateFamily(s) {
  for (const pt of PART_TYPES) {
    const idx = s.parts && s.parts[pt];
    if (typeof idx !== 'number' || !Number.isInteger(idx) || idx < 0 || idx >= PART_FAMILY[pt].length) {
      throw new FamilyIsolationError(
        '[' + (s.id || '?') + '·' + (s.family || '?') + '][' + pt + '=' + idx + '] 槽位越界（合法 0..' + (PART_FAMILY[pt].length - 1) + '）'
      );
    }
    if (!slotAllowed(PART_FAMILY[pt][idx], s.family)) {
      throw new FamilyIsolationError(
        '[' + (s.id || '?') + '][' + pt + '=' + idx + '(' + PART_FAMILY[pt][idx] + ')] 跨家族组合被禁止 ∉ 家族[' + s.family + ']'
      );
    }
  }
  return true;
}

// ---------------------------------------------------------------------------
// 目录解析：roster 未落地时按 id 兜底（先查 CRITTER_CATALOG，再确定性派生合法 spec）
// ---------------------------------------------------------------------------

function hashStr(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * 确定性派生合法 spec（任意 id 都返回通过 validateFamily 的 spec，家族隔离始终生效）。
 * 部件索引取自该家族的合法集合，身份配色取该家族预设范围 → 不串味、不越界。
 */
function deriveSpecFromId(id) {
  const s = String(id == null ? 'unknown' : id);
  let h = hashStr(s);
  const families = ['mammal', 'bird', 'round', 'aquatic'];
  const family = families[h % 4];
  const parts = {};
  let seed = h;
  for (const pt of PART_TYPES) {
    const allowed = FAMILY_PARTS[family][pt];
    parts[pt] = allowed[seed % allowed.length];
    seed = Math.floor(seed / Math.max(1, allowed.length)) || 1;
  }
  const range = FAMILY_PRESET_RANGE[family];
  const colorPresetId = range[0] + (h % (range[1] - range[0] + 1));
  return {
    family, parts, colorPresetId,
    expressionId: h % EXPRESSIONS.length,
    rarity: 'N', accessory: -1,
  };
}

/** 解析视觉 spec：优先目录，否则确定性派生（兜底）。返回对象含 family/parts/colorPresetId 等。 */
function resolveCritterSpec(id) {
  if (id != null && CRITTER_CATALOG[id]) return CRITTER_CATALOG[id];
  return deriveSpecFromId(id);
}

// ---------------------------------------------------------------------------
// 核心：产出角色绘制指令数组（z 序：软阴影 → 身+肢 → 头+耳+尾 → 脸 → 配件）
// 角色本体 fill 一律身份色（COLOR_PRESETS[colorPresetId]），绝不稀有度色。
// ---------------------------------------------------------------------------

function assembleCritter(specObj, opts) {
  opts = opts || {};
  if (!specObj || !specObj.family || !specObj.parts) {
    throw new FamilyIsolationError('[assembleCritter] spec 缺失 family/parts');
  }
  validateFamily(specObj); // 家族硬隔离运行时生效（不变量 #2）

  const frame = opts.frame || 0;
  const phase = opts.phase || 0;
  const r = opts.r || 18;
  const cx = opts.x;
  const bob = Math.sin((frame + phase) * 0.06) * (opts.bob != null ? opts.bob : 1.6);
  const cy = (opts.y || 0) + bob;
  const id = opts.id;

  // 解析角色本体 fill（身份色；locked=单色去色剪影；fillOverride=岗位/顾客固定色）
  let fill, shade;
  if (opts.fillOverride) { fill = opts.fillOverride; shade = opts.fillOverride; }
  else if (opts.locked) { fill = '#3a3a4a'; shade = '#3a3a4a'; }
  else {
    const preset = COLOR_PRESETS[specObj.colorPresetId] || COLOR_PRESETS[0];
    fill = preset.fill; shade = preset.shade;
  }
  const stroke = opts.stroke || '#8A7268';
  const eyeColor = opts.eyeColor || '#2e2e4a';

  const out = [];
  // 软阴影（最底，禁硬投影）
  out.push({ op: 'ellipse', x: cx, y: (opts.y || 0) + r * 0.95, rx: r * 0.92, ry: r * 0.32, fill: 'rgba(0,0,0,0.16)', tag: 'critter-shadow', id });

  const p = specObj.parts;
  const base = { cx, cy, r, fill, shade, stroke, id };
  drawBody(out, Object.assign({}, base, { bodyIdx: p.body || 0 }));
  drawLimbs(out, Object.assign({}, base, { limbIdx: p.limb || 0 }));
  drawTail(out, Object.assign({}, base, { tailIdx: p.tail || 0 }));
  const headY = cy - r * 0.55;
  drawHead(out, Object.assign({}, base, { headY, headIdx: p.head || 0 }));
  drawEars(out, Object.assign({}, base, { headY, earIdx: p.ear || 0 }));
  let expr = EXPRESSIONS[specObj.expressionId] || EXPRESSIONS[0];
  if (opts.blink) expr = Object.assign({}, expr, { blink: true }); // B4 周期眨眼覆盖（不依赖固定表情，无全局状态）
  drawFace(out, { cx, headY, r, eyeColor, id, expr });
  if (specObj.accessory != null && specObj.accessory >= 0) {
    drawAccessory(out, Object.assign({}, base, { headY, accIdx: specObj.accessory }));
  }
  if (opts.label) {
    out.push({
      op: 'text', x: cx, y: cy + r * 0.78, text: opts.label,
      color: opts.labelColor || '#5A4A42', font: '12px sans-serif',
      align: 'center', baseline: 'middle', tag: 'critter-label', id,
    });
  }
  return out;
}

module.exports = {
  Family,
  FAMILIES,
  PART_FAMILY,
  FAMILY_PARTS,
  PART_TYPES,
  COLOR_PRESETS,
  FAMILY_PRESET_RANGE,
  EXPRESSIONS,
  FAMILY_JOB,
  familyToJob,
  CRITTER_CATALOG,
  slotAllowed,
  FamilyIsolationError,
  validateFamily,
  resolveCritterSpec,
  deriveSpecFromId,
  assembleCritter,
};
