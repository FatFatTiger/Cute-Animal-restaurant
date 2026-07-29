'use strict';

/**
 * T2 集成测试 · Sprint 1 QA 缺口补齐（C1 / C2）
 * 零引擎依赖，jest 直跑。
 *
 * C1（serve 层 requestId 幂等）：Restaurant.serve 对同一个 requestId 重复结算，
 *     仅入账一次，第二次为 dup（ledger 幂等上推到生产层）。
 * C2（消除 dead helper）：
 *   - 引用 tests/helpers/clock.js：offlineFromClock 防本地时钟回拨（now < lastSeen → 0 收益）。
 *   - 引用 tests/helpers/economy-harness.js：跨批次多货币守恒 assertConservation 端到端校验。
 */

const { Ledger } = require('../../src/economy/ledger');
const ieff = require('../../src/economy/ieff');
const { Restaurant, createStaff } = require('../../src/restaurant/restaurant');
const { DishManager } = require('../../src/restaurant/dish');
const { Clock } = require('../helpers/clock');
const { makeHarness } = require('../helpers/economy-harness');

function buildOpenRestaurant(opts) {
  opts = opts || {};
  const ledger = opts.ledger || new Ledger({ star: opts.star || 0, food: opts.food || 0 });
  const r = new Restaurant({
    ledger,
    initialDishes: opts.dishes || ['dish_1', 'dish_2'],
    staff: [createStaff({ id: 'c', affinityRole: 'chef', level: 2 })],
  });
  r.schedule.assign('c', 'chef');
  return r;
}

describe('C1 · serve 层 requestId 幂等（生产层补齐）', () => {
  it('同一 requestId 重复 serve 仅入账一次（dup 不二次结算）', () => {
    const r = buildOpenRestaurant({ star: 0, food: 0 });
    const cust = { id: 'c1', dishDemand: 'dish_1', seatId: 0 };
    const before = r.ledger.snapshot().star;

    const s1 = r.serve(cust, 10, 'C1-serve');
    const afterFirst = r.ledger.getBalance('star');
    expect(s1.serviceable).toBe(true);
    expect(afterFirst).toBeGreaterThan(before); // 首次入账

    const s2 = r.serve(cust, 10, 'C1-serve'); // 同一 requestId
    const afterSecond = r.ledger.getBalance('star');
    expect(s2.dup).toBe(true); // ledger 幂等上推到生产层
    expect(s2.ledgerOk).toBe(false);
    expect(s2.earned.star).toBe(0);
    expect(afterSecond).toBe(afterFirst); // 余额不变 = 仅入账一次
  });

  it('不同 requestId 各自独立结算（不互相干扰）', () => {
    const r = buildOpenRestaurant({ star: 0, food: 0 });
    const cust = { id: 'c2', dishDemand: 'dish_1', seatId: 0 };
    const s1 = r.serve(cust, 10, 'C1-a');
    const s2 = r.serve(cust, 10, 'C1-b');
    expect(s1.dup).toBe(false);
    expect(s2.dup).toBe(false);
    // 两次独立结算，余额 = 2 × 单次收益
    expect(r.ledger.getBalance('star')).toBeCloseTo(s1.earned.star + s2.earned.star, 6);
  });

  it('不可服务顾客（未解锁）即便用新 requestId 也不入账（无惩罚）', () => {
    const r = buildOpenRestaurant({ star: 0, food: 0, dishes: ['dish_1', 'dish_2'] });
    const cust = { id: 'c3', dishDemand: 'dish_9', seatId: 0 }; // 未解锁
    const before = r.ledger.snapshot();
    const s = r.serve(cust, 10, 'C1-locked');
    expect(s.serviceable).toBe(false);
    expect(r.ledger.snapshot()).toEqual(before); // 账本不变
  });
});

describe('C2 · 引用 clock.js —— 离线防时钟回拨', () => {
  const Ieff = 0.451008;

  it('正常时钟：T_off = now − lastSeen，离线收益按公式计算', () => {
    const clock = new Clock(3600 * 1000); // 距 lastSeen 1 小时
    const acc = ieff.offlineFromClock(Ieff, clock, 0);
    const expected = Ieff * LOCKED_OFFLINE() * Math.min(3600, LOCKED_TCAP());
    expect(acc).toBeCloseTo(expected, 6);
  });

  it('时钟回拨（now < lastSeen）：离线收益夹到 0，杜绝负收益', () => {
    const clock = new Clock(-1000); // now 早于 lastSeen(0)
    const acc = ieff.offlineFromClock(Ieff, clock, 0);
    expect(acc).toBe(0); // 防回拨
  });

  it('超 T_cap 仍受软上限约束（不变量 5 经由时钟路径一致）', () => {
    const clock = new Clock(100 * 3600 * 1000); // 100 小时
    const acc = ieff.offlineFromClock(Ieff, clock, 0);
    expect(acc).toBeCloseTo(Ieff * LOCKED_OFFLINE() * LOCKED_TCAP(), 6);
    expect(acc).toBeLessThan(Ieff * LOCKED_OFFLINE() * 100 * 3600);
  });

  function LOCKED_OFFLINE() {
    return ieff.LOCKED.OFFLINE_FACTOR;
  }
  function LOCKED_TCAP() {
    return ieff.LOCKED.T_CAP_INIT;
  }
});

describe('C2 · 引用 economy-harness.js —— 跨批次货币守恒', () => {
  it('跨批次 产+耗 整数 delta，harness 守恒 allOk（消除 dead helper）', () => {
    // 用整数 delta 经 ledger 注入 + 消耗，直接驱动 harness.assertConservation，
    // 验证「Σ产出 == Σ消耗 + Δ余额」端到端（不变量 3 批次口径）。
    const h = makeHarness({ initial: { star: 1000, food: 500, diamond: 0, shard: 0 } });
    h.ledger.apply('batch-p1', { star: +300, food: +120 }); // 批次产出
    h.ledger.apply('batch-c1', { star: -200, food: -40 }); // 批次消耗
    h.ledger.apply('batch-c2', { shard: +5 });
    const produced = { star: 300, food: 120, shard: 5 };
    const consumed = { star: 200, food: 40 };
    const result = h.assertConservation(produced, consumed);
    expect(result.allOk).toBe(true);
    expect(result.final.star).toBe(1100);
    expect(result.final.food).toBe(580);
    expect(result.final.shard).toBe(5);
  });

  it('serve 走放置产出路径，harness 核验 diamond 恒为 0（双货币隔离）', () => {
    const h = makeHarness({ initial: { star: 0, food: 0, diamond: 0 } });
    const r = new Restaurant({
      ledger: h.ledger,
      initialDishes: ['dish_1', 'dish_2'],
      staff: [createStaff({ id: 'c', affinityRole: 'chef', level: 2 })],
    });
    r.schedule.assign('c', 'chef');
    const served = r.serve({ id: 'c', dishDemand: 'dish_1', seatId: 0 }, 10, 'produce-2');
    const result = h.assertConservation(
      { star: served.earned.star, food: served.earned.food },
      {}
    );
    // 放置产出只含 star/food，diamond 永不进入放置路径（GDD 双货币隔离）。
    expect(result.final.diamond).toBe(0);
    expect(served.earned.star).toBeGreaterThan(0);
  });
});
