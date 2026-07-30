# 《可爱小动物餐厅》v1.0 数值校准计划（REL-001 / CAL-v1.0）

> 文档归属：`production/release/v1-calibration.md`
> 作者：release-ops-lead（路远行）
> 阶段：节点④ 发布接入（P1）· 锁参红线零改动前提下的 TUNED 校准
> 协作：**design-strategist（文策渊）主导数值提案 · engineering-lead（程基岩）主导落盘与门禁 · qa-lead（严守真）回归 · release-ops-lead 编排流程与门控**
> 红线声明：**本计划绝不改 `src/config/tunables.js`、绝不动 `LOCKED` 锁参红线、绝不写游戏逻辑、绝不 commit/push**。本文只定义"什么可调 / 什么禁动 / 怎么调 / 谁来签 / 门控是什么"。

---

## 0. 总览与红线声明

v1.0 数值校准的目标：**在已签字的双流经济 + §5 玩法 + C3 平衡 pass 基线上，用真机数据与 Playtest 对 `TUNED` 段做保守微调，使首发手感更顺，同时零触碰锁参红线**。

- 基线已验证：159/159 单测、主包 131KB<4MB、`I_eff=0.540000`、双流（餐厅 80%/宿舍 20%）、离线仅宿舍 4h 封顶、C3 三方竞争闭环（phase2-balance §2 + §8）。
- **本计划所有校准动作仅作用于 `src/config/tunables.js` 的 `TUNED` 段**；`LOCKED` 段（见 §2）全程冻结。
- **每次 tunable 变更须经 design + eng 双签 + QA 回归 + 主理人审批**，且留 `changelog`（release-plan §4.1）。

---

## 1. 可调 Tunable 清单（TUNED 段）

> 数据来源：`src/config/tunables.js`（2026-07-29 落盘，design-strategist 复核签字 PASS 标注为非锁参 tunable）。当前值逐字引用，校准目标与可调范围为建议，最终由 design 提案 + 双签定。

### 1.1 双流经济核心（§2.5）

| Key | 当前值 | 含义 | 校准目标 | 可调范围（建议） | 风险/注意 |
|---|---|---|---|---|---|
| `DORM_SHARE` | `0.25` | 宿舍时间流占在线收益比（餐厅=1−0.25=80%） | 微调"餐厅为主/宿舍为辅"的体感比重 | `0.20–0.30` | 改变在线双流占比；须重跑 `balance-sim.js` 印证离线占比 ~32% 红线（C3 §8.3 红线3）不被破坏 |
| `T_ORDER` | `5` | 餐厅每单服务周期（秒），不影响总速率 `I_eff` | 飘字频率手感（用户 2026-07-29 由 3s 放慢为 5s） | `3–8` | 仅改离散结算节奏/飘字频率，不改 `I_eff`；过大则挂机感弱、过小则飘字堆叠 |

### 1.2 在线收益基准与升级树（§3.1 / §3.3）

| Key | 当前值 | 含义 | 校准目标 | 可调范围 | 风险/注意 |
|---|---|---|---|---|---|
| `Y_BASE` | `0.04` | 基准单位座位产出 星券/秒/座 | 整体降温/升温（phase2-balance §4 可选杠杆曾提 0.04→0.032 降 20%） | `0.032–0.05` | **高杠杆**：同时削弱活跃与离线（离线仅宿舍×DORM_SHARE），动之须谨慎并双签 |
| `C_INIT` | `4` | 初始座位容量 | 新手开局节奏 | `3–6` | 影响 early 档 `I_eff` 基线 |
| `C_MAX` | `24` | 座位上限 | 后期封顶（非饿死，C3 §8.5） | `20–30` | 改后须重算 late 档 flooding（发现 2） |
| `RECIPE_PER_LEVEL` | `0.10` | 菜谱每级 +10% | 升级树缩放 | `0.08–0.12` | 与 `STATION_PER_LEVEL` 同量级，避免反超 bond 上限 +30%（发现 3） |
| `STATION_PER_LEVEL` | `0.10` | 工位每级 +10% | 同上 | `0.08–0.12` | 同上 |

### 1.3 三岗加成（§3.3 / §5）

| Key | 当前值 | 含义 | 校准目标 | 可调范围 | 风险/注意 |
|---|---|---|---|---|---|
| `CHEF_PER_LEVEL` | `0.08` | 厨师每级 +8% | 岗位软补充强度 | `0.06–0.10` | 须 < 单分支升级（+10%），避免反超（发现 3 红线） |
| `WAITER_PER_LEVEL` | `0.08` | 服务员每级 +8% | 同上 | `0.06–0.10` | 同上 |
| `HOST_PER_LEVEL` | `0.06` | 接待每级 +6% | 同上 | `0.05–0.08` | 同上 |
| `AFFINITY_BONUS` | `1.5` | 主适配岗整乘 ×1.5 | 适配岗收益 | `1.3–1.6` | 整乘，动之须重算三方竞争（C3 §8） |

### 1.4 主动加成（§3.4）

| Key | 当前值 | 含义 | 校准目标 | 可调范围 | 风险/注意 |
|---|---|---|---|---|---|
| `ACTIVE_BONUS` | `0.15` | 点击"加把劲"增量（仅增量，不削弱被动） | 主动参与度手感 | `0.10–0.20` | 仅做增量语义（QA §4.2）；不放大于破坏被动基础 |

### 1.5 食材副产（§3.6）

| Key | 当前值 | 含义 | 校准目标 | 可调范围 | 风险/注意 |
|---|---|---|---|---|---|
| `FOOD_RATE` | `0.02` | 食材副产 食材/秒（在线仅，离线不计） | 食材门节奏（C3-R3 偏慢） | `0.02–0.04` | **必须保持"在线仅、离线不计"语义**，不得让食材突破红线（§2.4） |

### 1.6 菜品解锁成本曲线（§3.5 / §5）

| Key | 当前值 | 含义 | 校准目标 | 可调范围 | 风险/注意 |
|---|---|---|---|---|---|
| `UNLOCK_COST_STAR_BASE` | `200` | 解锁星券成本基数（n=0） | 解锁早期门槛 | `150–260` | 影响星券三方竞争 U/G/R（C3 §8.2） |
| `UNLOCK_COST_STAR_RATE` | `1.35` | 星券成本指数 | 解锁后期陡峭度 | `1.25–1.45` | 动率须重算 R 回收周期 |
| `UNLOCK_COST_FOOD_BASE` | `40` | 解锁食材成本基数（n=0） | 食材门早期门槛 | `30–60` | 食材为独立货币门，不挤占星券三方 |
| `UNLOCK_COST_FOOD_RATE` | `1.30` | 食材成本指数 | 食材门后期陡峭度 | `1.20–1.40` | C3-R3 指 late 食材门偏慢（78 天），可上调 base 缓解 |

### 1.7 养成 idle 加成（system-cultivation §3.2）

| Key | 当前值 | 含义 | 校准目标 | 可调范围 | 风险/注意 |
|---|---|---|---|---|---|
| `BOND_IDLE_PER_ANIMAL` | `0.03` | 家人级且上岗 +3%/只 | 养成软补充 | `0.02–0.04` | 须受 `BOND_IDLE_CAP=+30%` 封顶，避免反超单分支（发现 3） |
| `BOND_IDLE_CAP` | `0.30` | 上限 +30% | 养成天花板 | `0.20–0.40` | **建议冻结**：此 cap 是"无主导策略"红线（发现 3）的护栏 |
| `BOND_IDLE_COUNT_CAP` | `10` | 仅前 10 只上岗计 | 养成计数上限 | `8–12` | 与 C_MAX 协同 |

### 1.8 升级成本曲线（§3.1 / epics E4）

| Key | 当前值 | 含义 | 校准目标 | 可调范围 | 风险/注意 |
|---|---|---|---|---|---|
| `SEAT_COST_BASE` | `200` | 座位成本基数（200×1.5ⁿ） | 座位升级早期门槛 | `150–260` | 指数 1.5 后期极陡（late 座位 997577），动 base 影响 early 节奏 |
| `SEAT_COST_RATE` | `1.5` | 座位成本指数 | 座位后期陡峭度 | `1.4–1.6` | 改率须重算 late flooding |
| `BRANCH_COST_BASE` | `150` | 工位/菜谱成本基数（150×1.4ⁿ） | 分支升级早期门槛 | `120–200` | 与座位曲线协同 |
| `BRANCH_COST_RATE` | `1.4` | 分支成本指数 | 分支后期陡峭度 | `1.3–1.5` | 同上 |

### 1.9 Phase 2/3 辅助 tunable

| Key | 当前值 | 含义 | 校准目标 | 可调范围 | 风险/注意 |
|---|---|---|---|---|---|
| `PET_COOLDOWN_SEC` | `30` | 撸毛冷却（防 spam） | 互动节奏 | `20–60` | 仅影响撸毛手感，零货币（§8-C4 红线） |
| `PET_AFFINITY_GAIN` | `1` | 每次撸毛 +好感度 | 好感 accrual | `1–2` | 好感 A∈[0,100]，不影响货币 |
| `PET_DAILY_CAP` | `20` | 每 critter 每日撸毛上限 | 好感 accrual 上限 | `10–30` | **已单测覆盖**（cultivation.spec.js），动之须补回归 |
| `PET_HAPPY_DURATION_SEC` | `8` | "开心"视觉态时长 | 纯视觉 | `5–12` | 无数值 buff |
| `PET_FOOD_REWARD` | `0` | 蹭蹭回礼食材（默认关） | — | **保持 0** | ⚠️ **禁改 >0**：破"食材仅 idle 副产"红线（§2.4） |
| `WAREHOUSE_UNLOCK_DISH_COUNT` | `3` | 囤囤仓开放门槛（已解锁菜数） | 场景开放节奏 | `2–5` | TBD 真机验证"勿过早/过晚" |
| `LOUNGE_UNLOCK_ROSTER_COUNT` | `6` | 撸毛馆开放门槛（已拥有动物数） | 同上 | `4–8` | 同上 |
| `OFFLINE_CAP_HOURS` | `4` | 离线待领取上限小时数 | 领取频率 | `2–12` | **必须 = T_CAP_INIT/3600 = 4h**，动之须同步 `LOCKED.T_CAP_INIT`（锁参！）见 §2.2 |

> **关键交叉提示**：`OFFLINE_CAP_HOURS`（TUNED）与 `LOCKED.T_CAP_INIT=14400`（锁参）当前一致（4h）。**校准 `OFFLINE_CAP_HOURS` 即触碰锁参语义，禁止单改其一**——如需调离线时长，须按 §2.2 红线流程，且改的是 `T_CAP_INIT`（锁参），不在本校准范围。

---

## 2. 红线禁区（LOCKED 段 · 一律不可动）

> 以下任一项被改 = 红线击穿 = 发布 NO-GO（release-plan §9.2）。校准提案不得包含以下任何一项。

### 2.1 离线/离线上限锁参

| 红线项 | 值 | 出处 | 禁动理由 |
|---|---|---|---|
| `OFFLINE_FACTOR` | `0.20` | LOCKED | 平衡 pass v0.2 落盘、design-strategist 签字 PASS（2026-07-30）；双流下离线仅宿舍×0.20，放慢早期保底至 ~2.0 周 |
| `T_CAP_INIT` | `14400`（4h，可扩至 12h） | LOCKED | 离线累积上限初始值；与 `OFFLINE_CAP_HOURS` 一致 |

### 2.2 抽卡锁参（E3 已执行，全只读 LOCKED）

| 红线项 | 值 | 禁动理由 |
|---|---|---|
| 概率 `GACHA_R/SR/SSR/N` | `0.60 / 0.30 / 0.10 / 0.0` | R池 60-30-10、N=0% 不入池（art-bible 主理人裁定 v0.3 固化） |
| `PITY_HARD` | `50` | 50 抽硬保底（跨货币共享） |
| 软保底阶梯 | `SSR_SOFT_START=41 / END=49 / STEP=0.09 / OFFSET=40` | 软保底 41–49 阶梯，c=50 硬保底 100% |
| `TEN_PULL_SR_GUARANTEE` | `true` | 十连 9 折保底 ≥1SR |
| 抽卡成本 | 单 100 / 十连 900（星券/钻石同价） | 星券免费、钻石付费，共用池与 pity |
| 重复转碎片 | R20 / SR50 / SSR100 | 升星阈值 |
| `NEWBIE_FIRST10_SR` / `GACHA_NEWBIE_PULLS` | `true` / `10` | 新手前 10 抽保底 ≥1SR |

### 2.3 四货币定义（不可改/不可增）

- **星券**：免费，放置经营唯一生产源（双流 + 离线仅宿舍）。
- **钻石**：付费 IAP，不进放置产出，与星券共享全局 pity。
- **食材**：经营副产，仅宿舍时间流副产、离线不计。
- **碎片**：抽卡重复转化。
- ⚠️ 禁止引入第五种货币；禁止让任一货币突破既有产出/隔离语义（如 `PET_FOOD_REWARD>0` 破食材红线）。

### 2.4 经济护栏（不可破）

- 双货币隔离：抽卡只动 star/diamond，不碰 food；idle 仅产星券+食材；撸毛零货币（§8-C4）。
- 离线仅宿舍流、离线不计食材（与 `OFFLINE_FACTOR`/`T_CAP_INIT` 协同）。
- "无主导策略"：bond 上限 +30% < 单分支升级 +10%（发现 3），`BOND_IDLE_CAP` 建议冻结。

### 2.5 红线自检机制（每次校准必跑）

- `grep` / Grep `src/config/tunables.js` 的 `LOCKED` 段：与基线逐字段比对，零 diff。
- `grep` 渲染层/逻辑层是否硬编码概率/保底/四货币（须全读 `LOCKED`，无散落常量）。
- 不变量 #1（零位图）/ #2（家族硬隔离）与校准无关，但回归时一并保护（QA §3.1）。

---

## 3. 校准流程（基于真机数据 + Playtest，design+eng 双签）

### 3.1 流程总图

```
[数据采集] → [分析] → [提案] → [design 签] → [eng 签] → [改 tunables.js(TUNED)]
   ↑                                                        ↓
   └──────── 回归(QA) ← 审批(主理人) ← 灰度 ← 真机验证 ←──┘
```

### 3.2 阶段详述

**阶段 A · 数据采集（真机 + Playtest）**
- 通道：`beta` 体验版招募小样本玩家（建议 N≥50 活跃样本，覆盖 early/mid/late 进度档）。
- 数据源：真机行为埋点（升级 vs 抽卡 vs 解锁分配比例、在线时长、离线领取频率、主动"加把劲"使用率、关卡/解锁卡点）。
- 对照：phase2-balance §2 / §8 模拟基线（early 355★/日、离线占比 32.4%、50 保底 ~2.0 周全投 / 6.7 周推荐份额），看真实偏离。

**阶段 B · 分析**
- 比对真实分配比例 vs C3 推荐 `C3_ALLOC`（early 45/30/25、mid 40/35/25、late 25/45/30）。
- 识别卡点（哪条 tunable 导致某档饿死/过于宽松），对照 §1 可调范围。
- 不得为"后期 flooding"（发现 2）改常数硬压——靠内容 sink（动物/升星/装饰）吸收，提需求给 design。

**阶段 C · 提案（design-strategist 主导）**
- 产出《校准提案 #C-NNN》：列出拟改 `TUNED` 项、当前值→目标值、理由、预期影响（重跑 `balance-sim.js` 印证三线：早期保底 ~2 周上界、离线占比 ~32%、无主导策略）。
- **提案不得含任何 §2 红线项**；含则直接退回。

**阶段 D · 双签（design + eng）**
- design-strategist 签字：数值合理、不破红线、不反超单分支。
- engineering-lead 签字：落盘形态正确（仅改 `TUNED`）、三门禁可过、锁参未动。
- 双签前**不得改 `tunables.js`**。

**阶段 E · 落盘（engineering-lead）**
- 仅改 `TUNED` 段目标项；提交 `changelog`（release-plan §4.1 `Changed`）；留 tunables diff。

**阶段 F · 回归（qa-lead）**
- `npm test` 159/159（不回退）、`build-size.gate.js` <4MB、`node game.js` I_eff 仍为 0.540000（除非 `Y_BASE`/`C_INIT` 等被改，则按新基线）、锁参红线自检（§2.5）零 diff。
- 若改 `PET_DAILY_CAP` 等已测项，须补/验对应单测。

**阶段 G · 审批 + 灰度 + 全量**
- 主理人/用户审批 → 体验版验证 → 小比例灰度（监控崩坏/留存）→ 全量。
- 留上一版 `tunables.js` 快照（回滚预案，release-plan §8）。

### 3.3 双签门控（硬规则）

| 条件 | 是否满足才允许改 tunables.js |
|---|---|
| 提案仅含 `TUNED` 项（零 `LOCKED`） | 必须 |
| 重跑 `balance-sim.js` 三线达标 | 必须 |
| design-strategist 签字 | 必须 |
| engineering-lead 签字 | 必须 |
| 主理人/用户审批 | 必须 |
| QA 回归三门禁 + 红线自检 | 改后必须 |

---

## 4. 校准产出物形态

| 产出物 | 形态 | 位置 | 责任 |
|---|---|---|---|
| 校准提案 #C-NNN | Markdown：拟改项/当前→目标/理由/预期影响/三线印证 | `production/release/calibration/C-NNN.md` | design-strategist |
| 校准报告（周期） | 汇总多轮提案 + 真机数据对照 + 结论 | `production/release/calibration/report-v1.0.md` | release-ops-lead 编排 |
| tunables diff | `git diff src/config/tunables.js`（仅 TUNED 段） | 随提案附 | engineering-lead |
| changelog 条目 | `Changed` 段（附双签引用） | `production/release/CHANGELOG.md` | release-ops-lead |
| 审批记录 | 双签 + 主理人批准时间戳 | 提案内 | 主理人 |
| 回滚快照 | 上一版 `tunables.js` 副本 + 构建产物 | `production/release/calibration/snapshots/` | engineering-lead |

---

## 5. 门控（Gate）汇总

### 5.1 改 `tunables.js` 前置门（全部满足）

1. 提案零 `LOCKED` 项（§2 红线全禁）。
2. 重跑 `balance-sim.js` 印证：早期 50 保底全投 ~2.0 周上界、离线占比 ~32%、bond<单分支（无主导策略）。
3. design + eng 双签。
4. 主理人/用户审批。
5. changelog 条目就绪。

### 5.2 改后回归门（QA）

- `npm test` 159/159（不回退基线）。
- `node tests/smoke/build-size.gate.js` 退出 0（<4MB）。
- `node game.js` boot OK（I_eff 按新基线）。
- 锁参红线自检（§2.5）零 diff。
- 若触达已单测覆盖的 tunable（如 `PET_DAILY_CAP`），对应测试通过。

### 5.3 发布门（见 release-plan §9）

- 校准相关 Blocker：锁参红线被改（任何一次）、 calibration 提案未经双签即落盘、回归非全绿 → NO-GO。
- 校准本身非发布 Blocker（可后置到 v1.0.1+），但**首发前至少完成一轮 beta Playtest 校准提案**（建议）。

---

## 6. 校准里程碑 / 节奏（建议）

| 里程碑 | 通道 | 内容 | 产出 |
|---|---|---|---|
| M0 基线 | rc 前 | 当前 `TUNED` 全量快照 + 三线基线记录 | `calibration/baseline-v1.0.md` |
| M1 首轮 Playtest | beta | 招募样本、采集真实分配/卡点 | 真实数据 vs C3_ALLOC 对照 |
| M2 首轮提案 | beta→rc | #C-001 等（如 `DORM_SHARE`/`T_ORDER`/解锁曲线微调） | 双签 + changelog |
| M3 回归+灰度 | rc | QA 三门禁 + 灰度监控 | 上线就绪 |
| M4 持续校准 | stable 后 | 每赛季基于数据做 PATCH 级微调 | 周期报告 |

> 红线自检：本计划仅含清单/流程/门控，未改 `src/config/tunables.js`、未动 `LOCKED`、未写游戏逻辑、未 commit/push。任何 tunable 实际变更须回到本计划 §3 流程，由 design+eng 双签后由 engineering-lead 落盘。
