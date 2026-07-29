'use strict';

/**
 * 餐厅事件流累加器（主收入流，GDD §2.5.1）。
 *
 * 职责：把「餐厅主收入」从 idle 引擎（现仅负责宿舍时间流 + 离线）中剥离出来，
 * 做成可独立单测的纯逻辑模块，由 game.js 的帧循环每帧驱动（tick 调用）。
 * 这样 idle 引擎保持「宿舍+离线」纯职责，餐厅事件流另有独立账本前缀（serve-），二者绝不双计。
 *
 * 机制（§2.5.1）：
 *  - 每帧 accumulate(I_eff × dt)；累计满 T_ORDER 秒（serveAccum >= I_eff × T_ORDER）→
 *    若餐厅可运营（onDutyRoles.size>0 且当前至少一名顾客需求可匹配 matchServiceable 返回 serviceable）
 *    → 结算一单：reward = round(I_eff × T_ORDER × (active ? 1+ACTIVE_BONUS : 1))，
 *      账本 apply('serve-<bucketSec>', { star: reward })，清零累加器并保留余数（serveAccum -= threshold）。
 *  - 不可运营 / 无 serviceable 顾客 → 挂起累加器（不丢、不结算、不清零，跨帧保留）。
 *  - 与 idle 引擎（宿舍时间流 + 离线）职责分离：本模块只管餐厅主收入，绝不双计宿舍。
 *
 * 不变量：账本写入经 ledger.apply（requestId 幂等，前缀 'serve-'）；单帧至多结算一单（防止同秒双计）；
 *        锁参零改动（ACTIVE_BONUS / T_ORDER / DORM_SHARE 仅引用 tunables）。
 * 零引擎依赖，可 Node 直测。
 */

const { TUNED } = require('../config/tunables');
const { matchServiceable } = require('./customer');

function createServeAccrual({ ledger, getIeff, restaurant, clock }) {
  const _clock = clock || { now: () => Date.now() };
  let _lastMs = _clock.now(); // 首帧 dt 从构造时刻起算（对齐 idle 引擎，避免初始跳变）
  let _accum = 0;
  let _activeUntil = 0; // 「加把劲」active 窗口截止时间戳（ms）；now < _activeUntil 期间订单 ×(1+ACTIVE_BONUS)

  /** 「加把劲」主动加成：active 窗口 = now + 5000ms（仅做增量，不削弱被动基础，§3.4）。 */
  function setActive(nowMs) {
    _activeUntil = (nowMs != null ? nowMs : _clock.now()) + 5000;
  }

  /** 餐厅是否可运营：有在岗员工 且 顾客列表中至少一名 demand 可服务。 */
  function isOperable(customers) {
    const onDuty = restaurant.schedule.onDutyRoles();
    if (onDuty.size === 0) return false;
    const unlocked = new Set(restaurant.getUnlockedDishes());
    const list = customers || [];
    for (const c of list) {
      const m = matchServiceable(c, { unlockedDishes: unlocked, onDutyRoles: onDuty });
      if (m.serviceable) return true;
    }
    return false;
  }

  /**
   * 每帧推进。返回本帧结算的订单 { star, active } 或 null（未结算 / 挂起）。
   * @param {number} nowMs       当前时间戳（ms）
   * @param {object[]} customers 当前在场顾客（{ dishDemand, ... }）
   */
  function tick(nowMs, customers) {
    const now = nowMs != null ? nowMs : _clock.now();
    let dt = (now - _lastMs) / 1000;
    _lastMs = now;
    if (!(dt > 0)) return null; // 回拨 / 同帧：不累积（防负收益，对齐 idle 引擎）

    const Ieff = getIeff();
    _accum += Ieff * dt;

    const threshold = Ieff * TUNED.T_ORDER;
    if (_accum < threshold) return null; // 未满 T_ORDER 秒，继续累积

    // 可运营判定：有在岗员工 + 至少一名顾客需求可服务
    const onDuty = restaurant.schedule.onDutyRoles();
    const restaurantOperable = onDuty.size > 0;
    const list = customers || [];
    let anyServiceable = false;
    if (restaurantOperable) {
      const unlocked = new Set(restaurant.getUnlockedDishes());
      for (const c of list) {
        const m = matchServiceable(c, { unlockedDishes: unlocked, onDutyRoles: onDuty });
        if (m.serviceable) { anyServiceable = true; break; }
      }
    }

    if (!restaurantOperable || !anyServiceable) {
      // 挂起累加器：不丢、不结算、不清零（保持 _accum 跨帧保留，待可运营后继续累积）
      return null;
    }

    const active = now < _activeUntil;
    const bonusMult = active ? (1 + TUNED.ACTIVE_BONUS) : 1;
    const reward = Math.round(Ieff * TUNED.T_ORDER * bonusMult);
    const bucketSec = Math.floor(now / 1000);
    const res = ledger.apply('serve-' + bucketSec, { star: reward });
    _accum -= threshold; // 清零并保留余数（余数继续累积到下一单）
    if (res.ok) return { star: reward, active };
    return null; // 幂等重复（dup）则本帧不计，但累加器已扣减（避免堆积重复结算）
  }

  function getAccum() { return _accum; }
  function getActiveUntil() { return _activeUntil; }
  function reset() { _accum = 0; _lastMs = _clock.now(); _activeUntil = 0; }

  return { tick, setActive, isOperable, getAccum, getActiveUntil, reset };
}

module.exports = { createServeAccrual };
