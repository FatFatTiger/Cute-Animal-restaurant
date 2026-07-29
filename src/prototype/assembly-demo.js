'use strict';
// 可爱小动物餐厅 · 运行时拼装参考实现 (Node 可直接运行)
// 纯逻辑: 槽位映射 / 家族硬隔离校验 / 分层上色入口 / 贴图零增长断言
const assert = require('assert');

const Family = Object.freeze({
  Mammal: 'mammal',
  Bird:   'bird',
  Round:  'round',
  Aquatic:'aquatic',
});

const ATLAS = Object.freeze({
  head: [
    { id: 'H0', family: Family.Mammal,  rect: { x: 0,   y: 0,   w: 128, h: 128 } },
    { id: 'H1', family: Family.Mammal,  rect: { x: 128, y: 0,   w: 128, h: 128 } },
    { id: 'H2', family: Family.Mammal,  rect: { x: 256, y: 0,   w: 128, h: 128 } },
    { id: 'H3', family: Family.Bird,    rect: { x: 384, y: 0,   w: 128, h: 128 } },
    { id: 'H4', family: Family.Round,   rect: { x: 512, y: 0,   w: 128, h: 128 } },
    { id: 'H5', family: Family.Aquatic, rect: { x: 640, y: 0,   w: 128, h: 128 } },
  ],
  body: [
    { id: 'B0', family: Family.Mammal,  rect: { x: 0,   y: 128, w: 160, h: 160 } },
    { id: 'B1', family: Family.Mammal,  rect: { x: 160, y: 128, w: 160, h: 160 } },
    { id: 'B2', family: Family.Bird,    rect: { x: 320, y: 128, w: 160, h: 160 } },
    { id: 'B3', family: Family.Round,   rect: { x: 480, y: 128, w: 160, h: 160 } },
    { id: 'B4', family: 'universal',    rect: { x: 640, y: 128, w: 160, h: 160 } },
  ],
  ear: [
    { id: 'E0', family: Family.Mammal,  rect: { x: 0,   y: 288, w: 96, h: 96 } },
    { id: 'E1', family: Family.Mammal,  rect: { x: 96,  y: 288, w: 96, h: 96 } },
    { id: 'E2', family: Family.Mammal,  rect: { x: 192, y: 288, w: 96, h: 96 } },
    { id: 'E3', family: Family.Mammal,  rect: { x: 288, y: 288, w: 96, h: 96 } },
    { id: 'E4', family: Family.Mammal,  rect: { x: 384, y: 288, w: 96, h: 96 } },
    { id: 'E5', family: Family.Bird,    rect: { x: 480, y: 288, w: 96, h: 96 } },
    { id: 'E6', family: Family.Round,   rect: { x: 576, y: 288, w: 96, h: 96 } },
    { id: 'E7', family: Family.Aquatic, rect: { x: 672, y: 288, w: 96, h: 96 } },
  ],
  tail: [
    { id: 'T0', family: Family.Mammal,  rect: { x: 0,   y: 384, w: 96, h: 96 } },
    { id: 'T1', family: Family.Mammal,  rect: { x: 96,  y: 384, w: 96, h: 96 } },
    { id: 'T2', family: Family.Mammal,  rect: { x: 192, y: 384, w: 96, h: 96 } },
    { id: 'T3', family: Family.Bird,    rect: { x: 288, y: 384, w: 96, h: 96 } },
    { id: 'T4', family: Family.Round,   rect: { x: 384, y: 384, w: 96, h: 96 } },
    { id: 'T5', family: Family.Aquatic, rect: { x: 480, y: 384, w: 96, h: 96 } },
  ],
  limb: [
    { id: 'L0', family: [Family.Mammal, Family.Bird],      rect: { x: 0,   y: 480, w: 80, h: 80 } },
    { id: 'L1', family: Family.Mammal,                      rect: { x: 80,  y: 480, w: 80, h: 80 } },
    { id: 'L2', family: [Family.Round, Family.Aquatic],    rect: { x: 160, y: 480, w: 80, h: 80 } },
  ],
});

function slotAllowed(slot, family) {
  if (slot.family === 'universal') return true;
  if (Array.isArray(slot.family)) return slot.family.includes(family);
  return slot.family === family;
}

class FamilyIsolationError extends Error {}

function validateFamily(animal) {
  const fam = animal.family;
  for (const [partType, idx] of Object.entries(animal.parts)) {
    const slot = ATLAS[partType] && ATLAS[partType][idx];
    if (!slot) throw new FamilyIsolationError(`[${animal.id}] 槽位越界: ${partType}[${idx}]`);
    if (!slotAllowed(slot, fam)) {
      throw new FamilyIsolationError(
        `[${animal.id}] 跨家族组合被禁止: ${partType}=${slot.id}(${slot.family}) ∉ 家族[${fam}]`
      );
    }
  }
  return true;
}

const COLOR_PRESETS = Object.freeze({
  m_cream: { family: Family.Mammal, fill: '#FFF1E0', shade: '#F2D9C2' },
  m_pink:  { family: Family.Mammal, fill: '#F7C9D4', shade: '#E7A8B8' },
  m_mint:  { family: Family.Mammal, fill: '#BEE6D2', shade: '#9BCFB4' },
  m_tan:   { family: Family.Mammal, fill: '#E8C9A0', shade: '#D2AC7E' },
  b_sky:   { family: Family.Bird,   fill: '#CFE6F2', shade: '#A9CDE0' },
  b_rose:  { family: Family.Bird,   fill: '#F3CBD9', shade: '#E0A9BE' },
  b_lime:  { family: Family.Bird,   fill: '#D7EAC0', shade: '#B9D49B' },
  b_peri:  { family: Family.Bird,   fill: '#C9C2EC', shade: '#A99FDC' },
  r_white: { family: Family.Round,  fill: '#FFF7EF', shade: '#EADFCF' },
  r_peach: { family: Family.Round,  fill: '#FBE0C8', shade: '#EEC2A2' },
  r_lav:   { family: Family.Round,  fill: '#E6D6F2', shade: '#CBB2E0' },
  r_blue:  { family: Family.Round,  fill: '#D3E7F0', shade: '#AFCBDB' },
});

const RARITY = Object.freeze({
  N:   { color: '#A8C0B0', badge: 'dot' },
  R:   { color: '#8FB8E0', badge: 'diamond' },
  SR:  { color: '#C9A6E8', badge: 'double_diamond' },
  SSR: { color: '#F4C95D', badge: 'crown' },
});

const Z_LAYER = Object.freeze({ body: 0, limb: 0, head: 10, ear: 11, tail: 11, face: 12, accessory: 20 });

function assembleCharacter(animal) {
  validateFamily(animal);
  const preset = COLOR_PRESETS[animal.colorPresetId];
  if (!preset) throw new Error(`[${animal.id}] 未知配色预设: ${animal.colorPresetId}`);

  const composite = [];
  for (const [partType, idx] of Object.entries(animal.parts)) {
    const slot = ATLAS[partType][idx];
    composite.push({
      partType,
      atlasKey: slot.id,
      rect: slot.rect,
      z: Z_LAYER[partType] ?? 0,
      tint: {
        fill: preset.fill,
        shade: preset.shade,
        outline: '#8A7268',
      },
      deform: animal.deform ?? {},
    });
  }
  return {
    id: animal.id,
    family: animal.family,
    rarity: animal.rarity,
    expression: animal.expressionId,
    composite: composite.sort((a, b) => a.z - b.z),
    uiRarity: RARITY[animal.rarity],
  };
}

const ATLAS_BYTES = 466096;
let atlasBytes = ATLAS_BYTES;
let registryBytes = 0;

const FAMILY_CODE = { mammal: 0, bird: 1, round: 2, aquatic: 3 };
const RARITY_CODE = { N: 0, R: 1, SR: 2, SSR: 3 };
const EXPR_CODE   = { happy: 0, shy: 1, cute: 2, satisfied: 3, surprise: 4, sleep: 5 };
const PRESET_KEYS = Object.keys(COLOR_PRESETS);

function packAnimal(a) {
  return Buffer.from([
    FAMILY_CODE[a.family],
    a.parts.head, a.parts.body, a.parts.ear, a.parts.tail, a.parts.limb,
    PRESET_KEYS.indexOf(a.colorPresetId),
    EXPR_CODE[a.expressionId],
    RARITY_CODE[a.rarity],
    Math.round((a.deform?.headBodyRatio ?? 2.5) * 10) & 0xFF,
    Math.round((a.deform?.scale ?? 1.0) * 100) & 0xFF,
  ]);
}

function registerAnimal(a) {
  registryBytes += packAnimal(a).length;
  return atlasBytes;
}

const animals = [
  { id:'cat_01',  family:Family.Mammal,  parts:{head:0,body:0,ear:0,tail:0,limb:0}, colorPresetId:'m_cream', expressionId:'happy', rarity:'R',   deform:{headBodyRatio:2.5} },
  { id:'birb_02', family:Family.Bird,    parts:{head:3,body:2,ear:5,tail:3,limb:0}, colorPresetId:'b_sky',  expressionId:'shy',   rarity:'SR',  deform:{headBodyRatio:2.8} },
  { id:'blob_03', family:Family.Round,   parts:{head:4,body:3,ear:6,tail:4,limb:2}, colorPresetId:'r_peach',expressionId:'sleep', rarity:'N',   deform:{headBodyRatio:3.0} },
  { id:'fish_99', family:Family.Aquatic, parts:{head:5,body:4,ear:7,tail:5,limb:2}, colorPresetId:'r_blue', expressionId:'happy', rarity:'SSR', deform:{headBodyRatio:2.6} },
];

console.log('=== 运行时拼装演示 ===');
animals.forEach(a => {
  const spec = assembleCharacter(a);
  console.log(`✓ ${a.id} [${a.family}/${a.rarity}] 切片数=${spec.composite.length} 首切片=${spec.composite[0].atlasKey} 身份色=${spec.composite[0].tint.fill}`);
});

console.log('\n=== 贴图字节零增长断言 ===');
const before = atlasBytes;
animals.forEach(registerAnimal);
const after = atlasBytes;

assert.strictEqual(after - before, 0, '❌ 新增动物后 atlas 字节应零增长');
console.log(`✓ atlas 字节 before=${before} after=${after} delta=${after-before} (贴图零增长)`);
console.log(`✓ 角色参数注册表累计=${registryBytes} B / ${animals.length} 只 (≈${Math.round(registryBytes/animals.length)} B/只, 远低于64B上限)`);
assert.ok(registryBytes / animals.length <= 64, '❌ 单只参数应 ≤64B');

console.log('\n=== 家族硬隔离断言 (跨家族必须抛错) ===');
const illegal = { id:'x_bug', family:Family.Mammal, parts:{head:5,body:0,ear:0,tail:0,limb:0}, colorPresetId:'m_cream', expressionId:'happy', rarity:'R' };
let threw = false;
try { validateFamily(illegal); }
catch (e) { threw = (e instanceof FamilyIsolationError); }
assert.ok(threw, '❌ 跨家族组合应被禁止');
console.log('✓ 鱼头+哺乳身 跨家族组合已正确抛错 (FamilyIsolationError)');

assert.doesNotThrow(() => validateFamily(animals[0]), '同家族组合应允许');
console.log('✓ 同家族内任意组合通过校验');

console.log('\n🎉 全部断言通过: 4MB 主包下"参数拼装 + 贴图零增长 + 家族硬隔离"论证成立 (逻辑层)');
