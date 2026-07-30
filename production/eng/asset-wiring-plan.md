# ENG-ASSET-001 · 真实程序化美术资产接入方案（Phase A 仅方案）

> 任务：ENG-ASSET-001（P1，真实美术资产接入 · Phase A 仅出方案、不写任何代码）
> 负责人：engineering-lead-1（程基岩）
> 范围：**本任务只产出方案文档，绝不修改 `src/` 任何代码、绝不 `git commit/push`**
> 主约束：微信原生 canvas2d + 程序化零贴图；主包 ≤4MB（当前 **131.53 KB**，余量充足）；现有 **159 单测不回归**；锁参零改动。
> 依据：`art/art-bible.md` v0.3（§3.1 / §4.4.2 / §7.2 / §8 / §9 / §10）、`design/gdd/system-scene-phase2.md`、`src/ui/render.js`、`src/assembly/index.js`、`src/config/tunables.js`、`tests/`

---

## 0. 文档定位与结论摘要

本游戏美术是**程序化零贴图**——不存在位图绘制/导入环节。所谓"具体角色绘制/场景绘制落地"，本质是：**工程按 `render.js` 的 canvas2d 指令契约（`clear/rect/roundrect/circle/ellipse/text`，见 `applyCommands` R5 契约）把真实部件拼装 + 三区场景画出来，替换当前占位绘制**。

本方案给出四块设计：(1) 真实程序化部件拼装（参数→指令映射、12 身份色、6 表情、家族硬隔离、~11–64B/只、零贴图）；(2) 分层 fill 修正（身份色在角色层、稀有度色仅在 UI 卡框层，无 shader tint）；(3) 三区场景替换占位（迎宾/就餐/后厨 + HUB + Phase2 室内）；(4) 风险与门禁 + 分阶段落地顺序。

**关键结论**：
- 真实拼装逻辑应落在**新建 `src/ui/procedural-assembly.js`**，**不复活** `src/assembly/index.js`（该文件是 DEPRECATED 的 bitmap+atlas+tint 管线，复用它会重新引入 art-bible §10.9 Q1 指出的叙事冲突与 `ATLAS_BYTES≈0.45MB` 占位常量）。
- 当下 `render.js` 已存在**分层 fill 违规**：`buildLounge`(L561) 与 `buildRoster`(L592) 把 `RARITY_COLORS[...]` 当作 critter 主体 `fill` 传入 `appendCritter`，稀有度色被涂在角色本体上，违反 art-bible §7.2「身份色/稀有度色分属不同 UI 层」护栏。须改为：角色本体用 12 身份配色，稀有度色仅出现在 UI 卡框条/抽卡 chip 层。
- 零位图不变量(#1)在**代码层已成立**：`src/ui/**` 无任何 `drawImage/createImage/Image/.png` 引用；`tests/smoke/build-size.gate.js` 实测发布包 **134,685 B ≈ 131.53 KB < 4MB**，门禁通过。
- 159 单测全绿（11 套件 / 159 项，`Tests: 159 passed`）。方案须保留现有 tag 词汇表以确保零回归。
- 锁参红线（offline_factor=0.20、T_CAP=14400、N-R-SR-SSR、R60/SR30/SSR10、50 保底、四货币等）本任务为纯视觉层，**一律不触碰**，新代码只从 `tunables.js` 读取。

---

## 1. 现状审计结论（读懂四份文件后的关键发现）

| # | 发现 | 位置 | 处置 |
|---|---|---|---|
| F1 | 分层 fill **违规**：稀有度色涂在角色本体 | `render.js` L561/L592 传入 `fill: RARITY_COLORS[o.rarity]`；`appendCritter` L112-113 用 `o.fill` 同时涂身体+耳 | Phase B2 修正 |
| F2 | `appendCritter` 仅为「圆润占位 blob」，非真实部件拼装 | `render.js` L92-135 | 由 `assembleCritter`（新模块）取代 |
| F3 | `src/assembly/index.js` 是 DEPRECATED 的 bitmap atlas+tint 管线（`ATLAS_BYTES=466096` 占位、`tint` 逻辑），未被 `render.js` 引用 | `assembly/index.js` L1-3 | **不复活**；逻辑（Family/slotAllowed/validateFamily/FamilyIsolationError/12 预设）**可移植**为纯数据，atlas/tint 丢弃 |
| F4 | `applyCommands` 仅支持 6 类 op（clear/rect/roundrect/circle/ellipse/text），**无 gradient op** | `render.js` L789-849 | 吊灯光晕/天空渐变须用「堆叠半透明 ellipse/circle」伪造；若确需真渐变须先扩展契约（art-bible §10.7 K-EXT） |
| F5 | `buildLounge`/`buildRoster` 的只读数据**不含身份色/家族/部件索引**（`owned={id,rarity,affinity}`、`view={id,rarity,owned}`） | `render.js` L552/L582 | 须由 roster 模块挂视觉 spec（`family/parts/colorPresetId/expressionId`），或先用静态 `CRITTER_CATALOG` 兜底 |
| F6 | 零位图在代码层已成立；主包 131.53KB | `tests/smoke/build-size.gate.js` 实测 | 维持并加 CI 强制门禁 |
| F7 | 现有 159 单测断言了大量 tag（critter-/staff-label/demand/zone-label-*/hub-*/rarity 等）与「严格 roundRect radii 必须 Array」门禁 | `tests/unit/ui-state.spec.js` L392-498 | 新代码须保留这些 tag + 4 元素 radii 数组 |

> 注：`src/assembly/index.js` 的 `assembly.spec.js`（5 项）测试遗产 ATLAS/atlasDelta===0 行为；本方案不改动该文件，遗产测试继续绿。新拼装逻辑有**独立**测试文件。

---

## 2. 真实程序化部件拼装设计

### 2.1 「参数 → 绘制指令」映射数据结构

每只动物由一组**纯参数**描述（无位图字节）。数据结构（伪代码，非提交代码）：

```
CritterSpec = {
  id:            string,
  family:        'mammal' | 'bird' | 'round' | 'aquatic',   // 决定硬隔离判定的唯一家族
  parts:         { head:0..5, body:0..4, ear:0..7, tail:0..5, limb:0..2 }, // 部件库索引
  colorPresetId: 0..11,        // → 身份色（fill/shade），来自 12 套预设
  expressionId:  0..5,         // → 面部变体（6 表情）
  deform:        { headBodyRatio:2.0..3.0, scale:0.8..1.2 }, // 头身比/缩放插值（§4.4.3 规则3）
  rarity:        'N'|'R'|'SR'|'SSR',  // 仅用于 UI 卡框层，绝不进主体 fill
  accessory?:    0..7,          // 可选职业配件（围裙/厨师帽/领结/…）
}
```

**字节预算（对齐 art-bible §4.4.2 / 现有 `packAnimal`）**：family(1)+5 个部件索引(5)+colorPreset 索引(1)+expr 索引(1)+rarity(1)+headBodyRatio(1)+scale(1) = **11 字节起**；含配件/动画态可至 **≤64B**。与锁参「单只 ~11–64B」一致，且 atlas 字节恒=0（不变量#1）。

**映射路径**：`CritterSpec` → `assembleCritter(cmds, spec, x, y, r, frame, phase)` → 按 z 序 push 多个 canvas2d 图元指令（每部件一个绘制函数）。

### 2.2 程序化部件绘制函数库（全部仅用 R5 六类 op）

每个槽位索引对应一个纯绘制函数 `(cmds, {cx,cy,r,fill,shade,stroke,frame,phase,id})`，只 push `clear/rect/roundrect/circle/ellipse/text`。art-bible §10.7 已证明 roof/dome/cloud/hill/tile 均可由 `roundrect+ellipse+circle` 伪造，无 path/arc/bezier。

| 部件 | 槽位数 | 函数数组 | 索引分配（家族硬隔离依据） |
|---|---|---|---|
| 头 head | 6 | `PROC_HEADS[6]` | 0–2 哺乳圆头 / 3 鸟头 / 4 球头 / 5 鱼头 |
| 身 body | 5 | `PROC_BODIES[5]` | 0–1 哺乳胖/瘦 / 2 鸟 / 3 圆团 / 4 通用(universal) |
| 耳 ear | 8 | `PROC_EARS[8]` | 0–4 哺乳 长/圆/尖/垂/折 / 5 鸟冠羽 / 6 圆团芽耳 / 7 水族鳍耳·无 |
| 尾 tail | 6 | `PROC_TAILS[6]` | 0–2 哺乳 长/蓬松/短 / 3 鸟羽尾 / 4 圆团小尾·无 / 5 鱼尾 |
| 肢 limb | 3 | `PROC_LIMBS[3]` | 0 双足(哺乳+鸟共用) / 1 四足(哺乳) / 2 短肢·无肢·鳍(圆团+水族) |
| 面部 face | 6 | `PROC_FACES[6]` | 见 2.4 |
| 配件 accessory | 8 | `PROC_ACCESSORIES[8]` | 围裙/厨师帽/领结/头巾/眼镜/围脖/小包/碗 |

> atlas 校验：头 3+1+1+1=6 ✓；耳 5+1+1+1=8 ✓；尾 3+1+1+1=6 ✓；身 5 ✓；肢 3 ✓。**无需扩部件库**（art-bible §4.4.1）。

### 2.3 12 身份配色（移植自 DEPRECATED `COLOR_PRESETS`，**丢弃 tint/atlas**）

身份色作用于角色主体 fill + 描边同源加深；每家族绑定 4 套，跨家族不串味（§4.4.3 规则2）。水族复用圆团 4 套。

```
IDENTITY_PALETTE (12) = [
  // mammal 0..3
  {family:'mammal', fill:'#FFF1E0', shade:'#F2D9C2'},
  {family:'mammal', fill:'#F7C9D4', shade:'#E7A8B8'},
  {family:'mammal', fill:'#BEE6D2', shade:'#9BCFB4'},
  {family:'mammal', fill:'#E8C9A0', shade:'#D2AC7E'},
  // bird 4..7
  {family:'bird',   fill:'#CFE6F2', shade:'#A9CDE0'},
  {family:'bird',   fill:'#F3CBD9', shade:'#E0A9BE'},
  {family:'bird',   fill:'#D7EAC0', shade:'#B9D49B'},
  {family:'bird',   fill:'#C9C2EC', shade:'#A99FDC'},
  // round 8..11（水族复用）
  {family:'round',  fill:'#FFF7EF', shade:'#EADFCF'},
  {family:'round',  fill:'#FBE0C8', shade:'#EEC2A2'},
  {family:'round',  fill:'#E6D6F2', shade:'#CBB2E0'},
  {family:'round',  fill:'#D3E7F0', shade:'#AFCBDB'},
]
```

### 2.4 6 表情（复用同一套脸部件，参数切换，art-bible §8.4）

`PROC_FACES[6]`：开心/害羞/撒娇/满足/惊讶/睡着。每变体由`eyes/nose/mouth/blush` 的参数组合产生（眼型、嘴弧、腮红透明度）。与现有 `appendCritter` 的两点眼相比，新增眉/嘴/腮红差异，使表情「会说话」（满足 §4.2 辨识度策略③）。

### 2.5 家族硬隔离（运行时 FamilyIsolationError，不变量#2）

**移植** `src/assembly/index.js` 的隔离逻辑模型（丢弃 ATLAS/tint/ATLAS_BYTES），改为按部件库索引判定：

```
PART_FAMILY = {
  head: ['mammal','mammal','mammal','bird','round','aquatic'],
  body: ['mammal','mammal','bird','round','universal'],
  ear:  ['mammal','mammal','mammal','mammal','mammal','bird','round','aquatic'],
  tail: ['mammal','mammal','mammal','bird','round','aquatic'],
  limb: [['mammal','bird'],'mammal',['round','aquatic']],
}
slotAllowed(slotFamily, family) =
  slotFamily==='universal' ? true
  : Array.isArray(slotFamily) ? slotFamily.includes(family)
  : slotFamily===family
validateFamily(spec): 任一部件索引越界 / 不属本家族 → 抛 FamilyIsolationError
```

`assembleCritter` **第一步即 `validateFamily(spec)`**——跨家族组合在调用侧（运行时）即被拒。图鉴 🔒 剪影仍用该动物**真实家族部件**绘制（仅单色去色），隔离依旧生效（system-scene-phase2 §5.5 / §7）。

### 2.6 零贴图与字节预算证明

- 每只动物 = 0 独立贴图，仅引用「程序化部件绘制函数库」（canvas2d 矢量 + JSON 参数），atlas 字节=0。
- 新增一只动物 = 新增一组参数（~11–64B），贴图字节零增长。
- 组合空间≈5.2 万种 ≫ 所需；采用策展式固定参数组（非穷举），不扩部件库。

### 2.7 落点：新建 `src/ui/procedural-assembly.js`（不复活 legacy）

**为什么不复活 `src/assembly/index.js`**：
- 该文件头部已标 `// DEPRECATED: OP1-A pivot`，含 `ATLAS`（位图槽位 rect）、`ATLAS_BYTES=466096` 占位常量、`tint` 逻辑——与零贴图不变量#1 与 art-bible §10.9 Q1 直接冲突；复活它会重引叙事矛盾。
- 其 `assembly.spec.js` 测试遗产行为（`atlasDelta===0` 依赖 `ATLAS_BYTES` 常量），保留该文件不动即可让遗产测试继续绿。
- 真实拼装产出的是**绘制指令**（视图关注点），天然属于渲染层；新建聚焦模块更易单测、不污染遗产。

**新建模块导出（设计）**：`PROC_HEADS/BODIES/EARS/TAILS/LIMBS/FACES/ACCESSORIES`、`IDENTITY_PALETTE`、`PART_FAMILY`、`slotAllowed`、`FamilyIsolationError`、`validateFamily`、`assembleCritter`、`resolveCritterSpec(id)`（从 `CRITTER_CATALOG` 或 roster 视觉 spec 解析）。
- `CRITTER_CATALOG`：36 首发动物参数表（数据，纯 JSON，≈36×≤64B≈2–3KB），可置于 `src/config/critters.js`；roster 模块落地后改为读 `roster.owned()` 的视觉字段（见风险 R-P2-1）。

**涉及函数改动**：
- 新增 `src/ui/procedural-assembly.js`（全部纯函数，零 wx/canvas）。
- `render.js`：`appendCritter` 被 `assembleCritter` 取代；`buildRestaurant/buildHub/buildLounge/buildRoster` 的 critter 调用改为传 `CritterSpec` 而非单一 `fill`。

---

## 3. 分层 fill 修正方案（R3）

### 3.1 违规点定位

- `render.js` L561（`buildLounge`）：`appendCritter(cmds, { ..., fill: RARITY_COLORS[o.rarity] || '#888888', ... })`
- `render.js` L592（`buildRoster`）：`appendCritter(cmds, { ..., fill: RARITY_COLORS[e.rarity] || '#888888', ... })`
- `render.js` L112-113（`appendCritter`）：`fill: o.fill` 同时用于身体 `roundrect` 与双耳 `circle` → 稀有度色被涂满角色本体。

这违反 art-bible §7.2 护栏：「身份色（角色填充，来自 12 配色预设）与稀有度色（卡框条/角标）分属不同 UI 层，避免撞色」。

### 3.2 修正原则

- **身份色在角色本体绘制层**：critter 主体 `fill` 一律取自 `IDENTITY_PALETTE[colorPresetId].fill`（12 身份配色），**绝不**用 `RARITY_COLORS`。
- **稀有度色仅在 UI 卡框层**：只出现在 (a) `roster-rarity-bar`（卡顶稀有度条）、(b) 抽卡 `rarity` chip（`appendGachaResult`，正确）、(c) 可选 SSR 卡框描边（框层，非角色层）。
- **无 shader tint**：所有 fill 为 `applyCommands` 中的平涂 `fillStyle`，无运行时着色器（R5 契约本就不含 tint）。

### 3.3 分图层绘制（push 顺序即图层）与改法

`cmds` 数组按序执行，故「图层」= push 次序。同一函数内：
1. 先 push 软阴影 ellipse（`critter-shadow`，最底）；
2. 再 body+limb（z0）→ head+ear+tail（z10/11）→ face（z12）→ accessory（z20）；全部用**身份色**；
3. 角色层结束。
4. **UI 卡框层在 build* 函数中、critter 之后**单独 push：`roster-rarity-bar`（稀有度色）/ 卡框描边 / 名签等——与角色层物理分离。

**涉及函数改动**：
- `appendCritter` → `assembleCritter`：入参 `fill` 改为 `colorPresetId`（或 `identityFill`）；内部从 `IDENTITY_PALETTE` 取身份色。
- `buildLounge` L561、`buildRoster` L592：停止传 `RARITY_COLORS[...]`；改为 `resolveCritterSpec(o.id).colorPresetId` → 身份色。
- `buildRoster` L593：`roster-rarity-bar` 增加 §7.2 **双编码**（颜色+形状角标：N=圆点/R=单钻/SR=双钻/SSR=星冠 + 纹理），色盲安全、与身份色不撞（art-bible §7.2 护栏）。
- 其余调用方（`buildRestaurant` 员工/顾客 L623/L645、`buildHub` L280、`buildGachaMarket`）现传 `ROLE_COLORS`（岗位身份色，符合 art-bible R3「角色层岗位区分」）——保留，但统一改走身份色路径以保证一致性；`ROLE_COLORS` 仍为非锁、非稀有的渲染层常量。

---

## 4. 三区场景绘制替换占位方案

### 4.1 餐厅三区（迎宾/就餐/后厨，§10.5(a)）

当前 `buildRestaurant` 已是三区 roundRect + 标牌 + 员工/顾客 + pot/flame 占位。替换为：
- **迎宾区**：暖木 `#D9A878` 框 + 招牌（🏠/迎宾牌）；host critter（带「迎宾牌」配件）立于门口；排队顾客需求气泡（`drawCustomerBubble` 保留）。
- **就餐区**：每位绘制圆桌（roundRect 桌面 + ellipse 坐垫 `#A9D8A0`）+ 落座顾客 critter（`assembleCritter`，用其真实 spec）+ waiter critter；暖吊灯（circle + **伪造光晕**：2–3 层半透明 ellipse，因无 gradient op）。
- **后厨区**：chef critter + 锅（roundRect，保留 `pot` tag）+ 火苗（ellipse，保留 `flame` tag）+ 货架（roundRect 网格，暖木框）。
- **保留 tag**：`zone-label-welcome/dining/kitchen`、`seat`、`pot`、`flame`、`staff-label`、`demand`、`demand-text`、`float`、`hud`、`button`/`button-label`（双入口解锁按钮）。

### 4.2 HUB 中枢地图（§10.4 cozy overworld）

当前 `buildHub` 画天空 rect + 远山 ellipse + 4 区域 roundRect + critter。替换为星露谷 cozy 地图：
- **地面**：草坡绿 `#A9D8A0` 圆角 tile 网格（roundRect + 留白）+ 小径（圆角长 roundRect `#E8D2B0`）。
- **天空**：2–3 层堆叠 rect 伪造垂直渐变（`#CDEAF2`→`#FBE3D2`）+ 云（circle cluster）+ 远山（ellipse cluster）。
- **4 区域节点**：每节点 = 小屋/摊位（roundRect 主体 + 屋顶：两块渐缩 roundRect 叠坡面 或 ellipse 穹顶 + 暖木描边 + 招牌图标 🏠/📦/🐱/🎴）。
- **几何/命中不变**：`getHubRegions`/`hitHubRegion` 完全不动（测试 pin 了 label/lock/clickable）；仅升级 `appendHubRegion` 的绘制。
- **保留 tag**：`hub-region`、`hub-locked`、`hub-locked-label`、`hub-title`、`hub-sky`、`hub-hill`、`critter-*`。视差属 `game.js` 运行时，本层纯函数不处理。

### 4.3 Phase2 室内（仓库/撸毛馆/图鉴，§10.5(b)(c) + §5.5）

- **`buildWarehouse`**（§10.5(b) 冷调）：货架（roundRect 网格 + 暖木 `#D9A878` 框）、资源罐（roundRect + ⭐/🍖/💎/🔷 文字图标）、进度条（暖橘 `#FF9E68` 圆角条）；薄荷绿+雾霾蓝冷调。保留 `warehouse-title`/`hud`/`warehouse-dish-count`/`warehouse-next-cost`/`warehouse-insufficient`/`button`/`button-label`。
- **`buildLounge`**（§10.5(c) 奶茶暖调）：沙发/猫爬架（roundRect+ellipse 软垫 `#F3E2C7`）、窗（roundRect + 伪造天光）、critter 按网格 `assembleCritter` 陈列（身份色，见 §3）、好感度文本。保留 `lounge-title`/`button-label`(图鉴)/`critter-body`(`^lounge-`)/`lounge-affinity`/`lounge-empty`。
- **`buildRoster`**（§5.5）：每卡 = roundRect 卡框（r 28–32，双层描边）+ 顶稀有度条（§7.2 双编码）+ `assembleCritter` 立绘 + 名签；🔒 = 同卡框但 `assembleCritter` 用单色 `#3a3a4a` 去色（保留真实家族部件形状，隔离仍生效）+ 「?」角标。保留 `roster-title`/`roster-owned-label`/`roster-rarity-bar`/`roster-locked-mark`(?)。

### 4.4 涉及文件与保留 tag 清单

| 文件 | 动作 |
|---|---|
| `src/ui/procedural-assembly.js` | **新建**：部件库 + 12 预设 + 6 表情 + 家族隔离 + `assembleCritter` + `resolveCritterSpec` |
| `src/ui/render.js` | `appendCritter`→`assembleCritter`；升级 `appendHubRegion`/`buildRestaurant` 三区/`buildWarehouse`/`buildLounge`/`buildRoster`；分层 fill 修正（§3.3） |
| `src/config/critters.js` | **新建（可选）**：`CRITTER_CATALOG` 首发 36 参数（roster 落地前兜底） |
| `src/roster.js` | 为 owned/catalog 条目挂视觉 spec（`family/parts/colorPresetId/expressionId`）——依赖 R-P2-1 |
| `src/config/tunables.js` | **不改动 LOCKED**；如需新 UI 常量（如区域色）优先放进 `render.js` 的 `THEME`（已存在），避免新增 tunable |
| `tests/unit/procedural-assembly.spec.js` | **新建**：隔离抛错、12 预设、部件 draw 发 `critter-*` tag、≤64B |
| `tests/unit/ui-state.spec.js` | 现有 159 项须保持绿（不删不改既有断言） |

---

## 5. 风险与门禁

### 5.1 零位图门禁（不变量#1）

- **Gate A（已有）**：`tests/smoke/build-size.gate.js` 实测 134,685 B ≈ 131.53 KB < 4MB，CI 硬阻断。本任务新增均为 JS（部件函数极小 + catalog ≈2–3KB），体积可忽略。
- **Gate B（建议新增 CI）**：断言 `src/ui/**` 不含 `drawImage`/`createImage`/`wx.createImage`/`loadImage`/`new Image`/`.png`/`.jpg`。当前已干净，落成强制门禁即「atlas 字节恒=0」的构造性证明。

### 5.2 ≤4MB 门禁

当前 **131.53 KB**，余量 ≈ 3.87 MB。新增 `procedural-assembly.js` + `CRITTER_CATALOG` 字节 negligible。以 `build-size.gate.js` 为硬门禁，合并前必跑。

### 5.3 159 单测不回归

**硬约束：保留以下被既有测试断言的 tag 词汇表**（来自 `tests/unit/ui-state.spec.js` 与 `assembly.spec.js`）：

- critter 类：`critter-shadow`(ellipse) / `critter-body` / `critter-ear` / `critter-eye`（L362-364 明示断言存在）；新增 `critter-head`/`critter-tail` 但不移除既有。
- 餐厅/导航：`staff-label`、`demand`、`demand-text`、`float`、`hud`、`button`、`button-label`、`rarity`、`rarity-text`、`gacha-result-label`。
- HUB：`hub-region`、`hub-locked`、`hub-locked-label`、`hub-title`、`hub-sky`、`hub-hill`。
- 三区：`zone-label-welcome`/`zone-label-dining`/`zone-label-kitchen`、`seat`、`pot`(roundrect)、`flame`(ellipse)。
- Phase2：`warehouse-title`/`warehouse-dish-count`/`warehouse-next-cost`/`warehouse-insufficient`、`lounge-title`/`lounge-empty`/`lounge-affinity`(含 `A n/100`)、`roster-title`/`roster-owned-label`/`roster-rarity-bar`/`roster-locked-mark`(?)。
- 严格 roundRect 门禁（L392-498）：所有 `roundrect` 指令的 radii **必须 4 元素数组**（`applyCommands` 已强制 L807-809）；新代码不得破坏。

**遗产 `assembly.spec.js`**：测试 `src/assembly/index.js` 的 `atlasDelta===0`/`validateFamily`——本方案不改动该文件，故继续绿；新模块有**独立** `procedural-assembly.spec.js`。
**回归协议**：合并前 `npx jest` 须全绿（当前基线 159 passed / 159 total），且新增测试随 PR 增长。

### 5.4 锁参零改动（红线表 + 引用纪律）

本任务为**纯视觉/render 层**，不触碰任何经济/抽卡/离线数学。下列锁参/冻结项**一律不可动**，新代码只从 `src/config/tunables.js` 读取（如 `render.js` L25 已做的 `require('../config/tunables')`），**绝不硬编码魔法数**：

| 类别 | 冻结值 |
|---|---|
| 离线 | `LOCKED.OFFLINE_FACTOR = 0.20`、`LOCKED.T_CAP_INIT = 14400` |
| 稀有度档 | 仅 `N/R/SR/SSR` 四档 |
| 抽卡出率 | `GACHA_R=0.60 / GACHA_SR=0.30 / GACHA_SSR=0.10 / GACHA_N=0.0`（N 不入池） |
| 保底 | `PITY_HARD=50`、软保底阶梯 `SSR_SOFT_START/END/STEP/OFFSET`、`TEN_PULL_SR_GUARANTEE`、`NEWBIE_FIRST10_SR`/`GACHA_NEWBIE_PULLS` |
| 成本/碎片 | `GACHA_COST_*`、`GACHA_SHARD_*` |
| 四货币 | 星券/钻石/食材/碎片——不新增货币/资源；菜品解锁成本用 `TUNED.UNLOCK_COST_*`（沿用，不引新资源） |
| HUB 门槛 | `TUNED.WAREHOUSE_UNLOCK_DISH_COUNT=3`、`TUNED.LOUNGE_UNLOCK_ROSTER_COUNT=6`（TUNED 非 LOCKED，但 GDD §1 要求全程不重开，本任务冻结） |

**守卫**：新增视觉常量优先放入 `render.js` 的 `THEME`（已对齐 §3.1/§10.3），不进 `tunables`；CI 加 grep 拦截在 `src/ui/**` 出现上述已知锁参数值的字面量（或人工 review 门）。

### 5.5 其他风险

| # | 风险 | 化解 |
|---|---|---|
| R-P2-1 | `roster` 模块未落地（system-scene-phase2 §9），owned 条目无视觉 spec | Phase B1 先用静态 `CRITTER_CATALOG` 兜底；roster 落地后改读其视觉字段。**B1 可独立交付** |
| K-NoGradient | `applyCommands` 无 gradient op（R5 契约） | 吊灯/天空渐变用堆叠半透明 ellipse/circle 伪造；若确须真渐变，须先由 engineering-lead 扩展 `applyCommands` 加 `gradient` op（art-bible §10.7 K-EXT），再回流美术 |
| §10 待复核 | art-bible §10 标注 `pending review`，含开放 Q1/Q2/Q3/Q5 | Q1（deprecate assembly）本方案即采纳；Q5 选**平视 cozy**（最低实现成本）。方案以 §10 方向为准，待主编复核后微调 |
| 遗产 assembly | `src/assembly/index.js` 头部仅标 DEPRECATED，未指向新模块 | Phase B4 加一行注释指向 `procedural-assembly.js`（**注释级改动，非 Phase A 范围**） |

---

## 6. 建议分阶段落地顺序

> 任务示例顺序为「先角色拼装→再场景→再分层 fill 修正」。下方为**推荐顺序**，理由见每条。

- **Phase A（本任务）**：仅出方案，不写代码。✓ 本文档。
- **Phase B1 — 角色拼装先行（地基）**：实现 `procedural-assembly.js`（部件库 + 12 预设 + 6 表情 + 家族隔离 + `assembleCritter`）+ `CRITTER_CATALOG`；将 `buildRestaurant/buildHub/buildLounge/buildRoster` 的 critter 调用切到 `assembleCritter`，**保留 critter-* tag** → 159 测试绿；新增 `procedural-assembly.spec.js`。*一切场景/场馆都依赖真实 critter 绘制器，故最先做。*
- **Phase B2 — 分层 fill 修正（小且高价值）**：停止把稀有度色涂角色本体；身份色上角色层、稀有度色仅留卡框条/抽卡 chip；`roster-rarity-bar` 加 §7.2 双编码形状角标。*因 B1 已把身份色贯通 critter，此时修正成本极低；早做可避免新场景也带上「稀有度涂身」错误。*
- **Phase B3 — 三区场景替换（视觉丰富）**：升级 `appendHubRegion`（cozy 地图）、餐厅三区、仓库/撸毛馆/图鉴室内（§10.5/§10.7）；保留全部既有 tag。
- **Phase B4 — 动画与可达性打磨**：眨眼/表情细化、`reduce-motion` 关动效留定帧、伪造光晕渐变、♿ 双编码补全、给 legacy `assembly/index.js` 加 DEPRECATED→新模块指向注释。

**与任务示例顺序的差异说明**：示例「角色→场景→分层fill」亦可接受；本方案推荐 B1→B2→B3，是因为 B2 在 B1 之后几乎零成本，而延后至场景之后再做会有把「稀有度涂身」带进新场景的风险。若主理人偏好示例顺序，B2 可并入 B3 之后，仅需注意先清掉 `buildLounge/buildRoster` 的 `RARITY_COLORS` 入参。

---

## 7. 开放问题 / 待主理人裁决

1. **Q-a**：`roster` 模块未落地（R-P2-1），Phase B1 是否接受「静态 `CRITTER_CATALOG` 兜底」先行交付？还是等 roster 落地再接？建议：兜底先行，不阻塞。
2. **Q-b**：art-bible §10 仍 `pending review`（含 Q1/Q5）。本方案按 §10 方向（平视 cozy、deprecate legacy assembly）设计；若主编复核后调整视觉方向，方案对应小节需回滚修订。
3. **Q-c**：`buildLounge` 当前用 `ROLE_COLORS`（岗位身份色）作 critter fill，是否符合 art-bible R3「角色层岗位区分」？建议保留并统一走身份色路径；如主编要求 lounge 改用动物自身 12 身份色，则 B1 须先拿到每只动物的 `colorPresetId`（依赖 Q-a）。
4. **Q-d**：是否需要 engineering-lead 同步回退 `docs/architecture/tech-prototype.md` 的 ADR-1/ADR-2（仍写 Cocos+位图 atlas+shader tint）以与 OP1-A 对齐？本任务范围不含该文件，但 art-bible §10.0/§10.9 Q1 建议处理；建议单独立项。

---

*（本文档为 Phase A 纯方案，未修改 `src/` 任何文件、未执行 `git commit/push`。所有代码示例均为数据结构/伪代码说明，非提交代码。）*
