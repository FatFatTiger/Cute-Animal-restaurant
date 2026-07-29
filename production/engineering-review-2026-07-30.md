# engineering-lead 复核报告 · 2026-07-30

> **engineering-lead 复核签字：PASS（程基岩 · 2026-07-30）**
>
> 本次为纯复核/签字任务，范围严格限定于 5 个 dirext 兜底落盘文件，未读/改 scope 外逻辑
> （未碰 `src/restaurant/staff.js`，未做新功能，未改游戏逻辑）。
> 三道门禁全绿，5 文件判定如下。

---

## 一、三门禁数值（全绿）

| 门禁 | 命令 | 结果 |
|---|---|---|
| ① 单测基线 | `npm test` | **155 passed / 10 suites**（全绿，符合 155/10 基线） |
| ② 体积上限 | `node tests/smoke/build-size.gate.js` | 发布包 **132334 B ≈ 129.23 KB < 4 MB (4194304 B)** ✅ 通过 |
| ③ boot 一致性 | `node game.js` | **`I_eff = 0.540000`** + **`WeChat mini-game shell booted OK`** ✅ 通过 |

---

## 二、逐文件复核

### 1. `src/roster.js`（图鉴 Roster：去重登记 + view() 防御性拷贝） — **PASS**

- `register(draw)`：`draw && draw.animalId && !draw.isDuplicate` → 仅非重复入 `_owned`。去重登记正确。
- `registerMany` / `owned()`（`Array.from(Set)`，返回全新数组）/ `count()` / `has(id)` 均正确。
- `view()`：对 catalog 逐条 `map` 生成**全新纯对象** `{id, rarity, owned}`，无内部可变引用外泄 → **满足 🔒 防御性拷贝**。
- 对齐 GDD `system-scene-phase2.md §5`：纯只读注册表、去重拥有态、🔒 未拥有剪影由渲染层处理；本模块零经济/货币逻辑。
- 锁参红线：未触碰任何 LOCKED / offline_factor / 保底。
- **Minor（非阻断）**：`view()` 兜底分支 `flattenRoster(this._gacha._roster)` 读取私有 `_roster`；`game.js` 始终传 `catalog: CATALOG`，该兜底在生产路径为 dead code，仅作防御默认，不构成缺陷。

### 2. `src/cultivation.js`（撸毛 Cultivation：pet 仅好感度 + 冷却 + 日上限，零货币） — **PASS**

- `pet(id, opts)` 仅改写内部 `_affinity/_petAt/_daily`，**全程无 ledger/货币访问** → 严守 §8-C4 红线（星券=免费 idle 唯一源，撸毛不产货币）。
- 好感度 `A` 钳制 `[0,100]`（L66）。
- `canPet`：冷却 = `PET_COOLDOWN_SEC*1000`；从未撸过 → `last=-Infinity` → 跳过冷却；日上限 `PET_DAILY_CAP`（按 `Math.floor(at/86400000)` 判定当日计数，跨天自动清零）。
- 未触碰 `AFFINITY_BONUS(1.5)`、未触碰 `offline_factor`。
- `PET_FOOD_REWARD` 未实现（默认关），符合「食材仅 idle 副产」—— 无新增免费食材源。
- tunables 引用全部正确：`PET_COOLDOWN_SEC=30` / `PET_AFFINITY_GAIN=1` / `PET_DAILY_CAP=20` / `PET_HAPPY_DURATION_SEC=8`。
- 单测佐证（ui-state.spec.js）：`gain===1`、`affinity===1`、ledger 前后 `JSON` 一致（无货币）、`at+5000` 仍 `<30000` 触发 `COOLDOWN`。

### 3. `src/ui/render.js`（Phase 2 场景三渲染区 ≈L409–L582 + `evalHubUnlock`/`getHubRegions`/`hitHubRegion` L199–L242） — **PASS**

- `buildWarehouse` / `buildLounge` / `buildRoster` 均为**纯函数 → 绘制指令数组**，无副作用、无 ledger 写、无锁参改动。
- `buildWarehouse`：聚合四币（star/diamond/food/shard）HUD + 已解锁菜数 + 下一道成本；可负担才经 `getWarehouseButtons` 出解锁按钮；**不含抽卡按钮**（单测断言）。解锁入口在 `game.js` 触摸路由调用既有 `restaurant.unlockDish`（单一 API，符合 §8-C5 反作弊）。
- `buildLounge`：列出 `roster.owned()` 去重动物 + 好感度；点 critter 在 `game.js` 路由到 `cultivation.pet`（仅好感度、无货币）；含图鉴入口与空态。
- `buildRoster`：纯只读；拥有显示完整 critter + 稀有度色条，未拥有显示 `#3a3a4a` 去色剪影 + `?` 角标（符合 §5.5 家族隔离 #2 / 不变量 #1 零贴图）。
- `evalHubUnlock`：WAREHOUSE 按 `dishUnlockedCount >= TUNED.WAREHOUSE_UNLOCK_DISH_COUNT(3)`，STAFF_LOUNGE 按 `rosterOwnedCount >= TUNED.LOUNGE_UNLOCK_ROSTER_COUNT(6)`——与 GDD §2.2/§3.4/§4.6 一致，且使用 TUNED（可调、非锁参）。`getHubRegions`/`hitHubRegion` 据此返回 `locked/clickable` 与命中 id，锁定区忽略返回 `null`。
- 锁参红线：区域渲染零货币、零锁参改动。

### 4. `tests/unit/ui-state.spec.js`（Phase 2 场景三测试区 ≈L574–L753） — **PASS**

- 该区域全部 `describe`（buildWarehouse / buildLounge / buildRoster / HUB 解锁门控 / roster+cultivation 拨测 / 餐厅双入口解锁）与 render/roster/cultivation 代码一一对应，断言一致。
- 已随门禁 ① 全量通过（155/155），无红、无损坏用例。
- **Minor（非阻断覆盖缺口）**：`PET_DAILY_CAP` 未在单测中显式断言（实现逻辑正确，仅缺一条断言）。建议后续补一条日上限置灰断言，非本次阻断项。

### 5. `game.js`（L40 Phase 3 idle 接线 + L45 Phase 2 模块接线 两处注释区） — **PASS**　（附 1 CONCERN，供主理人参考）

- L40 接线：`createIdleEngine`(idle.js) / `createServeAccrual`(serve-accrual.js) / `loadGame,saveGame`(storage.js)。三模块均导出对应符号（已由 `node game.js` boot 成功 + storage 单测 `PASS` 佐证）。`idle.applyOffline/persist`、`serve.tick/setActive` 调用形态与实现签名一致。
- L45 接线：`Roster`(roster.js) / `Cultivation`(cultivation.js) / `DEFAULT_ROSTER`(gacha/index.js:252 已导出 ✅)。`buildWorld` 中 `new Roster({gacha, catalog: CATALOG})`、`new Cultivation({})` 构造正确。
- `bootDemo` 输出 `I_eff=0.540000` + `booted OK`，证明两处接线与底层模块协同正常（门禁 ③）。
- **CONCERN（顾问级，非阻断，超出本次两处注释区、供主理人裁决）**：`runUi` 内 L198 `world.ledger.apply('ui-seed', { star: 500, food: 100 })` 在**微信分支**注入免费星券+食材作真机演示启动资金，与「星券=免费 idle 唯一源 / 食材仅 idle 副产」红线的精神有张力。该分支 node boot 不走（注释已声明「不影响 node bootDemo 的账本快照」），且仅为 demo seed。建议主理人确认：生产环境应 gate 在 DEV flag 或改为一次性 onboarding seed，并确保不形成「免费循环」，以严守双货币隔离。本次仅作提示，未改动逻辑。

---

## 三、锁参红线核对（只引用绝不动）

| 红线项 | 核对结论 |
|---|---|
| `offline_factor=0.20` | 仅经 `LOCKED.OFFLINE_FACTOR` 引用（idle.js），5 文件均未重定义/改值 ✅ |
| `T_CAP_INIT=14400` | `LOCKED` 常量，未触碰 ✅ |
| `R60/SR30/SSR10`、N=0、50 抽保底、十连≥1SR、新手前 10 抽≥1SR | 位于 `LOCKED`/gacha，5 文件零改动 ✅ |
| 星券=免费 idle 唯一源 | `cultivation.pet` 零货币 ✅；仅 `game.js` L198 demo seed 存疑（见 §5 CONCERN） |
| 食材仅 idle 副产（离线不计） | `PET_FOOD_REWARD=0` 未实现；idle 离线仅结算星券（`applyOffline` 不产食材）✅ |

---

## 四、结论与下一步

- **复核签字结论：PASS（程基岩 · 2026-07-30）**。5 文件 dirext 兜底落盘内容技术正确、与 GDD 设计意图及锁参红线一致，三门禁全绿。
- 已落盘后将上述 6 处「待 engineering-lead 复核签字 / 待复核」注释改为「engineering-lead 复核签字 PASS · 2026-07-30」（仅改注释，未改任何逻辑）。
- **待主理人（游承峰）裁决项**：① `game.js` L198 demo seed 与货币红线的张力（CONCERN）；② GDD `system-scene-phase2.md` 自身 §8-C1 仓库「只读 vs 解锁入口」偏差（设计层，非本次工程文件问题）。
- 建议后续（非本次范围）：补 `PET_DAILY_CAP` 单测断言；评估 `roster.flattenRoster` 对 `_gacha._roster` 私有字段依赖是否改为显式 `getCatalog()` 接口。
