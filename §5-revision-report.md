# §5 接手修订汇编报告 · 员工/顾客/菜品解锁

> 主理人：游承峰（编排者）｜日期：2026-07-28｜范围：design/gdd 下 6 份文档
> 触发：用户 2026-07-28 20:52 确认 4 项设计决策，要求修订 6 份 GDD 后再进 Phase 5。

> ✅ **【design-strategist 复核签字 · 文策渊 · 2026-07-30 · 结论：PASS（带 CONCERNS）】**：6 份 GDD 兜底落盘的「员工/顾客/菜品解锁」修订经复核，新增常数（三岗 chef/waiter +8%、host +6%、affinity 1.5、解锁曲线 200×1.35ⁿ / 40×1.30ⁿ、active +0.15）全部命中 TUNED、均为 tunable 非锁参；零货币 / 双货币隔离不变量未破坏；锁参（R60/SR30/SSR10、N=0%、50 保底、`offline_factor=0.20`）原样保留。CONCERN：星券三方竞争扩展重算仍待 Phase 5 专项（详见 `production/design-review-2026-07-30.md`）。

## 执行路径（含一次 flaky 兜底）
1. 派 **design-strategist** 修订 6 份 GDD → 子 agent 后端再次 flaky，回传"完成"但**磁盘 mtime 未变、无内容**（与 HANDOFF §8 记载同源）。
2. 按 HANDOFF §8 授权，**主理人本地兜底执行**：用本地工具直接改写 6 份，全部标注「【主理人本地代执行 · 待 design-strategist 复核签字】」。
3. 落盘已用 `stat` mtime + 内容指纹双重核实（详见下）。

## 质量门评定：✅ PASS（带 CONCERNS）
| 检查项 | 结果 |
|---|---|
| 4 决策落地 | ✓ 顾客带菜需求(未解锁不可服务) / 菜品解锁=星券+食材 / 员工三岗 / 被动+主动结算 全部写入 |
| 锁参未动 | ✓ offline_factor=0.20、R60/SR30/SSR10、N不入池、50保底、双货币隔离 均保留 |
| 货币闭环 | ✓ 菜品解锁仅用 星券+食材，不引入新资源；食材闭环(养成+解锁) |
| 跨 GDD 一致 | ✓ 员工=动物、三岗加成不反超升级树、服务结算融合离线公式；一致性文档补 §5 + 张力 D |
| 无新主导策略 | ✓ 三岗同量级软补充；星券三方竞争(升级/抽卡/解锁)归为战略张力 |
| 历史不一致修正 | ✓ concept "金币"→"星券"；consistency offline_factor 0.25→0.20 |

**CONCERNS（均 tunable，design-strategist 复核签字 PASS · 2026-07-30）：**
- 三岗加成常数（chef/waiter 每级 +8%、host 每级 +6%）
- 岗位适配 `affinity_bonus = 1.5`
- 菜品解锁曲线（星券 `200×1.35ⁿ` / 食材 `40×1.30ⁿ`）
- 主动加成 `active_bonus = +0.15`（点击）
- §6-A：`offline_factor=0.20` **design-strategist 复核签字 PASS · 2026-07-30（锁参零改动，详见 production/design-review-2026-07-30.md）**

## 修订文件清单（版本 / mtime）
| 文件 | 版本 | 改动量 |
|---|---|---|
| system-idle-restaurant.md | v0.2 | 重大：员工/顾客二分、三岗加成、菜品解锁、被动+主动结算 |
| system-gacha.md | v0.1.1 | 措辞定性：抽卡产出=员工 |
| system-cultivation.md | v0.1.1 | 养员工 + 三岗岗位加成 + 适配 |
| concept-doc.md | v0.1.2 | 核心循环/MVP 植入员工·顾客·菜品解锁 |
| phase2-consistency.md | v0.2 | 新增 §5 一致性表 + 张力 D；章节重编号 |
| phase2-balance.md | v0.3 | 新增 R-BAL-4（增补尚未重跑平衡） |

## 下一步（未执行，待推进）
- **P0 工程**：engineering-lead 补 `production/epics.md`（顾客生成/菜品解锁/三岗 Story）+ `tests/README.md` 不变量（解锁扣费原子性、需求-解锁匹配）。
- **P1**：闭合签字项 A–F；`design/ux/spec.md` 补员工/菜品/顾客界面；`art/asset-spec.md` 补员工 vs 顾客视觉区分。
- **持续**：V4–V7 / R1–R7 构建 + 真机证伪（最大残留风险）。
- **复核**：design-strategist 后端恢复后，对 6 份"待复核"内容签字（含 §6-A offline_factor）。
