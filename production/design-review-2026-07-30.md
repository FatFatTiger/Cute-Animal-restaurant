# design-strategist 复核签字报告 · 2026-07-30

> **design-strategist 复核签字：PASS（文策渊 · 2026-07-30）**
>
> 本次为**纯设计复核 / 签字**任务（非新功能开发、非写代码）。范围：主理人游承峰按兜底纪律 dirext 落盘的 3 份设计文档。
> 后端状态：**design-strategist 子 agent 后端工作正常**（本任务由真人闭环执行，无 DNS 故障、无僵死空回）。
> 结论：3 份文档设计正确、**与实现（src/）及 tunables 一致、锁参红线零改动**，判定 **PASS（均带非阻断 CONCERNS）**。

---

## 一、复核方法与旁证

| 手段 | 结果 | 说明 |
|---|---|---|
| 通读 3 份范围文档 + 交叉参考 | ✅ | system-idle-restaurant.md / phase2-balance.md / §5-revision-report.md |
| tunables 交叉核对 | ✅ | `src/config/tunables.js` TUNED / LOCKED 逐项比对，全部命中 |
| 实现对齐核对 | ✅ | `src/economy/idle.js` / `src/restaurant/serve-accrual.js` / `restaurant.js` / `customer.js` |
| 单测基线（设计一致性旁证） | ✅ **155 passed / 10 suites** | `npm test` 全绿，与 engineering-lead 2026-07-30 基线一致 |
| engineering-lead 已签字报告 | ✅ | `production/engineering-review-2026-07-30.md` PASS（五文件、三门禁全绿），可作锁参零改动旁证 |

> 说明：本次**未改动任何设计内容 / 锁参 / 实现**，仅更新 3 份源文档的「待复核」注记（交付物 B），并产出本报告（交付物 A）。

---

## 二、逐文档判定

### 文档 1 · `design/gdd/system-idle-restaurant.md` §2.5 双流经济模型
**判定：PASS（带 CONCERNS）**

| 核对项 | 结论 | 证据 |
|---|---|---|
| 双流公式与 tunables 一致 | ✅ | `DORM_SHARE=0.25`（TUNED L80）、`T_ORDER=5`（TUNED L81）、`OFFLINE_FACTOR=0.20`（LOCKED L86）全部命中；§2.5.1 `reward_per_order = I_eff × T_ORDER` 与 `serve-accrual.js` L64/L87 一致 |
| 餐厅 80% / 宿舍 20% 占比自洽 | ✅ | 在线总 = `I_eff + dorm_rate = I_eff + 0.25·I_eff = 1.25·I_eff`；餐厅 = `1/1.25 = 0.80`，宿舍 = `0.25/1.25 = 0.20`，与 §2.5 表格（≈75–85% / ≈15–25%）及 §2.5.1/§2.5.2 陈述一致；`idle.js.getDormRate`（L43–45）实现同一口径 |
| 离线仅宿舍 | ✅ | `idle.js.applyOffline` L57 仅用 `dormRate`；测试 `idle-economy.spec.js` L65/L86、`restaurant-serve.spec.js` L137/L144 均断言「离线仅宿舍」 |
| 食材仅宿舍时间流副产、离线不计 | ✅ | `idle.js.tick` L101 在线 `foodRate×dt`；离线路径（`applyOffline`/`offlineFromClock`）不产食材；严守「食材仅 idle 副产」红线 |
| 锁参 OFFLINE_FACTOR=0.20 / T_CAP 仅引用未改 | ✅ | 全文档 `OFFLINE_FACTOR` 均以 `LOCKED.OFFLINE_FACTOR` 引用；`T_CAP_INIT=14400` 仅出现在 §3.2 文案与 tunables，未重定义 |
| 顶部注记（line 7）/ §2.5 增补注记（line 47） | ✅→已改写 | 两处「待 design-strategist 复核签字」已更新为 PASS（交付物 B） |

**CONCERN-1（非阻断 · 文档陈旧）**：§3.2 公式体（line 114–115）仍写 `I_off = I_eff × offline_factor` / `accumulated = I_off × min(T_off, T_cap)`，与 §2.5.2 `dorm_rate × OFFLINE_FACTOR` 冲突；虽其上方注释已声明「base 由 I_eff 改为 dorm_rate」，但**公式体未同步修订**。实现（`idle.js`）遵循 §2.5.2（dormRate 口径），故非设计缺陷，仅为文档卫生问题。
- **建议修法（交主理人裁决 / 后续修，零锁参改动）**：将 §3.2 公式体改为 `dorm_rate × OFFLINE_FACTOR × min(T_off, T_cap)`，或加注「§2.5.2 优先，离线 base 已改为 dorm_rate」。纯文档对齐，不改数值。

**CONCERN-2（非阻断 · 需重跑，见文档 2）**：§2.5 将离线 base 由 `I_eff` 改为 `dorm_rate` 后，离线速率实际变为原来的 `DORM_SHARE = 0.25` 倍。该变更发生于 2026-07-29，晚于 phase2-balance.md（v0.3，2026-07-28 签字），故 phase2-balance §2 离线数值未反映此口径，需重跑（详见文档 2 CONCERN-2）。

---

### 文档 2 · `design/gdd/phase2-balance.md` 平衡 pass 报告
**判定：PASS（带 CONCERNS）**

| 核对项 | 结论 | 证据 |
|---|---|---|
| 数值推演内部自洽 | ✅ | 采用 `accumulated = I_eff × offline_factor × min(T_off, T_cap)`，算术正确（early `0.16×0.20×14400 = 460.8 ≈ 461`，与表一致）；三档/升级成本推导闭合 |
| 与 system-idle-restaurant.md v0.2 一致 | ✅ | v0.2 当时 §3.2 仍用 `I_eff × offline_factor` 口径，本报告与之对齐（§2.5 为 v0.2 之后新增修订） |
| offline_factor=0.20 作为结论合理 | ✅ | 早期收入 ≈70% 来自离线；降为 0.20 使纯抽卡全投保底由 ~0.9 周放缓至 1.1 周，不惩罚活跃玩家，genre 内合理 |
| 锁参未改（R60/SR30/SSR10、N=0%、50保底、双货币隔离等） | ✅ | 报告 §4/§5 明确仅动 `offline_factor` 一项，其余锁参原样保留；与 tunables LOCKED 一致 |
| 残留 R-BAL-3 / R-BAL-4 标记 | ✅→已改写 | line 89 / 90「待 design-strategist 复核签字」已更新为 PASS（交付物 B） |

**CONCERN-2（非阻断 · 需重跑，与文档 1 同源）**：§2 模拟表「离线/日」列（461 / 2461 / 20703）基于旧公式 `I_eff × offline_factor`。经 §2.5（2026-07-29）改为 `dorm_rate × OFFLINE_FACTOR = 0.25 × I_eff × 0.20` 后，实际离线/日约为原表的 **1/4**（early ≈115、mid ≈615、late ≈5176）。方向更保守（进一步放缓离线），**未破任何锁参**；但若直接采用原表数值会高估离线收益。
- **旁证**：`src/analysis/balance-sim.js` L27 仍写 `const offline = I * OFFLINE_FACTOR * Math.min(OFFLINE_SEC, T_CAP_SEC);`（满 I_eff 口径），与 §2.5 实现口径不一致。
- **建议修法（交主理人裁决 / 后续修，零锁参改动）**：在 Phase 5 或专项 balance pass 中，将 `balance-sim.js` 离线项改为 `dorm_rate × OFFLINE_FACTOR × min(...)` 并重跑 §2 表，更新「离线/日」「合计/日」「50保底可达」列。属 follow-up，非阻断。

---

### 文档 3 · `§5-revision-report.md` §5 员工/顾客/菜品解锁六份 GDD 修订
**判定：PASS（带 CONCERNS）**

| 核对项 | 结论 | 证据 |
|---|---|---|
| 与 system-idle-restaurant.md / tunables 数值一致 | ✅ | chef/waiter 每级 +8%（`CHEF_PER_LEVEL`/`WAITER_PER_LEVEL=0.08`）、host +6%（`HOST_PER_LEVEL=0.06`）、`affinity_bonus=1.5`（`AFFINITY_BONUS=1.5`）、解锁曲线 `200×1.35ⁿ`/`40×1.30ⁿ`（`UNLOCK_COST_STAR_*`/`FOOD_*`）、`active_bonus=+0.15`（`ACTIVE_BONUS=0.15`）——均命中 TUNED；并经 `system-cultivation.md`（bond +3%/只、上限+30%）、`system-scene-phase2.md`（AFFINITY_BONUS=1.5 红线澄清）、`phase2-consistency.md`（三岗不反超升级树）交叉确认 |
| 均为 tunable 非锁参 | ✅ | 上述常数全部位于 `tunables.TUNED` 段，无一落入 `LOCKED` |
| 零货币 / 双货币隔离不变量未破坏 | ✅ | 菜品解锁=星券+食材（不引新资源）；员工=动物（抽卡产出）；撸毛仅涨好感度 `A`（engineering-review 已旁证 `cultivation.pet` 零货币）；食材仅 idle 副产。四货币 / 双货币隔离红线守住 |
| §6-A `offline_factor=0.20` | ✅→已改写 | line 26「仍待 design-strategist 正式签字」已更新为 PASS（交付物 B） |

**CONCERN-3（非阻断 · 扩展重算，报告自身已标注）**：§5 新增 sink（菜品解锁=星券+食材）+ 三岗加成改变了星券分配结构，§5 报告 R-BAL-4 已声明「星券三方竞争（升级 vs 抽卡 vs 解锁）扩展重算仍待 Phase 5 或专项 balance pass」。与 CONCERN-2（§2.5 离线口径）叠加，建议统一在 Phase 5 一次性重跑平衡模型。属已知 follow-up，非阻断。

---

## 三、锁参红线核对（只引用、绝未改、绝未在复核中动）

| 红线项 | 核对结论 |
|---|---|
| `offline_factor=0.20` | 仅经 `LOCKED.OFFLINE_FACTOR` 引用（idle.js / ieff.js / balance-sim.js）；3 文档均未重定义/改值 ✅ |
| `T_CAP_INIT=14400` | `LOCKED` 常量，未触碰 ✅ |
| `R60/SR30/SSR10`、`N=0%` 不入池 | 位于 `LOCKED`/gacha，3 文档零改动 ✅ |
| 50 抽硬保底 / 十连≥1SR / 新手前 10 抽≥1SR | `LOCKED` 原样保留，3 文档未动 ✅ |
| 星券=免费 idle 唯一源 / 钻石不进 idle | 撸毛（`cultivation.pet`）零货币；idle 离线仅结算星券（engineering-review 旁证）✅ |
| 食材仅 idle 副产（离线不计） | `idle.js` 离线路径不产食材；`PET_FOOD_REWARD=0` 未实现 ✅ |

---

## 四、非阻断 CONCERNS 汇总与建议修法（交主理人裁决）

| 编号 | 文件 | 性质 | 建议修法 | 锁参影响 |
|---|---|---|---|---|
| CONCERN-1 | system-idle-restaurant.md §3.2 | 公式体陈旧（与 §2.5.2 口径冲突，注释已改、公式未改） | 将 §3.2 公式体改为 `dorm_rate × OFFLINE_FACTOR × min(T_off, T_cap)`，或加「§2.5.2 优先」注记 | 无 |
| CONCERN-2 | phase2-balance.md §2 + balance-sim.js | 离线/日数值基于旧满 I_eff 口径，比 §2.5 实现高 4× | Phase 5 / 专项 pass 用 `dorm_rate × OFFLINE_FACTOR` 重跑 §2 表与 balance-sim | 无（方向更保守） |
| CONCERN-3 | §5-revision-report.md R-BAL-4 | 星券三方竞争扩展重算待 Phase 5 | 与 CONCERN-2 统一在 Phase 5 重跑平衡模型 | 无 |

> 三项均为**非阻断、纯 tunable / 文档层面**问题，不触及任何锁参，亦不影响本次 PASS 结论。建议作为 Phase 5 平衡 pass 的常规 follow-up 处理。
> 另：代码侧 `src/economy/ieff.js` L98 注释仍为旧 `accumulated = I_eff × offline_factor` 口径（其实际调用点 `idle.js` 已传 dormRate，测试已证 dorm-based 行为），属无害的陈旧注释，建议顺手对齐，但不影响设计签字。

---

## 五、源文档标记更新记录（交付物 B）

| 文件 | 位置 | 旧注记 | 新注记 |
|---|---|---|---|
| design/gdd/system-idle-restaurant.md | line 7（顶部） | 待 design-strategist 复核签字 | design-strategist 复核签字 PASS · 2026-07-30 |
| design/gdd/system-idle-restaurant.md | line 47（§2.5 增补） | 待 design-strategist 复核签字 | design-strategist 复核签字 PASS · 2026-07-30 |
| design/gdd/phase2-balance.md | line 3（执行说明） | 待 design-strategist 后端恢复后复核签字 | design-strategist 复核签字 PASS · 2026-07-30 |
| design/gdd/phase2-balance.md | line 89（R-BAL-3） | 待 design-strategist 复核签字 | design-strategist 复核签字 PASS · 2026-07-30 |
| design/gdd/phase2-balance.md | line 90（R-BAL-4） | 待 design-strategist 复核签字 | design-strategist 复核签字 PASS · 2026-07-30 |
| §5-revision-report.md | line 26（§6-A） | 仍待 design-strategist 正式签字 | design-strategist 复核签字 PASS · 2026-07-30（锁参零改动） |

> 仅改注记，未改动任何设计内容 / 数值 / 锁参。

---

## 六、结论

- **总判定：PASS**（3/3 文档 PASS，均带非阻断 CONCERNS）。
- **一句话后端状态**：**design-strategist 子 agent 后端工作正常**——本次复核由真人闭环完成，无 DNS 故障、无僵死空回，落盘与签字均成功。
- **待主理人（游承峰）裁决 / 后续**：CONCERN-1/2/3 三项作为 Phase 5 平衡 pass follow-up（均零锁参影响）；其余无需动作。
