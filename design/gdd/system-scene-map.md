# 系统 GDD · 场景 / 导航架构（Scene & Navigation Architecture）

> 版本 v0.1 ｜ 负责人 design-strategist（文策渊）｜ 状态 **待复核（draft for lead review）**
> 对齐基线：concept-doc.md（支柱/MDA/范围）｜ system-idle-restaurant.md v0.2 ｜ system-gacha.md v0.1.1 ｜ system-cultivation.md v0.1.1 ｜ phase2-consistency/balance ｜ art-bible.md v0.3（视觉/可达性）｜ 现有 E7 渲染入口（`buildScene`/`applyCommands`/`hitGachaButton`，`game.js` 注释确认：微信原生 `wx.createCanvas()`+`getContext('2d')`，不引入 Cocos）
> **锁参不可重开（全程遵守）**：稀有度 R60/SR30/SSR10、N 不入池、50 抽硬保底、十连≥1SR、新手前 10 抽≥1SR（见 concept-doc §7.1 与 art-bible §7.2 主理人一致性裁定）；offline_factor=0.20；双货币隔离（星券=免费 idle 唯一源，钻石=付费 IAP 不进 idle）；四货币（星券/钻石/食材/碎片）。
> **4 项已确认设计决策全程遵守**：①顾客带「想吃的菜」上门、未解锁不可服务；②菜品解锁资源=星券+食材（不引新资源）；③员工分厨师/服务员/接待三岗；④服务=被动基础结算+玩家主动派遣/点击加成。

---

## 0. 文档定位、依据与重大冲突披露

本文档定义「治愈系小动物餐厅」从 **E7 单屏** 升级到 **多场景** 的导航/UX 结构：最外层「主菜单地图」（中枢 overworld）+ 四个功能场景（餐厅 / 仓库 / 员工休息区 / 动才市场）。本 spec **只定义 UX 结构与状态路由，不引入任何新经济、新货币、不改动抽卡概率或菜品解锁数学**，仅把既有模块（restaurant / gacha / ledger / roster）以「中枢=router、场景=view（只读快照）」的方式重新编排。

### 0.1 ⚠️ 待 lead 裁决的跨文档硬矛盾（程序化资产范式冲突）

| 来源 | 表述 | 与本 spec 简报之冲突 |
|---|---|---|
| **本任务简报**（用户）+ **E7 `game.js`** | 「微信原生 canvas（不用 Cocos）」；「程序化零贴图：atlas 永远不增长（不加任何位图）；所有视觉是运行时 canvas 2d 程序化图元绘制」；`game.js` 注释「不引入 Cocos / 引擎」「`wx.createCanvas()`+`getContext('2d')`」 | ——（本 spec 依此撰写） |
| **`tech-prototype.md` ADR-1（LOCKED）** | 引擎=Cocos Creator+微信引擎插件 | ❌ 与本简报「不用 Cocos」直接冲突 |
| **`tech-prototype.md` ADR-2 / `art/art-bible.md` §A.1–A.5** | 单张 base-parts **PNG/WebP atlas** + WebGL **着色器 tint** + **Spine** 骨骼 | ❌ 与「零位图、canvas 2d 程序化图元」直接冲突 |

**结论与处置**：本 spec 严格按**用户简报 + E7 实装**（微信原生 2d canvas、零位图、程序化图元）撰写。视觉身份部分（art-bible §3 配色 / §4 角色语言 / §7 稀有度双编码 / §9 可达性）**完全复用、不受冲突影响**。但 art-bible §A（资产附录：PNG atlas / ASTC / Spine / 着色器 tint）与 tech-prototype ADR-1/ADR-2 的「Cocos + 位图 atlas + shader tint」表述**须由 程基岩（技术）/ 林绘澄（美术）据此修订或确认项目已 pivot 离 Cocos**。本 spec 将其解释为：所谓「base-parts atlas」在零位图范式下 = **一套程序化部件绘制函数库**（canvas 2d 矢量原语 + JSON 参数），家族硬隔离护栏照常在绘制调用层生效（见 §5）。**此冲突列为本文档头号开放问题（见 §8-OP1）**。

### 0.2 对既有 UX 规格的影响（navigation 模型取代）

既有 `design/ux/spec.md` §1.1 采用「主菜单浮层（☰）+ 底部 4 Tab（餐厅/抽卡/图鉴/商店）」。本 spec 的「中枢 overworld 地图 + 4 场景区域」**在导航模型上取代** UX spec §1.1 的 Tab Bar 方案，并重新映射：

| UX spec §1.1 Tab | 本 spec 场景 | 变化 |
|---|---|---|
| 餐厅 | 餐厅（RESTAURANT） | 同名，升级为多场景之一 |
| 抽卡 | 动才市场（GACHA_MARKET） | 改名（动才玩梗），本质同 |
| 图鉴 | 员工休息区（STAFF_LOUNGE / 猫咖） | 图鉴=已拥有角色陈列（猫咖），可含「图鉴子页」含🔒未拥有 |
| 商店（IAP） | **无独立节点** | ⚠️ 见 §8-OP2：IAP/钻石 获取入口待定 |

> UX spec 其余章节（核心流程、交互模型、可达性、反馈节奏）与本 spec 不冲突，继续有效；仅 §1.1 导航模型以本 spec 为准，需随后修订 UX spec。

---

## 1. 最外层「主菜单地图」（中枢 / Overworld）

### 1.1 定位与职责

- **中枢 = 纯导航外壳（router）**：负责 4 个场景入口的呈现与切换，**不持有任何玩法状态**，仅渲染只读快照（顶部货币 HUD 读 `ledger.snapshot()`，可选「新动物？」红点读 `roster` 增量）。
- **画风**：星露谷（Stardew Valley）cozy 风，但**全部以 canvas 2d 程序化图元绘制**（见 §5），无位图。一眼可辨的「毛茸茸街角小镇」。
- **入口**：首启着陆即中枢；任意场景内「回动才村」按钮回到中枢。中枢本身**不是玩法模块**，是地图。

### 1.2 地图布局（程序化绘制，4 区域 + 主路径）

```
                    ☁ 程序化渐变天空（暖色晨光）
          🌿 远山（2 层视差，圆角色块+渐变）         🌳 树（圆角团块）
   ┌───────────────────────────────────────────────────────────┐
   │          [ 撸毛馆 ]●                         ●[ 动才市场 ]      │   ← 左上：员工休息区(猫咖)
   │             (猫咖暖屋)                        (集市帐篷)        │      右上：动才市场(抽卡)
   │                                                              │
   │   ╭──────── 蜿蜒小径（圆角 path，暖棕描边）────────╮          │
   │   │                                                │          │
   │ [ 囤囤仓 ]●                              ●[ 暖爪餐厅 ]          │   ← 左下：仓库(只读展示)
   │   (圆木仓)                                (小屋+招牌+绿植)       │      右下：餐厅(主界面)
   │                                                │          │
   └───────────────────────────────────────────────────────────┘
                     🐾 玩家代表（可选小足迹光标）
       顶栏 HUD：⭐星券 N ｜ 💎钻石 N ｜ 🍖食材 N ｜ 🔷碎片 N（只读）
```

- 4 区域各为一个**大号圆角热区（≥88×88 设计像素，远超 44×44 下限）**，点击命中即切场景。
- 每个区域用 1 栋程序化建筑 + 1–2 个程序化道具（树/招牌/帐篷）表达，控制原语数量（见 §5 预算）。
- 区域内可放 1 只程序化小动物在门口「迎宾」（复用角色绘制库），仅装饰、不交互（或点一下触发轻 haptic，非必需）。

### 1.3 中枢渲染（复用 E7 契约）

- 新增 `buildHub(state)` 纯函数，与 E7 的 `buildScene` 同契约：输入只读快照 → 输出绘制指令 → `applyCommands(ctx, cmds)` 落 2d 上下文。
- `state` 仅含：`ledger.snapshot()`（货币 HUD）、`navigationState`（当前高亮区，可选）、`rosterCount`（新动物红点）。**无玩法写操作**。
- 中枢不跑经营循环；进入餐厅后经营才推进（模块状态独立于 UI，见 §3）。

---

## 2. 四个场景及其功能（复用既有模块，不重复造轮子）

> 通用契约：每个场景 = 一个 `build<Scene>(snapshot)` 纯函数（扩展 E7 `buildScene`）。场景**只读**模块快照渲染；写操作经既有模块 API（restaurant / gacha / ledger / roster / cultivation）触发，UI 无状态。

### 2.1 餐厅（RESTAURANT）—— 主界面

- **定位**：核心循环主舞台（顾客→服务→结算→解锁），P2「经营」支柱兑现点。占比最高频。
- **复用模块**：**E7 单屏 `buildScene(state)` 渲染器直接升级为本场景**（加中枢切换 + 店外/店内/厨房子视图淡入，沿用 UX spec §4.3）。读取 `restaurant` 对象、`ledger`。
- **读取（只读快照）**：`restaurant.getIeff()`、`restaurant.schedule.onDutyRoles()`、`restaurant.getUnlockedDishes()`、`restaurant.getStaff()`、`matchServiceable(c, {unlockedDishes, onDutyRoles})`（顾客可服务判定）、`ledger.snapshot()`、`customers`。
- **写操作（调用既有 API，UI 不持有状态）**：`restaurant.serve(customer, dt, reqId)`（被动结算）、升级三分支（`seat`/`station`/`recipe` upgrade，耗星券）、`restaurant.schedule.assign(id, role)`（三岗上岗，决策③）、「加把劲」主动加成（决策④）、`dishUnlock`（耗星券+食材，决策②）。
- **与锁参/4 决策一致性**：完全沿用 idle-restaurant GDD v0.2；本 spec 不改 I_eff / offline_factor / 解锁成本 / 三岗公式。详见 §4。
- **边界**：满座占位不产出、无惩罚；顾客需求未解锁仅提示解锁（决策①）；零动物时 5 只 N 自动上岗。

### 2.2 仓库（WAREHOUSE / 囤囤仓）—— 只读资源 / 进度展示

- **定位**：纯展示面板，**零交易、不引入新经济**。`design-strategist` 红线：只读。
- **复用模块**：读 `ledger`（四货币）、`restaurant.getUnlockedDishes()` + 全菜品目录（含解锁成本/进度）、`roster`（拥有数/碎片汇总）。**无新逻辑、无新状态**。
- **读取（只读快照）**：四货币总量（星券/钻石/食材/碎片）、食材库存、菜品解锁状态（已解锁列表 + 锁定列表 + 各自 `unlock_cost_star(n)`/`unlock_cost_food(n)` 进度，见 idle §3.5）、各货币总量、抽卡碎片数（按动物汇总）。
- **子页签（Tab，纯切换展示）**：`食材` / `菜品` / `货币` / `碎片`。
- **写操作**：**无**。解锁动作仍在餐厅触发；仓库仅显示进度。
- **与锁参/4 决策一致性**：展示四货币但不新增货币（锁参四货币不破）；展示菜品解锁进度但不改解锁数学（决策②）；不展示/不提供任何购买。✓
- **边界**：数值仅从 ledger/roster 快照渲染；弱网时显示上次快照并标注「同步中」，不本地改写。

### 2.3 员工休息区（STAFF_LOUNGE / 撸毛馆）—— 已抽角色陈列 + 互动（猫咖 / 基建风）

- **定位**：已拥有动物的「图鉴/角色库」+ 互动空间（明日方舟基建风 × 猫咖可爱布局）。即原 UX spec 的「图鉴」模块。
- **复用模块**：读 `roster`（拥有动物：id/稀有度/等级/羁绊阶层/星数/碎片/适配岗）、`gacha`（按动物碎片）、`cultivation`（加成读数）；互动调用 `cultivation` 的 feed/gift/assign 与 `restaurant.schedule.assign`（上岗，决策③）。角色绘制复用餐厅员工同一套程序化绘制库。
- **读取（只读快照）**：`roster.owned()`（含 bond 阶层/level/star/affinityRole/assignedRole）、`gacha` 碎片总数、`cultivation` 加成（idle+3%/碎片+10%/T_serve-5%）。
- **写操作（经既有 API）**：「喂一口」(`cultivation.feed`，耗食材)、「送礼物」(`cultivation.gift`，每日上限)、「派去上班」(`restaurant.schedule.assign`，决策③)、「升星」(碎片足够时 `cultivation.starUp`)。
- **布局（猫咖/基建风）**：网格/散座式陈列已拥有动物，每只一个「软垫工位」；点击动物弹【动物详情 Modal】（覆盖层，非场景切换，沿用 UX spec §1.1/§2.4）。可含「图鉴子页」展示🔒未拥有剪影（对齐 UX spec §4.4）。
- **与锁参/4 决策一致性**：仅展示已拥有（图鉴去重，gacha §4）；N 5 只基础动物在此陈列但不来自抽卡池（锁参 N 不入池 ✓）；升星用抽卡碎片（gacha §3.4），不改阈值；上岗三岗（决策③）。✓
- **边界**：未拥有动物不在此主区（仅在图鉴子页以🔒呈现）；羁绊满级喂食转 XP（cultivation §4）；升星碎片不足置灰。

### 2.4 动才市场（GACHA_MARKET / 动才市场）—— 抽卡入口

- **定位**：P1「收集」兑现点。名字 = 「人才市场」玩梗（动才 = 动物人才）。**唯一随机来源**。
- **复用模块**：复用 E7 `gacha` 引擎 + `hitGachaButton`（扩展为单抽/十连/免费三命中区）+ 抽卡演出逻辑；读 `gacha.getPity()`、`ledger`。
- **读取（只读快照）**：`gacha.getPity()`（距保底 X/50）、概率常量（R60/SR30/SSR10，N0%）、`ledger.snapshot()`（星券/钻石）、新手前 10 抽标记。
- **写操作（经既有 API）**：`gacha.drawSingle({requestId, currency})` / `gacha.drawTen(...)`（现有，锁参：十连≥1SR、50 保底、新手前 10≥1SR 全在引擎内，本 spec 不碰）；结果经 `onGachaResult` 回写 `ledger` + `roster`。
- **关键按钮（命名见 §6）**：「招一只」(100⭐/💎) / 「招十只」(900⭐/💎, 9 折) / 「免费招一次」(每日 1，计入 pity) / 货币切换「用星券 / 用钻石」/ 合规折叠入口「抽卡说明」(R60/SR30/SSR10 + 50 保底明示，微信合规)。
- **演出**：抽卡揭示 = 全屏 Overlay（非新场景），复用 UX spec §2.3 / art-bible §8.3；SSR 全屏彩带可关、可跳过。
- **与锁参/4 决策一致性**：本场景**仅调用既有 gacha 引擎**，不改变任何概率/保底/货币消耗。✓
- **边界**：货币不足按钮置灰（gacha §4）；弱网不扣费、可补偿；免费抽以服务端 UTC+8 0 点重置。

---

## 3. 导航 / 状态路由模型

### 3.1 核心原则

- **中枢 = router，场景 = view（只读快照）**。UI 不持有任何玩法状态；所有状态归模块（restaurant / gacha / ledger / roster / cultivation）。
- 扩展 E7 单渲染循环：`buildScene` 升级为按 `navigationState.scene` 分发的纯函数族（`buildHub` / `buildRestaurant` / `buildWarehouse` / `buildStaffLounge` / `buildGachaMarket`），统一经 `applyCommands(ctx, cmds)` 落地；触摸命中经扩展后的 `hitZone(x,y,...)` 判定（沿用 `hitGachaButton` 思路）。

### 3.2 状态归属与读取映射（模块 → 场景）

| 状态所有者（模块，持有状态） | 被读取的场景 | 读取方式（只读快照） |
|---|---|---|
| `ledger`（四货币单值源） | 中枢 HUD / 餐厅 / 仓库 / 动才市场 | `ledger.snapshot()` |
| `restaurant`（座位/升级/三岗/已解锁菜/I_eff/顾客） | 餐厅 / 仓库（菜品进度） | `getIeff()` / `schedule.onDutyRoles()` / `getUnlockedDishes()` / `getStaff()` / `matchServiceable()` |
| `gacha`（pity/概率/抽卡） | 动才市场 | `getPity()`（概率=常量，不读） |
| `roster`（拥有动物/碎片/升星） | 员工休息区 / 中枢红点 / 仓库（碎片汇总） | `roster.owned()` / 碎片汇总 |
| `cultivation`（好感/羁绊/加成） | 员工休息区 | 加成读数（只读） |

> **依赖提示**：E7 `game.js` 目前**未显式实例化 `roster` 对象**（员工 inline 创建于 `buildWorld`）。STAFF_LOUNGE/图鉴 依赖一个持久化「拥有动物注册表」`roster`，其数据由 `gacha.onGachaResult` 与 5 只 N 新手动物写入（concept-doc §2.1(7)、gacha §4 去重）。**若 `roster` 尚未作为独立模块落地，STAFF_LOUNGE 需其先行**（开放问题 §8-OP3）。

### 3.3 导航状态（设计层 schema，非代码）

```
NavigationState = {
  scene: 'HUB' | 'RESTAURANT' | 'WAREHOUSE' | 'STAFF_LOUNGE' | 'GACHA_MARKET',
  prev:  <scene> | null,            // 用于「回动才村」/ 场景间返回
}
UIOverlay = {                         // 覆盖层，不视为场景切换
  type: null | 'animalDetail' | 'gachaReveal' | 'dishUnlock',
  payload: {...}                       // 如 animalId / gachaResult / dishId
}
```

- 切场景：`tapZone(zone) → NavigationState.scene = zone`。
- 回中枢：任意场景「回动才村」→ `scene='HUB'`。
- 覆盖层：动物详情 / 抽卡演出 / 解锁提示 = `UIOverlay`（画在当前场景之上），`NavigationState.scene` 不变，底层场景继续渲染但暂停交互。

### 3.4 渲染循环（扩展 E7）

```
每帧:
  state = { navigation: NavigationState,
            hub:      NavigationState.scene==='HUB'      ? buildHubSnapshot(ledger, roster) : null,
            restaurant: NavigationState.scene==='RESTAURANT' ? buildRestaurantSnapshot(restaurant, ledger) : null,
            warehouse:  NavigationState.scene==='WAREHOUSE'  ? buildWarehouseSnapshot(ledger, restaurant, roster) : null,
            lounge:     NavigationState.scene==='STAFF_LOUNGE' ? buildLoungeSnapshot(roster, gacha, cultivation) : null,
            market:     NavigationState.scene==='GACHA_MARKET' ? buildMarketSnapshot(gacha, ledger) : null,
            overlay:    UIOverlay }
  cmds = dispatchScene(state)          // 依 scene 调对应 build<Scene>，再叠加 overlay 指令
  applyCommands(ctx, cmds)
```

- 模块状态（restaurant 挂机、ledger）**独立于 UI 存活**：切到仓库/市场时餐厅仍在后台累积（离线/挂机公式在模块内），回餐厅即见最新收益，符合「被照顾」治愈内核。

### 3.5 导航边界与异常

- **抽卡演出 overlay 期间**：中枢/区域点击禁用，仅「跳过/继续」可点（对齐 UX spec T5）。
- **动物详情 Modal 期间**：底层场景暂停交互、继续渲染。
- **离线收益回归**：进入餐厅前先「收菜」（RESTAURANT 收菜激励），或中枢顶部提示；切场景不重复触发领取。
- **弱网/断线**：抽卡服务端权威，本地仅演出；切场景不丢结果（已写 ledger/roster）。
- **零动物**：餐厅 5 只 N 自动上岗；员工休息区至少陈列 5 只 N。
- **货币不足**：动才市场按钮置灰（gacha §4），不发起请求。
- **reduce motion**：所有场景 idle/粒子/彩带可关（art-bible §8、§9）。
- **返回中枢不丢场景状态**：因模块状态独立于 UI。

---

## 4. 跨 GDD 一致性（锁参 + 4 决策合规）

> 场景地图只是 UX 结构，**不得引入新经济、新货币、改动抽卡概率或解锁数学**。逐项核对：

| 锁定项 / 决策 | 落点场景 | 本 spec 处理 | 结论 |
|---|---|---|---|
| R60/SR30/SSR10 | 动才市场 | 仅「抽卡说明」展示 + 调既有引擎；**不改** | ✓ |
| N 不入池 | 动才市场(不提供) / 员工休息区(陈列 N 基础) | 市场永不摇 N；休息区仅展示已拥有 N | ✓ |
| 50 抽硬保底 | 动才市场 | 读 `gacha.getPity()` 展示；保底在引擎内 | ✓ |
| 十连≥1SR | 动才市场 | 调 `drawTen`（既有） | ✓ |
| 新手前 10 抽≥1SR | 动才市场 | 读新号标记（既有） | ✓ |
| offline_factor=0.20 | 餐厅 | 读 `getIeff()`（既有公式） | ✓ 未动 |
| 双货币隔离（星券=idle 唯一源，钻石不进 idle） | 餐厅/动才市场 | 仅读取；idle 不产生钻石 | ✓ |
| 四货币（星券/钻石/食材/碎片） | 仓库(全展示) | 展示不新增货币 | ✓ |
| **决策①** 顾客带菜需求、未解锁不可服务 | 餐厅 | 沿用 `matchServiceable`；未解锁仅提示 | ✓ |
| **决策②** 菜品解锁=星券+食材（不引新资源） | 餐厅(触发) / 仓库(进度展示) | 仓库只读进度，不改成本/不引资源 | ✓ |
| **决策③** 员工分厨师/服务员/接待三岗 | 餐厅 / 员工休息区 | 上岗经 `schedule.assign` | ✓ |
| **决策④** 服务=被动基础+主动派遣/点击加成 | 餐厅 | 沿用 serve + 主动加成 | ✓ |
| 不引入新经济/货币/改概率/改解锁数学 | 全局 | 本 spec 纯导航重组 | ✓ |

**一致性结论**：本场景/导航架构 spec 在锁参与 4 项决策上与既有 GDD 完全一致，无冲突、无新增经济面。

---

## 5. 约束声明（微信原生 canvas + 程序化零贴图，无位图）

### 5.1 资产范式（零位图）

- 全部视觉 = **运行时 canvas 2d 程序化图元**（arc / roundRect / quadratic+bezier path / `createLinearGradient`+`createRadialGradient` / fill+stroke）。**严禁 `drawImage` 任何位图**（不变量 #1：atlas 永远不增长 → 零位图下恒成立）。
- 「base-parts atlas」在零位图范式下 = **程序化部件绘制函数库**（如 `drawCatHead(ctx,p)` / `drawBirdBody(ctx,p)`）+ JSON 参数（partsId / colorPreset / affinityRole / expression）。新增动物 = 新增一份参数，零贴图字节。
- **家族硬隔离（不变量 #2）**：绘制调用层强制校验——禁止跨家族部件组合（如 鱼头+哺乳身），越界即抛 `FamilyIsolationError`（与 tech-prototype 同义护栏，迁至绘制域）。中枢/场景内所有动物、迎宾 NPC 均经此护栏。
- 4MB 主包：零位图 → 包体只含 JS + 字体子集 + 可选 1 张程序化背景参数；首屏极简（对齐 tech-prototype §4 预算信封，但去 Cocos/atlas 字节）。

### 5.2 渲染预算（单 canvas、单渲染循环）

- 中枢地图：4 区域建筑（每栋 ≤12 原语）+ 远山 2 层 + 天空渐变 + 2–3 树/云；单帧原语上限约 ≤120，控制低端机帧率（R1 待真机证伪）。
- 场景内角色：复用同一套程序化角色绘制（餐厅员工=休息区角色=同一库），避免重复实现。
- 渐变/阴影：阴影用半透明暖灰贴地椭圆（art-bible §5），**禁硬投影**；视差仅 1–2 层。

### 5.3 「星露谷 cozy 感」——能拟 / 放弃（程序化可行性）

| 维度 | 能否程序化拟真 | 做法 | 放弃项 |
|---|---|---|---|
| 柔软渐变天光 / 暖色氛围 | ✅ 完全能 | `createLinearGradient` 晨光天空 + 全局暖色叠加 | — |
| 圆润有机建筑 / 小屋 / 仓 | ✅ 能 | roundRect + 贝塞尔圆角屋顶 + 暖棕描边 | — |
| 起伏远山 / 草地色块 | ✅ 能 | 2 层视差圆角色块 + 渐变 | 像素瓦片地形 |
| 轻软阴影 / 陪伴感 | ✅ 能 | 半透明暖灰椭圆贴地影 | 硬投影 / 高光贴图 |
| idle 微动（呼吸/摇摆） | ✅ 能 | 正弦插值绘制参数（scale/rotation） | 逐帧 PNG 序列 |
| 低饱马卡龙配色 | ✅ 完全能 | 复用 art-bible §3 调色板 | — |
| 像素艺术 crispness / 抖动纹理 | ❌ 放弃 | 改为扁平矢量语言 | 像素颗粒感 |
| 密集手绘植被 / 繁茂 foliage | ❌ 放弃 | 仅 2–3 棵程序化树，控原语数 | 茂密丛林 |
| 地形 tile 拼接细节 | ❌ 放弃 | 色块+路径表达，非 tile | 瓦片地图 |

**取向**：以「圆角粉彩小镇 + 蜿蜒小径 + 渐变天光 + 门口迎宾小动物 + 轻缓 idle」拟星露谷「安心陪伴感」；明确放弃像素颗粒、瓦片地形、茂密植被——换扁平矢量治愈语言（与 art-bible §4「扁平+轻软阴影的程序化矢量」一致）。

---

## 6. 命名集（动才种子 → 一致中文命名）

> 基调：可爱动物 cozy + 欢迎玩梗；种子「动才市场」=「动物人才市场」（riff on 人才市场）。覆盖中枢 + 4 场景 + 关键按钮；附英文 code key 供工程对齐。

### 6.1 中枢 + 4 场景

| 角色 | 展示名（中文） | 英文 code key | 备注 / 备选 |
|---|---|---|---|
| 中枢 / overworld | **动才村** | `HUB` / `scene_hub` | 副标「毛茸茸的街角」；备选「爪印小镇」 |
| 餐厅（主界面） | **暖爪餐厅** | `RESTAURANT` | 备选「喵呜小馆」 |
| 仓库（只读展示） | **囤囤仓** | `WAREHOUSE` | 备选「百宝仓」 |
| 员工休息区（猫咖） | **撸毛馆** | `STAFF_LOUNGE` | 备选「猫咖·员工休息区」 |
| 动才市场（抽卡） | **动才市场** | `GACHA_MARKET` | 种子名；备选「人才市场（动才版）」 |

### 6.2 关键按钮 / 交互命名

| 上下文 | 按钮 / 文案 | 命名意图 |
|---|---|---|
| 中枢 → 各场景 | 进店 / 逛仓 / 去撸毛 / 去招才 | 口语化入口 |
| 任意场景 → 中枢 | **回动才村** | 统一返回语 |
| 餐厅 CTA | 收菜 / 升座位 / 升工位 / 升菜谱 / 加把劲 / 解锁新菜 / 派去上岗 | 沿用经营动词（决策②③④） |
| 动才市场 CTA | **招一只**(100⭐/💎) / **招十只**(900⭐/💎,9折) / 免费招一次 / 用星券·用钻石 / 距保底 X/50 / 再招 X 次必得 SR / 抽卡说明 | 「招才」呼应动才玩梗；保底软提示 |
| 仓库子页 | 食材 / 菜品 / 货币 / 碎片 | 只读分类 |
| 员工休息区互动 | 摸摸 / 详情 / 喂一口 / 送礼物 / 派去上班 / 升星 | 猫咖感 + 养成动词 |
| 抽卡演出 overlay | 再招一次 / 去上岗 / 看图鉴 / 跳过 | 演出后回流 |

> 命名一致性校验：所有场景名 + 按钮均围绕「动才（动物人才）村落」主题，无跳脱词；稀有度仍用 art-bible §7.2 双编码（颜色+形状），命名不替代双编码。

---

## 7. 已知风险 / 张力（Flagged）

| # | 张力 | 表现 | 本 spec 化解 | 状态 |
|---|---|---|---|---|
| T-S1 | **Cocos vs 微信原生 canvas 资产范式冲突**（§0.1） | tech-prototype ADR-1/2 与 art-bible §A 写 Cocos+位图 atlas+shader tint，与简报/E7 零位图 canvas 矛盾 | 本 spec 依零位图 canvas 撰写；视觉身份复用、资产附录待修订 | **待 lead 裁决**（OP1） |
| T-S2 | **IAP/商店入口缺失**（§0.2 / §8-OP2） | 新 4 区域无「商店」节点，钻石获取(IAP)+IAA 免费抽无家 | 建议并入动才市场或加第 5 节点 | 待用户定 |
| T-S3 | **`roster` 模块未显式落地**（§3.2） | E7 无 roster 对象，员工 inline 创建 | STAFF_LOUNGE 依赖 roster 先行 | 待工程确认 |
| T-S4 | 中枢 vs 单屏认知 | 多场景增加 1 次点击进入餐厅，是否打断挂机节奏 | 中枢极简、餐厅默认高频；回村 1 点击 | 真机验证 |
| T-S5 | 图鉴🔒展示归属 | STAFF_LOUNGE 主区=已拥有；🔒未拥有放子页 | 含「图鉴子页」 | 待 UX 细化 |

---

## 8. 待审批 / 开放问题（供主理人 / 用户拍板）

- **OP1（高优）**：tech-prototype ADR-1/ADR-2 与 art-bible §A 的「Cocos + 位图 atlas + shader tint」与本项目实际（微信原生 2d canvas、零位图）冲突——是否**正式确认 pivot 离 Cocos**，并授权 程基岩/林绘澄 修订 tech-prototype / art-bible 资产附录？本 spec 已按零位图 canvas 撰写。
- **OP2（高优）**：IAP/钻石获取（首充/月卡/基金）+ IAA 免费抽入口放哪？选项 (A) 并入「动才市场」作「换钻/礼包」子面板（gacha 是钻石唯一消耗出口，顺理成章，保持 4 节点）；(B) 新增第 5 中枢节点（如「爪印小卖部」）。请用户定。
- **OP3**：`roster`（拥有动物注册表）是否作为独立模块落地？STAFF_LOUNGE/图鉴 依赖之；E7 当前未显式存在。
- **OP4**：导航模型取代 UX spec §1.1 底部 Tab——是否授权随后修订 UX spec §1.1 以本 spec 为准？
- **OP5**：中枢是否提供「首启着陆 + ☰ 总览浮层」双形态（对齐 UX spec §4.1），还是纯地图？建议纯地图（更契合「星露谷画风」简报）。

---

> 文档完（system-scene-map.md v0.1，**待复核 draft for lead review**）。锁参与 4 决策全程未动；仅做 UX 导航重组；资产范式冲突见 §0.1 / OP1。
