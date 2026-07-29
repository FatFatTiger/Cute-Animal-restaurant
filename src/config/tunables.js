'use strict';

/**
 * 集中配置 · 引用 GDD v0.2 / v0.1.1
 *
 * 设计纪律（见任务书「锁参红线」「tunable 引用」）：
 *  - TUNED 段：tunable 常数，引用 system-idle-restaurant v0.2 / system-cultivation v0.1.1，
 *    标「待 design-strategist 复核签字，非锁参」。可在此集中调参，不得固化为锁参。
 *  - LOCKED 段：锁参红线（绝不可动）。offline_factor=0.20 等由任务书与主理人推演落盘，
 *    明确禁止调参。集中放置以便一处可见，但不提供任何 tunable 入口。
 *
 * 引用声明：本文件全部数值均来自已签字 GDD，未做任何数值发明。
 */

const TUNED = {
  // —— 在线收益基准（system-idle-restaurant §3.1）——
  Y_BASE: 0.04, // 基准单位座位产出 星券/秒/座（平衡可调）
  C_INIT: 4, // 初始座位容量
  C_MAX: 24, // 座位上限

  // 升级树（§3.1 / §3.3）：工位 / 菜谱每级 +10%，idle 主缩放量
  RECIPE_PER_LEVEL: 0.10,
  STATION_PER_LEVEL: 0.10,

  // —— 三岗加成（§3.3，tunable）——
  CHEF_PER_LEVEL: 0.08, // 厨师每级 +8%
  WAITER_PER_LEVEL: 0.08, // 服务员每级 +8%
  HOST_PER_LEVEL: 0.06, // 接待每级 +6%
  // 主适配岗整乘：affinity_bonus=1.5 是「主适配岗 ×1.5」整乘，
  // 不内嵌进增量项（R1 复核修正已把 §3.1 归一为 §3.3 口径）。
  AFFINITY_BONUS: 1.5,

  // —— 主动加成（§3.4，tunable）——
  ACTIVE_BONUS: 0.15, // 点击「加把劲」增量（仅做增量，不削弱被动）

  // —— 食材（§3.6）——
  FOOD_RATE: 0.02, // 食材副产 食材/秒（基准），供养成 + 菜品解锁

  // —— 菜品解锁成本曲线（§3.5，n 0-based，tunable）——
  UNLOCK_COST_STAR_BASE: 200,
  UNLOCK_COST_STAR_RATE: 1.35,
  UNLOCK_COST_FOOD_BASE: 40,
  UNLOCK_COST_FOOD_RATE: 1.30,

  // —— 养成 idle 加成（system-cultivation §3.2）——
  BOND_IDLE_PER_ANIMAL: 0.03, // 家人级且上岗 +3%/只
  BOND_IDLE_CAP: 0.30, // 上限 +30%
  BOND_IDLE_COUNT_CAP: 10, // 仅前 10 只上岗计

  // —— 升级成本曲线（system-idle-restaurant §3.1 / epics E4，tunable）——
  // 座位 seats = 200×1.5^n；工位/菜谱 stations/recipes = 150×1.4^n（n = 升级序号 0-based）。
  SEAT_COST_BASE: 200,
  SEAT_COST_RATE: 1.5,
  BRANCH_COST_BASE: 150,
  BRANCH_COST_RATE: 1.4,
};

// 锁参红线（绝不可动）：见任务书与 GDD 复核签字（文策渊 2026-07-28）。
const LOCKED = {
  OFFLINE_FACTOR: 0.20, // 离线效率为在线 20%（锁参红线，平衡 pass v0.2 落盘）
  T_CAP_INIT: 14400, // 离线累积上限 初始 4h，可扩至 12h
  // —— 抽卡锁参（E3 已执行；全部只读 LOCKED，不硬编码）——
  // 概率表（system-gacha §3.1，锁参红线：R60/SR30/SSR10、N=0% 不入池）
  GACHA_R: 0.60,
  GACHA_SR: 0.30,
  GACHA_SSR: 0.10,
  GACHA_N: 0.0,
  // 保底（§3.2）：pity∈[0,50] 每次+1，SSR 获取归零，跨货币共享
  PITY_HARD: 50,
  // 软保底阶梯：SSR_rate(c)=min(1, GACHA_SSR + SSR_SOFT_STEP×(c−SSR_SOFT_OFFSET))，c∈[SSR_SOFT_START, SSR_SOFT_END]
  //   c=41→≈19% / c=45→≈55% / c=49→≈91% / c=50→硬保底 100%（SSR_SOFT_BASE 复用 GACHA_SSR）
  SSR_SOFT_START: 41,
  SSR_SOFT_END: 49,
  SSR_SOFT_STEP: 0.09,
  SSR_SOFT_OFFSET: 40,
  // 十连 9 折保底 ≥1SR（§3 / §4）
  TEN_PULL_SR_GUARANTEE: true,
  // 抽卡成本（§2：单抽 100 / 十连 900=9折；星券免费、钻石付费，共用同一池与 pity）
  GACHA_COST_SINGLE_STAR: 100,
  GACHA_COST_SINGLE_DIAMOND: 100,
  GACHA_COST_TEN_STAR: 900,
  GACHA_COST_TEN_DIAMOND: 900,
  // 重复转碎片（§3.3）：R20 / SR50 / SSR100（升星阈值与满星溢出回收后置 E5，本 Sprint 不做）
  GACHA_SHARD_R: 20,
  GACHA_SHARD_SR: 50,
  GACHA_SHARD_SSR: 100,
  // 新手前 10 抽保底 ≥1SR（§3.2 / §4）
  NEWBIE_FIRST10_SR: true,
  GACHA_NEWBIE_PULLS: 10,
};

module.exports = { TUNED, LOCKED };
