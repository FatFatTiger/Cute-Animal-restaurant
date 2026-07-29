'use strict';

/**
 * T1 单元测试 · 经济与核心公式
 * 覆盖：不变量 3（货币守恒 + requestId 幂等）、不变量 5（离线封顶 offline_factor=0.20）、
 *       I_eff 公式正确（含 §3.3 适配整乘口径）、不变量 6（菜品解锁扣费原子性）。
 *
 * 零引擎依赖，jest 直跑。
 */

const { Ledger } = require('../../src/economy/ledger');
const ieff = require('../../src/economy/ieff');
const { DishManager, unlockCostStar, unlockCostFood } = require('../../src/restaurant/dish');
const { TUNED, LOCKED } = require('../../src/config/tunables');
const { Restaurant, createStaff } = require('../../src/restaurant/restaurant');

// 已知 I_eff 构造（用于离线/集成断言，避免魔法数）：
//   host lv1 适配host → host_mult=1.5 → C_eff=4×1.5=6
//   chef lv3 适配chef → (1+0.08×2)×1.5 = 1.74
//   waiter lv2 非适配  → (1+0.08×1)      = 1.08
//   I_eff = 6 × 0.04 × 1.74 × 1.08 = 0.451008
function knownIeff() {
  const staff = [
    createStaff({ id: 'h', affinityRole: 'host', level: 1 }),
    createStaff({ id: 'c', affinityRole: 'chef', level: 3 }),
    createStaff({ id: 'w', affinityRole: 'chef', level: 2 }),
  ];
  const r = new Restaurant({ ledger: new Ledger(), staff });
  r.schedule.assign('h', 'host');
  r.schedule.assign('c', 'chef');
  r.schedule.assign('w', 'waiter');
  return r.computeIeff();
}

describe('不变量 3 · 货币守恒 + requestId 幂等', () => {
  it('同一 requestId 重复提交只计一次（幂等）', () => {
    const l = new Ledger({ star: 0 });
    const r1 = l.apply('P1', { star: +100 });
    const r2 = l.apply('P1', { star: +100 }); // 重复
    expect(r1.ok).toBe(true);
    expect(r2.dup).toBe(true);
    expect(r2.applied).toBe(false);
    expect(l.getBalance('star')).toBe(100); // 只 +100 一次
  });

  it('Σ产出 == Σ消耗 + Δ余额（货币守恒）', () => {
    const l = new Ledger({ star: 0 });
    l.apply('P1', { star: +100 }); // 产 100
    l.apply('C1', { star: -30 }); // 耗 30
    l.apply('C2', { star: -20 }); // 耗 20
    // Σ产=100, Σ耗=50, Δ=50
    expect(l.getBalance('star')).toBe(50);
  });

  it('任一侧余额不足 → 整体拒绝（无部分扣减）', () => {
    const l = new Ledger({ star: 10, food: 0 });
    const r = l.apply('X', { star: -5, food: -10 });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('INSUFFICIENT');
    expect(l.getBalance('star')).toBe(10); // 未扣
    expect(l.getBalance('food')).toBe(0); // 未扣
  });

  it('钻石不经由放置经营产出路径进入（serve 只结算 star/food）', () => {
    const l = new Ledger();
    const r = new Restaurant({
      ledger: l,
      staff: [createStaff({ id: 'c', affinityRole: 'chef', level: 2 })],
    });
    r.schedule.assign('c', 'chef');
    const cust = { id: 'c', dishDemand: 'dish_1', seatId: 0 };
    r.serve(cust, 10, 'serve-diamond');
    expect(l.getBalance('star')).toBeGreaterThan(0); // 星券产出
    expect(l.getBalance('food')).toBeGreaterThan(0); // 食材副产
    expect(l.getBalance('diamond')).toBe(0); // 钻石不进放置产出
    expect(l.getBalance('shard')).toBe(0);
  });
});

describe('不变量 5 · 离线收益封顶 (offline_factor=0.20 锁参)', () => {
  const I = knownIeff(); // 0.451008

  it('offline_factor 为锁参红线 0.20（不可调参）', () => {
    expect(LOCKED.OFFLINE_FACTOR).toBe(0.2);
  });

  it('accumulated = I_eff × 0.20 × min(T_off, T_cap)', () => {
    const under = ieff.offlineAccumulated(I, 10000); // 10000 < T_cap(14400)
    expect(under).toBeCloseTo(I * 0.2 * 10000, 6);
    const exact = ieff.offlineAccumulated(I, 10000, { offlineFactor: 0.2, T_cap: LOCKED.T_CAP_INIT });
    expect(exact).toBeCloseTo(I * 0.2 * 10000, 6);
  });

  it('T_off 超过 T_cap 部分不累积（软上限防通胀）', () => {
    const over = ieff.offlineAccumulated(I, 20000); // 20000 > 14400
    expect(over).toBeCloseTo(I * 0.2 * LOCKED.T_CAP_INIT, 6);
    expect(over).toBeLessThan(I * 0.2 * 20000); // 不按全额累积
  });
});

describe('I_eff 公式正确性（§3.3 口径 / 适配整乘）', () => {
  it('全乘区为 1 时 I_eff = C × Y_base', () => {
    expect(ieff.computeIeff({ C: 4 })).toBeCloseTo(4 * TUNED.Y_BASE, 9);
  });

  it('适配加成 = 主适配岗整乘 ×1.5（非内嵌进增量项）— R1 复核回归', () => {
    const aff = createStaff({ id: 'a', affinityRole: 'chef', level: 3 });
    const non = createStaff({ id: 'b', affinityRole: 'waiter', level: 3 }); // 在 chef 岗非适配
    // §3.3 正确口径：(1 + 0.08×2) × 1.5 = 1.16 × 1.5 = 1.74
    expect(ieff.staffRoleMult(aff, 'chef')).toBeCloseTo(1.74, 9);
    expect(ieff.staffRoleMult(non, 'chef')).toBeCloseTo(1.16, 9);
    // 明确否定旧错误口径 1 + 0.08×2×1.5 = 1.24
    expect(ieff.staffRoleMult(aff, 'chef')).not.toBeCloseTo(1.24, 6);
  });

  it('host 用 0.06 系数；适配 host lv1 → ×1.5', () => {
    const host = createStaff({ id: 'h', affinityRole: 'host', level: 1 });
    expect(ieff.staffRoleMult(host, 'host')).toBeCloseTo(1.5, 9);
    const hostLv = createStaff({ id: 'h2', affinityRole: 'host', level: 5 });
    expect(ieff.staffRoleMult(hostLv, 'host')).toBeCloseTo((1 + 0.06 * 4) * 1.5, 9);
  });

  it('多员工同岗乘区叠加（非简单相加）', () => {
    const s1 = createStaff({ id: '1', affinityRole: 'chef', level: 1 });
    const s2 = createStaff({ id: '2', affinityRole: 'chef', level: 1 });
    s1.role = 'chef';
    s2.role = 'chef';
    // 各 (1+0)×1.5=1.5，乘积 2.25，而非 1.5+1.5=3.0
    expect(ieff.roleMult([s1, s2], 'chef')).toBeCloseTo(2.25, 9);
    expect(ieff.roleMult([s1, s2], 'chef')).not.toBeCloseTo(3.0, 6);
  });

  it('主动加成 active_bonus 仅做增量、不削弱被动', () => {
    const passive = ieff.computeIeff({ C: 4, activeBonus: 0 });
    const active = ieff.computeIeff({ C: 4, activeBonus: TUNED.ACTIVE_BONUS });
    expect(active).toBeGreaterThan(passive);
    expect(active).toBeCloseTo(passive * (1 + TUNED.ACTIVE_BONUS), 9);
  });

  it('羁绊 idle 倍率 +3%/只，前 10 只计，上限 +30%', () => {
    expect(ieff.bondIdleMult(0)).toBe(1);
    expect(ieff.bondIdleMult(1)).toBeCloseTo(1.03, 9);
    expect(ieff.bondIdleMult(10)).toBeCloseTo(1.3, 9);
    expect(ieff.bondIdleMult(15)).toBeCloseTo(1.3, 9); // 超 10 只仍封顶 +30%
  });

  it('knownIeff 与手算一致 = 0.451008（三岗 + 适配口径串联）', () => {
    expect(knownIeff()).toBeCloseTo(0.451008, 6);
  });
});

describe('不变量 6 · 菜品解锁扣费原子性', () => {
  let ledger, dm;
  beforeEach(() => {
    ledger = new Ledger({ star: 300, food: 50 });
    dm = new DishManager(ledger, { initialDishes: ['dish_1'] });
  });

  it('success 路径：星券 + 食材在同一事务同时扣减', () => {
    const res = dm.unlock('dish_3', 'r1');
    expect(res.ok).toBe(true);
    expect(res.costStar).toBe(200);
    expect(res.costFood).toBe(40);
    expect(ledger.getBalance('star')).toBe(100);
    expect(ledger.getBalance('food')).toBe(10);
    expect(dm.isUnlocked('dish_3')).toBe(true);
  });

  it('no partial：任一侧不足 → 两侧均不扣减、账本无悬挂、不解锁', () => {
    // 新建账本：star=300 food=0；首个解锁（n=0）需 star200 food40 → food 不足
    const l2 = new Ledger({ star: 300, food: 0 });
    const dm2 = new DishManager(l2, { initialDishes: ['dish_1'] });
    const res = dm2.unlock('dish_4', 'r2');
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('INSUFFICIENT');
    expect(l2.getBalance('star')).toBe(300); // 未扣
    expect(l2.getBalance('food')).toBe(0); // 未扣
    expect(dm2.isUnlocked('dish_4')).toBe(false);
  });

  it('幂等（同 requestId 只计一次）：跨菜复用同一 requestId 被拦截', () => {
    const r1 = dm.unlock('dish_3', 'r-idem');
    const r2 = dm.unlock('dish_5', 'r-idem'); // 同 id，不同菜
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(false);
    expect(r2.reason).toBe('REQUEST_ID_DUP');
    expect(dm.isUnlocked('dish_5')).toBe(false);
    expect(ledger.getBalance('star')).toBe(300 - 200); // 只扣一次
  });

  it('重复解锁同菜（同 requestId）→ ALREADY_UNLOCKED，无二次扣费', () => {
    const r1 = dm.unlock('dish_3', 'r-same');
    const r2 = dm.unlock('dish_3', 'r-same');
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(false);
    expect(r2.reason).toBe('ALREADY_UNLOCKED');
    expect(ledger.getBalance('star')).toBe(300 - 200);
  });

  it('成本曲线与 v0.2 公式一致且单调递增（tunable）', () => {
    expect(unlockCostStar(0)).toBe(200);
    expect(unlockCostStar(1)).toBeCloseTo(200 * 1.35, 6);
    expect(unlockCostStar(2)).toBe(Math.round(200 * Math.pow(1.35, 2)));
    expect(unlockCostFood(0)).toBe(40);
    expect(unlockCostFood(1)).toBeCloseTo(40 * 1.3, 6);
    let prev = -1;
    for (let n = 0; n < 6; n++) {
      const c = unlockCostStar(n);
      expect(c).toBeGreaterThan(prev);
      prev = c;
    }
  });

  it('初始默认解锁基础菜（新手期核心循环可跑通）', () => {
    const dm2 = new DishManager(new Ledger(), { initialDishes: ['dish_1', 'dish_2'] });
    expect(dm2.isUnlocked('dish_1')).toBe(true);
    expect(dm2.isUnlocked('dish_2')).toBe(true);
  });
});
