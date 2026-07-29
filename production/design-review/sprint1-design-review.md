# Sprint 1 垂直切片 · 实现层设计评审报告

> 评审人：**文策渊（design-strategist / DS）** · 团队：animal-resto-studio
> 任务标签：`DS-REVIEW-001` · 评审层：Phase 5 Sprint 1 实现层设计评审 / 范围检查（每冲刺最后一道门）
> 基准：GDD `system-idle-restaurant.md` v0.2（文策渊 2026-07-28 复核签字·结论通过）
> 已确认 4 项设计决策（2026-07-28）：①顾客带需求/未解锁不可服务 ②解锁=星券+食材原子扣费（不引新资源） ③员工三岗+适配 ④服务=被动基础+主动加成
> 锁参红线：R60/SR30/SSR10/N0%、50 保底、十连≥1SR、新手前10≥1SR、offline_factor=0.20、双货币隔离、四货币

---

## 0. 评审方法与纪律声明

- **真实读码**：逐文件读取 `src/config/tunables.js`、`src/economy/{ledger,ieff}.js`、`src/restaurant/{staff,dish,customer,restaurant}.js`，并交叉比对已签字 GDD v0.2 与 QA 门报告 `production/qa/sprint1-qa-report.md`。
- **可追溯**：所有判定均附 `文件:行` 证据指纹（见附录）。
- **范围对齐**：以「垂直切片 = 纯逻辑核心循环（零引擎）」为范围基线，不把 Cocos/真机/抽卡/养成拼装等已知延迟项计入失败。
- **本评审性质**：设计忠实度 + 范围检查（实现是否忠实翻译 GDD 与 4 决策、有无范围漂移/设计意图丢失）；测试绿度以 QA 门结论为前置（已 PASS，30/30）。

---

## 1. 4 项已确认设计决策 · 落地核对

### 决策 ① 顾客带「想吃的菜」上门、未解锁则无法服务
**判定：✅ 忠实落地（含 1 处需主理人确认的设计解读）**

| 维度 | 实现落点 | 与 GDD/决策一致性 |
|---|---|---|
| 顾客携带需求 | `customer.js:17 makeCustomer(id, dishDemand, seatId)`；`spawnCustomer/spawnStream` 按 seeded rng 从需求池取 `dishDemand`（`customer.js:27-34`） | 与 GDD §2「顾客按节奏到店…出示 dish_demand」一致 |
| 未解锁不可服务 | `customer.js:57-69 matchServiceable`：`unlockedMatch = unlocked.has(dishDemand)`；`serviceable = unlockedMatch && staffed`；未解锁 → `serviceable=false` | 与 GDD §2「dish_demand ∉ 已解锁 → 无法服务」一致 |
| 零产出、无惩罚 | `restaurant.js:73-80`：不可服务直接 `return {serviceable:false, earned:{star:0,food:0}}` | 与 GDD §2「占位不产出、无惩罚」、§4「绝不扣血/扣资源」一致 |

⚠️ **设计解读澄清项（D-CLR-1，非偏离，待主理人确认）**：
`customer.js:12-14` 注释将「在岗」实现为「餐厅至少有 1 名在岗员工（任一岗）」（`onDutyRoles.size > 0`，`customer.js:63`）。GDD §2/§3.3 的「三岗」模型隐含各岗贡献不同乘区；本切片把「可服务」门槛放宽为「任一岗有人」。此为垂直切片合理简化，未丢失设计意图（未解锁仍不服务、无惩罚），但 `dish→具体岗位映射` 细化为 `matchServiceable` 一行扩展、尚未做。建议在 Sprint 2 明确「可服务门槛」是「任一岗」还是「与菜相关的特定岗」，以闭合该解读。

### 决策 ② 菜品解锁资源 = 星券 + 食材（原子扣费，不引新资源）
**判定：✅ 忠实落地**

| 维度 | 实现落点 | 与 GDD/决策一致性 |
|---|---|---|
| 原子扣费（同事务） | `dish.js:73`：`this.ledger.apply(requestId, { star: -costStar, food: -costFood })` 一次性结算 | 与 GDD §3.5「星券与食材在同一服务端事务中同时扣减」一致 |
| 任一方不足→无部分扣 | `dish.js:73-77`：`res.ok===false` 时不加 `unlocked`、不改 `_nextIndex`；`ledger.js:63-66` 任一侧 <0 整体拒绝 | 与不变量 6 / GDD §3.5「任一方不足→失败不部分扣」一致 |
| 幂等 + 跨菜防误开 | `dish.js:62-81`：`_usedRequests` 标记，无论成败都标记，杜绝同 requestId 跨菜误开 | 与 GDD 反作弊「防本地篡改只扣一种资源」意图一致 |
| 不引新资源 | 仅扣 `star`/`food`，复用既有双货币体系 | 与决策②「不引新资源」、GDD §3.5「不引入任何新资源」一致 |
| 成本曲线 | `dish.js:21-27`：`200×1.35^n` / `40×1.30^n`（n 0-based），基准菜不占索引 | 与 GDD §3.5 完全一致 |
| 基础菜出生时解锁 | `dish.js:39` / `restaurant.js:21-23`：默认 `['dish_1','dish_2']`，`_nextIndex=0` | 与 GDD §3.5「初始 1–2 道基础菜出生时即解锁」一致 |

### 决策 ③ 员工分厨师/服务员/接待三岗 + 适配
**判定：✅ 忠实落地（含 1 处 GDD §3.3 规则未强制，见 D-NOTE-2）**

| 维度 | 实现落点 | 与 GDD/决策一致性 |
|---|---|---|
| 三岗定义 | `staff.js:14 ROLES=['chef','waiter','host']` | 与 GDD §2/§3.3 三岗一致 |
| 主适配岗 | `staff.js:16-21 createStaff`：`affinityRole` 来自程序化拼装（家族/属性）；`staff.js:9` 注释 | 与 GDD §3.3「role_affinity 家族/属性决定」一致 |
| 排班单岗 | `staff.js:31-37 assign`：一名员工排一岗（互斥） | 与 GDD §2「分配到三岗之一」一致 |
| 三岗加成数值 | `ieff.js:33-43`：chef/waiter `1+0.08×(lv−1)`、host `1+0.06×(lv−1)` | 与 GDD §3.3 每级 +8%/+6% 一致 |
| 适配整乘 ×1.5 | `ieff.js:41-42`：`affinity = affinityRole===role ? 1.5 : 1.0; return base*affinity` | 与 GDD §3.3「主适配岗额外 ×affinity_bonus(1.5)」、R1 归一口径一致（**否定旧误 `1+0.08×(lv−1)×affinity`**） |
| 多员工同岗乘区叠加 | `ieff.js:45-52 roleMult`：Π 乘区叠加，非相加 | 与 GDD §3.3「乘区叠加不简单相加」一致（QA 回归 1.5×1.5=2.25≠3.0） |

⚠️ **设计规则未强制项（D-NOTE-2，非阻断）**：GDD §3.3 明确「每岗可排班员工数受**编制上限**约束（初始每岗 2，上限 8，tunable）」。经 `grep 编制` 全 `src/` 扫描，**无任一处实现该上限**（`staff.js assign` 无 cap 校验）。垂直切片用显式 staff、无自动满编压力，属合理简化；但 §3.3 规则与 §8 验收「三岗编制上限生效」尚未闭环。建议 Sprint 2 补 `assign` 编制上限（tunable 来源 tunables.js）。

### 决策 ④ 服务 = 被动基础结算 + 玩家主动派遣/点击加成
**判定：✅ 忠实落地（被动+主动双结构在；「派遣匹配」具体机制为已知部分实现，见 D-NOTE-3）**

| 维度 | 实现落点 | 与 GDD/决策一致性 |
|---|---|---|
| 被动基础结算 | `restaurant.js:81-84`：`starGain = Ieff×dt` 被动按 §3.1 公式自动结算，无需玩家操作 | 与 GDD §3.4「被动基础结算…无需玩家操作（治愈内核）」一致 |
| 主动加成 hook | `restaurant.js:36-41 setActiveBonus/setAdMult`；`computeIeff` 经 `(1+activeBonus)`、`ad_mult` 接入（`ieff.js:9,78,92`） | 与 GDD §3.4「玩家可主动介入拿额外收益」一致 |
| 仅做增量、不削弱被动 | `ieff.js:79,92`：`activeBonus` 默认 0 → `(1+0)=1.0` 即被动基准；加 active 只乘大 | 与 GDD §3.4「主动加成只做增量，不削弱被动基础」一致 |
| active_bonus 数值 | `tunables.js:34 ACTIVE_BONUS=0.15` | 与 GDD §3.4「点击加把劲 +0.15」一致 |
| ad_mult（加速广告） | `restaurant.js:39 setAdMult`；`ieff.js:78,91 ad_mult` | 与 GDD §3.2「看加速广告 ad_mult=2」接口一致（SDK 回调属真机层，本切片仅暴露 hook） |

⚠️ **设计部分实现项（D-NOTE-3，非阻断）**：GDD §3.4 列两类主动机制——「点击加把劲」与「**派遣匹配**（将主适配岗员工临时调往忙碌岗获取该岗 affinity 加成）」。`setActiveBonus` 已实现点击加把劲的接入，但「派遣匹配」所需的「临时改派→重算该岗 affinity」逻辑**未在切片实现**（staff.js 仅静态 assign）。主动双结构（被动+主动增量）已忠实，具体派遣机制属垂直切片之外、建议 Sprint 2 补。另 GDD §3.4「可叠加次数设上限」在 `setActiveBonus` 未强制（QA C6 已记）。

---

## 2. GDD 公式一致性

**判定：✅ 严格一致（§3.3 整乘口径正确，无旧误写法残留）**

### 2.1 I_eff / C_eff 主公式（§3.1 / §3.3）
- 实现：`ieff.js:70-94 computeIeff` 与 `ieff.js:8-10` 注释，公式逐项对应 GDD §3.1：
  `I_eff = C_eff × Y_base × recipe_mult × station_mult × chef_mult × waiter_mult × bond_idle_mult × ad_mult × (1+active_bonus)`，`C_eff = C × host_mult`。
- `recipe_mult = 1+0.10×(lv−1)`（`ieff.js:24-26`，`RECIPE_PER_LEVEL=0.10`，`tunables.js:22`）；`station_mult` 同（`ieff.js:28-30`，`STATION_PER_LEVEL=0.10`，`tunables.js:23`）。与 GDD §3.1 一致。
- `bond_idle_mult`：`ieff.js:54-58 bondIdleMult`，`1+min(0.30, 0.03×capped)`，`capped=min(count,10)`。与 GDD §3.1「+3%/只、上限+30%」及 §3.2「前 10 只计」一致（`tunables.js:46-48`）。

### 2.2 适配乘区口径（§3.3，R1 归一）
- `ieff.js:13-15,41-42`：**`base × affinity(1.5)` 整乘**，明确否定旧误 `1+0.08×(lv−1)×affinity`。与 GDD §3.1 复核修正（chef/host 行「已归一」）逐字一致。QA 回归 `chef lv3 适配 = (1+0.08×2)×1.5 = 1.74`（否定 1.24）佐证。

### 2.3 解锁成本曲线（§3.5）
- `dish.js:21-27`：`200×1.35^n` / `40×1.30^n`，`Math.round` 取整，n 0-based。与 GDD §3.5 一致。

### 2.4 active_bonus / 三岗 per-level / food_rate（§3.4/§3.3/§3.6）
- `ACTIVE_BONUS=0.15`（`tunables.js:34`）↔ §3.4 点击加把劲；`CHEF/WaITER_PER_LEVEL=0.08`、`HOST_PER_LEVEL=0.06`（`tunables.js:26-28`）↔ §3.3；`FOOD_RATE=0.02`（`tunables.js:37`，`restaurant.js:83 foodGain=foodRate×dt`）↔ §3.6。全部一致。

### 2.5 离线收益（§3.2，锁参）
- `ieff.js:104-109 offlineAccumulated`：`accumulated = Ieff × offlineFactor × min(T_off, T_cap)`；`offlineFactor` 默认 `LOCKED.OFFLINE_FACTOR=0.20`，`T_cap` 默认 `LOCKED.T_CAP_INIT=14400`（`ieff.js:105-106`）。与 GDD §3.2 锁参口径一致，**无硬编码**。

---

## 3. 范围检查

**判定：✅ 无范围漂移、无核心设计意图丢失**

### 3.1 是否超出 Sprint 1 范围（误建 Cocos/UI/真机壳）？
- `src/` 运行时交付仅 9 个 .js（tunables/ledger/ieff/staff/dish/customer/restaurant + analysis/balance-sim.js + prototype/assembly-demo.js）。**无 Cocos/UI/真机壳**。
- `analysis/balance-sim.js`、`prototype/assembly-demo.js` 属分析脚本 / Phase-2 原型，QA 报告已明确「未纳入 Sprint 1、不计入失败」。
- 结论：无范围膨胀。

### 3.2 是否缺失核心设计意图？
- 核心循环「顾客带需求→三岗服务→结算星券/食材→解锁菜品」在 `restaurant.js` 完整编排（DoD「闭环可跑通」达成）。
- 4 决策核心意图（见 §1）全部落地；锁参红线（见 §4）零触碰。
- 设计意图**未丢失**。但存在 3 处「抽象/延迟」需在主理人/后续史诗闭合（均非切片失败）：
  - **D-NOTE-1（座位离散占座）**：GDD §2/§4 有「占座/满座不崩」离散并发模型；切片以 `C_eff = C×host_mult` 在公式层表达有效并发，**未做逐顾客座位占用**（`customer.js:4` 注释提及占座但未实现离散占用）。容量意图经 C_eff 保留，离散占座管理属后续集成项。
  - **D-NOTE-2（编制上限）**：见 §1 决策③。
  - **D-NOTE-3（派遣匹配 / 主动叠加上限）**：见 §1 决策④。
  - **D-NOTE-4（食材来源粒度）**：GDD §3.6 食材为「厨房工位（chef）额外产出」；切片 `foodGain = foodRate×dt` 为扁平副产，未与 chef 在岗绑定。垂直切片合理，细粒度绑定建议后续。
  - **D-NOTE-5（bond 家人级来源）**：`bondFamilyCount` 由 `config` 注入（`restaurant.js:29`），切片未建模动物「家人级」层级（属养成/抽卡史诗）。接口正确、数据源延迟，符合切片范围。

---

## 4. 锁参与 tunable 纪律

**判定：✅ 运行时零触碰锁参、tunable 集中未固化；仅 1 处非运行时脚本同源风险（C4）**

### 4.1 锁参红线（LOCKED 段，不可动）
| 锁参 | 值 | 运行时是否触碰 | 结论 |
|---|---|---|---|
| offline_factor | 0.20 | 仅经 `LOCKED.OFFLINE_FACTOR` 读取（`ieff.js:105`） | ✅ 未硬编码、未改 |
| T_cap_init | 14400 | 仅经 `LOCKED.T_CAP_INIT`（`ieff.js:106`） | ✅ 未硬编码、未改 |
| gacha R/SR/SSR/N | 0.60/0.30/0.10/0.0 | 仅声明，gacha 不在切片 | ✅ 未改（未执行，见 C5） |
| pity 50 / 十连≥1SR / 新手前10≥1SR | — | 仅声明 | ✅ 未改（未执行） |
| 双货币隔离 | star 免费 / diamond 付费 | `serve` 仅结算 star/food（`restaurant.js:84`） | ✅ 生效 |
| 四货币 | star/diamond/food/shard | `ledger.js:19 CURRENCIES` 四值源 | ✅ 生效 |

- 全 `src/` 运行时逻辑均 `require('../config/tunables')` 读数，无直接硬编码锁参。与 QA §4.1 结论一致。

### 4.2 tunable 单一来源 / 未固化
- `TUNED` 段（`tunables.js:15-49`）集中全部可调参（Y_BASE/C_INIT/C_MAX/三岗 per-level/AFFINITY_BONUS=1.5/ACTIVE_BONUS/FOOD_RATE/解锁成本曲线/羁绊上限），运行时统一引用，无散布硬编码。
- `tunables.js:6-12` 头注明确标注 TUNED 段「**待 design-strategist 复核签字，非锁参**」、`LOCKED` 段「绝不可动、不提供 tunable 入口」。纪律到位。
- ⚠️ **C4（设计纪律相邻，低危，非阻断）**：`analysis/balance-sim.js` 自行硬编码 `0.04/0.20/14400/200*1.5^n`，与 tunables.js 不同源。属**非运行时**分析脚本，不威胁切片运行时忠实度，但后续 balance pass 若只改 tunables.js 会悄悄漂移。设计纪律建议：改为 `require('../config/tunables')` 或文件头标注「独立分析副本，调参须同步」。**归类：设计-纪律（软）/工具**，非设计意图丢失。

---

## 5. 关注项归并（C1–C6：属设计 vs 纯 QA）

> 结论：**C1–C6 中无一属于「设计意图丢失/偏离」**；最近 C4 为设计-纪律（软），其余均纯 QA/已知延迟。

| 关注项 | QA 原文定性 | 设计评审归并 | 理由 |
|---|---|---|---|
| C1 serve 幂等断言缺 / 离线防时钟回拨未测 | 低·dead helper | **纯 QA（测试覆盖缺口）** | 幂等/离线公式设计意图已实现（ledger/dish/ieff 正确），仅测试未接 `clock.js`/`economy-harness.js`；「防时钟回拨」属服务端权威层，纯逻辑切片无 server 时间戳，为切片设计 defer，非意图丢失 |
| C2 serve 层 requestId 幂等缺断言 | 低 | **纯 QA** | 底层 ledger/dish 幂等已充分测；生产层补 1 条集成断言即可，设计意图（幂等）在 |
| C3 tests/README.md 过期脚手架 | 中低 | **纯 QA（文档卫生）** | 不影响实现忠实度，仅追溯链误导风险 |
| C4 balance-sim.js 重复锁参/可调参 | 低 | **设计-纪律（软）/工具**（非意图丢失） | 非运行时脚本同源风险；不影响切片运行时；建议 de-dup 或标注 |
| C5 gacha 锁参声明未执行 | 信息 | **纯 defer（已知延迟）** | gacha 不在 Sprint 1；锁参已声明未动，非设计漂移 |
| C6 部分 GDD 验收超切片范围 | 信息 | **纯 defer（设计已决延迟）** | ad_mult 上限/active 叠加上限/T_cap 扩 12h/零动物自动上岗/不变量1/2/4 均按垂直切片设计故意延后 |

**设计评审额外揭示的设计澄清/笔记（非 QA 项，供主理人闭合）**：
- **D-CLR-1**：可服务门槛「任一岗」vs「特定岗映射」——待主理人确认（§1 决策①）。
- **D-NOTE-1~5**：座位离散占座 / 编制上限 / 派遣匹配+主动叠加上限 / 食材来源粒度 / bond 家人级来源——均属切片抽象或后续史诗延迟，建议在 Sprint 2 backlog 显式登记。

---

## 6. 总体评审判定

# ✅ PASS（带非阻断设计澄清与跟进）

**判定依据**：
1. **4 决策全部忠实落地**：①顾客带需求/未解锁零产出无惩罚；②星券+食材原子扣费、无部分扣、不引新资源、成本曲线一致；③三岗+适配整乘 ×1.5 口径正确（R1 归一）；④被动基础结算 + 主动增量（仅做增量不削弱被动）双结构在。无设计意图丢失。
2. **GDD 公式一致性严格**：§3.1/§3.3 I_eff、§3.3 适配整乘（否定旧误 `1.24` 口径）、§3.5 解锁曲线、§3.4 active_bonus、§3.6 food_rate 全部与 v0.2 逐字一致；§3.2 离线锁参经 `LOCKED` 读取无硬编码。
3. **范围检查通过**：零引擎纯逻辑垂直切片，无 Cocos/UI/真机壳误建；核心循环闭环可跑通；缺失项均为切片抽象或已决延迟（D-NOTE-1~5），非意图丢失。
4. **锁参/tunable 纪律达标**：运行时全经 `tunables.js` 单一来源、零硬编码锁参；TUNED 标「非锁参待复核」、LOCKED 禁入口。唯一纪律相邻风险 C4 为非运行时脚本。
5. **关注项归并**：C1–C6 无一属设计意图问题；C4 为软设计-纪律，余皆纯 QA/defer。

### 设计放行批准
**批准 Sprint 1 设计放行**（建议性，最终由主理人游承峰审批）。实现忠实翻译了已签字 GDD v0.2 与 4 项确认决策，无范围漂移、无设计意图丢失。

### 非阻断跟进清单（建议 Sprint 2 backlog，不阻塞本次放行）
| 编号 | 类型 | 动作 | 责任 | 关联合项 |
|---|---|---|---|---|
| F1 | 设计澄清 | 主理人确认「可服务门槛」=任一岗 or 特定岗映射 | 主理人/DS | D-CLR-1 |
| F2 | 设计规则 | 补 `staff.js assign` 编制上限（tunable 来源） | eng | D-NOTE-2 / GDD §3.3 |
| F3 | 设计机制 | 补「派遣匹配」临时改派+主动叠加上限 | eng/DS | D-NOTE-3 / GDD §3.4 |
| F4 | 设计粒度 | 食材副产与 chef 在岗绑定（可选） | eng | D-NOTE-4 |
| F5 | 测试 | 接 `clock.js` 补离线防回拨 + `economy-harness.assertConservation` 接入 | QA | C1 |
| F6 | 测试 | 补 `Restaurant.serve` requestId 幂等集成断言 | QA | C2 |
| F7 | 文档 | 更新 `tests/README.md` 反映 Sprint 1 实际 3 套件 | QA | C3 |
| F8 | 设计纪律 | `balance-sim.js` 改 `require('../config/tunables')` 或标注独立副本 | eng/DS | C4 |

---

## 附：证据指纹（供主理人独立 stat / 读码复核）
- 报告路径：`/Users/junzhi/WorkBuddy/Game/production/design-review/sprint1-design-review.md`
- 设计评审基线：GDD `system-idle-restaurant.md` v0.2（文策渊 2026-07-28 签字·通过）；前置 QA 门 `production/qa/sprint1-qa-report.md`（30/30 全绿·PASS）。
- 关键读码证据：
  - `src/config/tunables.js:15-49` → TUNED 集中可调段（标非锁参）；`:51-63` → LOCKED 锁参段（禁入口）。
  - `src/economy/ieff.js:13-15,41-42` → 适配 `base × affinity(1.5)` 整乘（§3.3 口径，否定旧误）。
  - `src/economy/ieff.js:70-94` → `computeIeff` 与 GDD §3.1 逐乘区对应；`:104-109` → 离线锁参经 `LOCKED.*`。
  - `src/economy/ledger.js:57-73` → requestId 幂等 + 原子 apply（no partial）；`:19` → 四货币单值源。
  - `src/restaurant/dish.js:21-27` → 解锁成本 `200×1.35^n / 40×1.30^n`；`:62-81` → 原子扣费 + 跨菜 requestId 防误开。
  - `src/restaurant/customer.js:57-69` → `matchServiceable` 未解锁→不可服务、零产出；`:63` → 「任一岗在岗」门槛（D-CLR-1）。
  - `src/restaurant/staff.js:14` → 三岗 ROLES；`:16-21` → 主适配岗 `affinityRole`；`:31-37 assign` → 无编制上限（D-NOTE-2）。
  - `src/restaurant/restaurant.js:67-94` → `serve` 被动结算 star/food、不可服务零产出；`:36-41` → 主动/广告 hook。
- 范围扫描：`grep 编制` 全 `src/` 无命中 → 编制上限未实现（D-NOTE-2）；`customer.js:4` 占座仅注释未离散建模（D-NOTE-1）。

> 评审：文策渊（design-strategist）· Phase 5 Sprint 1 实现层设计评审 · 任务 `DS-REVIEW-001`
