'use strict';

/**
 * 垂直切片编排：顾客带需求上门 → 三岗服务 → 结算(星券/食材) → 解锁菜品。
 * 把 E4 / E11 / E12 的逻辑模块组装成可跑通的核心循环，证明「闭环可跑通」（Sprint 1 DoD）。
 *
 * 零 wx / 引擎依赖；不持有 UI 状态（UI 只读，状态归此服务端权威逻辑层）。
 */

const { TUNED } = require('../config/tunables');
const ieff = require('../economy/ieff');
const { DishManager } = require('./dish');
const { StaffSchedule, createStaff } = require('./staff');
const { spawnCustomer, matchServiceable } = require('./customer');

class Restaurant {
  constructor(opts) {
    opts = opts || {};
    if (!opts.ledger) throw new Error('Restaurant requires a Ledger instance');
    this.ledger = opts.ledger;
    this.dishes = new DishManager(this.ledger, {
      initialDishes: opts.initialDishes || ['dish_1', 'dish_2'],
    });
    this.schedule = new StaffSchedule(opts.staff || []);
    this.config = {
      C: opts.C != null ? opts.C : TUNED.C_INIT,
      recipeLv: opts.recipeLv || 1,
      stationLv: opts.stationLv || 1,
      bondFamilyCount: opts.bondFamilyCount || 0,
      adMult: opts.adMult || 1,
      activeBonus: opts.activeBonus || 0,
      foodRate: opts.foodRate != null ? opts.foodRate : TUNED.FOOD_RATE,
    };
  }

  setActiveBonus(v) {
    this.config.activeBonus = v;
  }
  setAdMult(v) {
    this.config.adMult = v;
  }

  /** 计算当前 I_eff（含三岗加成 + 适配 + 主动 + 羁绊 idle）。 */
  computeIeff() {
    const b = this.schedule.breakdown();
    const bondIdle = ieff.bondIdleMult(this.config.bondFamilyCount);
    return ieff.computeIeff({
      C: this.config.C,
      recipeLv: this.config.recipeLv,
      stationLv: this.config.stationLv,
      chefMult: b.chef_mult,
      waiterMult: b.waiter_mult,
      hostMult: b.host_mult,
      bondIdleMult: bondIdle,
      adMult: this.config.adMult,
      activeBonus: this.config.activeBonus,
    });
  }

  /**
   * 服务一名顾客：可服务则按 dt 结算星券 + 食材（星券 = I_eff × dt，食材 = foodRate × dt）；
   * 不可服务则零产出、无惩罚。
   * @param {object} customer
   * @param {number} dt        结算时长（秒）
   * @param {string} requestId 结算幂等键
   */
  serve(customer, dt, requestId) {
    const b = this.schedule.breakdown();
    const m = matchServiceable(customer, {
      unlockedDishes: this.dishes.unlocked,
      onDutyRoles: b.onDutyRoles,
    });
    if (!m.serviceable) {
      return {
        serviceable: false,
        unlocked: m.unlocked,
        staffed: m.staffed,
        earned: { star: 0, food: 0 },
      };
    }
    const Ieff = this.computeIeff();
    const starGain = Ieff * dt;
    const foodGain = this.config.foodRate * dt;
    const res = this.ledger.apply(requestId, { star: starGain, food: foodGain });
    // Sprint2 工程化·C1 幂等返回修正：仅当「成功且非重复 requestId」才计为已入账；
    // 重复 requestId（res.dup）虽底层 ok=true（缓存首次结果），但本次未实际结算，
    // 故 earned/ledgerOk 归零，避免生产层向调用方谎报二次产出。账本余额本身已唯一（ledger 幂等）。
    const applied = res.ok && !res.dup;
    return {
      serviceable: true,
      unlocked: true,
      staffed: true,
      Ieff,
      earned: applied ? { star: starGain, food: foodGain } : { star: 0, food: 0 },
      ledgerOk: applied,
      dup: res.dup,
    };
  }

  /** 解锁菜品（委托 DishManager，原子扣费）。 */
  unlockDish(dishId, requestId) {
    return this.dishes.unlock(dishId, requestId);
  }
}

module.exports = { Restaurant, createStaff, spawnCustomer, matchServiceable };
