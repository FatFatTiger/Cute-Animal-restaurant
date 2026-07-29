'use strict';

/**
 * Roster（图鉴 / 收藏）模块 · Phase 2
 *
 * 持久登记已拥有动物（去重）。抽卡重复 → 转碎片（由 gacha 处理），不生成可撸/可展实体。
 * 本模块为「只读注册表 + 全量目录视图」，不含任何经济 / 货币逻辑。
 *
 * 锁参 / 4 决策合规：仅登记去重动物 id，不改概率 / 保底 / 离线公式 / 解锁数学。
 *
 * ⚠️ 待 engineering-lead（程基岩）复核签字：本文件由主理人（游承峰）在 agent 后端空回时
 *    按兜底纪律 dirext 落盘（design-strategist 的 system-scene-phase2.md 已先于本文件真实落盘）。
 */

class Roster {
  /**
   * @param {object} opts
   * @param {object} [opts.gacha]     GachaEngine 实例（可选；仅用于初始 seed 已拥有动物）
   * @param {Array<{id:string,rarity:string}>} [opts.catalog] 全量动物目录（flat），用于图鉴 🔒 剪影
   * @param {string[]} [opts.initialOwned] 初始已拥有 id
   */
  constructor(opts) {
    opts = opts || {};
    this._gacha = opts.gacha || null;
    this._catalog = Array.isArray(opts.catalog) ? opts.catalog : null;
    this._owned = new Set(opts.initialOwned || (this._gacha ? this._gacha.getOwned() : []));
  }

  /** 登记一次抽卡结果（单只）。重复(isDuplicate)不计入拥有集。 */
  register(draw) {
    if (draw && draw.animalId && !draw.isDuplicate) this._owned.add(draw.animalId);
  }

  /** 批量登记（抽卡结果 draws 数组）。 */
  registerMany(draws) {
    if (!Array.isArray(draws)) return;
    for (const d of draws) this.register(d);
  }

  /** 去重后的已拥有动物 id 列表。 */
  owned() { return Array.from(this._owned); }
  count() { return this._owned.size; }
  has(id) { return this._owned.has(id); }

  /**
   * 图鉴视图：全量目录 + 拥有标记。
   * @returns {Array<{id:string,rarity:string,owned:boolean}>}
   */
  view() {
    const cat = this._catalog || (this._gacha ? flattenRoster(this._gacha._roster) : []);
    return cat.map((e) => ({ id: e.id, rarity: e.rarity, owned: this._owned.has(e.id) }));
  }
}

/** 把 {SSR:[...],SR:[...],R:[...]} 拍平成 [{id,rarity}]（SSR 优先）。 */
function flattenRoster(rosterByRarity) {
  const out = [];
  for (const r of ['SSR', 'SR', 'R']) {
    const bucket = (rosterByRarity && rosterByRarity[r]) || [];
    for (const id of bucket) out.push({ id, rarity: r });
  }
  return out;
}

module.exports = { Roster, flattenRoster };
