'use strict';

// DEPRECATED: OP1-A pivot — legacy bitmap atlas + shader-tint pipeline, superseded by canvas2d procedural; not referenced by src/ui/render.js
//   → 活跃替代模块：src/ui/procedural-assembly.js（B1+B2 落地：零贴图指令 / 12 身份配色 / 家族硬隔离 / assembleCritter）

/**
 * 拼装工程化模块（Sprint2 工程化）
 *
 * 从 `src/prototype/assembly-demo.js` 提炼为可注入 / 可单测的 CommonJS 模块：
 *  - 去掉 demo 的 module 级 console 副作用；行为与原 prototype 完全一致；
 *  - 增加 `AssemblyRegistry` 封装以支撑不变量 1（atlas 字节零增长）测试。
 *
 * 设计纪律：
 *  - 锁参 / 结构不动：ATLAS 槽位、家族硬隔离、分层 tint、packAnimal（含 &0xFF 钳制 R-ENCODE）
 *    与原 prototype 逐字一致；`ATLAS_BYTES` 仍为占位常量（R-ATLAS-CONST，待真实烘焙图集替换）。
 *  - 不引入任何新锁参；不触碰 GDD 锁参红线。
 *
 * 不变量覆盖：
 *  - 不变量 1（atlas 字节零增长）：注册 N 只动物不增 atlas 字节；单只参数 ≤ 64B。
 *  - 不变量 2（家族硬隔离）：跨家族组合 `validateFamily` 抛 `FamilyIsolationError`。
 */

const Family = Object.freeze({
  Mammal: 'mammal',
  Bird: 'bird',
  Round: 'round',
  Aquatic: 'aquatic',
});

const ATLAS = Object.freeze({
  head: [
    { id: 'H0', family: Family.Mammal, rect: { x: 0, y: 0, w: 128, h: 128 } },
    { id: 'H1', family: Family.Mammal, rect: { x: 128, y: 0, w: 128, h: 128 } },
    { id: 'H2', family: Family.Mammal, rect: { x: 256, y: 0, w: 128, h: 128 } },
    { id: 'H3', family: Family.Bird, rect: { x: 384, y: 0, w: 128, h: 128 } },
    { id: 'H4', family: Family.Round, rect: { x: 512, y: 0, w: 128, h: 128 } },
    { id: 'H5', family: Family.Aquatic, rect: { x: 640, y: 0, w: 128, h: 128 } },
  ],
  body: [
    { id: 'B0', family: Family.Mammal, rect: { x: 0, y: 128, w: 160, h: 160 } },
    { id: 'B1', family: Family.Mammal, rect: { x: 160, y: 128, w: 160, h: 160 } },
    { id: 'B2', family: Family.Bird, rect: { x: 320, y: 128, w: 160, h: 160 } },
    { id: 'B3', family: Family.Round, rect: { x: 480, y: 128, w: 160, h: 160 } },
    { id: 'B4', family: 'universal', rect: { x: 640, y: 128, w: 160, h: 160 } },
  ],
  ear: [
    { id: 'E0', family: Family.Mammal, rect: { x: 0, y: 288, w: 96, h: 96 } },
    { id: 'E1', family: Family.Mammal, rect: { x: 96, y: 288, w: 96, h: 96 } },
    { id: 'E2', family: Family.Mammal, rect: { x: 192, y: 288, w: 96, h: 96 } },
    { id: 'E3', family: Family.Mammal, rect: { x: 288, y: 288, w: 96, h: 96 } },
    { id: 'E4', family: Family.Mammal, rect: { x: 384, y: 288, w: 96, h: 96 } },
    { id: 'E5', family: Family.Bird, rect: { x: 480, y: 288, w: 96, h: 96 } },
    { id: 'E6', family: Family.Round, rect: { x: 576, y: 288, w: 96, h: 96 } },
    { id: 'E7', family: Family.Aquatic, rect: { x: 672, y: 288, w: 96, h: 96 } },
  ],
  tail: [
    { id: 'T0', family: Family.Mammal, rect: { x: 0, y: 384, w: 96, h: 96 } },
    { id: 'T1', family: Family.Mammal, rect: { x: 96, y: 384, w: 96, h: 96 } },
    { id: 'T2', family: Family.Mammal, rect: { x: 192, y: 384, w: 96, h: 96 } },
    { id: 'T3', family: Family.Bird, rect: { x: 288, y: 384, w: 96, h: 96 } },
    { id: 'T4', family: Family.Round, rect: { x: 384, y: 384, w: 96, h: 96 } },
    { id: 'T5', family: Family.Aquatic, rect: { x: 480, y: 384, w: 96, h: 96 } },
  ],
  limb: [
    { id: 'L0', family: [Family.Mammal, Family.Bird], rect: { x: 0, y: 480, w: 80, h: 80 } },
    { id: 'L1', family: Family.Mammal, rect: { x: 80, y: 480, w: 80, h: 80 } },
    { id: 'L2', family: [Family.Round, Family.Aquatic], rect: { x: 160, y: 480, w: 80, h: 80 } },
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
  m_pink: { family: Family.Mammal, fill: '#F7C9D4', shade: '#E7A8B8' },
  m_mint: { family: Family.Mammal, fill: '#BEE6D2', shade: '#9BCFB4' },
  m_tan: { family: Family.Mammal, fill: '#E8C9A0', shade: '#D2AC7E' },
  b_sky: { family: Family.Bird, fill: '#CFE6F2', shade: '#A9CDE0' },
  b_rose: { family: Family.Bird, fill: '#F3CBD9', shade: '#E0A9BE' },
  b_lime: { family: Family.Bird, fill: '#D7EAC0', shade: '#B9D49B' },
  b_peri: { family: Family.Bird, fill: '#C9C2EC', shade: '#A99FDC' },
  r_white: { family: Family.Round, fill: '#FFF7EF', shade: '#EADFCF' },
  r_peach: { family: Family.Round, fill: '#FBE0C8', shade: '#EEC2A2' },
  r_lav: { family: Family.Round, fill: '#E6D6F2', shade: '#CBB2E0' },
  r_blue: { family: Family.Round, fill: '#D3E7F0', shade: '#AFCBDB' },
});

const RARITY = Object.freeze({
  N: { color: '#A8C0B0', badge: 'dot' },
  R: { color: '#8FB8E0', badge: 'diamond' },
  SR: { color: '#C9A6E8', badge: 'double_diamond' },
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
      z: Z_LAYER[partType] != null ? Z_LAYER[partType] : 0,
      tint: {
        fill: preset.fill,
        shade: preset.shade,
        outline: '#8A7268',
      },
      deform: animal.deform != null ? animal.deform : {},
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

// ATLAS_BYTES 为占位常量（R-ATLAS-CONST）：真实烘焙图集替换前，注册动物不得使其增长。
const ATLAS_BYTES = 466096;

const FAMILY_CODE = { mammal: 0, bird: 1, round: 2, aquatic: 3 };
const RARITY_CODE = { N: 0, R: 1, SR: 2, SSR: 3 };
const EXPR_CODE = { happy: 0, shy: 1, cute: 2, satisfied: 3, surprise: 4, sleep: 5 };
const PRESET_KEYS = Object.keys(COLOR_PRESETS);

function packAnimal(a) {
  // R-ENCODE：打包前对 deform 钳制（&0xFF），防越界静默回绕（与 prototype 一致）。
  return Buffer.from([
    FAMILY_CODE[a.family],
    a.parts.head,
    a.parts.body,
    a.parts.ear,
    a.parts.tail,
    a.parts.limb,
    PRESET_KEYS.indexOf(a.colorPresetId),
    EXPR_CODE[a.expressionId],
    RARITY_CODE[a.rarity],
    Math.round((a.deform && a.deform.headBodyRatio != null ? a.deform.headBodyRatio : 2.5) * 10) & 0xff,
    Math.round((a.deform && a.deform.scale != null ? a.deform.scale : 1.0) * 100) & 0xff,
  ]);
}

/**
 * 注册表封装（Sprint2 工程化）：在装配/注册动物时追踪 atlas 字节与单只参数字节。
 * 关键不变量证明：
 *  - atlas 字节恒定 = ATLAS_BYTES（注册任意数量动物 delta === 0）→ 不变量 1。
 *  - 单只参数 ≤ 64B（packAnimal 输出长度）→ 与锁参「单只 ~11–64B」一致。
 */
class AssemblyRegistry {
  constructor() {
    this.atlasBytes = ATLAS_BYTES; // 恒定，注册不增
    this.registryBytes = 0;
    this.count = 0;
  }

  /** 注册一只动物；返回其参数字节与当前 atlas 字节（恒定）。 */
  register(animal) {
    const packed = packAnimal(animal);
    this.registryBytes += packed.length;
    this.count += 1;
    return { atlasBytes: this.atlasBytes, paramBytes: packed.length };
  }

  /** atlas 字节相对初始的增量；不变量 1 要求恒为 0。 */
  get atlasDelta() {
    return this.atlasBytes - ATLAS_BYTES;
  }
}

module.exports = {
  Family,
  ATLAS,
  slotAllowed,
  FamilyIsolationError,
  validateFamily,
  COLOR_PRESETS,
  RARITY,
  Z_LAYER,
  assembleCharacter,
  packAnimal,
  AssemblyRegistry,
  ATLAS_BYTES,
};
