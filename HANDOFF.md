# 项目交接文档 · 可爱小动物「卡牌收集 + 餐厅放置经营」微信小游戏

> 交接目的：让新专家团队**无缝衔接**当前进度。
> 整理时间：2026-07-28（北京时间）
> 整理人：主理人 游承峰（编排者）。本包含 Phase 0–4 全部产物 + 当前阻断项与下一步。

---

## 0. 一句话定位

把 Steam 上爆发的「收集养成 + 模拟经营」机制**原创 IP 化**移植到**微信小游戏**：玩家抽/养可爱小动物作为**餐厅员工**，服务系统生成的**就餐顾客**赚资源，并解锁菜品驱动经营。平台硬约束是**主包 ≤4MB**，靠「程序化拼装资产管线」把单只动物贴图成本压到 ~0 字节。

---

## 1. 阶段进度总览

| Phase | 内容 | 状态 | 关键产物 |
|-------|------|------|----------|
| 0 | 阶段诊断 / 市场扫描 | ✅ 完成 | `微信小程序移植机会扫描.md`（市场机会分级） |
| 1 | 概念孵化 | ✅ 完成 | `design/gdd/concept-doc.md` v0.1.1 |
| 2 | 系统 GDD（三系统八节） | ✅ 完成 | `system-gacha.md` / `system-idle-restaurant.md` / `system-cultivation.md` + `phase2-consistency.md` |
| 2.x | 数值平衡 pass | ✅ 完成（编排者代执行） | `phase2-balance.md` + `src/analysis/balance-sim.js` |
| 3 | 4MB 技术原型（提前做） | ✅ 逻辑层 PASS（构建/真机项待证伪） | `docs/architecture/tech-prototype.md` + `src/prototype/assembly-demo.js` |
| 4 | 预制作 | ✅ 完成 | `design/ux/spec.md` / `art/asset-spec.md` / `production/epics.md` / `tests/README.md` / `production/sprint-1.md` |
| 5 | 制作（按冲刺） | ⏸️ **未启动** | 受「待签字项」+ 下方阻断项阻塞 |
| ★ | **核心玩法增补：员工/顾客/菜品解锁** | 🔴 **已提需求，未落盘** | 见 §5，是接手后**第一项设计任务** |

---

## 2. 已锁定决策（不可重开，所有文档受其约束）

**平台与技术**
- 微信小游戏；主包硬上限 **≤4MB**；分包按需加载（餐厅场景 / 扩展图鉴 / 音频音乐 / 活动运营）。
- 引擎 **Cocos Creator + 微信引擎插件**（运行时由微信客户端提供，不占 4MB 主包）。
- 资产 **程序化拼装**：单一白模 base-parts atlas（头6/身5/耳8/尾6/肢3 + 面部/配件/12配色/6表情）+ 运行时 JSON 参数拼装；**单只动物 0 独立贴图、~11–64 字节**；新增动物贴图字节零增长。
- **家族硬隔离**：跨家族部件组合运行时抛 `FamilyIsolationError`（universal / 显式多家族槽位白名单例外）。
- 着色器 tint 分层上色：身份色（角色层）vs 稀有度色（UI 卡框层）分属不同 UI 层。

**产品参数**
- 变现：混合 **IAP + IAA**。
- 美术：Q 版治愈圆润。人群：女性向治愈。评审强度：精简 solo / 小团队。
- 稀有度 **N / R / SR / SSR**；**N = 免费基础动物，不进抽卡池**。
- 抽卡池 **R 60% / SR 30% / SSR 10%**；**50 抽硬保底**；首十连 ≥1 SR；新手前 10 抽 ≥1 SR；软保底 41–49 抽阶梯 `SSR_rate(c)=min(1,0.10+0.09×(c−40))`。
- 四货币：**星券**（免费，放置经营唯一生产源）/ **钻石**（付费 IAP，不进放置产出，与星券共享全局 pity）/ **食材**（经营副产）/ **碎片**（抽卡重复转化）。
- **`offline_factor = 0.20`**（平衡 pass 由编排者代推，数值合理但**待 design-strategist 签字**——见 §6-A）。
- 升级成本：座位 `200×1.5ⁿ`、站点/菜谱 `150×1.4ⁿ`。养成羁绊 idle `+3%/只`（上限 +30%）、碎片 `+10%`（上限 +20%）。

---

## 3. 文件清单（路径 / 内容 / 状态）

| 路径 | 内容 | 状态 |
|------|------|------|
| `design/gdd/concept-doc.md` | 概念文档：三支柱/ MDA / 核心+元循环/范围分层/视觉锚点 | ✅ 终稿 v0.1.1 |
| `design/gdd/system-gacha.md` | 抽卡系统八节 GDD（R60/SR30/SSR10、50 保底、碎片/升星） | ✅ 终稿（待按 §5 措辞定性为「产员工」） |
| `design/gdd/system-idle-restaurant.md` | 放置经营八节 GDD（**尚未含员工/顾客/菜品解锁**，见 §5） | ⚠️ 旧版，需重大修订 |
| `design/gdd/system-cultivation.md` | 养成系统八节 GDD（羁绊/好感/加成） | ✅ 终稿（待按 §5 定性为「养员工」） |
| `design/gdd/phase2-consistency.md` | 跨 GDD 一致性自评 | ✅ 终稿（待补 §5 条目） |
| `design/gdd/phase2-balance.md` | 数值平衡 pass 报告（真实模拟表+修订+残留风险） | ✅ 终稿（编排者代执行，标注待复核） |
| `design/ux/spec.md` | UX 规格（☰Hub+底部4Tab、5屏线框、可访问性双编码） | ✅ v0.1（待补员工管理/菜品研发/顾客需求界面） |
| `art/art-bible.md` | 美术圣经九节 + 程序化拼装生产清单 | ✅ v0.3 |
| `art/asset-spec.md` | 资产规格（生产清单/Atlas打包/分层tint/分包/可访问性） | ✅ v0.1 |
| `docs/architecture/tech-prototype.md` | 4MB 技术原型规格（五层架构/4 ADR/首包预算/V1–V7/R1–R7） | ✅ v0.1（逻辑层 PASS，构建/真机项待证伪） |
| `production/epics.md` | 10 Epic 详述 + Top2 Epic Story 拆分 + Sprint1 候选 | ✅ v0.1 |
| `production/sprint-1.md` | **首个冲刺计划（垂直切片）** | ✅ v0.1（主理人汇编） |
| `tests/README.md` | 测试四分层 + 5 条关键不变量 + CI 体积门禁 | ✅ v0.1（脚手架） |
| `src/prototype/assembly-demo.js` | 可运行拼装参考实现（atlas 零增长/家族隔离/打包断言） | ✅ 实测通过 |
| `src/analysis/balance-sim.js` | 有界 30 天 F2P 经济模拟（平衡 pass 用） | ✅ 实测通过 |
| `微信小程序移植机会扫描.md` | 市场扫描与可行性分析主报告 | ✅ 参考 |

> 全部位于工作区根 `/Users/junzhi/WorkBuddy/2026-07-28-16-19-38/` 下。本 HANDOFF.md 也在根目录。

---

## 4. 已验证的事实（可信结论，无需重做）

- **4MB 资产风险已证伪（逻辑层）**：`assembly-demo.js` 实跑——atlas 字节 `delta=0`、单只参数 ≈11B、跨家族组合正确抛 `FamilyIsolationError`。✅
- **首包预算 ≈1.3–1.9MB**（引擎插件 0MB 由微信提供 + 核心框架 ~0.3–0.5MB + 引导白模 atlas ~0.8–1.2MB + 配置/字体）。✅ 但有**构建证伪**缺口（见 §7）。
- **经济自洽（模拟）**：星券为放置+抽卡单值源；bond +30% ≪ 单分支升级 +140%（无主导策略）；离线 3× 在线但 4h×20% 封顶。✅
- **早期偏慷慨**：纯抽卡 ~0.9 周达 50 保底 → 已下调 `offline_factor 0.25→0.20` 放缓。🟡

---

## 5. 🔴 阻断项 / 接手第一项任务：核心玩法增补（员工/顾客/菜品解锁）

**用户指令（2026-07-28 20:52）**：小动物分两类——①**餐厅员工**（玩家经抽卡/养成获得的角色资源）②**就餐顾客**（系统生成）；员工通过**服务顾客**获取资源；**菜品需玩家以合理资源解锁**。

**已与用户确认的设计分叉（4 项全采纳推荐）**：
1. 顾客**带「想吃的菜」上门** → 解锁菜品成为核心驱动力。
2. 解锁资源 = **星券 + 食材**（经营副产即解锁资源，闭环自洽，不引入新资源）。
3. 员工分三岗：**厨师 / 服务员 / 接待**（不同动物适配不同岗，策略深度）。
4. 服务机制 = **被动+主动加成**（就座基础被动结算 + 玩家主动派遣/点击拿加成）。

**当前状态**：⚠️ **该修订尚未落盘**。design-strategist 两次派发（先全量 6 文件、后聚焦单文件）均返回空 / 未改动磁盘（agent 执行后端 flaky，与本包 §8 注记的 DNS 故障同源）。`system-idle-restaurant.md` 仍是 20:26 旧版。

**新团队接手动作（建议顺序）**：
1. 派 **design-strategist** 按上述 4 决策修订 `system-idle-restaurant.md`（新增：员工/顾客二分、顾客带需求生成、服务结算公式、三岗加成、菜品解锁子模块+食材 sink），并同步微调 `system-gacha.md`（产出=员工）、`system-cultivation.md`（养员工/岗位加成）、`concept-doc.md` 核心循环、`phase2-consistency.md`、`design/ux/spec.md`（员工管理/菜品研发/顾客需求界面）。务必要求 agent **逐文件回复编辑确认**并**抽查磁盘 mtime** 验证落地。
2. 派 **engineering-lead** 在 `production/epics.md` 补：顾客生成、菜品解锁、员工三岗排班 的 Epic/Story；在 `tests/README.md` 增对应不变量（如菜品解锁扣费原子性、顾客需求-解锁匹配）。
3. 派 **art-director** 在 `art/asset-spec.md` 补：员工（围裙/名牌/岗位标识）vs 顾客（访客）视觉区分规范。

---

## 6. 待签字 / 待拍板项（不阻塞 P0，但设计评审前需闭合）

| # | 事项 | 状态 | 建议 |
|---|------|------|------|
| **A** | `offline_factor` 0.25→0.20 由编排者代推，需 design-strategist 签字 | 🟡 待签 | 数值合理，建议确认 |
| **B** | 导航（☰Hub + 底部 4 Tab） | 🟡 待确认 | 单手可达，建议采纳 |
| **C** | 保底展示粒度（显「距保底 X/50」软提示 vs 仅进度条） | 🟡 待确认 | 建议软提示 |
| **D** | 概率公示样式（微信强制公示 vs 治愈低压力） | 🟡 待确认 | 折叠小字满足合规 |
| **E** | 广告位权重（IAA 入口 vs 无打扰治愈） | 🟡 待确认 | 次级样式、明确「可选」 |
| **F** | 图鉴🔒收藏焦虑展示策略 | 🟡 待确认 | 进度环强调「已得%」 |

---

## 7. 已知风险与残留证伪项

- 🔴 **构建/真机证伪仍为最大未消项**：`tech-prototype.md` 的 V4（主包<4MB）、V5（tint 分层）、V6（引擎插件加载）、V7（分包命中）及 R1–R7（帧率/冷启/分包耗时/广告/IAP/内存）目前仅逻辑层+预算估算。**必须真实 Cocos 分包构建 + 微信真机**才能证伪。Sprint 1 的 CI 体积门禁是第一步。
- 🟡 **atlas 烘焙常量待替换**：`assembly-demo.js` 的 `ATLAS_BYTES` 为占位，E2-S5 须以真实烘焙图集替换并复核首包 0.8–1.2MB 行（标记为 R-ATLAS-CONST）。
- 🟡 **数值为初版常数**：曲线常数（含 `offline_factor`）待 v1.0 前数值平衡 pass 校准；结构不动只调数。

---

## 8. 协作机制与工具注记（给新主理人）

- **角色纪律**：编排者只编排不建造；GDD/架构/测试等专业产出由对应专家（design-strategist / engineering-lead / art-director / audio-director / quality-lead / release-ops-lead）产出，经主理人汇编。
- **质量门**：阶段切换处有 PASS/CONCERNS/FAIL 判定；CONCERNS/FAIL 须先解决或用户豁免。
- **产物落盘**：所有 spawn 任务须指定 Output Path，成员用 SendMessage 回传主理人，禁止成员间直连。
- ⚠️ **agent 后端 flaky 史**：本项目中 design-strategist / art-director 曾因 agent 执行后端（`copilot.tencent.com`）DNS 故障（`getaddrinfo ENOTFOUND`）派发失败/迟发。若再遇 agent 长时间无落盘，**先查磁盘 mtime 验证**，必要时用本地 node/工具代执行并明确标注「待专家复核」。派发大任务时建议**拆小**、并要求 agent **逐文件回复编辑确认**。

---

## 9. 立即下一步（new team 接手清单）

1. **[P0 设计]** 完成 §5 的员工/顾客/菜品解锁 GDD 修订（当前最大缺口）。
2. **[P0 工程]** 基于修订补 `production/epics.md` 的菜品解锁/顾客生成/三岗 Story + `tests/README.md` 不变量。
3. **[P1]** 闭合 §6 签字项 A–F（A 为硬性待签）。
4. **[P1]** 启动 Sprint 1（P0–P11）逻辑闭环，接通 `tests/` 不变量 + CI 体积门禁。
5. **[P2]** 进 Phase 5 每冲刺循环：engineering-lead 实现 → quality-lead QA/烟雾 → design-strategist 设计评审 → 主理人收尾。
6. **[持续]** 排真机/构建证伪 V4–V7 / R1–R7。
