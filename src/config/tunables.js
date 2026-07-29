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

  // —— Phase 2 · 撸毛馆 pet 机制（仅好感度 A，绝不产货币，对齐 §8-C4 红线）——
  PET_COOLDOWN_SEC: 30,        // 单只 critter 撸后冷却秒数（防 spam）
  PET_AFFINITY_GAIN: 1,        // 每次撸毛 +好感度 A（A∈[0,100]）
  PET_DAILY_CAP: 20,           // 每 critter 每日撸毛上限（bound 好感 accrual）
  PET_HAPPY_DURATION_SEC: 8,   // 「开心」视觉态时长（默认仅视觉，无数值 buff）
  PET_FOOD_REWARD: 0,          // 蹭蹭回礼食材数（默认关；>0 需主编签核，破「食材仅 idle 副产」）

  // —— Phase 2 · HUB 解锁门槛（TBD 待真机验证「勿过早/过晚开放」）——
  WAREHOUSE_UNLOCK_DISH_COUNT: 3, // 已解锁菜数 ≥ 此值 → 囤囤仓开放（双入口：餐厅也可解锁）
  LOUNGE_UNLOCK_ROSTER_COUNT: 6,  // 已拥有动物数 ≥ 此值 → 撸毛馆开放

  // —— Phase 3 · 离线收益待领取上限（TBD 待真机调）——
  // 离线收益先进入「待领取」缓冲（仅星券），受 cap 限制；达上限后不再累积，
  // 须上线点击领取后才清零并恢复累积。cap = dormRate × OFFLINE_FACTOR × OFFLINE_CAP_HOURS × 3600（秒）。
  // 默认 4h，与 LOCKED.T_CAP_INIT 时长一致，使上限成为真正可触达的封顶线（TBD 真机调参：想更频繁领取可下调）。
  // 注：2026-07-29 双流经济修订后 cap base 由 I_eff 改为 dormRate（见 idle.js capStars）。
  OFFLINE_CAP_HOURS: 4,

  // —— Phase 3.5 · 双流经济（§2.5，tunable，非锁参，标注待复核）——
  // 在线收益由 100% 时间流重构为「餐厅事件流(主) + 宿舍时间流(辅)」（GDD §2.5 重大修订）。
  //  DORM_SHARE：宿舍速率占 I_eff 比例 → 宿舍占在线 ≈20%、餐厅 ≈80%（典型游玩）。
  //  T_ORDER：餐厅每单服务周期（秒）→ 离散结算节奏与飘字频率；不改变总速率 I_eff。
  // 两者均为非锁参 tunable（待 design-strategist 复核签字），锁参 OFFLINE_FACTOR / T_CAP_INIT 零改动。
  DORM_SHARE: 0.25, // 宿舍速率 = DORM_SHARE × I_eff（§2.5.2）
  T_ORDER: 5, // 餐厅每单服务周期（秒），用户 2026-07-29 拍板由 3s 放慢为 5s（§2.5.1）
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
