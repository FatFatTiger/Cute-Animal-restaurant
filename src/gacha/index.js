'use strict';

/**
 * Epic 3 · 抽卡系统（纯逻辑核心，预生产）
 *
 * 范围（见 production/epics.md §3.2、design/gdd/system-gacha.md）：
 *  - E3-S1 单抽稀有度摇号：R60/SR30/SSR10、N=0%（普通池不产 N），星券/钻石扣费。
 *  - E3-S2 pity 计数 + 硬/软保底：pity∈[0,50] 每次+1、SSR 归零、跨货币共享；
 *          硬保底 pity≥50→SSR；软保底 c∈[41,49] 阶梯 SSR_rate(c)=min(1, GACHA_SSR + SSR_SOFT_STEP×(c−SSR_SOFT_OFFSET))。
 *  - E3-S3 十连 + 新手保底：十连 900（9 折）保底≥1SR；新账号前 10 抽≥1SR。
 *  - E3-S4 重复转碎片：R20/SR50/SSR100 落 E6 shard 账本。（升星阈值与满星溢出回收后置 E5，本 Sprint 不做）
 *  - E3-S5 服务端权威抽象：摇号/保底/余额裁决走可注入接口（rng / decide），不接真机。
 *  - E3-S6 事件预留：onGachaResult 订阅接口（演出归 E7，本 Sprint 不实现）。
 *
 * 设计纪律（ADR，见 production/sprint-2.md E3 交付）：
 *  1. RNG 可注入：默认用 Math.random；测试注入 seeded RNG 保证确定性 + 蒙特卡洛校验。
 *  2. 锁参来源：概率/保底/成本/碎片全部从 `../config/tunables` 的 LOCKED 读取（闭合 C5，不硬编码）。
 *  3. 分层：零 wx / 引擎依赖，Node 直跑；货币扣费经 E6 ledger（requestId 幂等），不改动 ledger 已实现的不变量。
 *  4. 验收追溯：tests/unit/gacha.spec.js + tests/integration/gacha-economy.int.js 覆盖 system-gacha.md §8。
 *
 * 锁参红线（绝不可动）：R60/SR30/SSR10、N=0%、50 保底、十连≥1SR、新手前10≥1SR、双货币隔离、四货币。
 */

const { Ledger } = require('../economy/ledger');
const { LOCKED } = require('../config/tunables');

// 普通池不产 N（N 走免费基础动物路径）；roster 仅为示例数据，生产由图鉴/配置注入。
// 可注入：构造时传 `roster` 覆盖（测试用）。
const DEFAULT_ROSTER = {
  R: ['r_01', 'r_02', 'r_03', 'r_04', 'r_05', 'r_06'],
  SR: ['sr_01', 'sr_02', 'sr_03', 'sr_04'],
  SSR: ['ssr_01', 'ssr_02', 'ssr_03'],
};

// 稀有度保底用比较：'SSR' 最高，'R' 最低（N 不入池）。
function isAtLeastSR(rarity) {
  return rarity === 'SR' || rarity === 'SSR';
}

function clampToSR(rarity) {
  return isAtLeastSR(rarity) ? rarity : 'SR';
}

class GachaEngine {
  /**
   * @param {object} opts
   * @param {Ledger} [opts.ledger] 货币账本（默认新建）；星券/钻石扣费 + 碎片入账走它。
   * @param {object} [opts.roster] 各稀有度动物 id 池；默认 DEFAULT_ROSTER。
   * @param {() => number} [opts.rng] 可注入 RNG，返回 [0,1)；默认 Math.random。
   * @param {(ctx:{pity:number,newbieGuaranteeActive:boolean,newbieGotSR:boolean}) => 'R'|'SR'|'SSR'} [opts.decide]
   *        服务端权威摇号抽象：注入后完全接管稀有度裁决（预生产以可注入实现模拟，真机接入归后续）。
   * @param {(rarity:string) => string} [opts.pickAnimal] 可注入动物 id 选择（默认按 rng 从 roster 取）。
   * @param {(res:{animalId:string,rarity:string,isDuplicate:boolean,shardGain:number}) => void} [opts.onResult]
   *        E3-S6 预留：每抽结果订阅接口（演出归 E7，本 Sprint 仅预留）。
   * @param {boolean} [opts.newbieWindow] 新手前 N 抽保底开关（默认取 LOCKED.NEWBIE_FIRST10_SR）。
   * @param {number} [opts.initialPity] 初始 pity（存档恢复 / 测试用）。
   * @param {number} [opts.initialPulls] 初始已抽次数（新手窗口判定用）。
   * @param {string[]} [opts.initialOwned] 初始已拥有动物 id（图鉴/仓库态）。
   */
  constructor(opts) {
    opts = opts || {};
    this._ledger = opts.ledger || new Ledger();
    this._roster = opts.roster || DEFAULT_ROSTER;
    this._rng = typeof opts.rng === 'function' ? opts.rng : Math.random;
    this._decide = typeof opts.decide === 'function' ? opts.decide : this._defaultDecide.bind(this);
    this._pickAnimal = typeof opts.pickAnimal === 'function' ? opts.pickAnimal : this._defaultPickAnimal.bind(this);
    this._onResult = typeof opts.onResult === 'function' ? opts.onResult : null;

    this._pity = opts.initialPity || 0; // [0, PITY_HARD]
    this._pulls = opts.initialPulls || 0; // 累计抽卡次数（新手窗口判定）
    this._newbieGotSR = false; // 新手窗口内是否已出 SR+
    this._owned = new Set(opts.initialOwned || []); // 图鉴/仓库（预生产内存态）
    this._newbieEnabled = opts.newbieWindow !== false && LOCKED.NEWBIE_FIRST10_SR === true;

    this._cache = new Map(); // requestId -> 结果（幂等：同 id 只结算一次）
    this._lastResult = null; // 最近一次成功抽卡结果（只读 getter，供 E7 UI 演出引用）
  }

  // —— 公开读取接口（状态只读，便于测试与存档恢复）——
  getPity() { return this._pity; }
  getPulls() { return this._pulls; }
  getOwned() { return Array.from(this._owned); }
  /** 只读 getter：最近一次成功抽卡结果（供 E7 UI 渲染抽中稀有度色块 + 动物名）。 */
  getLastResult() { return this._lastResult; }

  /**
   * 默认摇号裁决（服务端权威抽象的可注入默认实现）。
   * 硬保底优先，其次软保底阶梯抬升 SSR 率，基线为 R60/SR30/SSR10（非 SSR 段按 2:1 拆 R/SR）；
   * 新手窗口内首个 R 强制为 SR（保证前 N 抽≥1SR）。
   */
  _defaultDecide(ctx) {
    const L = LOCKED;
    // 硬保底：pity≥50 → 必出 SSR
    if (ctx.pity >= L.PITY_HARD) return 'SSR';
    // 软保底阶梯（c∈[41,49]）
    let ssrRate = L.GACHA_SSR;
    if (ctx.pity >= L.SSR_SOFT_START && ctx.pity <= L.SSR_SOFT_END) {
      ssrRate = Math.min(1, L.GACHA_SSR + L.SSR_SOFT_STEP * (ctx.pity - L.SSR_SOFT_OFFSET));
    }
    const r = this._rng();
    let rarity;
    if (r < ssrRate) {
      rarity = 'SSR';
    } else if (r < ssrRate + (1 - ssrRate) * (1 / 3)) {
      // 非 SSR 段按 R:SR = 2:1 拆（基线 R60/SR30/SSR10 一致）
      rarity = 'SR';
    } else {
      rarity = 'R';
    }
    return rarity;
  }

  _defaultPickAnimal(rarity) {
    const bucket = this._roster[rarity];
    if (!bucket || bucket.length === 0) return rarity + '_unknown';
    const idx = Math.floor(this._rng() * bucket.length) % bucket.length;
    return bucket[idx];
  }

  _shardFor(rarity) {
    if (rarity === 'R') return LOCKED.GACHA_SHARD_R;
    if (rarity === 'SR') return LOCKED.GACHA_SHARD_SR;
    if (rarity === 'SSR') return LOCKED.GACHA_SHARD_SSR;
    return 0;
  }

  _costFor(type, currency) {
    if (currency !== 'star' && currency !== 'diamond') {
      throw new Error('GachaEngine: unsupported currency "' + currency + '" (only star/diamond)');
    }
    const key = (type === 'ten' ? 'GACHA_COST_TEN_' : 'GACHA_COST_SINGLE_') + currency.toUpperCase();
    return LOCKED[key];
  }

  _inNewbieWindow() {
    return this._newbieEnabled && this._pulls < LOCKED.GACHA_NEWBIE_PULLS;
  }

  /**
   * 纯计算单次/十连抽卡结果（不修改引擎状态，便于幂等回滚）。
   * 返回 { draws, totalShard, nextPity, nextPulls, nextNewbieGotSR, nextOwned }。
   */
  _computeDraw(type) {
    const n = type === 'ten' ? 10 : 1;
    let pity = this._pity;
    let pulls = this._pulls;
    let newbieGotSR = this._newbieGotSR;
    const owned = new Set(this._owned); // 副本：判定重复，提交时才覆盖
    const draws = [];
    let totalShard = 0;

    for (let i = 0; i < n; i++) {
      const active = this._newbieEnabled && pulls < LOCKED.GACHA_NEWBIE_PULLS;
      const ctx = { pity, newbieGuaranteeActive: active, newbieGotSR };
      let rarity = this._decide(ctx);
      // 新手保底（系统级担保，置于 decide 之外：即便注入服务端 decide 也保证前 N 抽 ≥1SR）
      if (active && rarity === 'R' && !newbieGotSR) rarity = 'SR';
      const animalId = this._pickAnimal(rarity);
      const isDuplicate = owned.has(animalId);
      const shardGain = isDuplicate ? this._shardFor(rarity) : 0;
      totalShard += shardGain;
      draws.push({ animalId, rarity, isDuplicate, shardGain });
      if (!isDuplicate) owned.add(animalId); // 新动物入账，供同批后续抽卡判定重复
      // pity 推进：SSR 归零，否则 +1
      if (rarity === 'SSR') pity = 0; else pity += 1;
      pulls += 1;
      if (isAtLeastSR(rarity)) newbieGotSR = true;
    }

    // 十连保底 ≥1SR（E3-S3）：本批无 SR+ 则强制末位为 SR（含重新选动物 + 重复判定）
    if (type === 'ten' && LOCKED.TEN_PULL_SR_GUARANTEE) {
      const hasSRorBetter = draws.some((d) => isAtLeastSR(d.rarity));
      if (!hasSRorBetter) {
        const target = draws[draws.length - 1]; // 全为 R，强制末位
        target.rarity = 'SR';
        target.animalId = this._pickAnimal('SR');
        if (owned.has(target.animalId)) {
          target.isDuplicate = true;
          target.shardGain = this._shardFor('SR');
          totalShard += target.shardGain;
        } else {
          owned.add(target.animalId);
        }
      }
    }

    return { draws, totalShard, nextPity: pity, nextPulls: pulls, nextNewbieGotSR: newbieGotSR, nextOwned: owned };
  }

  _commit(result) {
    this._pity = result.nextPity;
    this._pulls = result.nextPulls;
    this._newbieGotSR = result.nextNewbieGotSR;
    this._owned = result.nextOwned;
  }

  _draw(type, opts) {
    opts = opts || {};
    const requestId = opts.requestId;
    const currency = opts.currency || 'star';
    if (!requestId) throw new Error('GachaEngine: requestId is required for idempotency');
    // 幂等：同 requestId 直接返回缓存结果，不重复摇号/扣费
    if (this._cache.has(requestId)) return this._cache.get(requestId);

    const cost = this._costFor(type, currency);
    // 货币不足：不发起、不消耗 rng、不推进状态（弱网/断线不扣费）
    if (!this._ledger.canAfford({ [currency]: -cost })) {
      const fail = { ok: false, reason: 'INSUFFICIENT', requestId, type, currency };
      this._cache.set(requestId, fail);
      return fail;
    }

    const result = this._computeDraw(type); // 纯计算（不修改状态）
    const deltas = { [currency]: -cost };
    if (result.totalShard > 0) deltas.shard = result.totalShard;
    const ledgerRes = this._ledger.apply(requestId, deltas); // E6 ledger 原子扣费 + 碎片入账
    if (!ledgerRes.ok) {
      // 预检已通过，理论上不会到这；留作防御，仍不提交状态
      const fail = { ok: false, reason: ledgerRes.reason || 'LEDGER_REJECTED', requestId, type, currency };
      this._cache.set(requestId, fail);
      return fail;
    }

    this._commit(result); // 仅在扣费成功后提交状态
    const out = {
      ok: true,
      requestId,
      type,
      currency,
      cost,
      draws: result.draws,
      totalShard: result.totalShard,
      pityAfter: this._pity,
      pullsAfter: this._pulls,
    };
    this._lastResult = out; // 记录最近一次成功结果（只读 getter 供 UI 引用）
    this._cache.set(requestId, out);

    // E3-S6 预留：每抽结果订阅接口（演出归 E7，本 Sprint 不实现）
    if (typeof this._onResult === 'function') {
      for (const d of result.draws) {
        this._onResult({ animalId: d.animalId, rarity: d.rarity, isDuplicate: d.isDuplicate, shardGain: d.shardGain });
      }
    }
    return out;
  }

  drawSingle(opts) { return this._draw('single', opts); }
  drawTen(opts) { return this._draw('ten', opts); }
}

module.exports = { GachaEngine, DEFAULT_ROSTER, isAtLeastSR, clampToSR };
