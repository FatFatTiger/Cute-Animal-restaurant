'use strict';

/**
 * 四货币单值源账本，支持 requestId 幂等（支撑不变量 3）。
 *
 * 货币（双货币隔离 / 四货币体系，见任务书锁参红线）：
 *  - star   星券：免费，放置经营唯一生产源
 *  - diamond 钻石：付费，不经由放置经营产出
 *  - food    食材：经营副产（厨房工位）
 *  - shard   碎片：抽卡重复转化
 *
 * 设计要点：
 *  - apply(requestId, deltas)：所有 delta 一次性结算（原子）。任一货币扣减后 < 0 → 整体拒绝，无部分扣减。
 *  - requestId 幂等：采用「幂等键」语义——首次结果被缓存并复用（成功或失败都缓存），
 *    同 requestId 重复提交只计一次；重新发起应使用新的 requestId。
 *  - 零 wx / 引擎依赖，可 Node 直跑。
 */

const CURRENCIES = ['star', 'diamond', 'food', 'shard'];

function emptyBalances() {
  return { star: 0, diamond: 0, food: 0, shard: 0 };
}

class Ledger {
  constructor(initial) {
    this._balances = Object.assign(emptyBalances(), initial || {});
    this._seen = new Map(); // requestId -> { ok, applied, reason }
  }

  getBalance(currency) {
    return this._balances[currency] || 0;
  }

  snapshot() {
    return Object.assign({}, this._balances);
  }

  currencies() {
    return CURRENCIES.slice();
  }

  /** 校验一组 delta 是否可负担（任一货币扣减后 < 0 则不可）。 */
  canAfford(deltas) {
    for (const c of CURRENCIES) {
      const d = deltas[c] || 0;
      if (d < 0 && this._balances[c] + d < 0) return false;
    }
    return true;
  }

  /**
   * 原子 apply：所有 delta 一次性结算；任一不足则整体拒绝（无部分扣减）。
   * requestId 幂等：同 requestId 重复提交只计一次（首次结果被缓存并复用）。
   * @returns {{ok:boolean, applied:boolean, dup:boolean, reason:?string}}
   */
  apply(requestId, deltas) {
    if (this._seen.has(requestId)) {
      const prev = this._seen.get(requestId);
      // 本次调用未产生新变更；ok 复用首次结果，applied 恒为 false
      return { ok: prev.ok, applied: false, dup: true, reason: prev.reason || null };
    }
    if (!this.canAfford(deltas)) {
      this._seen.set(requestId, { ok: false, applied: false, reason: 'INSUFFICIENT' });
      return { ok: false, applied: false, dup: false, reason: 'INSUFFICIENT' };
    }
    for (const c of CURRENCIES) {
      const d = deltas[c] || 0;
      this._balances[c] += d;
    }
    this._seen.set(requestId, { ok: true, applied: true, reason: null });
    return { ok: true, applied: true, dup: false, reason: null };
  }
}

module.exports = { Ledger, CURRENCIES, emptyBalances };
