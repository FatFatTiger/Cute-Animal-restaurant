# Sprint 1 · 垂直切片冲刺计划（Phase 4 汇编）

> 汇编：主理人 游承峰 · 来源：engineering-lead `production/epics.md` §4 + design-strategist `design/ux/spec.md` + art-director `art/asset-spec.md`
> 阶段：Phase 4 预生产收尾 → 进入 Phase 5 制作的首个冲刺
> 评审强度：精简 solo / 小团队

---

## 1. Sprint 1 目标（垂直切片）

端到端跑通最小可玩闭环：

**拼装 1 只动物 → 餐厅上岗产出星券 → 用星券抽 1 次卡**

优先打通主干（E1→E6→{E2,E3,E4}→E7），运营 / 音频 / 商业化 / 养成全量留待后续 Sprint。目标是**证伪核心循环"好不好玩 + 技术上能否在 4MB 内跑通"**，不是做全功能。

- **排期假设**：1 名工程师 + 1 名美术（atlas 引导子集）。建议 **2 周**。
- **截面原则**：只做"能演示核心循环"的最小集，所有 R1–R7 / V4–V7 真机待证伪项仅留抽象与 CI 门禁占位，不阻塞本 Sprint 逻辑闭环。

---

## 2. Story 序列与依赖（P0–P11）

| 序 | Story | Epic | 复杂度 | 依赖 | 切片角色 |
|----|-------|------|--------|------|----------|
| P0 | E1-S1 核心运行时引导框架（引擎插件加载 + 首屏 atlas + 分包调度入口） | E1 | L | — | 地基，阻塞一切 |
| P1 | E6-S1 经济账本与货币模型（四货币单值源 + 守恒钩子） | E6 | M | E1-S1 | 数值流动枢纽 |
| P2 | E1-S2 本地存档封装（wx.getStorage 异步/同步） | E1 | S | E1-S1 | 余额/进度持久化 |
| P3 | E2-S1 拼装核心 assembler | E2 | M | E1-S1 | 切片起点：拼装 1 只动物 |
| P4 | E2-S2 家族硬隔离守卫 | E2 | S | E2-S1 | 正确性护栏 |
| P5 | E2-S3 紧凑打包/解包（≤64B/只，防回绕） | E2 | S | E2-S1 | 资产零增长落地 |
| P6 | E4-S1 餐厅核心循环骨架（cook→serve→earn，1 工位，5 只 N 动物自动上岗） | E4 | M | E1-S1, E2-S1, E6-S1 | 切片中段：餐厅产出星券 |
| P7 | E4-S2 在线收益公式 I_eff（三分支乘区） | E4 | S | E4-S1, E6-S1 | 收益数值自洽 |
| P8 | E3-S1 单抽 + 稀有度摇号（R60/SR30/SSR10） | E3 | M | E6-S1 | 切片终点：用星券抽 1 次 |
| P9 | E3-S2 保底计数 + 50 抽硬保底 | E3 | S | E3-S1 | 保底正确性 |
| P10 | E3-S3 重复转碎片 | E3 | S | E3-S1, E6-S1 | 碎片闭环（轻量） |
| P11 | E7-S1 最小导航壳（主菜单 → 图鉴/餐厅/抽卡入口，UI 不持状态） | E7 | M | E1-S1, E3-S1, E4-S1 | 可演示外壳 |

**依赖主干**：`E1 → E6 → {E2, E3, E4} → E7`。P0 是硬阻塞，其余按依赖顺序推进，P3/P6/P8 是切片三段里程碑。

---

## 3. 跨职能协同（本 Sprint 各自交付）

| 职能 | Sprint 1 交付 | 对应 Story / 制品 |
|------|--------------|------------------|
| **engineering-lead** | 落地 P0–P11 逻辑闭环 + 接入 tests 不变量 | `src/`（运行时/拼装/经济/抽卡/餐厅/导航壳）、`tests/unit` 用例 |
| **art-director** | 引导子集 atlas 烘焙（主包）、5 只 N 动物槽位组合定稿、稀有度双编码形状/图标、5 屏高保真线框 | `art/asset-spec.md` §1–§2（引导子集）、`art/asset-spec.md` §5（图标/形状） |
| **design-strategist** | 引导 5 只 N 动物最终槽位组合、概率公示合规文案、保底展示文案、广告位权重定稿 | `design/ux/spec.md` §9 待审批项、引导脚本 |
| **audio-director** | 本 Sprint 不涉及（E9 留后续） | — |
| **quality-lead** | 本 Sprint 不单独 spawn；`tests/README.md` 已建 5 条不变量与 CI 门禁，进入 Phase 5 每冲刺再 spawn | `tests/README.md` |

---

## 4. 完成定义（DoD）

1. 端到端可在微信开发者工具 / 真机启动：引导 → 拼装 1 只动物（如 `cat_01`）→ 餐厅上岗产出星券 → 主菜单抽卡入口单抽 1 次，星券扣减并落入仓库。
2. 以下不变量在本 Sprint 单测通过（对应 `tests/README.md` §3）：**atlas 零增长、跨家族抛错、货币守恒、保底计数正确**。
3. 主包体积 < 4MB（`tests/README.md` §4 CI 门禁不红）。
4. 离线收益封顶（`T_cap` / `offline_factor`）逻辑已实现并单测通过（E4 公式一体落地，本切片未强依赖离线）。

---

## 5. 退出标准 → 进 Phase 5

Sprint 1 DoD 全过 + 主包体积门禁绿 → 主理人裁定 **Phase 4 PASS**，进入 Phase 5 制作（每冲刺循环：engineering-lead 实现就绪 Story → quality-lead 产 QA 计划与烟雾测试 → design-strategist 设计评审与范围检查 → 主理人收尾回顾）。

---

## 6. ⚠️ 待你拍板 / 待签字项（不阻塞 Sprint 1 启动，但需在设计评审前闭合）

| # | 事项 | 来源 | 建议 |
|---|------|------|------|
| **A** | `offline_factor` 0.25→0.20 由编排者（后端故障期间）直推，需 design-strategist 复核签字 | `design/ux/spec.md` 末注 + `phase2-balance.md` | 数值合理，建议签字确认；如不同意回退 0.25 |
| **B** | 导航决策（☰Hub 总览 + 底部 4 Tab） | `design/ux/spec.md` §9-1 | 单手可达、不打断收菜，建议采纳 |
| **C** | 保底展示粒度（显示「距保底 X/50」软提示 vs 完全隐藏仅进度条） | `design/ux/spec.md` §9-2 / T2 | 建议显示软提示，兼顾透明与低焦虑 |
| **D** | 概率公示样式（微信强制公示 vs 治愈低压力） | `design/ux/spec.md` §9-3 / T1 | 折叠小字满足合规、主视觉弱化数字 |
| **E** | 广告位权重（IAA 入口 vs 无打扰治愈） | `design/ux/spec.md` §9-4 / T4 | 次级样式、明确「可选」 |
| **F** | 图鉴🔒收藏焦虑展示策略 | `design/ux/spec.md` §9-5 / T6 | 进度环强调「已得%」、限定卡标「季节」降 FOMO |

> A 项为硬性待签字（影响数值基线）；B–F 为体验决策，可在 Sprint 1 设计评审一并确认，不阻塞 P0 启动。

---

## 7. 已知风险与缓解

- 🔴 **构建/真机证伪仍为最大未消项**：V4（主包<4MB）、V5（tint 分层）、V6（引擎插件加载）、V7（分包命中）、R1–R7（帧率/冷启/内存等）目前仅逻辑层 + 预算估算，**需真实 Cocos 分包构建 + 微信真机**。Sprint 1 的 CI 体积门禁是第一步构造性证明，真机在 Phase 5 每冲刺补。
- 🟡 **atlas 烘焙常量待替换**：`assembly-demo.js` 的 `ATLAS_BYTES` 为占位，E2-S5 须以真实烘焙图集替换并复核首包 0.8–1.2MB 行（R-ATLAS-CONST）。
- 🟡 **数值为初版常数**：抽卡/经营/养成曲线常数（含 `offline_factor`）待数值平衡 pass 在 v1.0 前校准；Sprint 1 用当前锁定值，结构不动只调数。

---

## 8. 关联产物索引

- 概念：`design/gdd/concept-doc.md`
- 三系统 GDD：`design/gdd/system-gacha.md` / `system-idle-restaurant.md` / `system-cultivation.md`
- 平衡 pass：`design/gdd/phase2-balance.md`
- 技术原型：`docs/architecture/tech-prototype.md`
- UX 规格：`design/ux/spec.md`
- 资产规格：`art/asset-spec.md`
- Epic/Story：`production/epics.md`
- 测试框架：`tests/README.md`
- 可运行参考：`src/prototype/assembly-demo.js`、`src/analysis/balance-sim.js`
