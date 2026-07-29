'use strict';

/**
 * Cultivation（养成）模块 · Phase 2 · 撸毛馆 pet 机制
 *
 * 撸毛（pet）只写「好感��� A ∈ [0,100]」+ 记录冷却 / 日上限，用于「开心」视觉态计时；
 * **绝不产出任何货币**（星券 / 钻石 / 食材 / 碎片都不产）——对齐 system-scene-phase2.md §8-C4 红线
 * （星券=免费 idle 唯一源，撸毛为主动非 idle 行为，产星券会破双货币隔离；食材回礼 PET_FOOD_REWARD
 * 默认 0 / 关闭，>0 需主编签核）。
 *
 * 遵守：不触碰 AFFINITY_BONUS(1.5) 常量、不改动 offline_factor、不引入新货币。
 *
 * ✅ engineering-lead 复核签字 PASS · 2026-07-30（程基岩）：本文件由主理人（游承峰）在 agent 后端空回时
 *    按兜底纪律 dirext 落盘。
 */

const { TUNED } = require('./config/tunables');

const BOND_TIERS = [0, 20, 50, 80, 100]; // 陌生 / 熟悉 / 朋友 / 挚友 / 家人

class Cultivation {
  constructor(opts) {
    opts = opts || {};
    this._affinity = new Map(); // animalId -> A [0,100]
    this._petAt = new Map();    // animalId -> 上次撸毛时间戳(ms)
    this._daily = new Map();    // animalId -> { date, count }
  }

  affinityOf(id) { return this._affinity.get(id) || 0; }

  /** 羁绊阶层（按 A 落在哪个 tier 阈值）。 */
  bondTier(id) {
    const a = this.affinityOf(id);
    let tier = 0;
    for (const t of BOND_TIERS) if (a >= t) tier = t;
    return tier;
  }

  /** 是否可撸（冷却 + 日上限校验）。 */
  canPet(id, at) {
    at = at || Date.now();
    const last = this._petAt.has(id) ? this._petAt.get(id) : -Infinity; // 从未撸过 → 视为 -∞
    const cooldownMs = TUNED.PET_COOLDOWN_SEC * 1000;
    if (at - last < cooldownMs) {
      return { ok: false, reason: 'COOLDOWN', waitMs: cooldownMs - (at - last) };
    }
    const today = Math.floor(at / 86400000);
    const d = this._daily.get(id);
    const used = (d && d.date === today) ? d.count : 0;
    if (used >= TUNED.PET_DAILY_CAP) return { ok: false, reason: 'DAILY_CAP' };
    return { ok: true };
  }

  /**
   * 撸毛：+好感度 A（受冷却 / 日上限约束），无货币产出。
   * @returns {{ok:boolean,reason?:string,gain?:number,affinity:number,bondTier:number,happyUntil?:number}}
   */
  pet(id, opts) {
    opts = opts || {};
    const at = opts.at || Date.now();
    const check = this.canPet(id, at);
    if (!check.ok) {
      return { ok: false, reason: check.reason, affinity: this.affinityOf(id), waitMs: check.waitMs };
    }
    let a = this.affinityOf(id) + TUNED.PET_AFFINITY_GAIN;
    if (a > 100) a = 100;
    this._affinity.set(id, a);
    this._petAt.set(id, at);
    const today = Math.floor(at / 86400000);
    const d = this._daily.get(id) || { date: today, count: 0 };
    if (d.date !== today) { d.date = today; d.count = 0; }
    d.count += 1;
    this._daily.set(id, d);
    return {
      ok: true,
      gain: TUNED.PET_AFFINITY_GAIN,
      affinity: a,
      bondTier: this.bondTier(id),
      happyUntil: at + TUNED.PET_HAPPY_DURATION_SEC * 1000,
    };
  }
}

module.exports = { Cultivation, BOND_TIERS };
