# 系统 GDD · Phase 2 场景（囤囤仓 / 撸毛馆 / 图鉴）

> 版本 v0.1（Phase 2 设计稿）｜ 负责人 design-strategist（文策渊）｜ 状态 **待主编（游承峰）复核**
> 对齐基线：
> - `design/gdd/system-scene-map.md` v0.1（中枢 + 4 区域命名 / 导航模型 / §5 零贴图约束）—— 本 GDD 在其之上做实，对仓库「只读」偏差见 §8-C1
> - `design/gdd/system-idle-restaurant.md` v0.2（`I_eff` / 离线 / 三岗 / 菜品解锁 §3.5）
> - `design/gdd/system-cultivation.md` v0.1.1（好感度 `A` / 羁绊 5 阶层 / 加成 §3.2）
> - `design/gdd/system-gacha.md` v0.1.1（重复→碎片 `GACHA_SHARD_*` / 升星阈值 / 去重）
> - `src/config/tunables.js`（LOCKED 锁参 / TUNED 可调参，新数值按同风格提议，不硬编码魔法数）
> - `art/art-bible.md` v0.3 §10（cozy 零贴图视觉方向 / 调色板 §10.3 / 家族硬隔离）
> - 实装参考：`src/ui/render.js` `getHubRegions`/`hitHubRegion`/`appendCritter`；`game.js` `NavigationState`
>
> **锁参不可重开（全程遵守）**：稀有度 `R60/SR30/SSR10`（`LOCKED.GACHA_R/SR/SSR`）、`N` 不入池（`LOCKED.GACHA_N=0`）、`50` 抽硬保底（`LOCKED.PITY_HARD`）、十连≥1SR（`LOCKED.TEN_PULL_SR_GUARANTEE`）、新手前 `10` 抽≥1SR（`LOCKED.NEWBIE_FIRST10_SR` / `GACHA_NEWBIE_PULLS`）、`offline_factor=0.20`（`LOCKED.OFFLINE_FACTOR`）。
> **4 项已确认设计决策全程遵守**：①顾客带「想吃的菜」上门、未解锁不可服务；②菜品解锁资源=星券+食材（`TUNED.UNLOCK_COST_STAR_*`/`FOOD_*`，不引新资源）；③员工分厨师/服务员/接待三岗；④服务=被动基础结算+玩家主动派遣/点击加成。
> **平台硬约束（不变量）**：微信原生 canvas2d、程序化零贴图（atlas 字节=0，#1）、家族硬隔离（#2）；主包 ≤4MB。

---

## 0. 文档定位、依据与偏差披露

本 GDD 定义 Phase 2 要解锁的两个中枢锁定区（**囤囤仓 WAREHOUSE / 撸毛馆 STAFF_LOUNGE**）及拆分出的**图鉴（roster）**集合视图的交互、数据、tunable、解锁判定、零贴图渲染与验收。设计原则：

- **场景 = view（只读快照）+ 既有模块 API 触发写操作**；不引入新经济、不新增货币、不改动抽卡概率/保底/离线公式、不改动菜品解锁数学（决策②成本曲线沿用 `TUNED.UNLOCK_COST_*`）。
- **冲突披露（头号）**：v0.1 `system-scene-map.md` §2.2 将仓库定义为「**纯展示面板、零交易、只读、解锁动作仍在餐厅触发**」。本任务要求仓库成为「**食材库存视图 + 菜品解锁的消耗入口**」（写操作）。二者在「只读 vs 解锁入口」上直接矛盾，列为 §8-C1，交由主编裁决；本 GDD 按**任务书的 Phase 2 意图**撰写（仓库=解锁入口），并在 §8 给出三种处置建议。
- **撸毛 ≠ 岗位亲和**：本 GDD 反复区分「好感度 `A` / 羁绊 bond（cultivation §2–§3）」与「岗位适配乘区 `AFFINITY_BONUS=1.5`（TUNED，主适配岗上岗整乘）」。撸毛只涨 `A`，**不触碰** `AFFINITY_BONUS` 常量。

---

## 1. 锁参与 4 决策合规总表

| 锁定项 / 决策 | 落点模块 | 本 GDD 处理 | 结论 |
|---|---|---|---|
| `R60/SR30/SSR10` / `N` 不入池 / `PITY_HARD=50` / 十连≥1SR / 新手前10≥1SR | 图鉴（仅展示去重拥有态）/ 撸毛馆（宠物来自 roster 去重） | 仅展示；撸毛对象=已拥有去重动物，不重摇 | ✓ 未动 |
| `offline_factor=0.20` | 三模块均不触碰离线公式 | 撸毛/仓库/图鉴均为在线主动/查看，离线累积仍在 restaurant 模块内 | ✓ 未动 |
| 双货币隔离（星券=免费 idle 唯一源，钻石不进 idle） | 撸毛馆（撸毛产出） | 撸毛**默认只产好感度+视觉情绪**；不默认产星券（见 §8-C4 红线）；可选食材回礼为新源需签核 | ✓ 默认合规 |
| 四货币（星券/钻石/食材/碎片） | 仓库（聚合展示全四币） | 展示不新增货币；解锁消耗沿用 star+food | ✓ |
| **决策①** 顾客带菜需求未解锁不可服务 | 仓库（解锁入口触发 `dishUnlock`） | 入口仅调用既有 `restaurant.dishUnlock`，未解锁提示逻辑不变 | ✓ |
| **决策②** 菜品解锁=星券+食材（不引新资源） | 仓库（解锁入口） | 调用既有解锁 API，成本曲线 `TUNED.UNLOCK_COST_*` 原样 | ✓ 不引新资源 |
| **决策③** 三岗 | 撸毛馆（派去上班）/ 图鉴（关联岗展示） | 上岗仍走 `restaurant.schedule.assign`；无第 4 岗 | ✓ |
| **决策④** 被动+主动加成 | 撸毛馆（情绪为视觉态，不动 `active_bonus`） | 「开心」态默认仅视觉；不叠加数值加成 | ✓ 不碰 `active_bonus` |

---

## 2. 通用契约

### 2.1 状态归属（沿用 v0.1 §3.2）

| 状态所有者（模块） | 被读取的 Phase 2 模块 | 说明 |
|---|---|---|
| `ledger`（四货币单值源） | 仓库（全四币）/ 中枢 HUD | `ledger.snapshot()` |
| `restaurant`（座位/三岗/已解锁菜/解锁成本） | 仓库（菜品进度 + 解锁入口） | `getUnlockedDishes()` / `getDishCatalog()` / `dishUnlock()` |
| `roster`（拥有动物去重注册表） | 撸毛馆（宠物列表）/ 图鉴（集合视图） | `roster.owned()` / 全量 catalog（含 🔒） |
| `cultivation`（好感/羁绊/加成） | 撸毛馆（撸毛写 `pet`）/ 图鉴（阶层展示） | `pet()` / 加成读数 |
| `gacha`（碎片/升星阈值） | 仓库（碎片汇总）/ 图鉴（碎片展示） | `GACHA_SHARD_*`（LOCKED）/ 升星阈值 |

> **依赖提示（OP3 延续）**：`roster` 需在 Phase 2 作为独立模块落地（E7 `game.js` 当前员工 inline 创建，无持久 `roster` 对象）。撸毛馆与图鉴均依赖之；若未落地，本 Phase 2 二者需 `roster` 先行。

### 2.2 HUB 热区解锁判定（通用）

当前 `render.js` `getHubRegions(w,h)` 对 `WAREHOUSE`/`STAFF_LOUNGE` 返回 `{locked:true, clickable:false}`，`hitHubRegion` 遇 `!clickable` 直接 `continue` → 返回 `null`（即「锁定不可进」）。Phase 2 引入**解锁判定函数**，使满足条件后 `locked:false, clickable:true`：

```
// 设计层伪码（不修改 render.js，供工程实现参考）
function evalHubUnlock(regionId, ctx) {
  // ctx = { totalStarEarned, dishUnlockedCount, rosterOwnedCount, ... }
  switch (regionId) {
    case SCENE.WAREHOUSE:    return ctx.totalStarEarned   >= TUNED.WAREHOUSE_UNLOCK_STAR_TOTAL;   // 或 dishUnlockedCount >= WAREHOUSE_UNLOCK_DISH_COUNT（二选一，见 §3.4）
    case SCENE.STAFF_LOUNGE: return ctx.rosterOwnedCount   >= TUNED.LOUNGE_UNLOCK_ROSTER_COUNT;
    default:                 return true; // RESTAURANT / GACHA_MARKET 始终开放
  }
}
```

- `getHubRegions` 改为读取 `evalHubUnlock(reg.id, ctx)` 决定 `locked/clickable`；未解锁区仍渲染 🔒「即将开放」遮罩（沿用现有 `appendHubRegion` 分支）。
- **数据依赖**：`rosterOwnedCount` 来自 `roster.owned().length`；`dishUnlockedCount` 来自 `restaurant.getUnlockedDishes().length`；`totalStarEarned` 需 `ledger` 提供**累计获得星券**字段（当前 `ledger` 仅存余额，是否新增累计字段待 §9-OP 确认；若不打字段，默认用 `dishUnlockedCount` 判定仓库解锁，避免新增账本字段）。

### 2.3 渲染循环

沿用 v0.1 §3.4：每帧按 `nav.scene` 分发 `buildWarehouse` / `buildLounge` / `buildRoster`（图鉴为覆盖层或撸毛馆子页，非独立 scene）纯函数 → `applyCommands(ctx, cmds)`。模块状态（restaurant 挂机、ledger）独立于 UI 存活。

---

## 3. 模块一 · 囤囤仓（WAREHOUSE / storage）

### 3.1 交互流程（玩家在此场景做什么）

- **进入**：中枢点「囤囤仓」热区（解锁后）→ `nav.scene='WAREHOUSE'`。
- **查看（主）**：四币总览 + 食材库存 + 菜品解锁进度 + 碎片汇总。
- **整理（UI）**：按「来源 / 稀有度 / 近期获得」对食材与碎片分组排序——**纯展示排序，不新增状态、不新增容量上限**（见 §3.2「容量」说明）。
- **解锁（写）**：在「菜品」子页点未解锁菜 → 弹确认（展示 `unlock_cost_star(n)` / `unlock_cost_food(n)`，n=解锁序号 0-based）→ 调用既有 `restaurant.dishUnlock(dishId, {requestId})`（原子扣星券+食材，决策②）。
- **返回**：顶部「回动才村」→ `scene='HUB'`。
- **子页签（Tab，纯切换）**：`食材` / `菜品` / `货币` / `碎片`（沿用 v0.1 §2.2）。

### 3.2 数据模型

```
// 只读快照（buildWarehouse 输入）
WarehouseView = {
  ledger:     { star, diamond, food, shard },                 // ledger.snapshot() 四货币
  food:       { total:number, bySource?:Record<string,number> }, // 食材总量（idle 副产 FOOD_RATE，无硬上限）
  dishes:     Array<{ id, name, idx, unlocked:boolean,
                      costStar:number, costFood:number }>,     // 全目录 + 进度（cost 来自 TUNED.UNLOCK_COST_*）
  shards:     Array<{ animalId, rarity, shard:number,
                      toStarThreshold?:number }>,              // 碎片汇总（重复转碎片 LOCKED.GACHA_SHARD_*）
  tabs:       ['食材','菜品','货币','碎片'],
}

// 写操作（经既有模块 API，UI 不持有状态）
restaurant.dishUnlock(dishId, { requestId })   // 既有；原子扣 star+food，任一不足则失败不部分扣
```

- **是否引入新资源**：**否**。仓库仅聚合展示 `ledger`/`restaurant`/`roster` 既有状态；唯一写操作调用既有 `dishUnlock`（决策②，star+food，无新资源）。符合「不引入新经济」红线。
- **容量上限**：食材**不设硬上限**（对齐 idle §3.6「食材为经营副产、闭环消耗于养成+解锁」，且四货币纪律下不应新增门控）；「整理」仅为 UI 排序分组，不改变任何数值。若未来需展示上限，仅作 UI 分页，不阻产出。

### 3.3 所需 tunable（建议值，标 TBD 待平衡 pass）

> 全部归入 `src/config/tunables.js` 的 `TUNED`（可调、非锁参），不硬编码魔法数；仓库本身**不新增经济 tunable**，解锁成本曲线沿用既有 `TUNED.UNLOCK_COST_STAR_BASE/RATE`、`FOOD_BASE/RATE`。

| tunable | 建议值 | 含义 | 备注 |
|---|---|---|---|
| `WAREHOUSE_UNLOCK_STAR_TOTAL` | `600`（TBD） | 累计获得星券达此值解锁仓库 | 需 `ledger` 累计字段（见 §2.2 数据依赖） |
| `WAREHOUSE_UNLOCK_DISH_COUNT` | `3`（TBD，备选） | 已解锁菜数达此值解锁仓库 | 若不打累计字段则用此项判定 |

### 3.4 HUB 热区解锁条件（从 null 锁定 → 可进的判定）

- **判定**：`evalHubUnlock(SCENE.WAREHOUSE, ctx)` = `ctx.totalStarEarned >= TUNED.WAREHOUSE_UNLOCK_STAR_TOTAL`（或 `dishUnlockedCount >= TUNED.WAREHOUSE_UNLOCK_DISH_COUNT`）。
- **未解锁**：`getHubRegions` 返回 `locked:true, clickable:false` → `hitHubRegion` 忽略 → 渲染 🔒「即将开放」遮罩（沿用现有 `appendHubRegion`）。
- **解锁后**：`locked:false, clickable:true` → `hitHubRegion` 返回 `WAREHOUSE` → `nav.scene='WAREHOUSE'`；`game.js` 触摸路由在 `HUB` 分支新增 `WAREHOUSE` 处理（与现有 `RESTAURANT`/`GACHA_MARKET` 同构）。
- **节奏提示**：若仓库=解锁入口，则首次解锁需先在餐厅自解 ≥3 菜（或赚 ≥600 星券）才开放——属「先教后开放」的 cozy 节奏；若主编希望首启即开放，可设阈值=0（始终开放），列为 §8-C1 选项 (c)。

### 3.5 canvas2d 零贴图渲染要点

- **调色板**（art-bible §10.3）：仓库冷调 薄荷绿 `#B8E0CB` + 雾霾蓝 `#CFE3EC`；木框 暖木 `#D9A878`；进度条 暖橘 `#FF9E68`。
- **图元**（全部 canvas2d 矢量，零位图，不变量 #1）：
  - 货架 = 纵向 `roundRect` 格 + 暖木 `#D9A878` 框（`appendHubRegion` 风格扩展为 `buildWarehouse`）。
  - 资源罐 = `roundRect` + 标签图标 `⭐/🍖/💎/🔷`（文字图标，非位图）；四币分行陈列。
  - 进度条 = 暖橘 `#FF9E68` 圆角条（已解锁/锁定对比）。
  - 食材堆叠 = 小圆角块 cluster（数量越多块越密，纯参数，无贴图）。
- **动效**（§8 总纲）：新资源入架轻微下落弹跳（sine y）；数值飘字 `+n🍖`。`reduce motion` 关下落/飘字留定帧。
- **家族隔离 #2**：仓库无动物家族概念，不受影响；若门口放迎宾 critter，经 `appendCritter` 且同家族（#2 生效）。
- **可达性**（§9）：区域 accent 不编码状态；文字 ≥18px（Num 24–28）；热区 ≥44×44；货架格 uniform 圆角避免 clutter。

### 3.6 QA / 验收标准

- [ ] 仓库展示四货币与 `ledger.snapshot()` 一致，不新增任何货币/资源。
- [ ] 「菜品」子页展示全目录 `unlock_cost_star/food(n)`（n 0-based），数值与 `TUNED.UNLOCK_COST_*` 公式一致。
- [ ] 点未解锁菜 → 调 `restaurant.dishUnlock` → 原子扣 star+food；任一不足则失败不部分扣（双币同源校验）。
- [ ] 解锁后该菜从「菜品」子页移入「已解锁」，且餐厅侧 `matchServiceable` 立即可服务（状态归模块，UI 只读生效）。
- [ ] 食材无硬上限；「整理」仅改排序不改动数值/状态。
- [ ] HUB 解锁判定：未达阈值时 `hitHubRegion` 对该区返回 `null`（🔒 遮罩）；达阈值后返回 `WAREHOUSE` 并切场景。
- [ ] 零位图：仓库全部 canvas2d 图元，无 `drawImage` 任何位图；atlas 字节=0。
- [ ] 可达性：文字 ≥18px、热区 ≥44×44、reduce motion 关动效留定帧。

---

## 4. 模块二 · 撸毛馆（STAFF_LOUNGE / petting parlor / 猫咖）

### 4.1 交互流程（玩家在此场景做什么）

- **进入**：中枢点「撸毛馆」热区（解锁后）→ `nav.scene='STAFF_LOUNGE'`。
- **陈列**：网格/散座式软垫工位，每只**已拥有（去重）**动物一个展位（`appendCritter` 复用，家族隔离 #2）。
- **撸毛（新机制）**：点某只 critter → 撸毛动效（critter 缩放弹跳 `1.0→1.12→1.0` + 爱心粒子 3–5 颗，canvas2d，§8.2）→ 调用 `cultivation.pet(animalId)` → +好感度 `A`（受冷却/日上限约束）→ 飘「+A」+ 短暂「开心」视觉态。
- **延续 v0.1 §2.3 既有互动（同空间）**：喂一口（`cultivation.feed`，耗食材）、送礼物（`cultivation.gift`，每日上限）、派去上班（`restaurant.schedule.assign`，决策③）、升星（`cultivation.starUp`，碎片足够）。
- **图鉴入口**：本馆内「图鉴」子页 → 跳转 roster 视图（§5）。
- **返回**：顶部「回动才村」→ `scene='HUB'`。
- **撸哪只**：`roster.owned()` 去重后的动物（`gacha` §4「动物按 id 去重」）。重复抽卡已转碎片（`LOCKED.GACHA_SHARD_*`），**不**生成可撸的额外实体；故撸毛对象 = 去重拥有列表。

### 4.2 数据模型

```
// 只读快照（buildLounge 输入）
LoungeView = {
  owned: Array<{ id, rarity, family, level, star,
                 affinityA:number,            // 好感度 A∈[0,100]（cultivation §2）
                 bondTier:0|20|50|80|100,     // 羁绊阶层
                 roleAffinity:'chef'|'waiter'|'host', // 主适配岗
                 assignedRole:null|'chef'|'waiter'|'host', onDuty:boolean }>,
  bonuses: { bondIdlePerAnimal:0.03, bondIdleCap:0.30,
             serveReduceAtFriendWaiter:0.05 }, // cultivation §3.2 读数（只读）
  petCooldownSec: TUNED.PET_COOLDOWN_SEC,
  petDailyCap:    TUNED.PET_DAILY_CAP,
}

// 写操作
cultivation.pet(animalId, { at:timestamp }) -> { gain:number, affinityA, happyUntil }  // 新增 API（additive 到 feed/gift）
cultivation.feed / cultivation.gift / cultivation.starUp                // 既有（v0.1 §2.3）
restaurant.schedule.assign(id, role)                                    // 既有（决策③）
```

- **客户端/服务端瞬时态**：`petState: Map<animalId,{lastPetAt, happyUntil}>` 仅用于冷却与「开心」视觉态计时，**不持久为硬资源**，不进账本。

### 4.3 所需 tunable（建议值，标 TBD 待平衡 pass）

> 归入 `TUNED`（可调、非锁参）。**不引入星券产出 tunable**（见 §8-C4 红线）。

| tunable | 建议值 | 含义 | 备注 |
|---|---|---|---|
| `PET_COOLDOWN_SEC` | `30`（TBD） | 单只 critter 撸后冷却秒数，防 spam | 冷却期内点撸无效 + 提示「再摸要等 Xs」 |
| `PET_AFFINITY_GAIN` | `1`（TBD） | 每次撸毛 +好感度 A | 量级对齐 `cultivation` 喂食 +1/食材；撸毛无食材成本 → 靠冷却制衡 |
| `PET_DAILY_CAP` | `20`（TBD，可选） | 每 critter 每日撸毛上限 | bound 好感 accrual，防 trivialize 喂食/送礼 |
| `PET_HAPPY_DURATION_SEC` | `8`（TBD） | 「开心」视觉态时长 | 默认仅视觉，无数值 buff（见 §4.4） |
| `PET_FOOD_REWARD` | `0`（TBD，默认关） | 蹭蹭回礼给食材数 | `>0` 则为新食材源，需 §8-C4 签核 |

### 4.4 与 `affinity 1.5` 及顾客需求的联动（重要：概念区分）

> **红线澄清**：本 GDD 中「撸毛产出的好感度」= **好感度 `A` / 羁绊 bond**（cultivation §2–§3），**不是** `AFFINITY_BONUS=1.5`（TUNED，岗位适配整乘：动物在其主适配岗上岗时该岗 mult 额外 ×1.5）。撸毛**只涨 `A`，绝不改动 `AFFINITY_BONUS` 常量**。

- **联动路径（撸毛 → 顾客需求被满足）**：
  - `A` → 羁绊阶层（陌生0 → 熟悉20 → 朋友50 → 挚友80 → 家人100）。
  - **挚友(80) + 服务员岗** → `T_serve −5%`（cultivation §3.2）→ 上菜更快 → 更多带菜需求的顾客被及时服务（决策①）。
  - **家人(100)** → idle `+3%/只`（仅前 10 只上岗计，上限 `+30%`）→ 吞吐↑ → 可服务顾客量↑ → 更多需求可满足。
  - **协同（不碰常量）**：把高 bond 动物放在其 `roleAffinity`（主适配岗）上，既吃 `AFFINITY_BONUS=1.5`（岗位适配）又吃 bond idle `+3%`，形成「撸毛→bond→上岗适配」正反馈；全程未修改任何锁参/常量。
- **「开心」态**：默认**仅视觉反馈**（critter 表情切换 + 爱心粒子），**不叠加数值加成**，避免与决策④ `active_bonus`（点击/派遣增量）叠加成主导策略。若主编要数值化 pet-buff，列为 §8-C4 TBD（需平衡 pass 证伪）。

### 4.5 canvas2d 零贴图渲染要点

- **调色板**（§10.3）：猫咖暖调 奶茶 `#F3E2C7` + 鹅黄 `#FBE3A1`；软垫 = 奶茶色椭圆；窗 = 圆角 + 渐变天光（雾霾蓝提亮）。
- **图元**（零位图，#1）：软垫/猫爬架 = `roundRect` + `arc`；critter = `appendCritter`（复用，家族隔离 #2 生效）；撸毛动效 = scale 弹跳 + 爱心粒子（canvas2d 圆/路径，无位图）。
- **动效**（§8）：每只错相位呼吸（§8.1 sine）；hover 放大；窗光带缓移；`reduce motion` 关粒子/呼吸留定帧。
- **家族隔离 #2**：陈列动物严格同家族部件组合；撸毛馆仅为「展示容器」，不破隔离（art-bible §10.5 注）。
- **可达性**（§9）：岗位用图标+文字双编码（厨帽/托盘/迎宾牌）；好感度用进度环+数值+阶层名三重表达（cultivation §6）；热区 ≥44×44。

### 4.6 QA / 验收标准

- [ ] 撸毛对象 = `roster.owned()` 去重列表；重复抽卡转碎片者不生成可撸实体。
- [ ] 点 critter → `cultivation.pet` → +`A`，数值与 `PET_AFFINITY_GAIN` 一致；`A` 上限 100 不溢出（满后转少量 XP，对齐 cultivation §4）。
- [ ] 冷却生效：`PET_COOLDOWN_SEC` 内重复撸无效并有提示；`PET_DAILY_CAP` 达上限置灰。
- [ ] 「开心」态默认仅视觉；无数值 buff 叠加（除非 §8-C4 显式签核）。
- [ ] 撸毛**不**改 `AFFINITY_BONUS`（1.5）常量；bond 阶层→`T_serve−5%`/`idle+3%` 联动正确（对齐 cultivation §3.2）。
- [ ] 延续互动（喂/送/上岗/升星）与 v0.1 §2.3 一致，调用既有 API。
- [ ] HUB 解锁判定：未达 `LOUNGE_UNLOCK_ROSTER_COUNT` 时 `hitHubRegion` 返回 `null`（🔒）；达阈值后可进。
- [ ] 零位图：全部 canvas2d 图元；家族隔离 #2 在陈列与撸毛动效中生效。

---

## 5. 模块三 · 图鉴（roster / 收藏）

### 5.1 交互流程（玩家在此场景做什么）

- **入口（非 HUB 区域）**：撸毛馆内「图鉴」子页；动才市场抽卡后「看图鉴」按钮（v0.1 §6.2）。
- **展示**：已拥有（去重）+ 🔒未拥有剪影（收集进度）；可按 稀有度 / 家族 / 主适配岗 / 拥有状态 筛选；可选两只「对比」并排。
- **纯只读**：无写操作；仅呈现 `roster` 状态与全量目录。

### 5.2 数据模型

```
// 只读快照（buildRoster 输入）
RosterView = {
  catalog: Array<{ id, rarity, family, roleAffinity, owned:boolean }>, // 全量目录（静态，含 🔒）
  owned:   Array<{ id, rarity, family, level, star,
                   affinityA, bondTier, assignedRole,
                   shard:number,                            // 该动物碎片（LOCKED.GACHA_SHARD_*）
                   linkedHint?:string }>,                   // 派生文本："主适配岗=厨师→出餐更快"
  filters: { rarity?:'N'|'R'|'SR'|'SSR', family?, role?, ownedOnly?:boolean },
  compare: [idA?:string, idB?:string],
}
```

- **无新增状态**：🔒 = `catalog` 中 `owned=false` 条目（静态目录已知，无需服务端持有）。
- **关联已解锁菜**：展示动物 `roleAffinity` + 当前 `assignedRole` + 派生文本「该岗提升 recipe/T_serve，服务全部已解锁菜更快」（无新状态，纯展示）。

### 5.3 所需 tunable

- **无**（只读视图，不引入经济/平衡 tunable）。
- 仅 UI 常量 `ROSTER_GRID_COLS`（展示列数，非平衡 tunable，不入 `TUNED`）。

### 5.4 HUB 热区解锁条件（入口可用判定）

- **图鉴不是 HUB 区域**（中枢固定 4 区域）；其可用性 = `roster` 模块落地后**始终可进**（目录静态，含 🔒）。
- **入口可见性**：随 Phase 2 模块开放自然可用——撸毛馆解锁后馆内显示「图鉴」入口；动才市场抽卡后显示「看图鉴」。
- 若主编要图鉴作为独立第 5 HUB 节点（art-bible §10.9-Q3 选项），列为 §8-C2 待裁决（结构变更，需扩 `SCENE` + `getHubRegions`）。

### 5.5 canvas2d 零贴图渲染要点

- **调色板**：复用全局；稀有度双编码 §7.2（颜色+角标形状+纹理），色盲安全。
- **图元**（零位图，#1）：
  - 每张卡 = `roundRect` 卡框（圆角 28–32，双层描边）+ 顶稀有度色条（§7.2）+ `appendCritter` 立绘 + 名签。
  - 🔒未拥有 = 同卡框但 `appendCritter` 用 `#3a3a4a` 单色剪影（**仅去色、保留该家族部件形状**，家族隔离 #2 仍适用）+ 「?」角标。
  - 筛选 chips = `roundRect` 按钮（≥44×44）。
- **动效**：卡片翻入（sine scale）；`reduce motion` 关翻入留定帧。
- **可达性**（§9）：稀有度不靠颜色单编码（角标形状+纹理兜底）；文字 ≥18px。

### 5.6 QA / 验收标准

- [ ] 图鉴含全量目录；已拥有显示完整 critter + 稀有度双编码；🔒显示剪影（同家族形状、去色）。
- [ ] 筛选（稀有度/家族/岗/拥有）正确切换展示集；对比并排数值一致。
- [ ] 纯只读：无任何写操作；不调用 `dishUnlock`/`pet`/`assign` 等。
- [ ] 碎片展示与 `gacha` 重复转碎片（`LOCKED.GACHA_SHARD_*`）一致；升星阈值展示与 `system-gacha.md` §3.4 一致。
- [ ] 入口：撸毛馆/动才市场可进；非 HUB 区域不占 `getHubRegions`。
- [ ] 零位图：全部 canvas2d 图元；家族隔离 #2 在剪影绘制中生效（剪影用该家族部件）。

---

## 6. 跨 GDD 一致性（模块级关键项）

| 模块 | 关联 GDD | 一致性结论 |
|---|---|---|
| 囤囤仓 | idle §3.5 / tunables `UNLOCK_COST_*` | 解锁入口调用既有 `dishUnlock`，成本曲线原样，不引新资源 ✓ |
| 囤囤仓 | gacha §3.3（碎片） | 碎片汇总仅展示 `LOCKED.GACHA_SHARD_*`，不改阈值 ✓ |
| 撸毛馆 | cultivation §2–§3（好感/羁绊/加成） | 撸毛 = 新增 `pet` 写 `A`，联动 bond 阶层→`T_serve−5%`/`idle+3%`；不碰 `AFFINITY_BONUS` ✓ |
| 撸毛馆 | idle §3.3（三岗）/ 决策③ | 上岗走 `schedule.assign`，无第 4 岗 ✓ |
| 图鉴 | gacha §4（去重）/ §3.4（升星） | 去重拥有 + 🔒剪影 + 升星阈值展示一致 ✓ |
| 三模块 | 锁参 `R60/SR30/SSR10`/`PITY_HARD`/`OFFLINE_FACTOR` | 均不触碰，原样引用 ✓ |

---

## 7. 三模块共用 · 零贴图 / 家族隔离 / 平台约束

- **不变量 #1（atlas 字节=0）**：仓库/撸毛馆/图鉴全部视觉为 canvas2d 程序化图元（`roundRect`/`arc`/`ellipse`/path/渐变），严禁 `drawImage` 任何位图；新增场景=新增绘制调用，零贴图字节。主包 ≤4MB 不受新增场景威胁（字符+参数，无贴图）。
- **不变量 #2（家族硬隔离）**：撸毛馆/图鉴陈列动物经 `appendCritter` 统一入口，仅同家族头/身/耳/尾/肢组合；跨家族组合在调用侧拒绝。仓库无动物家族概念，不受影响。
- **调色板（§10.3）**：草坡绿 `#A9D8A0`（室外地/小径土 `#E8D2B0`）/ 暖木 `#D9A878`（货架木框）/ 猫咖奶茶 `#F3E2C7`（撸毛馆室内）/ 薄荷绿 `#B8E0CB`+雾霾蓝 `#CFE3EC`（仓库冷调）/ 鹅黄 `#FBE3A1`（猫咖点缀）/ 暖橘 `#FF9E68`（CTA/进度）。区域 accent 仅作氛围，**不编码状态/稀有度**（§9 色盲安全）。
- **可达性（§9）**：正文 ≥18px（Num 24–28）；热区 ≥44×44；稀有度/岗位双编码；`reduce motion` 关呼吸/粒子/下落/飘字留定帧。

---

## 8. 待裁决冲突（与 v0.1 `system-scene-map.md` 的偏差 + 经济/平衡 flag）

> 凡偏差均**不擅自改 v0.1**，列此交主编（游承峰）拍板。

- **C1（高优）· 仓库「只读」vs「解锁入口」**：v0.1 §2.2 明确定义仓库=「纯展示面板、零交易、只读、解锁动作仍在餐厅触发」。本任务要求仓库=「食材库存视图 + 菜品解锁的消耗入口」（写操作）。**本 GDD 按任务书 Phase 2 意图撰写（仓库=解锁入口）**，但与 v0.1 直接矛盾。
  - 处置建议（三选一，请主编定）：
    - **(a)** 接受本 GDD：仓库为解锁入口，调用既有 `restaurant.dishUnlock`（单一 API，与餐厅共用，无双实现）；v0.1 §2.2 随之修订为「聚合展示 + 解锁入口」。
    - **(b)** 维持 v0.1 只读：仓库仅展示进度，解锁仍在餐厅触发；本 GDD §3 改为纯只读（删除 3.1「解锁（写）」与 3.2 写操作）。
    - **(c)** 双入口：仓库与餐厅均可触发解锁（共用同一 `dishUnlock` API，防成本曲线分叉）；最便利但需确认不造成 UI 重复认知。
- **C2（中）· 图鉴是否独立 HUB 节点**：v0.1 §2.3 把图鉴作为撸毛馆子页；art-bible §10.9-Q3 提出「猫咖 vs 图鉴两处并存」选项。本 GDD 默认图鉴=撸毛馆子页 + 动才市场「看图鉴」入口（非 HUB 区域）。若主编要图鉴为第 5 HUB 节点，需扩 `SCENE`/`getHubRegions`（结构变更）。
- **C3（中）· 撸毛作为第 3 个养成动作**：cultivation §2 已定义动作集（喂食/送礼/装扮/上岗），撸毛为新增。需补 `cultivation.pet` 到 cultivation GDD §2（或注明撸毛馆经 `cultivation.pet` 路由），并复核与喂食/送礼的 bonding 竞争（见 C4）。
- **C4（高优）· 撸毛产出红线**：默认撸毛**只产好感度 `A` + 视觉「开心」态**。**星券不产**（红线：星券=免费 idle 唯一源，撸毛为主动非 idle 行为，产星券会破双货币隔离纪律）；**食材回礼**（`PET_FOOD_REWARD>0`）为新食材源，需主编签核 + 平衡 pass 证伪。若开放 pet-buff 数值化，须防与决策④ `active_bonus` 叠加成主导策略。
- **C5（中）· 解锁入口须单源**：无论 C1 选 (a)/(c)，仓库解锁**必须调用既有 `restaurant.dishUnlock`**，不得另写一套扣费逻辑，避免 star+food 原子性分叉（对齐 idle §3.5 反作弊）。
- **C6（中）· 解锁阈值新 tunable 待签核**：`WAREHOUSE_UNLOCK_*` / `LOUNGE_UNLOCK_ROSTER_COUNT` 为本 GDD 新增进度门，非任何既有 GDD 所有；阈值（600 星券 / 3 菜 / 6 拥有）为 TBD，需主编定 + 真机验证「勿卡核心循环过早/过晚开放」。

---

## 9. 已知风险 / 开放问题

| # | 风险 | 表现 | 化解 | 状态 |
|---|---|---|---|---|
| R-P2-1 | `roster` 模块未落地（OP3 延续） | 撸毛馆/图鉴依赖 `roster.owned()`；E7 员工 inline | 需 `roster` 模块先行落地 | 待工程确认 |
| R-P2-2 | `ledger` 缺累计星券字段 | `WAREHOUSE_UNLOCK_STAR_TOTAL` 判定需累计值 | 改用 `dishUnlockedCount` 判定（不打字段）或新增累计字段 | 待定（§2.2） |
| R-P2-3 | 撸毛 trivialize 喂食/送礼 | 若冷却/日上限过松，撸毛成最优 bonding 路径 | `PET_COOLDOWN_SEC`/`PET_DAILY_CAP` 收紧 + 平衡 pass 证伪 | TBD 待调 |
| R-P2-4 | 解锁阈值节奏偏差 | 仓库/撸毛馆过早开放稀释引导，或过晚卡循环 | 阈值 TBD + 真机验证 | TBD |
| R-P2-5 | 平衡 pass 待办 | 撸毛/解锁入口改变星券/食材分配结构 | 扩展 `balance-sim.js` 重算（对齐 phase2-balance R-BAL-4 待办） | 待 Phase 5 |

---

> 文档完（system-scene-phase2.md v0.1，**待主编复核**）。锁参与 4 决策全程未动；仓库「只读 vs 解锁入口」偏差见 §8-C1 交主编裁决；新 tunable 均标 TBD 待平衡 pass 与 design-strategist 复核签字。
>
> 复核签字占位：文策渊 · ____ · 结论：____