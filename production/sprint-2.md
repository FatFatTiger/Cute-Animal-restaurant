# Sprint 2 · 工程底座（Engineering Base）交付记录

> 任务标签：EL-SPRINT2-001
> 阶段：Phase 5 Sprint 2
> 主导：engineering-lead（程基岩）· 主理人：游承峰
> 范围：建立回归保护网 + 闭合已知工程缺口。
> **不做** E3 抽卡 / E7 UI / R-BAL-4 数值；**不触碰** `game.js` / Cocos / 微信真机 shell。
> 注：Sprint 3 已追加实现 **E3 抽卡**（纯逻辑核心，见 §6，任务标签 EL-E3-001）；E7 演出与 E5 升星/溢出回收仍延后至对应 epic。

## 1. 交付清单

### A. git + CI（回归保护网地基）
- A.1 `git init` + `.gitignore`：排除 `node_modules/`、`.workbuddy/`、`*.log`、`project.private.config.json`、`*.pem/*.key/*.p12/*.pfx`、`.env*`；保留 `src/ tests/ design/ production/`。
- A.2 首个基线提交 `chore: init repo + Sprint1 vertical slice + WX shell`（不含 node_modules，41 个文件）。
- A.3 真实 `.github/workflows/ci.yml`：两个 job —— `test`（`npm ci` → `npm test`）、`size-gate`（`npm ci` → `node tests/smoke/build-size.gate.js`）。替换 `tests/README.md` §4 占位骨架。

### B. 拼装工程化（不变量 1/2）
- B.1 `src/assembly/index.js`：从 `src/prototype/assembly-demo.js` 抽取拼装逻辑（CommonJS 导出，保留 demo 行为，标注「Sprint2 工程化」）。新增 `AssemblyRegistry` 支撑不变量 1（atlas 字节零增长）。
- B.2 `tests/unit/assembly.spec.js`：9 个用例覆盖不变量 1（atlas 零增长）与不变量 2（跨家族 `FamilyIsolationError`）。**未改动锁参，未改 `& 0xff` 钳制（R-ENCODE）。**

### C. 主包体积门禁（T3 硬门禁）
- C-1 `tests/smoke/build-size.gate.js`：读 `project.config.json` `packOptions.ignore`，递归累加非忽略文件字节，断言 `< 4MB`（4194304），超限 `process.exit(1)`，打印发布包字节数。本地产出 ≈36KB，通过。

### D. 闭合 Sprint 1 QA / 设计评审缺口
- C1 serve 幂等：`src/restaurant/restaurant.js` 的 `serve()` 修正 —— 重复 `requestId` 不再误报二次发放（`applied = res.ok && !res.dup`，重复时 `earned=0`、`ledgerOk:false`）；账本本身早已唯一。并在 `tests/integration/qa-gaps.int.js` 增加幂等断言（同 id 仅结算一次 / 不同 id 独立 / 不可服务顾客不结算）。
- C2 死 helper 回收：`tests/integration/qa-gaps.int.js` 引用 `tests/helpers/clock.js`（防回拨）与 `tests/helpers/economy-harness.js`（跨批次守恒）编写用例，消除两个长期未用的 helper。
- C3 `tests/README.md` 过期脚手架章节更新（见第 3 节）。
- C4 `src/analysis/balance-sim.js` 改为 `require('../config/tunables')` 取参（锁参来自 `LOCKED`，曲线来自 `TUNED`），消除重复与漂移风险；输出字节级不变（md5 `8a4f937150dccea4d2c57cabbaeb9a8b`）。`tunables.js` 相应补 `SEAT_COST_*` / `BRANCH_COST_*`。

### 文档
- `production/sprint-2.md`（本文件）：工程底座任务清单 + 延后项（Phase 5 待办）。

## 2. 纪律遵守
- 锁参红线（`offline_factor=0.20`、`T_CAP_INIT=14400`、抽卡锁参）未动。
- 不变量 1–5 不变；本 Sprint 新增对 1/2 的自动化覆盖。
- GDD 未修订；tunable 仍标「待复核非锁参」。
- 未触碰 `game.js` / Cocos / 微信真机 shell。
- 所有新增测试在 `npm test` 通过；CI 文件仅创建，未本地跑 GitHub Actions。

## 3. tests/README.md 更新要点（C3）
- 删除「脚手架 v0.1 / 待审批」占位口吻，标注已落地（Sprint 1 + Sprint 2）。
- 目录结构反映真实文件，删除对不存在用例的误导（gacha.spec.js / cultivation.spec.js / gacha-economy.int.js / idle-economy-gacha.int.js / bond-idle.int.js / device-boot.smoke.js / playtest 文件 / gacha-config.json）。
- 记录真实 4 套件与不变量覆盖：assembly(1,2) / economy(3,5,6 原子) / customer-dish(7) / dish-unlock(6)；不变量 4（抽卡保底）因 E3 延后未覆盖。
- 不变量追溯表（§5）指向真实文件；CI 章节指向 `.github/workflows/ci.yml` 真实两 job。

## 4. Phase 5 待办（延后项，本 Sprint 不实现，仅记录）
| 项 | 来源 | 延后原因 | 落点 Sprint |
|----|------|----------|-------------|
| C5 | QA 报告 | 抽卡锁参「声明未执行」需随 E3 落地 | Sprint 3+（E3） |
| C6 | QA 报告 | 部分 GDD 验收超出 Sprint 1 范围，随对应 epic 落地 | 对应 epic Sprint |
| D-NOTE-1 | 设计评审 | 离散座位占用模型 | 待定 |
| D-NOTE-2 | 设计评审 | 员工指派上限 | 待定 |
| D-NOTE-3 | 设计评审 | 调度匹配 / 在岗上限 | 待定 |
| D-NOTE-4 | 设计评审 | 食材来源粒度 | 待定 |
| D-NOTE-5 | 设计评审 | 羁绊家族级来源 | 待定 |
| E3 抽卡 | Epic | **Sprint 3 已实现（EL-E3-001，见 §6）** | 已完成 |
| E7 UI | Epic | 用户未选，留后续 | Sprint 3+ |
| R-BAL-4 数值复核 | 锁参 | 主理人推演落盘，待 design-strategist 签字 | 待定 |

## 5. 验证（HANDOFF §8 防抖）
- `npm test`：基线 Sprint 1 为 30 用例；本 Sprint 新增 assembly 9 + qa-gaps 8（共 > 40）。
- `node tests/smoke/build-size.gate.js`：发布包 ≈36KB < 4MB，exit 0。
- `git log --oneline -1`：Sprint 2 提交 + 基线提交 `24e7ff2`。
- 全部新增/修改文件 `stat -f '%m %z'` 见回传报告。

---

## 6. Epic 3 抽卡系统交付（Sprint 3 · EL-E3-001）

> 任务标签：EL-E3-001 ｜ 主导：engineering-lead（程基岩）｜ 主理人：游承峰
> 范围：实现可单测的**纯逻辑核心** + 服务端权威抽象（预生产，不接真机）。一次打通 E3-S1~S5 + E6 事件订阅接口预留。
> 纪律：锁参红线（R60/SR30/SSR10、N=0%、50 保底、十连≥1SR、新手前10≥1SR、双货币隔离、四货币）全部读 `tunables.js` 的 LOCKED，不硬编码；不回改 GDD；不碰 game.js / Cocos / 微信真机壳 / UI（E7 留后续）；不重写 E4/E11/E12（仅复用）。

### 6.1 交付清单
- **A. `src/gacha/index.js`（CommonJS）**：`GachaEngine` 实现 E3-S1~S5。
  - E3-S1 单抽稀有度摇号：R60/SR30/SSR10、N=0%（普通池不产 N）；星券/钻石扣费经 E6 ledger，不足不发起。
  - E3-S2 pity 计数 + 硬/软保底：`pity∈[0,50]` 每次+1、SSR 获取归零、跨货币共享；硬保底 `pity≥50→SSR`；软保底 `c∈[41,49]` 阶梯 `SSR_rate(c)=min(1, GACHA_SSR + SSR_SOFT_STEP×(c−SSR_SOFT_OFFSET))`。
  - E3-S3 十连 + 新手保底：十连 900（9 折）保底≥1SR（保底顺延：末位强制 SR）；新账号前 10 抽≥1SR（**系统级担保，置于 decide 之外**，即便注入服务端 decide 也保证）。
  - E3-S4 重复转碎片：R20/SR50/SSR100 落 E6 `shard` 账本。（升星阈值 R80/SR150/SSR300 与满星溢出回收 `1碎片={R2/SR5/SSR10}星券` 后置 E5，本 Sprint 不做。）
  - E3-S5 服务端权威抽象：`rng` / `decide` 可注入（摇号/保底裁决）；余额裁决走 E6 ledger（requestId 幂等）。不接真机；真机接入归后续证伪。
  - E3-S6 事件预留：`onGachaResult{animalId,rarity,isDuplicate,shardGain}` 订阅接口（`opts.onResult`）仅预留，演出归 E7。
- **B. `src/config/tunables.js` LOCKED 补充**：软保底公式系数（SSR_SOFT_START/END/STEP/OFFSET）、十连/单抽星券与钻石成本、重复碎片（GACHA_SHARD_R/SR/SSR）、新手窗口抽数。原已声明的 GACHA_R/SR/SSR/N、PITY_HARD、TEN_PULL_SR_GUARANTEE、NEWBIE_FIRST10_SR 现被 `src/gacha/index.js` 实际引用执行 —— **闭合 C5（抽卡锁参「声明未执行」）**。
- **C. `tests/unit/gacha.spec.js`**：不变量 4 落地 —— 概率分布蒙特卡洛（R≈60/SR≈30/SSR≈10，容差±1%，N=0%）、硬保底 pity≥50→SSR、软保底阶梯（c=41/45/49≈19%/55%/91%）、十连≥1SR、新手前10≥1SR、pity 跨货币共享/SSR 归零、重复转碎片、幂等（同 requestId 不双扣）、货币不足不扣费。
- **D. `tests/integration/gacha-economy.int.js`**：扣费→E6 ledger（requestId 幂等）→重复转碎片入账闭环；跨批次货币守恒（复用 economy-harness）；双货币隔离（不碰 food）；钻石路径不扣星券；货币不足账本零变化。

### 6.2 纪律遵守
- 锁参红线未动；gacha 逻辑全部读 LOCKED（C5 闭环，零硬编码新值）。tunable 仍标「待复核非锁参」。
- 不变量 1–7 不变；本 Sprint 新增对**不变量 4** 的自动化覆盖（原为「未覆盖」）。
- 未触碰 `game.js` / Cocos / 微信真机 shell / UI（E7 留后续）；未改写 ledger（仅通过 `canAfford`/`apply` 接口交互，不破坏既有不变量 3）。
- 全部新增测试在 `npm test` 通过（全量 72 用例，较 Sprint 2 基线 47 增加 25）。

### 6.3 Phase 5 待办（仍延后，本 Sprint 不实现）
| 项 | 来源 | 延后原因 | 落点 Sprint |
|----|------|----------|-------------|
| E5 升星阈值 + 满星溢出回收 | Epic | 用户选定 E3 范围不含升星（system-gacha §3.4/§3.5 后半） | E5 |
| E7 UI 演出 | Epic | 抽卡演出/概率公示 UI 归后续 | E7 |
| C6 | QA 报告 | 部分 GDD 验收超出本范围，随对应 epic 落地 | 对应 epic Sprint |
| D-NOTE-1~5 | 设计评审 | 离散座位/员工上限/调度/食材粒度/羁绊家族级 | 待定 |
| R-BAL-4 数值复核 | 锁参 | 主理人推演落盘，待 design-strategist 签字 | 待定 |

### 6.4 验证（防 flaky 落盘核验）
- `npm test`：基线 Sprint 2 为 47 用例；本 Sprint 新增 gacha 25（unit 18 + int 7）→ **全量 72 用例通过，7 套件**。
- `node tests/smoke/build-size.gate.js`：发布包 < 4MB，exit 0（新增 `src/gacha/index.js` 计入主包，仍远低于硬限）。
- `git log --oneline -1`：Sprint 3 E3 提交。
- 全部新增/修改文件 `stat -f '%m %z'` 见回传报告（主理人独立复核）。
