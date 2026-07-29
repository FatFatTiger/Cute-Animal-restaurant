'use strict';

/**
 * 顾客生成（占座，seeded 可复现）+ 携带 dish_demand；需求-已解锁匹配（纯函数）。
 * 支撑 E12 + 不变量 7（顾客需求-解锁匹配）。
 *
 * 不变量 7 语义：
 *  - dish_demand ∉ unlocked_dishes → 不可服务（不贡献 I_eff、不结算、无惩罚，占位不产出）。
 *  - dish_demand ∈ unlocked_dishes 且餐厅有在岗员工（任一岗）→ 可服务并计入 I_eff。
 *  - 匹配逻辑纯函数化（同输入 → 确定输出），供 seeded 复现。
 *
 * 关于「对应岗位有在岗员工」的解读（留待主理人确认，见回传）：
 *   本 Sprint 将「在岗」实现为「餐厅至少有 1 名在岗员工（任一岗）」，即店铺处于可运营状态；
 *   dish→具体岗位映射若需细化，是 matchServiceable 的一行扩展。
 */

function makeCustomer(id, dishDemand, seatId) {
  return { id, dishDemand, seatId, arrivedAt: null };
}

/**
 * 从 seeded rng 生成一名顾客。
 * @param {function():number} rng  [0,1) 随机数（seeded 可复现）
 * @param {string[]} dishPool      可选需求池
 * @param {object} [opts]          { id, index, seatId }
 */
function spawnCustomer(rng, dishPool, opts) {
  const pool = dishPool && dishPool.length ? dishPool : ['dish_1'];
  const idx = Math.floor(rng() * pool.length) % pool.length;
  const demand = pool[idx];
  const id = (opts && opts.id) || 'cust_' + (opts && opts.index != null ? opts.index : idx);
  const seatId = opts && opts.seatId != null ? opts.seatId : idx;
  return makeCustomer(id, demand, seatId);
}

/** 批量生成（用于复现性测试）。 */
function spawnStream(rng, dishPool, count, startSeat) {
  const out = [];
  for (let i = 0; i < count; i++) {
    out.push(
      spawnCustomer(rng, dishPool, {
        index: i,
        id: 'cust_' + i,
        seatId: startSeat != null ? startSeat + i : undefined,
      })
    );
  }
  return out;
}

/**
 * 需求-已解锁匹配（纯函数，确定性输出）→ 不变量 7。
 * @param {object} customer        { dishDemand }
 * @param {object} ctx             { unlockedDishes:Set|string[], onDutyRoles:Set|string[] }
 * @returns {{serviceable:boolean, unlocked:boolean, staffed:boolean}}
 */
function matchServiceable(customer, ctx) {
  const unlocked =
    ctx.unlockedDishes instanceof Set ? ctx.unlockedDishes : new Set(ctx.unlockedDishes || []);
  const onDutyRoles =
    ctx.onDutyRoles instanceof Set ? ctx.onDutyRoles : new Set(ctx.onDutyRoles || []);
  const unlockedMatch = unlocked.has(customer.dishDemand);
  const staffed = onDutyRoles.size > 0;
  return {
    serviceable: unlockedMatch && staffed,
    unlocked: unlockedMatch,
    staffed,
  };
}

module.exports = { spawnCustomer, spawnStream, makeCustomer, matchServiceable };
