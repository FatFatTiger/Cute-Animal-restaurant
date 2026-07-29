'use strict';

/**
 * T2 集成测试 · 抽卡 × 经济账本闭环（Epic 3 × E6）
 *
 * 验证：扣费 → E6 ledger（requestId 幂等）→ 重复转碎片入账 的端到端闭环。
 *  - 单抽/十连扣星券或钻石；不足不扣费（弱网/断线语义）。
 *  - 重复动物转碎片（R20）入账 shard 账本。
 *  - 跨批次货币守恒（复用 economy-harness，不变量 3 批次口径）。
 *  - 双货币隔离：抽卡不动 food；钻石路径不扣星券。
 *  - ledger 唯一：同 requestId 经 ledger 幂等只计一次。
 *
 * 零引擎依赖，jest 直跑。
 */

const { GachaEngine } = require('../../src/gacha/index');
const { Ledger } = require('../../src/economy/ledger');
const { makeHarness } = require('../helpers/economy-harness');
const { makeSeededRng } = require('../helpers/seeded-rng');

describe('E3 集成 · 扣费→账本→碎片闭环（单抽）', () => {
  it('扣星券；重复转碎片入账；跨批次守恒', () => {
    const h = makeHarness({ initial: { star: 1000, food: 0, diamond: 0, shard: 0 } });
    const e = new GachaEngine({
      ledger: h.ledger,
      rng: makeSeededRng(1),
      newbieWindow: false,
      decide: () => 'R',
      pickAnimal: () => 'r1',
      roster: { R: ['r1'], SR: [], SSR: [] },
    });
    const r1 = e.drawSingle({ currency: 'star', requestId: 'g1' }); // 首抽：新
    const r2 = e.drawSingle({ currency: 'star', requestId: 'g2' }); // 重复：+20
    const r3 = e.drawSingle({ currency: 'star', requestId: 'g3' }); // 重复：+20
    expect(r1.draws[0].isDuplicate).toBe(false);
    expect(r1.totalShard).toBe(0);
    expect(r2.totalShard).toBe(20);
    expect(r3.totalShard).toBe(20);

    const result = h.assertConservation({ shard: 40 }, { star: 300 }); // 3 抽×100 消耗，2 重复×20 产出
    expect(result.allOk).toBe(true);
    expect(h.ledger.getBalance('star')).toBe(700);
    expect(h.ledger.getBalance('shard')).toBe(40);
  });

  it('ledger 唯一：同 requestId 仅扣一次（幂等经 ledger）', () => {
    const h = makeHarness({ initial: { star: 1000, food: 0, diamond: 0, shard: 0 } });
    const e = new GachaEngine({
      ledger: h.ledger,
      rng: makeSeededRng(3),
      newbieWindow: false,
      decide: () => 'R',
      pickAnimal: () => 'r1',
      roster: { R: ['r1'], SR: [], SSR: [] },
    });
    e.drawSingle({ currency: 'star', requestId: 'same' });
    e.drawSingle({ currency: 'star', requestId: 'same' }); // 重复 id → 不二次扣
    e.drawSingle({ currency: 'star', requestId: 'same' }); // 再重复 → 仍不扣
    const result = h.assertConservation({}, { star: 100 });
    expect(result.allOk).toBe(true);
    expect(h.ledger.getBalance('star')).toBe(900); // 仅扣 100 一次
  });
});

describe('E3 集成 · 十连闭环（9 折 + 保底）', () => {
  it('十连扣 900 星券；保底 ≥1SR；重复碎片守恒', () => {
    const h = makeHarness({ initial: { star: 2000, food: 0, diamond: 0, shard: 0 } });
    const e = new GachaEngine({
      ledger: h.ledger,
      rng: makeSeededRng(2),
      newbieWindow: false,
      decide: () => 'R', // 全 R，触发十连保底强制末位 SR
      roster: { R: ['r1'], SR: ['sr1', 'sr2', 'sr3', 'sr4'], SSR: [] },
    });
    const r = e.drawTen({ currency: 'star', requestId: 'ten1' });
    expect(r.draws[9].rarity).toBe('SR'); // 保底末位 SR
    expect(r.draws.some((d) => d.rarity === 'SR' || d.rarity === 'SSR')).toBe(true);

    // 10 抽：首抽 r1 新（0），其后 9 抽 r1 重复（9×20=180）；保底 SR 重选 sr_X 未拥有 → 0
    const result = h.assertConservation({ shard: 180 }, { star: 900 });
    expect(result.allOk).toBe(true);
    expect(r.totalShard).toBe(180);
    expect(h.ledger.getBalance('star')).toBe(1100);
    expect(h.ledger.getBalance('shard')).toBe(180);
  });
});

describe('E3 集成 · 钻石路径 + 双货币隔离', () => {
  it('钻石扣费走 diamond，不扣星券；food 隔离不动', () => {
    const h = makeHarness({ initial: { star: 1000, food: 777, diamond: 1e9, shard: 0 } });
    const e = new GachaEngine({
      ledger: h.ledger,
      rng: makeSeededRng(4),
      newbieWindow: false,
      decide: () => 'R',
      pickAnimal: () => 'r1',
      roster: { R: ['r1'], SR: [], SSR: [] },
    });
    const r = e.drawSingle({ currency: 'diamond', requestId: 'dia1' });
    expect(r.ok).toBe(true);
    const result = h.assertConservation({ shard: 0 }, { diamond: 100 });
    expect(result.allOk).toBe(true);
    expect(h.ledger.getBalance('star')).toBe(1000); // 星券不动
    expect(h.ledger.getBalance('diamond')).toBe(1e9 - 100);
    expect(h.ledger.getBalance('food')).toBe(777); // 隔离：食材不动
  });
});

describe('E3 集成 · 货币不足不扣费（弱网/断线语义）', () => {
  it('星券不足 → 账本零变化', () => {
    const h = makeHarness({ initial: { star: 50, food: 0, diamond: 0, shard: 0 } });
    const e = new GachaEngine({ ledger: h.ledger, rng: makeSeededRng(5), newbieWindow: false });
    const r = e.drawSingle({ currency: 'star', requestId: 'poor' });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('INSUFFICIENT');
    const result = h.assertConservation({}, {}); // 无产出无消耗
    expect(result.allOk).toBe(true);
    expect(h.ledger.getBalance('star')).toBe(50); // 未扣
    expect(h.ledger.getBalance('shard')).toBe(0);
  });

  it('钻石不足 → 账本零变化，星券不动', () => {
    const h = makeHarness({ initial: { star: 1e9, food: 0, diamond: 50, shard: 0 } });
    const e = new GachaEngine({ ledger: h.ledger, rng: makeSeededRng(6), newbieWindow: false });
    const r = e.drawTen({ currency: 'diamond', requestId: 'poor-dia' });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('INSUFFICIENT');
    const result = h.assertConservation({}, {});
    expect(result.allOk).toBe(true);
    expect(h.ledger.getBalance('diamond')).toBe(50);
    expect(h.ledger.getBalance('star')).toBe(1e9);
  });
});

describe('E3 集成 · 跨批次多抽累计守恒', () => {
  it('混合单抽/十连跨批次，Σ消耗 == Σ产出 + Δ余额', () => {
    const h = makeHarness({ initial: { star: 1e9, food: 0, diamond: 0, shard: 0 } });
    const e = new GachaEngine({
      ledger: h.ledger,
      rng: makeSeededRng(8),
      newbieWindow: false,
      decide: () => 'R',
      roster: { R: ['r1'], SR: [], SSR: [] },
    });
    e.drawSingle({ currency: 'star', requestId: 'a1' }); // 新：0 碎片
    e.drawSingle({ currency: 'star', requestId: 'a2' }); // 重复：+20
    e.drawTen({ currency: 'star', requestId: 'a3' }); // 10 抽全 R/r1：1 新 + 9 重复 = +180
    // 累计消耗 star = 100 + 100 + 900 = 1100；
    // 累计碎片：a1 新(0) + a2 重复(20) + a3 十连 10 抽全重复(10×20=200) = 220
    const result = h.assertConservation({ shard: 220 }, { star: 1100 });
    expect(result.allOk).toBe(true);
    expect(h.ledger.getBalance('star')).toBe(1e9 - 1100);
    expect(h.ledger.getBalance('shard')).toBe(220);
  });
});
