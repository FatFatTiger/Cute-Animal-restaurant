'use strict';

/**
 * T2 集成测试 · 顾客生成 + 需求匹配（不变量 7，E12-S2/S3）
 * 零引擎依赖，jest 直跑。
 */

const { Ledger } = require('../../src/economy/ledger');
const { Restaurant, createStaff, spawnCustomer, matchServiceable } = require('../../src/restaurant/restaurant');
const { makeSeededRng } = require('../helpers/seeded-rng');

function buildRestaurant() {
  const ledger = new Ledger();
  const r = new Restaurant({
    ledger,
    initialDishes: ['dish_1', 'dish_2'],
    staff: [
      createStaff({ id: 'c', affinityRole: 'chef', level: 2 }),
      createStaff({ id: 'w', affinityRole: 'waiter', level: 1 }),
    ],
  });
  r.schedule.assign('c', 'chef');
  r.schedule.assign('w', 'waiter');
  return r;
}

describe('集成 · 顾客生成 + 需求匹配（不变量 7，E12-S2/S3）', () => {
  it('未解锁需求顾客：不可服务、零结算、无惩罚', () => {
    const r = buildRestaurant();
    const cust = { id: 'c1', dishDemand: 'dish_3', seatId: 0 };
    const m = matchServiceable(cust, {
      unlockedDishes: r.dishes.unlocked,
      onDutyRoles: r.schedule.onDutyRoles(),
    });
    expect(m.unlocked).toBe(false);
    expect(m.serviceable).toBe(false);

    const before = r.ledger.snapshot();
    const serv = r.serve(cust, 10, 's1');
    expect(serv.serviceable).toBe(false);
    expect(serv.earned.star).toBe(0);
    expect(serv.earned.food).toBe(0);
    expect(r.ledger.snapshot()).toEqual(before); // 账本不变 = 无惩罚
  });

  it('已解锁 + 在岗：可服务并计入 I_eff（结算星券/食材）', () => {
    const r = buildRestaurant();
    const cust = { id: 'c2', dishDemand: 'dish_1', seatId: 0 };
    const m = matchServiceable(cust, {
      unlockedDishes: r.dishes.unlocked,
      onDutyRoles: r.schedule.onDutyRoles(),
    });
    expect(m.unlocked).toBe(true);
    expect(m.serviceable).toBe(true);

    const Ieff = r.computeIeff();
    const serv = r.serve(cust, 10, 's2');
    expect(serv.serviceable).toBe(true);
    expect(serv.Ieff).toBeCloseTo(Ieff, 9);
    expect(serv.earned.star).toBeCloseTo(Ieff * 10, 9);
    expect(r.ledger.getBalance('diamond')).toBe(0); // 钻石不经由放置产出
  });

  it('无在岗员工：即便已解锁也不可服务', () => {
    const ledger = new Ledger();
    const r = new Restaurant({ ledger, initialDishes: ['dish_1', 'dish_2'], staff: [] }); // 无人上岗
    const cust = { id: 'c3', dishDemand: 'dish_1', seatId: 0 };
    const m = matchServiceable(cust, {
      unlockedDishes: r.dishes.unlocked,
      onDutyRoles: r.schedule.onDutyRoles(),
    });
    expect(m.staffed).toBe(false);
    expect(m.serviceable).toBe(false);
  });

  it('seeded 可复现：同种子 → 同需求序列', () => {
    const pool = ['dish_1', 'dish_2', 'dish_3', 'dish_4'];
    const rngA = makeSeededRng(12345);
    const rngB = makeSeededRng(12345);
    const seqA = [];
    const seqB = [];
    for (let i = 0; i < 20; i++) seqA.push(spawnCustomer(rngA, pool, { index: i }).dishDemand);
    for (let i = 0; i < 20; i++) seqB.push(spawnCustomer(rngB, pool, { index: i }).dishDemand);
    expect(seqA).toEqual(seqB);
  });

  it('需求匹配纯函数：同输入多次运行结果一致（不变量 7 可复现）', () => {
    const cust = { id: 'x', dishDemand: 'dish_2', seatId: 0 };
    const ctx = {
      unlockedDishes: new Set(['dish_1', 'dish_2']),
      onDutyRoles: new Set(['chef', 'waiter']),
    };
    const a = matchServiceable(cust, ctx);
    const ctxB = {
      unlockedDishes: new Set(['dish_1', 'dish_2']),
      onDutyRoles: new Set(['chef', 'waiter']),
    };
    const b = matchServiceable(cust, ctxB);
    expect(a).toEqual(b);
    expect(a.serviceable).toBe(true);
  });
});
