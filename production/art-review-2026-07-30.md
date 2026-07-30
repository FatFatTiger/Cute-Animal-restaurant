# 美术复核签字 · ART-SIGNOFF-001

> **复核人**：林绘澄（art-lead / 美术与视觉表现指导）
> **日期**：2026-07-30
> **任务**：ART-SIGNOFF-001（P1，对应交接文档待办 G）
> **范围**：复核并签字三份文件，逐项核查是否与其上技术红线一致；冲突/模糊列出具体行号与冲突点。
> **落盘**：本文件为真实落盘复核报告（非仅文本回传）。

---

## 〇、复核基准（技术红线）

| # | 红线 | 依据 |
|---|---|---|
| R1 | **零位图**：微信原生 canvas2d 程序化资产；单只动物 0 独立贴图、~11–64 字节参数；atlas 字节=0（不变量#1） | 任务书；art-bible §A；asset-spec §0/§2.2；render.js L13 |
| R2 | **家族硬隔离**：跨家族部件组合运行时抛 `FamilyIsolationError`（不变量#2） | 任务书；art-bible §4.4.3；assembly/index.js L74-88 |
| R3 | **分层 fill**：身份色在角色绘制层、稀有度色在 UI 卡框层，分属不同绘制指令层，无 shader tint | 任务书；art-bible §4.2/§7.2；asset-spec §3 |
| R4 | **主包 ≤4MB**（硬约束） | 任务书；art-bible §A.4；asset-spec §0 |
| R5 | **渲染契约**：`buildScene(state)` 纯函数 → 指令数组(`clear/rect/circle/roundrect/ellipse/text`) → `applyCommands(ctx,cmds)` | 任务书；render.js `applyCommands` L769-829（实测仅支持上述 6 类 op + `circle` 内部用 `arc`） |

**交叉证据**（本次实读代码）：
- `src/ui/render.js` 的 `applyCommands`（L769-829）**仅处理** `clear / rect / roundrect / circle / ellipse / text` 六类指令；`circle` 内部用 `ctx.arc`，但 `arc`、`path`、`triangle`、`polygon` 均**不是**可用的 op 类型。→ R5 命令集以此为准。
- `src/assembly/index.js` 的 `validateFamily`（L76-88）确实抛 `FamilyIsolationError`；`slotAllowed`（L68-72）以数组家族 `[Mammal,Bird]`/`[Round,Aquatic]` 与 `'universal'` 实现**肢部白名单**——与 art-bible §4.4.1 / asset-spec §1.5 一致。→ R2 白名单在运行时已正确编码。
- 工程侧三门禁（`engineering-review-2026-07-30.md` L16）：发布包 **132334 B ≈ 129 KB < 4 MB**，单测 155/10 全绿。→ **R4 实测已满足**，asset-spec §0 的 AR-1「预算未实测」已由该门禁背书（见 K4）。

---

## 一、总判定表

| 文件 | 版本 | 红线一致性 | 判定 | 阻塞项 |
|---|---|---|---|---|
| `art/art-bible.md` | v0.3 | R1–R5 文本一致（§10.7/§10.9-Q6/§10.0-Q1/§10.1/§10.4/§10.5/§4.4.2 已对齐 R5 契约与字节口径） | **PASS（闭环于 2026-07-30，用户授权）** | 原 C-1/C-2 + K1：均已闭环（见 §二闭环记录） |
| `art/asset-spec.md` | v0.1 | R1–R5 文本一致（§3.2 已去 multiply/screen；§0/§2.2/§2.4 已对齐） | **PASS（闭环于 2026-07-30，用户授权）** | 原 C-3 + K1：均已闭环（见 §三闭环记录） |
| `design/gdd/system-scene-phase2.md` | v0.1 | R1–R5 实质一致，已实现 | **PASS（附 2 minor 注释）** | 无阻塞 |

> 三份文件**均未发现对五条红线的实质性违反（无 FAIL）**；CONCERNS 来自「文档词汇/叙事越界于实测渲染契约」与「文档↔代码漂移」，均为可定点修复项。

---

## 二、文件一 · `art/art-bible.md` v0.3 → **PASS（闭环于 2026-07-30，用户授权）**

### 红线核对
| 红线 | 结论 | 证据 |
|---|---|---|
| R1 零位图 | ✅ 文本一致 | §A.1(L329-336) / §10.1(L188-213) 全篇声明 canvas2d 零贴图、atlas 字节=0；§10.0(L12) 已 pivot 离 Cocos |
| R2 家族硬隔离 | ✅ 文本一致 | §4.4.3 硬护栏(L98) / §4.4.4 矩阵(L100-106) / §10.6(L264-280) 全篇强制 |
| R3 分层 fill | ✅ 文本一致 | §4.2（身份色绑定 L62）/ §7.2 护栏(L143) 身份色 vs 稀有度色分属不同 UI 层 |
| R4 ≤4MB | ✅ 文本一致（实测亦过） | §A.4(L344-347) 主包≤4MB；工程门禁 129KB 背书 |
| R5 渲染契约 | ✅ 已对齐 | §10.7(L282-300) 图元表已全部改写为 `roundRect`/`circle`/`ellipse`/`text` 组合；`triangle`/`arc`/`path`/`low-poly rounded path` 已移除，残留 `path`/`polygon` 需求列入「待工程扩展契约」待办（K-EXT，见 §10.7 注） |

### 阻塞项 / 冲突点
- **C-1（R5 · 阻断 → 已闭环 2026-07-30 · 用户授权）· §10.7 图元词汇越界**。L289「屋顶 = `triangle` / `arc`」、L293「摊位棚 = `arc` + 条纹 `ellipse`」、L295「远山 = low-poly rounded path」。`triangle`/`path`/`arc` 不在 `applyCommands` 支持的 `{clear,rect,roundrect,circle,ellipse,text}`（render.js L769-829）。**冲突**：美术/程序按 §10.7 生产时会假设 `triangle`/`path` 指令存在，但运行时无法落地。
  - **已闭环**：§10.7 图元表已统一改写为受契约支持的基元——屋顶/远山用 `roundrect`+`ellipse`/`circle` 组合表达（坡顶=两块渐缩 `roundRect`；穹顶=`ellipse` 半球被主体覆盖；远山=`ellipse` cluster/阶梯 `roundRect`）；原 `triangle`/`arc`/`low-poly rounded path` 已全部移除。残留 `path`/`polygon` 需求列入「待工程扩展契约」待办（K-EXT），须先由 engineering-lead 在 `render.js applyCommands` 新增对应 op 方可回流生产。§10.1/§10.4/§10.5 同源 `arc`/`path`/三角/弧形 词汇一并改写为 `roundRect`/`circle`/`ellipse` 组合。

- **C-2（R1 · 阻断 → 已闭环 2026-07-30 · 用户授权）· §10.9-Q6 自相矛盾**。Q6 将「单白模 base-parts atlas」拆为 (a) 仍保留一张极小白模形状图集（圆/方/三角/弧）供 tint，或 (b) 完全用 canvas2d path。但文档声称「两者都满足不变量#1」——**选项 (a) 保留位图 atlas 直接违反 atlas 字节=0（不变量#1）与 OP1-A pivot**。
  - **已闭环**：Q6 选项 (a)（保留白模形状图集供 tint）已删除——保留位图 atlas 直接违反 atlas 字节=0（不变量#1）与 OP1-A pivot；现唯一合法解为 (b) 完全用 canvas2d 图元（受 R5 契约支持的 op）绘制、不设任何位图，与 asset-spec §2.2 一致。

### 跨文档/跨代码 关联发现（见第四节 K1/K2）
- 本文 §10.0(L12) / §10.9-Q1(L314) 自述「仅剩 `docs/architecture/tech-prototype.md` 待 engineering-lead 回退」，**遗漏了 `src/assembly/index.js` 仍保留 legacy 位图 atlas + tint 管线**（见 K1）。属文档自评不全，须补正。

### 签字栏
```
文件：art/art-bible.md v0.3
判定：PASS（闭环于 2026-07-30，用户授权）★ 原 CONCERNS 已闭环
美术签字：林绘澄（art-lead）· 2026-07-30
原条件：① §10.7 图元表对齐 R5 命令集（C-1）→ 已闭环；② §10.9-Q6 删除白模 atlas 选项 (a)（C-2）→ 已闭环；
      ③ §10.0/Q1 补列 src/assembly/index.js 为剩余 pivot 缺口（K1）→ 已闭环（§10.0 仍待修订 bullet + Q1 均补列）。
闭环说明：上述三项 + §4.4.2 字节下限统一为 ~11–64B（与 asset-spec §2.4 对齐）均已落盘；R1–R5 文本一致，升 PASS。
```

---

## 三、文件二 · `art/asset-spec.md` v0.1 → **PASS（闭环于 2026-07-30，用户授权）**

### 红线核对
| 红线 | 结论 | 证据 |
|---|---|---|
| R1 零位图 | ✅ 文本一致 | §2.2(L152-164) 删除全部纹理格式；L163「不存在位图纹理格式（不变量#1）」 |
| R2 家族硬隔离 | ✅ 文本一致（与运行时吻合） | §1.5 L0=[哺乳+鸟]/L2=[圆团+水族] 白名单(L91-93)；AR-6(L303)「绘制调用层强制校验」↔ assembly/index.js L68-72 |
| R3 分层 fill | ✅ 文本一致 | §3.1 身份色层(角色绘制层 L182-189) / §3.2 稀有度色层(UI 卡框层 L191-199)，无 shader tint |
| R4 ≤4MB | ✅ 文本一致（实测亦过） | §0 主包合计≈0.42–0.82MB(L23)；工程门禁 129KB 背书（K4） |
| R5 渲染契约 | ✅ 已对齐 | §3.2(L194-197) 原 `multiply` / `screen` 层内混合已删除，改为「纯 alpha 叠加 + 角标形状/纹理编码」，与 applyCommands 无 `globalCompositeOperation` 一致 |

### 阻塞项 / 冲突点
- **C-3（R5 · 阻断 → 已闭环 2026-07-30 · 用户授权）· §3.2 混色模式越界**。L194「卡框条 multiply」、L195「multiply + 轻光 screen」、L196「multiply + 边框微光 screen」、L197「multiply + 流光 screen」。`applyCommands`（render.js L769-829）**无任何 `globalCompositeOperation` 处理**，`multiply`/`screen` 无法落地。
  - **已闭环（采用方案 b）**：§3.2 已改为「纯 alpha 叠加（`globalAlpha`）+ 角标形状/纹理编码」实现稀有度演出，`multiply`/`screen` 表述全数删除，与 applyCommands 无 `globalCompositeOperation` 处理一致，严守零贴图契约。§2.2 同源 `path`/`arc` 词汇一并改写为受 R5 契约支持的 op。

### 跨文档/跨代码 关联发现
- **字节预算口径**：本文 §0「新手 5 只 N ≈11B/只」(L20)、§2.4「~11–64B JSON」(L174) 与 art-bible §4.4.2「~32–64 字节」(L89) 下限不一致（11B vs 32B）。非阻断，但建议在 art-bible §4.4.2 对齐为「~11–64B」（N 动物部件少→更小）。
- **K1 关联**：本文 §0(L6)/§2.2(L152) 断言零贴图已完成，但未提示 `src/assembly/index.js` 仍含 legacy tinted-atlas 逻辑（见 K1）。

### 签字栏
```
文件：art/asset-spec.md v0.1
判定：PASS（闭环于 2026-07-30，用户授权）★ 原 CONCERNS 已闭环
美术签字：林绘澄（art-lead）· 2026-07-30
原条件：① §3.2 去除 multiply·screen 混色（C-3）→ 已闭环（改纯 alpha 叠加 + 角标/纹理编码）；
      ② 与 art-bible §4.4.2 对齐单只字节下限（11B）→ 已闭环（art-bible §4.4.2 已统一为 ~11–64B）；
      ③ §0 补列 src/assembly/index.js 为剩余 pivot 缺口（K1）→ 已闭环（§0 已补 K1 注，与 art-bible §10.0/Q1 一致）。
闭环说明：三项条件均落盘，R1–R5 文本一致，升 PASS。
```

---

## 四、文件三 · `design/gdd/system-scene-phase2.md` v0.1 → **PASS（附 2 minor 注释）**

### 红线核对
| 红线 | 结论 | 证据 |
|---|---|---|
| R1 零位图 | ✅ | §3.5(L134-138)/§4.5(L218)/§5.5(L276-280) 全为 canvas2d 图元；§3.5(L151)「无 drawImage 任何位图；atlas 字节=0」 |
| R2 家族硬隔离 | ✅ | §4.5(L220)/§5.5(L278,290) 陈列与剪影均用同家族部件；§7(L310) 重申 #2 |
| R3 分层 fill | ✅ | §5.5(L275,277) 稀有度双编码在卡框层；身份色在角色层 |
| R4 ≤4MB | ✅ | §7(L309)「主包 ≤4MB 不受新增场景威胁」；工程门禁背书 |
| R5 渲染契约 | ✅（实质） | §2.3(L79)「buildWarehouse/buildLounge/buildRoster 纯函数 → applyCommands(ctx,cmds)」；render.js 三函数已实现且仅用受支持 op |

### Minor 注释（非阻断）
- **M-1（R5 词汇）· §4.5(L218)**：「软垫/猫爬架 = `roundrect` + `arc`」「爱心粒子（canvas2d 圆/路径）」。`arc`/`路径` 非 R5 op；但同节已用 `appendCritter`（运行时仅 roundrect/circle/ellipse/text）实现，且 render.js `buildLounge`(L520-546) 实际未用 arc/path。**建议**：将 §4.5 文案的 `arc`/`路径` 改为「`roundRect`/`circle`/`ellipse` 组合」，与实测契约一致。
- **M-2（R5 命名）· §2.3(L79)**：使用 `buildWarehouse/buildLounge/buildRoster` 而非任务书契约名 `buildScene(state)`。render.js 已设 `buildScene = buildRestaurant`(L758) 别名，且 `buildScene` 在既有单测中作为餐厅场景保留。**建议**：在 §2.3 明确「`buildScene(state)` 为契约总入口（按 `nav.scene` 分发至 buildXXX），Phase 2 三模块即 buildWarehouse/buildLounge/buildRoster」，避免与契约名歧义。

> 本 GDD 是三份中**最贴合实测渲染契约**的一份（无 triangle/path 越界），已实现代码（render.js L409-582）全用受支持 op，故判 PASS。

### 签字栏
```
文件：design/gdd/system-scene-phase2.md v0.1
判定：PASS（附 M-1/M-2 两处文案精修，非阻断）
美术签字：林绘澄（art-lead）· 2026-07-30
```

---

## 五、跨文档 / 跨代码 关键发现（供主理人 + 程基岩裁决）

**K1 — `src/assembly/index.js` 仍保留 legacy 位图 atlas + shader-tint 管线（与 R1/R3 叙事冲突，属潜在漂移）**
- 证据：L12「分层 tint」设计注记；L27-66 `ATLAS` 以 `rect:{x,y,w,h}` 描述 sprite-sheet 切片坐标；L41 `B4 family:'universal'`；L61-65 `limb L0=[Mammal,Bird]/L2=[Round,Aquatic]`（白名单，与文档一致）；L113-143 `Z_LAYER` + `assembleCharacter` 产出含 `tint:{fill,shade,outline}` 字段的部件合成（典型 shader-tint 结构）；**L146 `ATLAS_BYTES = 466096`（≈0.45MB 占位常量）**。
- 判定：**实际包体字节为 0**（该常量为 JS 数字字面量，未烘焙真实 atlas；工程门禁 129KB 佐证），故 R1 红线**未被实际破坏**。但此模块仍完整描述「白模 atlas + tint」旧管线，与 art-bible/asset-spec 声称的「atlas 字节=0、无 shader tint、OP1-A 已 pivot」叙事直接相悖，且当前 `render.js` **未引用** assembly/index.js（render.js 用自有 `appendCritter`）。
- 风险：若任何人将 assembly/index.js 重新接回运行时并 expect 真实 atlas，会突破零贴图；且文档自评（art-bible §10.0/Q1）只点名 `tech-prototype.md`，**漏列本文件**。
- **建议**：① 在 art-bible §10.0/Q1 与 asset-spec §0 补列 `src/assembly/index.js` 为剩余 pivot 缺口；② 由程基岩裁定——要么将 assembly/index.js 的 `ATLAS`/`tint` 重写为「canvas2d 绘制函数表」（去 rect 坐标、去 tint 字段、改 `draw(ctx,slot,preset)`），要么标注其为 legacy 死代码并加 `// DEPRECATED: OP1-A pivot` 注释，避免误用。

**K2 — `src/ui/render.js` 当前视觉主题/稀有度色与 art-bible 锁定身份冲突（R3 相关漂移，非红线硬违）**
- 证据：render.js L48 `BG='#1a1a2e'`（深蓝黑底）+ 面板 `#2e2e55`/`#26264a` 等**暗色主题**；L28-33 `RARITY_COLORS` = `N:#9aa0a6 / R:#5bc0eb / SR:#c77dff / SSR:#ffd166`——与 art-bible §7.2 锁定的 `N:#A8C0B0 / R:#8FB8E0 / SR:#C9A6E8 / SSR:#F4C95D` 及 §3.1 暖奶油马卡龙基底**不一致**（assembly/index.js L105-110 的 `RARITY` 反而与 art-bible 一致）。
- 判定：非 R1–R5 红线硬违（仍零贴图、仍分层），但**视觉身份基准（art-bible §1/§3）未被当前运行时遵循**——暗色主题直接对立于「暖调为基底、马卡龙低饱」的核心定位。
- 风险：当前 `buildLounge`(L541)/`buildRoster`(L572) 用 `RARITY_COLORS[o.rarity]` 填充**角色本体**，使身份色层被稀有度色占据（L541 `fill: RARITY_COLORS[o.rarity]`），与 R3「身份色在角色层、稀有度色在卡框层」的分层纪律相左（属 Phase 2 fallback 占位，待真实部件装配接入时需改为身份色）。
- **建议**：① 真实部件装配接入时，角色 fill 改用 12 配色预设身份色（art-bible §4.2），稀有度色仅留卡框条/角标（R3 分层）；② 立项将 render.js 主题迁移至 art-bible §3.1 暖奶油调（或明确本作为「开发占位暗色壳」，标注 `// DEV PLACEHOLDER THEME`）；③ `RARITY_COLORS` 对齐 art-bible §7.2 锁定 hex（与 assembly/index.js 一致）。

**K3 — 工程门禁已背书 R4（利好，非风险）**
- `engineering-review-2026-07-30.md` L16：发布包 **132334 B ≈ 129.23 KB < 4 MB**。→ asset-spec §0 AR-1「主包真实体积未测」**已由该门禁闭环**，R4 实测满足，无需另测。art-bible §A.4「去 Cocos/atlas 后余量极大」成立。

---

## 六、修复优先级清单

| 优先级 | 项 | 归属 | 动作 |
|---|---|---|---|
| P0 阻断 | C-1 §10.7 图元表越界 triangle/path/arc | art-lead（修文档）+ 程基岩（确契约） | §10.7 改受支持基元，或 render.js 增 `path`/`polygon` op |
| P0 阻断 | C-2 §10.9-Q6 白模 atlas 选项 (a) | art-lead | 删 (a)，仅留 (b) 零贴图 |
| P0 阻断 | C-3 §3.2 multiply/screen | art-lead（修文档）+ 程基岩（确 composite） | 改为纯 alpha 叠加或加 `composite` 字段 |
| P1 | K1 assembly/index.js legacy atlas+tint | 程基岩 + art-lead（补文档自评） | 重写/标注 deprecated；文档补列缺口 |
| P1 | K2 render.js 暗色主题 + 稀有度 hex 漂移 | 程基岩 + art-lead | 接入真实装配改身份色层；主题/hex 对齐 art-bible |
| P2 | M-1 §4.5 arc/路径 文案 | design-lead（文策渊） | 改 roundRect/circle/ellipse 组合 |
| P2 | M-2 §2.3 buildScene 命名 | design-lead | 明确 buildScene 为分发总入口 |
| P2 | 字节下限 11B vs 32B | art-lead | art-bible §4.4.2 统一为 ~11–64B |

---

## 七、整体签字

```
复核任务：ART-SIGNOFF-001
复核人：林绘澄（art-lead / 美术与视觉表现指导）
日期：2026-07-30

art/art-bible.md            v0.3   → PASS      （闭环于 2026-07-30，用户授权；原 C-1/C-2/K1 已闭环）
art/asset-spec.md           v0.1   → PASS      （闭环于 2026-07-30，用户授权；原 C-3/K1 已闭环）
design/gdd/system-scene-phase2.md v0.1 → PASS（附 M-1/M-2 精修）

红线总评：R1–R4 三份文件文本一致、R4 已由工程门禁实测背书（129KB<4MB）；
         R5 命令集以 render.js 实测六类 op 为准；art-bible §10.7 与 asset-spec §3.2
         原词汇/混色越界（C-1/C-3）已于 2026-07-30 用户授权下闭环，全表对齐六类 op。
跨码风险：K1（assembly/index.js legacy atlas+tint 叙事冲突）、K2（render.js 暗色主题/
         稀有度 hex 漂移）需主理人+程基岩闭环，不阻断文档签字但影响视觉身份落地。

结论：三份文件已于 2026-07-30 用户授权下闭合 P0 三项（C-1/C-2/C-3）与 K1 文档自评，全部升 PASS；
      K1/K2 为工程侧遗留，建议列入 Phase 2 收尾清单。
```

> 本复核报告已真实落盘于 `production/art-review-2026-07-30.md`。未执行任何 git commit/push。

---

## 八、闭环记录（2026-07-30 · 用户授权）

> **授权**：用户已授权将 art-bible / asset-spec 的 CONCERNS 闭环至 PASS。art-fix（林绘澄）于 2026-07-30 落盘以下修复，未改动任何代码/锁参，未执行 git commit/push。

| 文件 | 闭环项 | 落盘位置 | 状态 |
|---|---|---|---|
| `art/art-bible.md` v0.3 | C-1 §10.7 图元词汇越界 | §10.7 表改 roundRect/circle/ellipse/text 组合；§10.1/§10.4/§10.5 同源 arc/path/三角/弧形 一并改写；残留 path/polygon 列入「待工程扩展契约」(K-EXT) | ✅ 闭环 → PASS |
| `art/art-bible.md` v0.3 | C-2 §10.9-Q6 自相矛盾 | Q6 删除选项 (a)，仅留 (b) 完全 canvas2d 图元、不设任何位图（与 asset-spec §2.2 一致） | ✅ 闭环 → PASS |
| `art/art-bible.md` v0.3 | K1 文档自评遗漏 | §10.0 仍待修订 bullet + Q1 补列 `src/assembly/index.js` 为剩余 pivot 缺口 | ✅ 闭环 |
| `art/art-bible.md` v0.3 | 字节下限对齐 | §4.4.2 由 ~32–64B 统一为 ~11–64B（与 asset-spec §2.4 对齐） | ✅ 闭环 |
| `art/asset-spec.md` v0.1 | C-3 §3.2 混色越界 | §3.2 删除 multiply/screen，改纯 alpha 叠加 + 角标形状/纹理编码；§2.2 同源 path/arc 改写 | ✅ 闭环 → PASS |
| `art/asset-spec.md` v0.1 | K1 文档自评遗漏 | §0 补列 `src/assembly/index.js` 为剩余 pivot 缺口（与 art-bible §10.0/Q1 一致） | ✅ 闭环 |

**最终判定（2026-07-30，用户授权）**：
- `art/art-bible.md` v0.3 → **PASS**
- `art/asset-spec.md` v0.1 → **PASS**
- `design/gdd/system-scene-phase2.md` v0.1 → **PASS（附 M-1/M-2 精修）**

> 注：K1 的**工程侧处置**（`src/assembly/index.js` 回退/标注 deprecated、tech-prototype ADR-1/ADR-2 回退）仍属 engineering-lead 待办，不影响本文档签字（文档侧自评已补全）；K2（render.js 暗色主题/稀有度 hex 漂移）亦为工程侧遗留，建议列入 Phase 2 收尾清单。
