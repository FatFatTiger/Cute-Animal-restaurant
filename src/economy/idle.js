'use strict';

/**
 * 放置经营 · 宿舍时间流（辅）+ 离线收益接线（纯逻辑，零引擎依赖，可 Node 直测）。
 *
 * 双流经济口径（system-idle-restaurant §2.5 / §3.2，2026-07-29 重构）：
 *  - 本引擎只负责「宿舍时间流 + 离线」，纯职责、零餐厅事件流（餐厅主收入流由 game.js 驱动
 *    createServeAccrual 结算，二者账本前缀不同，绝不双计）。
 *  - 在线宿舍流：星券按 dormRate × dt（dormRate = DORM_SHARE × I_eff）、食材按 foodRate × dt
 *    持续累积（场景无关，切到市场/中枢仍后台累积）；直接入账本（requestId 幂等），不经 pending。
 *  - 离线收益：仅宿舍，按 dormRate × offline_factor(=0.20) × min(T_off, T_cap) 折扣。
 *    **先进入 pending 缓冲（待领取），受 cap 限制**（cap = dormRate × OFFLINE_CAP_HOURS × OFFLINE_FACTOR）；
 *    达上限后不再累积；玩家上线点击「领取」后才入账本并清零，恢复累积。食材离线不计。餐厅无离线收益。
 *  - 防回拨：T_off 由可注入 clock 派生，now < lastSeen 夹到 0（ieff.offlineFromClock 已实现）。
 *
 * 不变量：所有账本写入经 ledger.apply（requestId 幂等）；_seen 增长受「每秒桶」约束。
 *          pending 不持久化——boot / onShow 由 lastSeenMs 重算，避免重复入账。
 *          宿舍流与餐厅流职责分离，账本写入前缀不同（idle- / offline-claim- vs serve-），杜绝双计。
 */

const { offlineFromClock } = require('./ieff');
const { TUNED, LOCKED } = require('../config/tunables');

// 单帧 dt 上限（秒）：超过视为长时间挂起/卡顿；其缺口由「离线/存档」路径覆盖，
// 在线 tick 不替其补满，避免与 boot 离线重复计。普通卡顿（<60s）照常累积。
const MAX_FRAME_DT = 60;

function createIdleEngine({ ledger, getIeff, getFoodRate, clock }) {
  const _clock = clock || { now: () => Date.now() };
  let _lastAccrueMs = _clock.now();
  let _accBucket = Math.floor(_lastAccrueMs / 1000);
  let _accStar = 0;
  let _accFood = 0;
  let _pending = 0;     // 待领取离线收益（仅星券），受 cap 限制
  let _hiddenAt = null; // 切后台时间戳（onShow 时结算）

  /** 离线待领取上限（星券）：cap = dormRate × OFFLINE_FACTOR × OFFLINE_CAP_HOURS × 3600（§2.5.2 修订：base 由 I_eff 改为 dormRate）。 */
  function capStars() {
    return getDormRate() * LOCKED.OFFLINE_FACTOR * (TUNED.OFFLINE_CAP_HOURS || 4) * 3600;
  }

  /** 宿舍速率（§2.5.2）：dormRate = DORM_SHARE × I_eff。 */
  function getDormRate() {
    return TUNED.DORM_SHARE * getIeff();
  }

  /**
   * 离线收益结算（boot / onShow 时调用一次）：直接进 pending（受 cap），不直接入账本。
   * @returns {{pending:number, added:number, seconds:number, capped:boolean}|null}
   */
  function applyOffline(lastSeenMs) {
    if (typeof lastSeenMs !== 'number') return null;
    const seconds = Math.max(0, (_clock.now() - lastSeenMs) / 1000);
    const cap = capStars();
    let added = 0;
    if (_pending < cap) {
      const star = offlineFromClock(getDormRate(), _clock, lastSeenMs); // 离线=宿舍 only（折扣后）
      const room = Math.max(0, cap - _pending);
      added = Math.min(star, room);
      _pending += added;
    }
    return { pending: _pending, added, seconds, capped: _pending >= cap };
  }

  /** 切后台：记录时间戳（onShow 再结算，避免长挂起缺口被在线 tick 漏计）。 */
  function markHidden() { _hiddenAt = _clock.now(); }

  /** 回前台：结算后台期间离线收益到 pending（受 cap）。返回结算结果或 null。 */
  function settleOnShow() {
    if (typeof _hiddenAt !== 'number') return null;
    const r = applyOffline(_hiddenAt);
    _hiddenAt = null;
    return r;
  }

  /** 领取待领取离线收益：pending → 入账本，清零，返回领取量。 */
  function claimPending() {
    if (_pending <= 0) return 0;
    const amt = _pending;
    ledger.apply('offline-claim-' + _clock.now(), { star: amt });
    _pending = 0;
    return amt;
  }

  function getPending() { return _pending; }
  function hasPending() { return _pending > 0; }

  /**
   * 每帧调用（场景无关）。返回本帧实际累积 { star, food }（供 UI 浮动数字）。
   * 在线 idle 直接入账本（不经 pending）；按「秒桶」聚合，跨秒边界 flush 一次。
   */
  function tick(nowMs) {
    const now = nowMs != null ? nowMs : _clock.now();
    let dt = (now - _lastAccrueMs) / 1000;
    _lastAccrueMs = now;
    if (!(dt > 0)) return { star: 0, food: 0 };
    if (dt > MAX_FRAME_DT) dt = MAX_FRAME_DT; // 长挂起缺口交给离线/存档，不在线补满

    // 在线宿舍流：星券 = dormRate × dt（dormRate = DORM_SHARE × I_eff），不再满 I_eff（§2.5 双流）
    const starGain = getDormRate() * dt;
    const foodGain = (getFoodRate() || 0) * dt;

    const bucket = Math.floor(now / 1000);
    if (bucket !== _accBucket) {
      if (_accStar > 0 || _accFood > 0) {
        ledger.apply('idle-' + _accBucket, { star: _accStar, food: _accFood });
      }
      _accBucket = bucket;
      _accStar = 0;
      _accFood = 0;
    }
    _accStar += starGain;
    _accFood += foodGain;
    return { star: starGain, food: foodGain };
  }

  /** 生成可持久化快照（账本 + 服务端时间戳）。pending 不持久化（boot/onShow 由 lastSeenMs 重算）。 */
  function persist(nowMs) {
    const now = nowMs != null ? nowMs : _clock.now();
    return { ledger: ledger.snapshot(), lastSeenMs: now };
  }

  return { applyOffline, markHidden, settleOnShow, claimPending, getPending, hasPending, getDormRate, tick, persist };
}

module.exports = { createIdleEngine, MAX_FRAME_DT };
