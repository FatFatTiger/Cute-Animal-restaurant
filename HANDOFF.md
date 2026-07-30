# 项目交接文档 · 可爱小动物「卡牌收集 + 餐厅放置经营」微信小游戏

> **交接目的**：让新专家团队**无缝衔接**当前进度。
> **整理时间**：2026-07-30（北京时间）
> **整理人**：主理人 游承峰（编排者）。本包整合 Phase 0–4 产物 + 2026-07-29~07-30 的引擎 pivot、双流经济重构、§5 玩法增补、两份专家复核签字与 4 个 commit。
> **修订**：2026-07-29 pivot to canvas2d（用户 OP1-A）；2026-07-30 双流经济落地 + §5 签字 + design/engineering 复核签字 + 设计文档收口（详见 git 链 `94d424b`→`1d4c8e9`→`81d5ae0`）。
> **工作区路径**：`/Users/junzhi/WorkBuddy/Game/`（git 本地 main 链，全程**未 push**，无 remote）。

---

## 0. 一段话总览（给接手团队）

「可爱小动物餐厅」是一款面向女性向治愈人群的微信小游戏，把 Steam 上「收集养成 + 模拟经营」机制原创 IP 化移植：玩家抽/养可爱小动物作为**餐厅员工**，服务系统生成的**带菜需求顾客**赚资源、解锁菜品驱动经营；平台硬约束为**主包 ≤4MB**，故采用**微信原生 canvas2d + 程序化零贴图资产管线**（单只动物 0 独立贴图、家族硬隔离）。截至 2026-07-30，项目已完成 Phase 0–4（概念/系统 GDD/数值平衡/4MB 技术原型/预制作）、Phase 2 三场景渲染与导航、并把在线收益从「纯时间流」重构为**双流经济**（餐厅事件流主 80% + 宿舍时间流辅 20%、离线仅宿舍且 4h 封顶），Phase 3 放置 idle 循环与 Phase 3.5 离线待领取模态均已落地并通过 **155/155 测试、129KB<4MB、node boot 验收**；设计侧 §5 员工/顾客/菜品解锁与工程侧 5 个兜底文件均已完成并由 design-strategist / engineering-lead **复核签字**，C1/C2 文档公式口径已对齐。**下一阶段节点计划**：① 先 push 远端并真机验收双流手感；② 启动 Phase 5 正式按冲刺循环（实现→QA→设计评审），补 `PET_DAILY_CAP` 测试与 §5 星券三方竞争扩展平衡 pass（C3）；③ 推动 art-director 复核美术圣经/资产规格签字、完成构建与微信真机证伪（4MB/分层 fill/分包）；④ 接入 audio-director 与 release-ops-lead，在**锁参红线零改动**前提下做 v1.0 数值校准。

---

## 1. 阶段进度总览

| Phase | 内容 | 状态 | 关键产物 / commit |
|-------|------|------|----------|
| 0 | 阶段诊断 / 市场扫描 | ✅ 完成 | `微信小程序移植机会扫描.md` |
| 1 | 概念孵化 | ✅ 完成 | `design/gdd/concept-doc.md` v0.1.2（已签字）|
| 2 | 系统 GDD（三系统八节）| ✅ 完成 | `system-gacha.md` / `system-idle-restaurant.md` / `system-cultivation.md` + `phase2-consistency.md` |
| 2.x | 数值平衡 pass | ✅ 完成 | `phase2-balance.md` + `src/analysis/balance-sim.js`（已双流重构重跑）|
| 2.5 | ★ 核心玩法增补（员工/顾客/菜品解锁）| ✅ **已完成并签字** | §5 六份 GDD 修订 + `§5-revision-report.md`（design-strategist 签字 2026-07-30）|
| 3 | 4MB 技术原型 | ✅ 逻辑层 PASS | `docs/architecture/tech-prototype.md` + `src/prototype/assembly-demo.js` |
| 3.5 | 预制作 | ✅ 完成 | `design/ux/spec.md` / `art/asset-spec.md` / `production/epics.md` / `production/sprint-1.md` |
| 4 | 双流经济重构（餐厅事件流 + 宿舍时间流）| ✅ 完成 | `src/restaurant/serve-accrual.js` + `src/economy/idle.js`（commit `94d424b`）|
| 4.5 | Phase 3 放置 idle 循环 + Phase 3.5 离线待领取模态 | ✅ 完成 | `src/economy/storage.js` + `game.js` 接线（`94d424b`）|
| 4.7 | 专家复核签字 | ✅ 完成 | `production/engineering-review-2026-07-30.md`（工程 PASS）、`production/design-review-2026-07-30.md`（设计 PASS）|
| 5 | 制作（按冲刺循环）| ⏸️ **未正式启动** | 仅有垂直切片（sprint-5 餐厅三区/导航），缺 quality-lead 正式 QA 循环 |

---

## 2. 已锁定决策（不可重开，所有文档受其约束）

**平台与技术**
- 微信小游戏；主包硬上限 **≤4MB**；分包按需加载（餐厅场景 / 扩展图鉴 / 音频音乐 / 活动运营）。
- 引擎 **微信原生 canvas2d（无 Cocos / 引擎插件）**（pivot 2026-07-29，用户 OP1-A；`wx.createCanvas().getContext('2d')`，零位图）。
- 资产 **程序化图元绘制（零位图）**：头6/身5/耳8/尾6/肢3 + 面部/配件/12 配色/6 表情；**单只动物 0 独立贴图、~11–64 字节**；新增动物贴图字节零增长。
- **家族硬隔离**：跨家族部件组合运行时抛 `FamilyIsolationError`。
- 分层 fill 上色（无 shader tint）：身份色（角色层）vs 稀有度色（UI 卡框层）分属不同绘制指令层。
- 渲染契约：`buildScene(state)` 纯函数 → 绘制指令数组（`op: clear/rect/circle/roundrect/ellipse/text`）；`applyCommands(ctx, cmds)` 落 2d 上下文。

**产品参数（锁参红线，仅引用、绝不可改）**
- 变现：混合 **IAP + IAA**；美术 Q 版治愈圆润；人群女性向治愈；评审强度精简 solo。
- 稀有度 **N / R / SR / SSR**；**N = 免费基础动物，不进抽卡池**。
- 抽卡池 **R 60% / SR 30% / SSR 10%**；**50 抽硬保底**；首十连 ≥1 SR；新手前 10 抽 ≥1 SR；软保底 41–49 阶梯 `SSR_rate(c)=min(1,0.10+0.09×(c−40))`。
- 四货币：**星券**（免费，放置经营唯一生产源）/ **钻石**（付费 IAP，不进放置产出，与星券共享全局 pity）/ **食材**（经营副产，**仅宿舍时间流副产、离线不计食材**）/ **碎片**（抽卡重复转化）。
- **`offline_factor = 0.20`**（平衡 pass，2026-07-30 design-strategist 签字 PASS）；离线 cap `T_CAP=14400s`（4h）。
- 升级成本：座位 `200×1.5ⁿ`、站点/菜谱 `150×1.4ⁿ`。养成羁绊 idle `+3%/只`（上限 +30%）、碎片 `+10%`（上限 +20%）。

**双流经济新增 tunable（非锁参，可调）**
- `DORM_SHARE = 0.25`（宿舍时间流占在线收益比；餐厅=1−DORM_SHARE=80%）。
- `T_ORDER = 5`（餐厅每单服务周期秒数；不影响总速率 `I_eff`）。
- §5 解锁曲线：`UNLOCK_COST_STAR = 200×1.35ⁿ` / `UNLOCK_COST_FOOD = 40×1.30ⁿ`；三岗加成 `CHEF_PER_LEVEL/WAITER_PER_LEVEL=+8%`、`HOST_PER_LEVEL=+6%`；`AFFINITY_BONUS=1.5`；`ACTIVE_BONUS=0.15`。

---

## 3. 文件清单（路径 / 内容 / 状态）

**设计（design/）**
| 路径 | 内容 | 状态 |
|------|------|------|
| `design/gdd/concept-doc.md` | 概念文档：三支柱/MDA/核心+元循环/范围分层 | ✅ v0.1.2 已签字 |
| `design/gdd/system-gacha.md` | 抽卡系统八节 GDD（产出=员工）| ✅ v0.1.1 已签字 |
| `design/gdd/system-idle-restaurant.md` | 放置经营八节 GDD + **§2.5 双流模型** | ✅ v0.3（双流+§5 已植入，design 签字）|
| `design/gdd/system-cultivation.md` | 养成系统八节 GDD（养员工/岗位加成）| ✅ v0.1.1 已签字 |
| `design/gdd/system-scene-phase2.md` | 场景三（囤囤仓/撸毛馆/图鉴）GDD | ✅ 已落盘（**art-director 未签字**）|
| `design/gdd/system-scene-map.md` | 场景/导航架构 GDD | ✅ v0.1（draft，待 lead review）|
| `design/gdd/phase2-consistency.md` | 跨 GDD 一致性自评 | ✅ v0.2（含 §5 条目）|
| `design/gdd/phase2-balance.md` | 数值平衡 pass（**双流口径已对齐**）| ✅ v0.3（design 签字）|
| `design/ux/spec.md` | UX 规格 | ✅ v0.1 |

**美术（art/）**
| 路径 | 内容 | 状态 |
|------|------|------|
| `art/art-bible.md` | 美术圣经九节 + 程序化拼装生产清单 | ✅ v0.3（**art-director 未签字**）|
| `art/asset-spec.md` | 资产规格（生产清单/分包/可访问性）| ✅ v0.1（**art-director 未签字**）|

**架构 / 生产（docs/、production/）**
| 路径 | 内容 | 状态 |
|------|------|------|
| `docs/architecture/tech-prototype.md` | 4MB 技术原型（五层架构/4 ADR/首包预算）| ✅ v0.1（逻辑层 PASS，构建/真机待证伪）|
| `production/epics.md` | 10 Epic + Top2 Story 拆分 | ✅ v0.1 |
| `production/sprint-1.md` / `sprint-2.md` / `sprint-5.md` | 冲刺计划（垂直切片）| ✅ |
| `production/engineering-review-2026-07-30.md` | 工程复核签字报告（5 兜底文件 PASS）| ✅ 已签字 |
| `production/design-review-2026-07-30.md` | 设计复核签字报告（3 文档 PASS + C1/C2）| ✅ 已签字 |
| `production/design-review/`、`production/qa/` | 复核/QA 归档子目录 | ✅ |
| `§5-revision-report.md`（根）| §5 六份 GDD 修订报告 | ✅ 已签字 |

**实现（src/）**
| 路径 | 内容 | 状态 |
|------|------|------|
| `src/config/tunables.js` | TUNED/LOCKED 全部旋钮 | ✅（含 DORM_SHARE/T_ORDER/OFFLINE_CAP_HOURS）|
| `src/economy/ledger.js` | 账本（幂等 requestId）| ✅ |
| `src/economy/idle.js` | **宿舍时间流 + 离线**（降级后职责）| ✅（engineering 签字）|
| `src/economy/ieff.js` | I_eff / 离线数学 | ✅ |
| `src/economy/storage.js` | 存档（wx→localStorage→内存三级）| ✅ |
| `src/restaurant/restaurant.js` | computeIeff / serve / 三岗 | ✅ |
| `src/restaurant/customer.js` | 顾客生成 + 带菜需求 + matchServiceable | ✅ |
| `src/restaurant/dish.js` | 菜品解锁 | ✅ |
| `src/restaurant/staff.js` | 员工三岗 | ✅ |
| `src/restaurant/serve-accrual.js` | **餐厅主收入事件流**（双流核心）| ✅（engineering 签字）|
| `src/roster.js` | 图鉴（去重登记 + view()🔒）| ✅（engineering 签字）|
| `src/cultivation.js` | 撸毛（仅好感度，零货币）| ✅（engineering 签字）|
| `src/ui/render.js` | 绘制指令构建（含场景三/离线领取模态）| ✅（engineering 签字）|
| `src/analysis/balance-sim.js` | 经济模拟（**已双流重构重跑**）| ✅ |
| `src/assembly/`、`src/prototype/`、`src/gacha/` | 拼装参考 / 原型 / 抽卡 | ✅ |
| `game.js` | 主循环（idle 接线 + 餐厅 serve 流 + 离线结算 + DEV_DEMO_SEED gate）| ✅ |

**测试（tests/）**
| 路径 | 内容 | 状态 |
|------|------|------|
| `tests/unit/*.spec.js`（12 个）| 装配/经济/抽卡/idle/餐厅 serve/UI 状态等 | ✅ **155 用例全绿** |
| `tests/smoke/build-size.gate.js` | 体积门禁（<4MB）| ✅ 当前 **129KB** |
| `tests/README.md` | 测试四分层 + 不变量 + CI | ✅ |

---

## 4. 已验证的事实（可信结论，无需重做）
- **4MB 资产风险已证伪（逻辑层）**：`assembly-demo.js` 实跑——参数注册表字节 `delta=0`、单只参数 ≈11B、跨家族正确抛 `FamilyIsolationError`。
- **首包预算 ≈0.4–0.9MB**（零位图后）；当前整包 `size-gate` **129KB < 4MB**，`node game.js` **I_eff=0.540000 + booted OK**。
- **双流经济已实现并测试**：餐厅事件流 ≈在线 80%、宿舍时间流 ≈20%、离线仅宿舍（`dorm_rate×0.20`）、4h 封顶 ≈389★；155/155 测试覆盖（含 `restaurant-serve.spec.js` 断言「餐厅≫宿舍」）。
- **经济自洽（模拟）**：星券为放置+抽卡单值源；双流口径下 early 合计 355★/日、离线占比 ~32%、50 保底 ~2.0 周（`balance-sim.js` 重跑确认）。
- **两份专家复核签字已落盘**：engineering-lead（5 兜底文件 PASS）、design-strategist（3 文档 PASS + C1/C2 公式对齐）。

---

## 5. 核心玩法增补 §5（已完成并签字，非阻断）
- 顾客**带「想吃的菜」上门** → 解锁菜品成核心驱动力；菜品解锁 = 星券 + 食材（不引新资源）。
- 员工分三岗（厨师/服务员/接待），岗位适配 affinity 1.5；服务 = 被动基础结算 + 主动「加把劲」加成（ACTIVE_BONUS=0.15）。
- 已植入 6 份 GDD（system-idle-restaurant v0.3 / system-gacha v0.1.1 / system-cultivation v0.1.1 / concept-doc v0.1.2 / phase2-consistency v0.2 / phase2-balance v0.3）+ `§5-revision-report.md`，design-strategist 复核签字 PASS（2026-07-30）。
- 注：早前旧 HANDOFF 将其列为「未落盘阻断项」——**现已解决**，请勿重复派工。

---

## 6. 双流经济模型（已实现，落地于 `94d424b`）
- **流 A 餐厅（主，事件驱动·半自动+点击加成）**：每 `T_ORDER=5s` 若可运营（在岗员工>0 且顾客需求可匹配）结算一单 `reward = I_eff × T_ORDER × (active?1+ACTIVE_BONUS:1)`；飘字 `+N★`。等效速率恒为 `I_eff`，占在线 80%。
- **流 B 宿舍/撸毛馆（辅，时间流）**：`dorm_rate = DORM_SHARE×I_eff = 0.25×0.54=0.135/s` 场景无关涓流，占在线 20%；食材副产 `0.02/s`、离线不计。
- **离线仅宿舍**：`dorm_rate × OFFLINE_FACTOR(0.20)`，`capStars()=dorm_rate×0.20×OFFLINE_CAP_HOURS(4)×3600≈389★`；待领取上限 + 阻塞式领取模态（`src/ui/render.js` 的 `buildOfflineClaim`）。
- 餐厅流**场景无关**（在线且可运营即跑），离线（游戏关闭）= 仅宿舍。

---

## 7. 待签字 / 待拍板项
| # | 事项 | 状态 | 建议 |
|---|------|------|------|
| A | `offline_factor` 0.20 | ✅ **已签**（design-strategist 2026-07-30）| 闭合 |
| B | 导航（☰Hub + 底部 4 Tab）| 🟡 待确认 | 建议采纳 |
| C | 保底展示粒度 | 🟡 待确认 | 建议软提示 |
| D | 概率公示样式 | 🟡 待确认 | 折叠小字合规 |
| E | 广告位权重 | 🟡 待确认 | 次级「可选」 |
| F | 图鉴🔒收藏焦虑策略 | 🟡 待确认 | 进度环强调「已得%」|
| **G** | **art-director 复核签字**（art-bible / asset-spec / system-scene-phase2 视觉身份）| 🔴 **未签** | art-director 后端最不稳定，须磁盘核验 |
| H | audio-director 接入（音乐/音效方向）| ⚪ 未启动 | Phase 6 打磨前 |
| I | release-ops-lead 接入（发布/本地化/Live Ops）| ⚪ 未启动 | Phase 7 前 |

---

## 8. 已知风险与残留证伪项
- 🔴 **构建/真机证伪仍为最大未消项**：`tech-prototype.md` 的 V4（主包<4MB）、V5（canvas2d 分层 fill）、V6（微信原生 canvas2d 渲染就绪）、V7（分包命中）及 R1–R7（帧率/冷启/分包/广告/IAP/内存）目前仅逻辑层+预算。**必须真实构建 + 微信真机**证伪。
- 🟡 **atlas 烘焙常量待替换**：`assembly-demo.js` 的 `ATLAS_BYTES` 为占位（标记 R-ATLAS-CONST）。
- 🟡 **C3**：§5 星券三方竞争（升级 vs 抽卡 vs 解锁）扩展重算留待 **Phase 5 专项 balance pass**。
- 🟡 **测试缺口**：缺 `PET_DAILY_CAP` 单测断言（建议补一条日上限置灰断言）。
- 🟡 **demo seed 红线**：`game.js` 的 `ui-seed` 已 gate 到 `DEV_DEMO_SEED=false`（默认关），生产零注入；确认永不对其开默认真。

---

## 9. 协作机制与工具注记（给新主理人）
- **角色纪律**：编排者只编排不建造；GDD/架构/测试等专业产出归对应专家，经主理人汇编。
- **质量门**：阶段切换处 PASS/CONCERNS/FAIL 判定；CONCERNS/FAIL 须先解决或用户豁免。
- **产物落盘**：spawn 任务须指定 Output Path；成员用 SendMessage 回传主理人，禁止成员间直连。
- ⚠️ **agent 后端 flaky 史**：design-strategist / art-director / engineering-lead 子 agent 后端（copilot.tencent.com）曾因 DNS 故障派发空回。经验：**派发后必磁盘核验**（`grep` mtime / `git status` / 报告文件存在），不轻信回传；空回则主理人 dirext 落盘并标注「待对应专家复核签字」，后续重试补签（07-30 已验证 engineering-lead / design-strategist 重试可成功，art-director 仍最不稳）。

---

## 10. 节点计划 / 立即下一步（new team 接手清单）
1. **[P0]** 用户给 remote URL → `git push`（本地 main 链 `e948e9c→…→94d424b→1d4c8e9→81d5ae0`，全程未推送）。
2. **[P0]** 真机验收：DevTools reload 后看餐厅每 ~5s「+N★」飘字 + 点空白「加把劲」×1.15；离线/后台返回「待领取」模态与 4h 封顶。
3. **[P1]** 启动 **Phase 5 正式冲刺循环**：engineering-lead 实现就绪 Story → quality-lead QA/烟雾测试 → design-strategist 设计评审 → 主理人收尾。优先补 `PET_DAILY_CAP` 测试。
4. **[P1]** **C3 平衡 pass**：§5 星券三方竞争扩展重算（design-strategist 主导）。
5. **[P1]** 推动 **art-director 复核签字**（G：art-bible / asset-spec / system-scene-phase2），务必磁盘核验。
6. **[P2]** 构建 + 微信真机证伪 V4–V7 / R1–R7（4MB / 分层 fill / 分包 / 帧率）。
7. **[P2]** 接入 **audio-director**（H）与 **release-ops-lead**（I）；在锁参红线零改动前提下做 v1.0 数值校准。
8. **[持续]** 闭合 §7 签字项 B–F。
