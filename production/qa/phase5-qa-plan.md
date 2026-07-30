# Phase 5 正式 QA 循环框架 · 可爱小动物餐厅

> 文档归属：`production/qa/phase5-qa-plan.md`
> 作者：qa-lead（严守真）
> 阶段：Phase 5 制作冲刺循环（入口质量门 PASS，设计+工程复核均 PASS）
> 关联任务：QA-P5-001（本框架 + `PET_DAILY_CAP` 单测补测）
> 红线：本框架只定义测试/质量证据与门控，**绝不写游戏逻辑、不锁参、不改架构**；所有高影响放行动作（发布/commit）需主理人/用户人工审批。

---

## 0. 入口质量门状态（Phase 4.7 收口 / Phase 5 入口）

| 指标 | 数值 | 门控 |
|---|---|---|
| 单元测试 | **159 passed / 159 total（11 suites）**（基线 155 → 本次 +4） | ✅ PASS |
| 主包体积 | lead 报 **129.64KB**；sprint-5 自报 `build-size.gate.js` = **84.80KB** | ⚠️ 口径待 reconciliation（见 §6-R1） |
| node boot | `I_eff = 0.540000` + `booted OK` | ✅ PASS |
| 设计复核 | PASS | ✅ |
| 工程复核 | PASS | ✅ |
| 质量门判定 | **PASS（advisory，建议性）** | — |

> 质量门为**建议性门控**：qa-lead 给判定，最终放行由用户/主理人决定。

---

## 1. Phase 5 每冲刺 QA checklist（循环）

每个冲刺按以下四段推进，QA 在每段给出明确判定。

### 1.1 实现完成判据（Dev → QA 交接前）
- [ ] 变更只落在任务约定文件；锁参红线（`src/config/tunables.js` 的 `LOCKED`）零改动。
- [ ] 纯逻辑改动配套 `tests/unit` 单测；新增渲染/导航纯函数配套 `tests/helpers/mock-canvas.js` 记录新 op。
- [ ] `IN_WECHAT=false` 路径下 `node game.js` 仍能 boot（`I_eff=0.540000`、`booted OK`）。
- [ ] `git status --short` 自证落盘，未 commit（高影响动作需审批）。

### 1.2 烟雾测试（Smoke Gate）
- [ ] `npm test` 全绿，测试数不回退（回归见 §3）。
- [ ] `node tests/smoke/build-size.gate.js`：主包 < 4MB，exit 0。
- [ ] 垂直切片烟雾用例（§2.5）逐条 PASS/FAIL，FAIL 即「未达 QA」。
- [ ] flaky 测试隔离（见 §3.4），不污染 CI 信号。

### 1.3 回归（Regression）
- [ ] 关键路径映射（§3.2）全部命中既有保护测试。
- [ ] 已修 Bug 补回归（§3.3）。
- [ ] 跨冲刺不变量（§3.1）不破。

### 1.4 设计评审前质量证据包
- [ ] QA 报告（结构见 `production/qa/`，参考 `sprint1-qa-report.md` 模板）。
- [ ] 测试前后数字（如 155→159）、体积门、boot 证据。
- [ ] 真机验收 checklist 勾选结果（§4，供主理人微信开发者工具/真机核对）。
- [ ] 未消风险与待澄清项（§6）。

---

## 2. 垂直切片烟雾测试 scope（sprint-5：餐厅三区 迎宾/就餐/后厨 + HUB 导航）

> 当前 sprint-5 已落 HUB 中枢 + 餐厅 + 动才市场导航（`NavigationState`：HUB / RESTAURANT / GACHA_MARKET）。本切片以主理人指定的「餐厅三区 + HUB 导航」为 smoke 主范围，动才市场作为相邻 nav surface 一并纳入（避免导航回归遗漏）。

### 2.1 导航流（HUB ⇄ 餐厅 ⇄ 动才市场）
- HUB 首启着陆；`hitHubRegion` 仅 暖爪餐厅/动才市场 可点，仓库/撸毛馆锁定返回 null。
- 餐厅内 `hitBackButton` 回村；动才市场 `hitMarketButton`（single/ten/exchange/back）命中与空白返回 null。
- 经营循环仅在 RESTAURANT 推进；**切场不丢收益**（模块状态独立于 UI 存活）。

### 2.2 餐厅三区（迎宾 welcome / 就餐 dining / 后厨 kitchen）
- 迎宾区：门口迎宾 critter 指令渲染（`appendCritter` 入口、分层软阴影、idle 帧动效）。
- 就餐区：座位/顾客/需求标签（`seat`/`staff-label`/`demand`/`demand-text`）、可服务判定（已解锁+在岗）。
- 后厨区：菜谱/解锁按钮（`buildRestaurant` 升级自 E7 `buildScene`，导出名兼容）；可负担时显示解锁按钮，不足时不显示。

### 2.3 经营循环存活
- 餐厅内每 `T_ORDER=5s` 结算一单，飘字 `+N★`（见 §4.1）；点击空白触发「加把劲」×(1+ACTIVE_BONUS=1.15)（见 §4.2）。
- 切到 HUB/动才市场再切回，星券/食材余额与待领取 pending 不丢、不双计。

### 2.4 HUB 只读 HUD + 锁定区
- HUB 四货币 HUD 只读（不提供写入口）；4 区域圆角建筑，锁定区渲染 🔒「即将开放」。
- 分层 fill 视觉（canvas2d 替代 shader tint，见 §4.4）：暖色天光块 + 远山椭圆 + 圆润 critter。

### 2.5 烟雾用例清单（逐条 PASS/FAIL，FAIL=未达 QA）

| # | 用例 | 期望 | 来源 |
|---|---|---|---|
| S1 | HUB 首启着陆 | `scene=HUB`、四货币 HUD 渲染 | `buildHub` |
| S2 | HUB→餐厅点击 | `hitHubRegion(餐厅)` 命中 id；`runUi` 切 RESTAURANT | `hitHubRegion` |
| S3 | 仓库/撸毛馆锁定 | `hitHubRegion` 返回 null；`buildHub` 渲染 🔒 | `getHubRegions` |
| S4 | 餐厅→回村 | `hitBackButton` 命中；`scene=HUB` | `hitBackButton` |
| S5 | HUB→动才市场 | `hitHubRegion(市场)` 命中；`scene=GACHA_MARKET` | `hitMarketRegion` |
| S6 | 动才市场单抽/十连按钮 | `hitMarketButton(single/ten)` 命中；空白返回 null | `hitMarketButton` |
| S7 | 切场收益存活 | 餐厅累积星券，切 HUB 再回餐厅余额不变、不双计 | `runUi` 状态机 |
| S8 | 餐厅三区标签完整 | `seat`/`staff-label`/`demand`/`demand-text`/`float` 全存在 | `buildRestaurant` |
| S9 | 可负担解锁按钮 | 星券+食材足够时显示解锁按钮并返回 dishId | `buildRestaurant` |
| S10 | 不足不显示 | 余额不足时无解锁按钮 | `buildRestaurant` |
| S11 | 分层 fill 不崩（mock） | `applyCommands` 消费 `ellipse`/`roundrect` 不抛错、Node 安全 | `mock-canvas` |
| S12 | 主包 < 4MB | `build-size.gate.js` exit 0 | 体积门 |

---

## 3. 回归重点（Regression Focus）

### 3.1 跨冲刺不变量（必须持续保护）
- **不变量 #1 零位图**：注册 N 只动物后 atlas 字节 delta = 0；单只 ≤64B（`assembly.spec.js`）。
- **不变量 #2 家族硬隔离**：跨家族组合抛 `FamilyIsolationError`（`assembly.spec.js`）。
- **经济守恒**：Σ消耗 == Σ产出 + Δ余额（E3/E4 集成 `gacha-economy`/`dish-unlock`）。
- **双货币隔离**：抽卡只动 star/diamond，不碰 food；idle 仅产星券+食材，撸毛零货币（`economy`/`cultivation` 单测）。
- **锁参红线**：`OFFLINE_FACTOR=0.20`、`T_CAP_INIT=14400`、抽卡概率/保底全读 `LOCKED`，渲染层不硬编码。

### 3.2 关键路径 → 既有保护测试映射
| 关键路径 | 保护测试 |
|---|---|
| 撸毛馆每日上限 | `tests/unit/cultivation.spec.js`（本次新增，4 例） |
| idle 在线/离线累积 + 4h 封顶 | `tests/unit/idle-economy.spec.js` |
| 双流经济（餐厅事件流 80% / 宿舍时间流 20%） | `tests/unit/economy.spec.js`、`idle-economy.spec.js` |
| 菜品解锁原子扣费→可点单 | `tests/integration/dish-unlock.int.js` |
| 顾客生成+需求匹配 | `tests/integration/customer-dish.int.js` |
| 抽卡守恒/保底 | `tests/unit/gacha.spec.js`、`tests/integration/gacha-economy.int.js` |
| serve 幂等/离线索赔上限 | `tests/integration/qa-gaps.int.js` |
| HUB/餐厅/动才市场渲染+命中 | `tests/unit/ui-state.spec.js`（26 例 Phase 1） |
| 零位图/家族隔离 | `tests/unit/assembly.spec.js` |

### 3.3 已修 Bug → 补回归
- 每个 resolved Bug 在 `production/qa/bugs/` 留单；修复 PR 必须携带最小回归用例（防复发）。
- 无历史 Bug 仓库时，首个冲刺建立 `production/qa/bugs/` 目录与模板。

### 3.4 flaky 检测与隔离
- 连续 2 次 CI 同用例结果不一致 → 标记为 flaky，隔离到 `tests/unit/.flaky/` 或加 `@retry`，不阻塞主信号。
- 时间相关用例统一用注入时钟（`tests/helpers/clock.js`），禁止依赖真实 `Date.now()`（本切片 `cultivation.spec.js` 已示范）。

---

## 4. 真机验收 checklist（微信开发者工具 / 真机核对，供主理人）

> 下列为端到端真机项，**逻辑层已由单测/集成覆盖的部分会标注「逻辑已覆盖」**，真机用于验证"手感/视觉/构建"层。

### 4.1 在线飘字 `+N★`（~5s） — 逻辑已覆盖（`serve-accrual.js` / `game.js:298`）
- [ ] DevTools reload 后，餐厅内每约 `T_ORDER=5s` 出现一次 `+N★` 飘字（N 随 I_eff 浮动）。
- [ ] active（加把劲）时飘字带「加把劲!」后缀（`game.js:298`）。
- [ ] 飘字 ttl 正常消退，不堆叠/不残留。

### 4.2 点空白「加把劲」×1.15 — 逻辑已覆盖（`serve-accrual.js:86`）
- [ ] 餐厅内点击空白处触发 active 窗口（5s），窗口内结算订单 ×(1+ACTIVE_BONUS=1.15)。
- [ ] active 窗口结束后自动回落到 ×1.0，不削弱被动基础（§3.4 增量语义）。

### 4.3 离线/后台返回「待领取」模态 + 4h 封顶 — 逻辑已覆盖（`idle.js` / `render.js:832`）
- [ ] 返回小程序（onShow）/后台返回，弹出「待领取」模态覆盖最上层，须点击「领取」才继续交互。
- [ ] 离线收益 = 宿舍 only × `OFFLINE_FACTOR=0.20`；达 cap（4h）后不再累积，模态显示封顶。
- [ ] 领取后 pending→账本且清零；二次领取无副作用。

### 4.4 分层 fill 视觉 — 构建证伪项（V5）
- [ ] 角色/场景用 canvas2d 分层 fill 近似 shader tint；暖色天光块 + 远山椭圆 + 圆润 critter 视觉到位。
- [ ] 无 Spine/ASTC/着色器 tint 依赖（对齐 pivot to canvas2d，零位图）。

### 4.5 分包加载 — ⚠️ TBD 构建证伪（V7，当前未配置）
- [ ] `game.json` / `project.config.json` **当前无 `subpackages` 字段**（已核查）。
- [ ] HANDOFF.md 将「分包命中 V7」列为**最大未消项**，须真实构建 + 微信真机证伪。
- [ ] 主理人确认：分包（餐厅场景/扩展图鉴/音频/活动）是否在 Phase 5 内落地；未落地则本项标「N/A（待 Phase 5 后期/Phase 6）」，不视为阻塞但须显式记录。

### 4.6 冷启/帧率/内存（R1–R7）— 真机占位
- [ ] 冷启 < 阈值；运行时帧率稳定；内存不泄漏（重点回归切场不丢收益的同时对象不堆积）。

---

## 5. 质量门协议与放行

- **判定等级**：`PASS` / `CONCERNS` / `FAIL`，advisory。
- **FAIL 条件**：`npm test` 非全绿、主包 ≥ 4MB、垂直切片烟雾（§2.5）任一 FAIL、锁参红线改动。
- **CONCERNS**：存在 §6 待澄清项但不阻塞冒烟/逻辑。
- **放行**：除主理人/用户人工审批外，qa-lead 不执行 commit/push/发布。

---

## 6. 已知风险 / 待澄清（回传主理人）

| # | 项 | 表现 | 处置建议 | 状态 |
|---|---|---|---|---|
| R1 | 主包体积口径不一致 | lead 报 129.64KB vs sprint-5 `build-size.gate.js` 84.80KB | 统一测量口径（同一工具/同一产物），以 `build-size.gate.js` 为权威门；差异可能来自含/不含文档或不同构建产物 | 待主理人定 |
| R2 | 分包未配置 | `game.json` 无 `subpackages`；V7 未证伪 | 决定 Phase 5 是否落地分包；否则标 N/A 记录 | 待主理人定（OP） |
| R3 | 撸毛馆延后到 Phase 2 | `PET_DAILY_CAP` 逻辑已实现且本次单测覆盖 `canPet`→`DAILY_CAP`（UI 置灰决策信号），但「置灰/禁用」真机表现依赖撸毛馆（`STAFF_LOUNGE`）落地（sprint-5 T2） | 逻辑层已锁；端到端真机置灰待撸毛馆场景落地后补真机验证 | 逻辑 PASS / 真机待 Phase 2 |
| R4 | IAP 真实支付占位 | 动才市场「换钻/礼包」仅 `wx.showModal` 占位；`DEV_IAP_GRANT` flag 保护 dev 发钻 | 真实支付/礼包形态待用户定（OP2） | 待用户定 |
| R5 | 中枢→餐厅多 1 次点击 | 是否打断挂机节奏 | 真机验证（§4 外 T4） | 真机验证 |

---

## 附：本次交付（QA-P5-001）

1. **新增单测** `tests/unit/cultivation.spec.js`（mtime 2026-07-30 10:16:19，4974 B），4 例覆盖 `PET_DAILY_CAP`：
   - 达上限后 `canPet` 返回 `ok:false, reason='DAILY_CAP'`（动作置灰/禁用的逻辑信号）。
   - 达上限后再次 `pet` 返回 `ok:false`，好感度 A 与日计数不再累计。
   - 边界：恰好 `PET_DAILY_CAP=20` 次成功，(cap+1) 次被拒。
   - 跨天清零：次日上限重置、可重新撸满 cap 次（**好感度 A 跨天累积、日计数按自然日独立封顶**）。
2. **测试前后数字**：155 → **159**（+4），全绿，无回归。
3. 机制现状：`PET_DAILY_CAP` **已实现**（`src/cultivation.js:50` + `src/config/tunables.js:60`），无需补测试说明文档；仅补单测。
4. 本框架文档 `production/qa/phase5-qa-plan.md`。

> 红线自检：本次仅新增测试 + QA 文档，未改动 `src/` 任何逻辑/锁参/架构，未 commit/push/删文件。
