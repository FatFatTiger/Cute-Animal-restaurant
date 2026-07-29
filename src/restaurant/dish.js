'use strict';

/**
 * 菜品解锁：原子扣费（星券 + 食材同一事务同时扣减），维护 unlocked_dishes 集合。
 * 支撑 E11 + 不变量 6（菜品解锁扣费原子性）。
 *
 * 成本曲线（§3.5，n 0-based，tunable，引用 GDD v0.2）：
 *   unlock_cost_star(n) = 200 × 1.35^n
 *   unlock_cost_food(n) = 40  × 1.30^n
 * n = 玩家发起解锁的顺序索引（0-based）；出生时免费解锁的基础菜不占索引。
 *
 * 原子性语义（不变量 6）：
 *  - success：星券与食材在同一账本事中同时扣减。
 *  - no partial：任一侧余额不足 → 两侧均不扣减，unlocked_dishes 不变，无悬挂账本。
 *  - 幂等：requestId 幂等（复用 E6 单值源语义）。同 requestId 只计一次；
 *    跨菜复用同一 requestId 亦被拦截（防「成功 memo 误开他菜」）。
 */

const { TUNED } = require('../config/tunables');

function unlockCostStar(n) {
  return Math.round(TUNED.UNLOCK_COST_STAR_BASE * Math.pow(TUNED.UNLOCK_COST_STAR_RATE, n));
}

function unlockCostFood(n) {
  return Math.round(TUNED.UNLOCK_COST_FOOD_BASE * Math.pow(TUNED.UNLOCK_COST_FOOD_RATE, n));
}

class DishManager {
  /**
   * @param {object} ledger  E6 单值源账本实例（支持 requestId 幂等）
   * @param {object} [opts]  { initialDishes: string[] } 出生时即解锁的基础菜（1–2 道）
   */
  constructor(ledger, opts) {
    if (!ledger || typeof ledger.apply !== 'function') {
      throw new Error('DishManager requires a Ledger instance');
    }
    this.ledger = ledger;
    this._unlocked = new Set((opts && opts.initialDishes) || ['dish_1', 'dish_2']);
    this._nextIndex = 0; // 玩家发起解锁的顺序索引（0-based），基础菜不占索引
    this._usedRequests = new Map(); // requestId -> dishId（防跨菜复用 / 幂等）
  }

  get unlocked() {
    return this._unlocked;
  }

  isUnlocked(dishId) {
    return this._unlocked.has(dishId);
  }

  /** 下一道待解锁菜的成本（n = 当前 nextIndex）。 */
  nextCost() {
    const n = this._nextIndex;
    return { n, star: unlockCostStar(n), food: unlockCostFood(n) };
  }

  /**
   * 解锁一道菜。
   * @returns {{ok:boolean, dishId:string, reason?:string, costStar?:number, costFood?:number, n?:number, dup?:boolean}}
   */
  unlock(dishId, requestId) {
    if (this._unlocked.has(dishId)) {
      return { ok: false, reason: 'ALREADY_UNLOCKED', dishId };
    }
    if (this._usedRequests.has(requestId)) {
      // 同 requestId 已用于某次解锁（成功或失败），复用只计一次，杜绝跨菜误开
      return { ok: false, reason: 'REQUEST_ID_DUP', dishId, dup: true };
    }
    const n = this._nextIndex;
    const costStar = unlockCostStar(n);
    const costFood = unlockCostFood(n);
    const res = this.ledger.apply(requestId, { star: -costStar, food: -costFood });
    this._usedRequests.set(requestId, dishId); // 无论成败都标记，防跨菜复用
    if (!res.ok) {
      return { ok: false, reason: res.reason, dishId, dup: false };
    }
    this._unlocked.add(dishId);
    this._nextIndex += 1;
    return { ok: true, dishId, costStar, costFood, n, dup: false };
  }
}

module.exports = { DishManager, unlockCostStar, unlockCostFood };
