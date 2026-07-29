'use strict';

/**
 * 在线收益 I_eff 与离线累积计算（纯函数，零引擎依赖）。
 *
 * 严格按 system-idle-restaurant §3.3 口径实现（R1 复核修正已把 §3.1 适配乘区归一为 §3.3）：
 *
 *   I_eff = C_eff × Y_base × recipe_mult × station_mult
 *           × chef_mult × waiter_mult × bond_idle_mult × ad_mult × (1 + active_bonus)
 *   C_eff = C × host_mult
 *
 * 三岗单只加成（§3.3）：
 *   chef_mult_i  = (1 + 0.08 × (lv − 1)) × (role==affinity ? AFFINITY_BONUS : 1.0)
 *   waiter_mult_i= (1 + 0.08 × (lv − 1)) × (role==affinity ? AFFINITY_BONUS : 1.0)
 *   host_mult_i  = (1 + 0.06 × (lv − 1)) × (role==affinity ? AFFINITY_BONUS : 1.0)
 *   某岗总 mult  = Π_i（在岗员工该岗 mult）  // 乘区叠加，不简单相加
 *
 * 关键口径声明：affinity_bonus=1.5 是「主适配岗整乘 ×1.5」，绝不内嵌进增量项
 * （即不是 1 + 0.08×(lv−1)×affinity）。这是 R1 复核修正的核心，单测 economy.spec.js 会回归验证。
 */

const { TUNED, LOCKED } = require('../config/tunables');

function recipeMult(recipeLv) {
  return 1 + TUNED.RECIPE_PER_LEVEL * Math.max(0, (recipeLv - 1));
}

function stationMult(stationLv) {
  return 1 + TUNED.STATION_PER_LEVEL * Math.max(0, (stationLv - 1));
}

/** 单只员工在某岗的加成（§3.3 口径：base × affinity 整乘）。 */
function staffRoleMult(staff, role) {
  const perLevel =
    role === 'host'
      ? TUNED.HOST_PER_LEVEL
      : role === 'chef' || role === 'waiter'
      ? TUNED.CHEF_PER_LEVEL
      : 0;
  const base = 1 + perLevel * Math.max(0, (staff.level - 1));
  const affinity = staff.affinityRole === role ? TUNED.AFFINITY_BONUS : 1.0;
  return base * affinity;
}

/** 某岗总加成 = 在岗员工该岗 mult 的乘区叠加。 */
function roleMult(staffList, role) {
  let m = 1;
  for (const s of staffList) {
    if (s.role === role) m *= staffRoleMult(s, role);
  }
  return m;
}

/** 羁绊 idle 倍率：家人级且上岗 +3%/只，前 10 只计，上限 +30%。 */
function bondIdleMult(familyOnDutyCount) {
  const capped = Math.min(familyOnDutyCount, TUNED.BOND_IDLE_COUNT_CAP);
  return 1 + Math.min(TUNED.BOND_IDLE_CAP, TUNED.BOND_IDLE_PER_ANIMAL * capped);
}

/** C_eff = C × host_mult。 */
function effectiveSeats(C, hostMult) {
  return C * hostMult;
}

/**
 * I_eff 主公式（§3.1 / §3.3 口径）。所有乘区各计一次，无双计。
 * @param {object} ctx
 * @returns {number}
 */
function computeIeff(ctx) {
  const C = ctx.C != null ? ctx.C : TUNED.C_INIT;
  const hostMult = ctx.hostMult != null ? ctx.hostMult : 1;
  const chefMult = ctx.chefMult != null ? ctx.chefMult : 1;
  const waiterMult = ctx.waiterMult != null ? ctx.waiterMult : 1;
  const recipeLv = ctx.recipeLv != null ? ctx.recipeLv : 1;
  const stationLv = ctx.stationLv != null ? ctx.stationLv : 1;
  const bondIdle = ctx.bondIdleMult != null ? ctx.bondIdleMult : 1;
  const adMult = ctx.adMult != null ? ctx.adMult : 1;
  const activeBonus = ctx.activeBonus != null ? ctx.activeBonus : 0;
  const Ybase = ctx.Ybase != null ? ctx.Ybase : TUNED.Y_BASE;

  const C_eff = effectiveSeats(C, hostMult);
  const I_eff =
    C_eff *
    Ybase *
    recipeMult(recipeLv) *
    stationMult(stationLv) *
    chefMult *
    waiterMult *
    bondIdle *
    adMult *
    (1 + activeBonus);
  return I_eff;
}

/**
 * 离线累积（§3.2，offline_factor 锁参）。
 * accumulated = I_eff × offline_factor × min(T_off, T_cap)
 * 超 T_cap 部分不累积（软上限防通胀）。
 * @param {number} Ieff
 * @param {number} T_off  离线时长（秒）
 * @param {object} [opts] { offlineFactor, T_cap }
 */
function offlineAccumulated(Ieff, T_off, opts) {
  const offlineFactor = opts && opts.offlineFactor != null ? opts.offlineFactor : LOCKED.OFFLINE_FACTOR;
  const T_cap = opts && opts.T_cap != null ? opts.T_cap : LOCKED.T_CAP_INIT;
  const eff = Math.min(T_off, T_cap);
  return Ieff * offlineFactor * eff;
}

module.exports = {
  recipeMult,
  stationMult,
  staffRoleMult,
  roleMult,
  bondIdleMult,
  effectiveSeats,
  computeIeff,
  offlineAccumulated,
  TUNED,
  LOCKED,
};
