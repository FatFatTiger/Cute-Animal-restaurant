# Sprint 1 垂直切片 · QA 门控评审报告

> 评审人：**严守真（quality-lead / QL）** · 团队：animal-resto-studio
> 任务标签：`QL-SPRINT1-001` · 评审层：Phase 5 Sprint 1 第二层验证（非 rubber-stamp）
> 评审对象：Sprint 1 纯逻辑交付（E4/E11/E12 核心循环 + 不变量 3/5/6/7）
> 基准：GDD v0.2（system-idle-restaurant §3.1/§3.2/§3.3/§3.5 + design-strategist 签字 2026-07-28）

---

## 0. 评审方法与纪律声明

- **独立重跑**：在仓库根 `cd /Users/junzhi/WorkBuddy/Game && npm test` 实际执行（非采信 engineering-lead 回传）。
- **真实读码**：逐文件读取 `src/config/tunables.js`、`src/economy/{ledger,ieff}.js`、`src/restaurant/{staff,dish,customer,restaurant}.js` 及全部 3 个测试套件、helpers、fixtures。
- **不变量对账**：以 `tests/README.md` 不变量 1–7 为清单，逐条判定覆盖状态。
- **口径校验**：对照 GDD `system-idle-restaurant.md` §3.3 适配乘区口径，验证 `ieff.js` 实现与回归测试。
- **质量门性质**：本报告判定为**建议性门控（advisory）**；最终放行由主理人游承峰决定。

---

## 1. 独立测试重跑结果（第二层验证）

**命令**：`cd /Users/junzhi/WorkBuddy/Game && npm test`
**结果**：`Test Suites: 3 passed, 3 total` / `Tests: 30 passed, 30 total` / `Time: 0.219 s`
**断言**：与主理人独立核验及 eng 回传一致——**3 套件 / 30 测试全绿，无 flaky、无跳过**。

| 套件 | 类型 | 用例数 | 状态 |
|---|---|---|---|
| `tests/unit/economy.spec.js` | T1 单测 | 18 | ✅ PASS |
| `tests/integration/dish-unlock.int.js` | T2 集成 | 5 | ✅ PASS |
| `tests/integration/customer-dish.int.js` | T2 集成 | 7 | ✅ PASS |
| **合计** | | **30** | ✅ **全绿** |

> 注：本报告为**实跑**（非「未实跑、仅静态核对」），因当前环境具备 node/jest 执行权限。

交付文件清点（供追溯）：
- 运行时逻辑（`src/`，9 个 .js）：`config/tunables.js`、`economy/ledger.js`、`economy/ieff.js`、`restaurant/{staff,dish,customer,restaurant}.js`、`analysis/balance-sim.js`（分析脚本）、`prototype/assembly-demo.js`（Phase-2 原型，非 Sprint 1 范围）。
- 测试（7 个 .js）：上述 3 套件 + `tests/helpers/{seeded-rng,clock,economy-harness,mock-wx-storage}.js` + `tests/fixtures/{animals,economy-config}.json`。

---

## 2. 不变量 1–7 覆盖评估

判定图例：**✅ 充分覆盖** / **⚠️ 范围内但缺口** / **➖ 超出 Sprint 1 范围（已知延迟）**。

| # | 不变量 | 落点（当前实现） | 覆盖判定 | 说明 |
|---|---|---|---|---|
| 1 | atlas 字节零增长 | 无（Sprint 1 未含拼装模块） | ➖ 超范围 | assembly 属 Phase-2 史诗，`prototype/assembly-demo.js` 未纳入 Sprint 1；不计入失败。 |
| 2 | 跨家族组合运行时抛错 | 无（同上） | ➖ 超范围 | 同上；家族守卫逻辑未在本切片实现。 |
| 3 | 货币守恒 + requestId 幂等 | `economy.spec.js`×3 + 间接集成 | ✅ 充分 | 见 §2.3 详述。 |
| 4 | 保底计数正确（R60/SR30/SSR10/N0/50 硬保底/十连≥1SR/新手前10≥1SR） | `tunables.js` LOCKED 仅声明，逻辑未实现 | ➖ 超范围 | gacha 不在 Sprint 1；锁参已声明但**未被执行/回归**（见 §4、Concern C5）。 |
| 5 | 离线收益封顶（offline_factor=0.20） | `economy.spec.js`×3 | ✅ 充分（一处缺口） | 锁参值、公式、软上限均覆盖；唯「防时钟回拨」未实测（见 Concern C1）。 |
| 6 | 菜品解锁扣费原子性 | `economy.spec.js`×5 + `dish-unlock.int.js`×5 | ✅ 充分（含跨层冗余，可接受） | success / no-partial / 幂等 / 成本曲线 / 默认基础菜 全覆盖。 |
| 7 | 顾客需求-解锁匹配 | `customer-dish.int.js`×7 | ✅ 充分 | 未解锁不服务、已解锁在岗可服务、无在岗不可服务、seeded 可复现、纯函数确定性 全覆盖。 |

### §2.3 不变量 3（货币守恒 + 幂等）逐断言核对
- `同一 requestId 重复提交只计一次`：✅ `l.getBalance('star')===100`（仅 +100 一次），`r2.dup===true`、`r2.applied===false`。
- `Σ产出 == Σ消耗 + Δ余额`：✅ +100 / −30 / −20 → 余额 50。
- `任一侧不足 → 整体拒绝（no partial）`：✅ star/food 均不扣，reason=INSUFFICIENT。
- `钻石不进放置产出路径`：✅ serve 仅结算 star/food，diamond/shard 恒为 0。
- **缺口**：跨批次多货币封闭守恒（helper `economy-harness.assertConservation`）**未被任何测试调用**（dead helper，见 C1）；serve 层 requestId 幂等**无断言**（见 C2）。

### 覆盖冗余 / 缺口小结
- **冗余（可接受）**：不变量 6 在单测与集成层各重测一遍（success / no-partial / 幂等），属单测+集成双层保护，非浪费。
- **缺口（须关注）**：见 Concern C1、C2（均为 Sprint 1 范围内但缺断言）。

---

## 3. 边界用例评审

| 边界 | 是否覆盖 | 落点 | 备注 |
|---|---|---|---|
| 离线封顶 offline_factor=0.20（锁参） | ✅ | `economy.spec.js` | `LOCKED.OFFLINE_FACTOR===0.2` 断言 |
| requestId 幂等 | ✅ | ledger / dish 层 | 跨层双测 |
| 任侧不足零扣（no partial） | ✅ | ledger / dish / 集成 | 全绿 |
| seeded 可复现 | ✅ | `customer-dish.int.js` | 同种子→同序列 |
| §3.3 适配整乘回归 | ✅ | `economy.spec.js` | `chef lv3 适配=1.74`（明确否定旧误口径 1.24） |
| 货币守恒 | ✅ | `economy.spec.js` | 见 §2.3 |
| 钻石不进放置产出 | ✅ | `economy.spec.js` + `customer-dish.int.js` | 双测 |
| 多员工同岗乘区叠加（非相加） | ✅ | `economy.spec.js` | 1.5×1.5=2.25 ≠ 3.0 |
| 羁绊 idle 上限 +30% / 前10只封顶 | ✅ | `economy.spec.js` | bondIdleMult(10/15)→1.3 |
| 主动加成仅增量 | ✅ | `economy.spec.js` | active=passive×(1+0.15) |
| **serve 层 requestId 幂等** | ⚠️ 缺 | — | ledger 幂等正确，但 Restaurant.serve 未断言重复 requestId 仅入账一次（C2） |
| **离线防时钟回拨** | ⚠️ 缺 | — | GDD §4/§5 验收项；offlineAccumulated 直接收 T_off，未接 clock，无回拨抵抗测试（C1） |
| **T_cap 扩至 12h** | ➖ 超范围 | — | 仅默认 14400s；扩展机制未实现（设计注记，延后） |
| **dt=0 / 负 dt** | ⚠️ 未测 | — | starGain=Ieff×dt；边界 trivial，建议补一条 smoke |
| **空需求池 / dishDemand 越界** | ⚠️ 未测 | `customer.js` | 空池默认 `['dish_1']`，无断言 |
| **ad_mult 切换(1↔2) / active_bonus 叠加上限** | ➖ 部分超范围 | `restaurant.js` | setAdMult/setActiveBonus 暴露但无叠加上限；GDD §3.2/§3.4 验收项未全覆盖（延后） |
| **零动物自动上岗 5 只 N** | ➖ 超范围 | — | GDD §4；Sprint 1 取显式 staff（垂直切片合理） |

**结论**：Sprint 1 范围内的核心边界（锁参、幂等、no-partial、seeded、§3.3、守恒、钻石隔离）均已覆盖；2 处范围内缺断言（serve 幂等、离线回拨），均非阻断级，列 Concern。

---

## 4. 锁参回归检查

### 4.1 运行时逻辑是否触碰锁参红线
- 对 `src/` 全量扫描：所有运行时逻辑（`ieff.js`/`dish.js`/`restaurant.js`/`staff.js`/`ledger.js`）**均通过 `require('../config/tunables')` 读取数值，无直接硬编码锁参/可调参**。
- 仅 `src/analysis/balance-sim.js` 与 `src/prototype/assembly-demo.js` 出现数值字面量（`0.04/0.20/14400/1.5^n/0.08/0.06`），二者**非运行时交付**：前者为平衡分析脚本，后者为 Phase-2 原型。详见 Concern C4。

### 4.2 锁参红线逐条核对（LOCKED 段）
| 锁参 | 值 | 状态 | 验证方式 |
|---|---|---|---|
| offline_factor | 0.20 | ✅ 未被改 | 代码默认取 `LOCKED.OFFLINE_FACTOR`；单测断言 `===0.2` |
| T_cap_init | 14400 (4h) | ✅ 未被改 | 默认取 `LOCKED.T_CAP_INIT` |
| gacha R / SR / SSR / N | 0.60 / 0.30 / 0.10 / 0.0 | ✅ 声明未动（但**未执行**，见 C5） | 仅 `tunables.js` 声明 |
| pity 硬保底 | 50 | ✅ 声明未动（未执行） | 同上 |
| 十连 ≥1SR | true | ✅ 声明未动（未执行） | 同上 |
| 新手前10抽 ≥1SR | true | ✅ 声明未动（未执行） | 同上 |
| 双货币隔离 | star 免费 / diamond 付费 | ✅ 生效 | serve 不结算 diamond；单测验证 |
| 四货币体系 | star/diamond/food/shard | ✅ 生效 | `CURRENCIES` 四值源，diamond/shard 走非放置路径 |

### 4.3 tunable 集中性 / 固化检查
- `TUNED` 段（Y_BASE/C_INIT/C_MAX/三岗 per-level/AFFINITY_BONUS=1.5/ACTIVE_BONUS/FOOD_RATE/解锁成本曲线/羁绊上限）**全部集中**于 `tunables.js`，运行时统一引用，**无固化**（无散布硬编码）。
- 风险点：`src/analysis/balance-sim.js` 自行硬编码 `Y_BASE=0.04 / OFFLINE_FACTOR=0.20 / T_CAP_SEC=4*3600 / seatCost=200*1.5^n`，与 `tunables.js` **重复且不同源**——若后续平衡 pass 调参只改 `tunables.js`，分析脚本会悄悄偏离运行时。属 Concern C4（低危，非阻断）。

---

## 5. T3 明确 defer（已知缺口，不计入 Sprint 1 失败）

Sprint 1 **故意未建 Cocos / 真机壳**，以下 T3 验证**未执行**，归后续专项 spike，**不计入 Sprint 1 失败**：

- V4 主包 <4MB 门禁（`tests/smoke/build-size.gate.js` 未建，仅为 README 占位）。
- V6 引擎插件注入、V7 分包按需命中。
- R1（帧率）/ R2（启动耗时）/ R4（内存）真机验证。
- `device-boot.smoke.js` 真机启动脚本（占位）。
- assembly 拼装 / atlas（不变量 1）+ 家族守卫（不变量 2）相关 T3/T1 均延后至拼装史诗。

> 此 defer 由设计（垂直切片范围）决定，主理人已知。本报告**不因此判 FAIL**。

---

## 6. Bug 列表 / 关注项

### 阻断级 Bug（Blocker/Critical）：**无**。

### 关注项（CONCERNS，建议性，非阻断）

- **C1（低）· 两处 dead helper → 真实覆盖缺口**
  `tests/helpers/clock.js`（防时钟回拨）与 `tests/helpers/economy-harness.js`（跨批次多货币守恒 `assertConservation`）**均未被任何测试 import**。后果：
  - 不变量 3 的「封闭批次守恒」仅以单笔 apply 粒度验证，未以 harness 做端到端批次校验；
  - 离线「防本地时钟回拨」（GDD §4/§5 验收项）**无测试**（`offlineAccumulated` 直接收 `T_off`，未接 injectable clock）。
  - 建议：Sprint 2 接入 `clock.js` 补离线回拨测试；将 `assertConservation` 接入一枚集成用例。

- **C2（低）· serve 层 requestId 幂等缺断言**
  `Restaurant.serve` 委托 `ledger.apply(requestId,…)`，幂等由底层保证；但**无测试断言「同一 requestId 在 serve 层重复结算仅入账一次」**。底层已充分测，此属生产层补齐。建议补 1 条集成用例。

- **C3（中低）· tests/README.md 为过期脚手架**
  该文件仍为 Phase-4 v0.1 占位（首行「无实现」），列出 `assembly.spec.js`/`gacha.spec.js`/`cultivation.spec.js`/`build-size.gate.js`/`device-boot.smoke.js` 等**不存在**的测试，未记载 Sprint 1 实际交付的 3 套件。对 QA 追溯链有误导风险。建议：更新 README 以反映 Sprint 1 实际落点，或显式标注「脚手架/规划，非现状」。

- **C4（低）· balance-sim.js 重复锁参/可调参**
  分析脚本自行硬编码 `0.04/0.20/14400/200*1.5^n`，与 `tunables.js` 单一来源脱节，存在后续调参漂移风险。建议：改为 `require('../config/tunables')`，或于文件头标注「独立分析副本，非运行时，调参须同步」。

- **C5（信息）· gacha 锁参已声明但未执行**
  `LOCKED` 中 R60/SR30/SSR10/N0/50 硬保底/十连≥1SR/新手前10≥1SR 均**仅声明、未被任何逻辑引用**（gacha 不在 Sprint 1）。本 Sprint 无法对其做回归，属已知延迟，待 gacha 史诗补 `gacha.spec.js`。

- **C6（信息）· 部分 GDD 验收项超 Sprint 1 范围**
  ad_mult 切换上限、active_bonus 叠加上限、T_cap 扩 12h、零动物自动上岗 5 只 N、不变量 1/2/4 —— 均不在垂直切片范围，延后实现，**非 Sprint 1 失败**。

---

## 7. 总体门控判定

# ✅ PASS（带非阻断关注项）

**判定依据**：
1. 独立重跑 **3 套件 / 30 测试全绿**，无 flaky、无跳过（第二层验证通过，非采信 eng）。
2. Sprint 1 范围内不变量 **3 / 5 / 6 / 7 均充分覆盖**；§3.3 适配整乘口径经单测回归（1.74 口径正确，否定 1.24 旧误）。
3. 运行时逻辑**未触碰任何锁参红线**，tunable **集中未固化**；GDD v0.2 §3.3/§3.5 对齐经 design-strategist 签字并代码级复核一致。
4. T3（Cocos/真机/分包）**按设计 defer**，不计入失败。

**未达标项**：无阻断级。
**建议跟进**（Sprint 2  backlog，非本切片阻塞）：C1（clock/harness 接入）、C2（serve 幂等断言）、C3（README 更新）、C4（balance-sim 去重）、C5/C6（gacha / 拼装 / 扩展机制延后史诗）。

> 最终发布放行仍由主理人游承峰审批；本判定为建议性门控。

---

## 附：评审证据指纹（供主理人独立 stat 复核）

- 报告路径：`/Users/junzhi/WorkBuddy/Game/production/qa/sprint1-qa-report.md`
- 评审时 `npm test` 输出签名：`Test Suites: 3 passed, 3 total | Tests: 30 passed, 30 total`
- 关键读码证据：
  - `src/economy/ieff.js:105-106` → offlineFactor/T_cap 默认取 `LOCKED.*`（锁参未硬编码）。
  - `src/economy/ieff.js:13-15,41` → 适配口径 `base × affinity(1.5)`（§3.3 整乘），与单测 `1.74` 一致。
  - `src/economy/ledger.js:57-73` → requestId 幂等 + 原子 apply（no partial）。
  - `src/restaurant/dish.js:62-81` → 解锁原子扣费 + 跨菜 requestId 防误开。
  - `src/config/tunables.js:51-63` → LOCKED 锁参段；`:15-49` → TUNED 集中可调段。
- helper 使用扫描：`seeded-rng` 被 `customer-dish.int.js` 引用；`clock`/`economy-harness`/`mock-wx-storage` **未被任何测试引用**（dead，对应 C1）。
