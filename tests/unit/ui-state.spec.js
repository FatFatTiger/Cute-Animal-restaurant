'use strict';

/**
 * T1 单元测试 · E7 渲染层（纯函数 buildScene + applyCommands + 按钮命中）
 * 零 canvas / 零 wx 依赖，Node 直跑，验证「状态 → 视图」映射与不变量 UI 表现。
 *
 * 不变量关联：不变量 7（顾客需求-解锁匹配）的可视化呈现——
 *   - 已解锁 + 在岗 → 需求气泡亮色、可服务；
 *   - 未解锁（占位）→ 气泡置灰 + 🔒，零产出（与逻辑层一致）。
 * 抽卡结果按稀有度色板渲染（SSR=金），与 LOCKED 稀有度语义对齐。
 */

const {
  buildScene,
  applyCommands,
  hitGachaButton,
  getGachaButtons,
  RARITY_COLORS,
} = require('../../src/ui/render');
const { createMockCanvas } = require('../helpers/mock-canvas');

// 基础场景（覆盖三岗员工 + 已解锁顾客 + 账本）
function baseState(over) {
  return Object.assign(
    {
      canvas: { w: 375, h: 667 },
      seats: 4,
      ledger: { star: 100, diamond: 0, food: 20, shard: 0 },
      staff: [
        { id: 's1', role: 'chef', affinityRole: 'chef', level: 1 },
        { id: 's2', role: 'waiter', affinityRole: 'waiter', level: 2 },
        { id: 's3', role: 'host', affinityRole: 'host', level: 1 },
      ],
      unlockedDishes: ['dish_1', 'dish_2'],
      customers: [{ id: 'c1', dishDemand: 'dish_1', seatId: 0, serviceable: true }],
      floats: [],
      lastGacha: null,
      pity: 5,
    },
    over
  );
}

describe('E7 buildScene 纯函数（不依赖 canvas）', () => {
  it('返回绘制指令数组，含 clear 背景', () => {
    const cmds = buildScene(baseState());
    expect(Array.isArray(cmds)).toBe(true);
    expect(cmds.length).toBeGreaterThan(0);
    expect(cmds.some((c) => c.op === 'clear')).toBe(true);
  });

  it('员工三岗：含 staff 色块 + 角色等级标签', () => {
    const cmds = buildScene(baseState());
    const labels = cmds.filter((c) => c.tag === 'staff-label');
    expect(labels.length).toBe(3);
    expect(labels.some((l) => /chef/i.test(l.text))).toBe(true);
    expect(labels.some((l) => /host/i.test(l.text))).toBe(true);
    expect(labels.some((l) => /L2/.test(l.text))).toBe(true); // waiter L2
  });

  it('顾客需求气泡：已解锁→亮色可服务；未解锁→置灰 🔒', () => {
    const ok = buildScene(baseState({ customers: [{ id: 'c', dishDemand: 'dish_1', seatId: 0, serviceable: true }] }));
    const locked = buildScene(baseState({ customers: [{ id: 'c', dishDemand: 'dish_9', seatId: 0, serviceable: false }] }));

    const okText = ok.find((c) => c.tag === 'demand-text');
    expect(okText.text).toContain('dish_1');
    expect(okText.locked).toBeFalsy();

    const lockedCmd = locked.find((c) => c.tag === 'demand' && c.locked === true);
    expect(lockedCmd).toBeTruthy();
    const lockedText = locked.find((c) => c.tag === 'demand-text');
    expect(lockedText.text).toContain('🔒');
  });

  it('结算浮动数字：floats 渲染为 float 文本（含星券数值）', () => {
    const cmds = buildScene(baseState({ floats: [{ x: 100, y: 100, text: '+0.54★', color: '#ffd166' }] }));
    const f = cmds.find((c) => c.tag === 'float');
    expect(f).toBeTruthy();
    expect(f.text).toContain('0.54');
  });

  it('抽卡结果：稀有度色块（SSR=金色）+ 动物名（按 RARITY_COLORS）', () => {
    const cmds = buildScene(
      baseState({
        lastGacha: { type: 'single', ok: true, draws: [{ animalId: 'ssr_01', rarity: 'SSR', isDuplicate: false, shardGain: 0 }], totalShard: 0 },
      })
    );
    const chip = cmds.find((c) => c.tag === 'rarity' && c.rarity === 'SSR');
    expect(chip).toBeTruthy();
    expect(chip.fill).toBe(RARITY_COLORS.SSR);
    const t = cmds.find((c) => c.tag === 'rarity-text' && c.animalId === 'ssr_01');
    expect(t.text).toContain('ssr_01');
  });

  it('HUD 显示星券 / 食材 / pity', () => {
    const cmds = buildScene(baseState());
    const hud = cmds.find((c) => c.tag === 'hud');
    expect(hud.text).toContain('100');
    expect(hud.text).toContain('20');
    expect(hud.text).toContain('Pity 5');
  });

  it('空状态（无员工/无顾客/无抽卡）不抛错且仍返回指令', () => {
    const cmds = buildScene(baseState({ staff: [], customers: [], lastGacha: null, ledger: {} }));
    expect(Array.isArray(cmds)).toBe(true);
    expect(cmds.some((c) => c.op === 'clear')).toBe(true);
  });
});

describe('E7 applyCommands（mock canvas，零真机依赖）', () => {
  it('在 mock 2d ctx 上消费指令不抛错，并记录 draw 调用', () => {
    const canvas = createMockCanvas(375, 667);
    const ctx = canvas.getContext('2d');
    const cmds = buildScene(
      baseState({
        lastGacha: { type: 'single', ok: true, draws: [{ animalId: 'r_01', rarity: 'R', isDuplicate: true, shardGain: 20 }], totalShard: 20 },
      })
    );
    expect(() => applyCommands(ctx, cmds)).not.toThrow();
    expect(canvas._calls.some((c) => c.m === 'fillRect')).toBe(true);
    expect(canvas._calls.some((c) => c.m === 'fillText')).toBe(true);
    expect(canvas._calls.some((c) => c.m === 'arc')).toBe(true);
  });

  it('ctx 为空时安全返回不抛', () => {
    expect(() => applyCommands(null, buildScene(baseState()))).not.toThrow();
  });
});

describe('E7 抽卡按钮命中检测', () => {
  it('点击单抽按钮区域命中 single', () => {
    const b = getGachaButtons(375, 667)[0];
    expect(hitGachaButton(b.x + 5, b.y + 5, 375, 667)).toBe('single');
  });
  it('点击十连按钮区域命中 ten', () => {
    const b = getGachaButtons(375, 667)[1];
    expect(hitGachaButton(b.x + 5, b.y + 5, 375, 667)).toBe('ten');
  });
  it('点击空白区域返回 null', () => {
    expect(hitGachaButton(10, 10, 375, 667)).toBeNull();
  });
  it('非数值坐标安全返回 null', () => {
    expect(hitGachaButton(undefined, undefined, 375, 667)).toBeNull();
  });
});
