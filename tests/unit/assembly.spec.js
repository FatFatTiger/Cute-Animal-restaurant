'use strict';

/**
 * T1 单元测试 · 程序化拼装（不变量 1 / 不变量 2）
 * 零引擎依赖，jest 直跑。
 *
 * 不变量 1（atlas 字节零增长）：注册 N 只动物后 base-parts atlas 字节数不变 +
 *   单只 0 独立贴图（参数 ≤64B，与锁参一致）。
 * 不变量 2（家族硬隔离）：跨家族部件组合调用 validateFamily 抛 FamilyIsolationError；
 *   universal / 多家族白名单槽位（R-GUARD-NUANCE）不误报。
 */

const {
  AssemblyRegistry,
  FamilyIsolationError,
  validateFamily,
  Family,
  ATLAS,
} = require('../../src/assembly/index');

// 与 prototype/assembly-demo.js 一致的 4 只示例动物（跨 4 家族）。
const SAMPLE_ANIMALS = [
  { id: 'cat_01', family: Family.Mammal, parts: { head: 0, body: 0, ear: 0, tail: 0, limb: 0 }, colorPresetId: 'm_cream', expressionId: 'happy', rarity: 'R', deform: { headBodyRatio: 2.5 } },
  { id: 'birb_02', family: Family.Bird, parts: { head: 3, body: 2, ear: 5, tail: 3, limb: 0 }, colorPresetId: 'b_sky', expressionId: 'shy', rarity: 'SR', deform: { headBodyRatio: 2.8 } },
  { id: 'blob_03', family: Family.Round, parts: { head: 4, body: 3, ear: 6, tail: 4, limb: 2 }, colorPresetId: 'r_peach', expressionId: 'sleep', rarity: 'N', deform: { headBodyRatio: 3.0 } },
  { id: 'fish_99', family: Family.Aquatic, parts: { head: 5, body: 4, ear: 7, tail: 5, limb: 2 }, colorPresetId: 'r_blue', expressionId: 'happy', rarity: 'SSR', deform: { headBodyRatio: 2.6 } },
];

describe('不变量 1 · atlas 字节零增长', () => {
  it('注册 N 只动物后 atlas 字节 delta = 0', () => {
    const reg = new AssemblyRegistry();
    const before = reg.atlasBytes;
    SAMPLE_ANIMALS.forEach((a) => reg.register(a));
    expect(reg.atlasDelta).toBe(0);
    expect(reg.atlasBytes - before).toBe(0);
  });

  it('单只动物参数 ≤ 64B（零独立贴图，与锁参一致）', () => {
    const reg = new AssemblyRegistry();
    SAMPLE_ANIMALS.forEach((a) => {
      const r = reg.register(a);
      expect(r.paramBytes).toBeGreaterThan(0);
      expect(r.paramBytes).toBeLessThanOrEqual(64); // 锁参红线：单只 ≤64B
    });
  });

  it('新增 100 只动物 atlas 仍为 0 增量（规模累积不增贴图字节）', () => {
    const reg = new AssemblyRegistry();
    for (let i = 0; i < 100; i++) {
      const a = Object.assign({}, SAMPLE_ANIMALS[i % SAMPLE_ANIMALS.length]);
      a.id = 'gen_' + i;
      reg.register(a);
    }
    expect(reg.atlasDelta).toBe(0);
    expect(reg.registryBytes).toBeLessThanOrEqual(100 * 64); // 累计参数仍受 ≤64B 约束
  });

  it('assembleCharacter 产出切片数与分层 z 顺序正确（行为与原 prototype 一致）', () => {
    const { assembleCharacter } = require('../../src/assembly/index');
    const spec = assembleCharacter(SAMPLE_ANIMALS[0]);
    expect(spec.composite.length).toBe(5); // 5 个部件槽位
    expect(spec.composite[0].atlasKey).toBe('B0'); // body 在 z=0 最先
    expect(spec.composite[0].tint.fill).toBe('#FFF1E0'); // 身份色匹配 preset
    expect(spec.uiRarity.badge).toBe('diamond'); // 稀有度双编码：R=diamond
  });
});

describe('不变量 2 · 跨家族组合运行时抛错（家族硬隔离）', () => {
  it('鱼头 + 哺乳身 跨家族组合抛 FamilyIsolationError', () => {
    const illegal = {
      id: 'x_bug',
      family: Family.Mammal,
      parts: { head: 5, body: 0, ear: 0, tail: 0, limb: 0 }, // head[5]=Aquatic，家族 Mammal
      colorPresetId: 'm_cream',
      expressionId: 'happy',
      rarity: 'R',
    };
    expect(() => validateFamily(illegal)).toThrow(FamilyIsolationError);
  });

  it('同家族内任意组合通过校验', () => {
    const a = {
      id: 'cat_01',
      family: Family.Mammal,
      parts: { head: 0, body: 0, ear: 0, tail: 0, limb: 0 },
      colorPresetId: 'm_cream',
      expressionId: 'happy',
      rarity: 'R',
    };
    expect(() => validateFamily(a)).not.toThrow();
  });

  it('universal 槽位（body B4）跨家族不误报', () => {
    const mam = {
      id: 'm_uni',
      family: Family.Mammal,
      parts: { head: 0, body: 4, ear: 0, tail: 0, limb: 0 }, // body[4]=universal
      colorPresetId: 'm_cream',
      expressionId: 'happy',
      rarity: 'R',
    };
    expect(() => validateFamily(mam)).not.toThrow();
  });

  it('多家族白名单槽位（limb L0=[mammal,bird]）不误报', () => {
    const bird = {
      id: 'birb_white',
      family: Family.Bird,
      parts: { head: 3, body: 2, ear: 5, tail: 3, limb: 0 }, // limb[0]=[mammal,bird]
      colorPresetId: 'b_sky',
      expressionId: 'shy',
      rarity: 'SR',
    };
    expect(() => validateFamily(bird)).not.toThrow();
    // 反向：limb[0] 用于 mammal 也应通过（白名单双向）
    const mam = {
      id: 'm_white',
      family: Family.Mammal,
      parts: { head: 0, body: 0, ear: 0, tail: 0, limb: 0 },
      colorPresetId: 'm_cream',
      expressionId: 'happy',
      rarity: 'R',
    };
    expect(() => validateFamily(mam)).not.toThrow();
  });

  it('槽位越界（不存在的 idx）同样抛错', () => {
    const oob = {
      id: 'oob',
      family: Family.Mammal,
      parts: { head: 99, body: 0, ear: 0, tail: 0, limb: 0 },
      colorPresetId: 'm_cream',
      expressionId: 'happy',
      rarity: 'R',
    };
    expect(() => validateFamily(oob)).toThrow(FamilyIsolationError);
  });
});
