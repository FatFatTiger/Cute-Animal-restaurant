'use strict';

/**
 * 餐厅事件流（主收入流，§2.5.1）单测：
 *  - 可运营下跑满 T_ORDER 秒恰结算一单 ≈ I_eff × T_ORDER；
 *  - 「加把劲」active 窗口内订单奖励 ×(1 + ACTIVE_BONUS)；
 *  - 同等时间内餐厅总收益 ≫ 宿舍总收益（验证「餐厅为主」）。
 * 与 idle 引擎（宿舍时间流）职责分离，账本前缀 'serve-' 隔离，绝不双计。
 */

const { Ledger } = require('../../src/economy/ledger');
const { createServeAccrual } = require('../../src/restaurant/serve-accrual');
const { createIdleEngine } = require('../../src/economy/idle');
const { Restaurant, createStaff, spawnCustomer } = require('../../src/restaurant/restaurant');
const { TUNED, LOCKED } = require('../../src/config/tunables');

// 构造可运营的餐厅：3 岗各 1 名员工（均主适配岗），2 道已解锁菜，1 名 demand dish_1 的顾客
function makeOperableWorld() {
  const ledger = new Ledger({});
  const chef = createStaff({ id: 's_chef', affinityRole: 'chef', level: 1 });
  const waiter = createStaff({ id: 's_waiter', affinityRole: 'waiter', level: 1 });
  const host = createStaff({ id: 's_host', affinityRole: 'host', level: 1 });
  const restaurant = new Restaurant({
    ledger,
    initialDishes: ['dish_1', 'dish_2'],
    staff: [chef, waiter, host],
    C: 4, recipeLv: 1, stationLv: 1, bondFamilyCount: 0, adMult: 1, activeBonus: 0,
  });
  restaurant.schedule.assign('s_chef', 'chef');
  restaurant.schedule.assign('s_waiter', 'waiter');
  restaurant.schedule.assign('s_host', 'host');
  const customer = spawnCustomer(() => 0, ['dish_1', 'dish_2'], { id: 'c1', seatId: 0 });
  return { ledger, restaurant, customer };
}

// 可注入时钟（测试用）
function makeClock() {
  let t = 0;
  return { now: () => t, set: (v) => { t = v; } };
}

describe('餐厅事件流 · 单单结算（可运营）', () => {
  it('跑满 T_ORDER 秒恰结算一单 ≈ I_eff × T_ORDER', () => {
    const { ledger, restaurant, customer } = makeOperableWorld();
    const Ieff = restaurant.getIeff(); // 0.54
    const clock = makeClock();
    const serve = createServeAccrual({ ledger, getIeff: () => Ieff, restaurant, clock });
    const expected = Math.round(Ieff * TUNED.T_ORDER);

    let settled = 0;
    let orders = 0;
    const totalMs = TUNED.T_ORDER * 1000; // 5s
    for (let t = 0; t < totalMs; t += 100) {
      clock.set((t / 1000 + 0.1) * 1000); // 100ms 步进
      const r = serve.tick(clock.now(), [customer]);
      if (r) { settled += r.star; orders += 1; }
    }
    expect(orders).toBe(1); // 恰结算一单（不多结算）
    expect(settled).toBe(expected); // ≈ I_eff × T_ORDER（取整）
  });

  it('可运营判定：无在岗员工 / 需求未解锁 → 挂起累加器（不结算、不丢）', () => {
    const { ledger, restaurant, customer } = makeOperableWorld();
    const Ieff = restaurant.getIeff();
    const clock = makeClock();
    const serve = createServeAccrual({ ledger, getIeff: () => Ieff, restaurant, clock });

    // 跑满 T_ORDER 秒，但传入空顾客列表（无 serviceable 顾客）→ 不结算
    let orders = 0;
    const totalMs = TUNED.T_ORDER * 1000;
    for (let t = 0; t < totalMs; t += 100) {
      clock.set((t / 1000 + 0.1) * 1000);
      const r = serve.tick(clock.now(), []); // 无顾客 → 不可运营
      if (r) orders += 1;
    }
    expect(orders).toBe(0);
    // 累加器被挂起保留（不丢）：继续给一名可服务顾客 → 立即（在下一 T_ORDER 内）结算
    let settledAfter = 0;
    for (let t = totalMs; t < totalMs + TUNED.T_ORDER * 1000; t += 100) {
      clock.set((t / 1000 + 0.1) * 1000);
      const r = serve.tick(clock.now(), [customer]);
      if (r) { settledAfter += r.star; break; }
    }
    expect(settledAfter).toBeGreaterThan(0); // 之前累积的盈余被延续结算
  });
});

describe('餐厅事件流 · 主动加成（加把劲）', () => {
  it('active 窗口内订单奖励 ×(1 + ACTIVE_BONUS)', () => {
    const { ledger, restaurant, customer } = makeOperableWorld();
    // 注入大 I_eff 以区分加成后的取整（0.54 取整后与被动同值，无法区分）
    const Ieff = 10;
    const clock = makeClock();
    const serve = createServeAccrual({ ledger, getIeff: () => Ieff, restaurant, clock });

    // 0..2000ms 不激活（accum → 20，threshold = 10×5 = 50，未结算）
    for (let t = 0; t < 2000; t += 100) { clock.set(t + 100); serve.tick(clock.now(), [customer]); }
    serve.setActive(clock.now()); // now=2000 → activeUntil=7000
    // 2100..5000ms（accum 达 50，结算；now=5000 < 7000 → 激活）
    let settled = 0;
    for (let t = 2000; t < 5000; t += 100) { clock.set(t + 100); const r = serve.tick(clock.now(), [customer]); if (r) settled += r.star; }

    const expectedActive = Math.round(Ieff * TUNED.T_ORDER * (1 + TUNED.ACTIVE_BONUS));
    const passiveBase = Math.round(Ieff * TUNED.T_ORDER);
    expect(settled).toBe(expectedActive); // 58
    expect(settled).toBeGreaterThan(passiveBase); // > 被动 50（仅做增量）
  });
});

describe('双流经济 · 餐厅为主（同等时间内餐厅总收益 ≫ 宿舍）', () => {
  it('60s 内餐厅主收入 ≫ 宿舍时间流副收入', () => {
    const { ledger: ledgerRest, restaurant, customer } = makeOperableWorld();
    const ledgerDorm = new Ledger({});
    const Ieff = restaurant.getIeff(); // 0.54
    const clock = makeClock();

    const serve = createServeAccrual({ ledger: ledgerRest, getIeff: () => Ieff, restaurant, clock });
    const idle = createIdleEngine({ ledger: ledgerDorm, getIeff: () => Ieff, getFoodRate: () => 0, clock });

    const totalMs = 60000; // 60s
    for (let t = 0; t < totalMs; t += 100) {
      clock.set(t + 100);
      serve.tick(clock.now(), [customer]); // 餐厅主收入流
      idle.tick(clock.now()); // 宿舍时间流（辅）
    }

    const restaurantTotal = ledgerRest.getBalance('star');
    const dormTotal = ledgerDorm.getBalance('star');

    // 餐厅 ≈ I_eff × 60 = 32.4；宿舍 ≈ dormRate × 60 = 0.25×0.54×60 = 8.1 → 餐厅 ≫ 宿舍
    expect(restaurantTotal).toBeGreaterThan(0);
    expect(dormTotal).toBeGreaterThan(0);
    expect(restaurantTotal).toBeGreaterThan(dormTotal * 3); // 占比约 80% vs 20%，明确「餐厅为主」
    expect(dormTotal).toBeCloseTo(0.25 * Ieff * 60, 1); // 宿舍 = dormRate × 时长
  });

  it('离线仅宿舍：idle 离线 accrual 用 dormRate（与餐厅无关）', () => {
    const { ledger, restaurant } = makeOperableWorld();
    const Ieff = restaurant.getIeff();
    const clock = makeClock();
    const idle = createIdleEngine({ ledger, getIeff: () => Ieff, getFoodRate: () => 0, clock });
    clock.set(1000000);
    const off = idle.applyOffline(clock.now() - 100000); // 离线 100s
    // 离线 = 宿舍 only：dormRate × OFFLINE_FACTOR × T_off = 0.25 × 0.54 × 0.2 × 100
    expect(off.pending).toBeCloseTo(TUNED.DORM_SHARE * Ieff * LOCKED.OFFLINE_FACTOR * 100, 5);
  });
});
