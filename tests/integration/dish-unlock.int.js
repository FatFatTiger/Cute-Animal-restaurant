'use strict';

/**
 * T2 集成测试 · 菜品解锁原子扣费 → 账本 → 顾客可点单（E11 / E12 联动，不变量 6）
 * 零引擎依赖，jest 直跑。
 */

const { Ledger } = require('../../src/economy/ledger');
const { DishManager } = require('../../src/restaurant/dish');
const { Restaurant, createStaff } = require('../../src/restaurant/restaurant');

describe('集成 · 菜品解锁原子扣费 → 账本 → 顾客可点单（E11/E12，不变量 6）', () => {
  it('解锁成功：星券+食材同事务双扣，菜进入 unlocked_dishes', () => {
    const ledger = new Ledger({ star: 500, food: 200 });
    const dm = new DishManager(ledger, { initialDishes: ['dish_1'] });
    const res = dm.unlock('dish_3', 'req-1');
    expect(res.ok).toBe(true);
    expect(ledger.getBalance('star')).toBe(500 - 200);
    expect(ledger.getBalance('food')).toBe(200 - 40);
    expect(dm.isUnlocked('dish_3')).toBe(true);
  });

  it('任一侧不足：零扣减、账本无悬挂、不解锁', () => {
    const ledger = new Ledger({ star: 100, food: 0 });
    const dm = new DishManager(ledger, { initialDishes: ['dish_1'] });
    const res = dm.unlock('dish_3', 'req-2'); // 需 star200 food40 → food 不足
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('INSUFFICIENT');
    expect(ledger.getBalance('star')).toBe(100);
    expect(ledger.getBalance('food')).toBe(0);
    expect(dm.isUnlocked('dish_3')).toBe(false);
  });

  it('幂等：同 requestId 重复提交只计一次', () => {
    const ledger = new Ledger({ star: 500, food: 200 });
    const dm = new DishManager(ledger, { initialDishes: ['dish_1'] });
    const r1 = dm.unlock('dish_3', 'req-idem');
    const r2 = dm.unlock('dish_3', 'req-idem'); // 同菜同 id → ALREADY_UNLOCKED
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(false);
    expect(r2.reason).toBe('ALREADY_UNLOCKED');
    expect(ledger.getBalance('star')).toBe(500 - 200); // 只扣一次
  });

  it('解锁后顾客可点单：dish_3 需求 + 在岗 → serviceable 且 I_eff > 0（E11→E12 联动）', () => {
    const ledger = new Ledger({ star: 500, food: 200 });
    const r = new Restaurant({
      ledger,
      initialDishes: ['dish_1'],
      staff: [createStaff({ id: 'c', affinityRole: 'chef', level: 2 })],
    });
    r.schedule.assign('c', 'chef');

    const unlockRes = r.unlockDish('dish_3', 'req-link');
    expect(unlockRes.ok).toBe(true);

    const customer = { id: 'cust_x', dishDemand: 'dish_3', seatId: 0 };
    const serv = r.serve(customer, 10, 'serve-link');
    expect(serv.serviceable).toBe(true);
    expect(serv.Ieff).toBeGreaterThan(0);
    expect(r.ledger.getBalance('star')).toBeGreaterThan(0);
  });

  it('未解锁菜不可被点单（即便有在岗员工也不结算）', () => {
    const ledger = new Ledger({ star: 500, food: 200 });
    const r = new Restaurant({
      ledger,
      initialDishes: ['dish_1'],
      staff: [createStaff({ id: 'c', affinityRole: 'chef', level: 2 })],
    });
    r.schedule.assign('c', 'chef');
    const customer = { id: 'cust_y', dishDemand: 'dish_4', seatId: 0 }; // dish_4 未解锁
    const before = r.ledger.snapshot();
    const serv = r.serve(customer, 10, 'serve-locked');
    expect(serv.serviceable).toBe(false);
    expect(serv.earned.star).toBe(0);
    expect(r.ledger.snapshot()).toEqual(before); // 账本不变，无惩罚
  });
});
