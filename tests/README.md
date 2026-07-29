# 测试框架与回归套件

> 项目：可爱小动物「卡牌收集 + 餐厅放置经营」治愈系微信小游戏
> 阶段：Phase 5 Sprint 2 工程底座 · 脚手架已落地为真实回归套件
> 版本：v0.2 · 作者：engineering-lead（程基岩）· 对齐：tech-prototype.md（L1–L5、V1–V7、R1–R7、ADR-1~4）+ 三份 GDD
> 状态：已落地（Sprint 1 垂直切片 + Sprint 2 工程底座），随 CI 自动回归

> 本文件既是**结构与约定**，也是**已落地套件的真实清单**。所有 `*.spec.js` / `*.int.js` / `*.gate.js` 均已实现并通过 `npm test` / `node tests/smoke/build-size.gate.js`。

---

## 1. 测试策略分层

| 层 | 名称 | 对象 | 是否需引擎/真机 | 对应验证项 | 主要不变量（见 §3） |
|----|------|------|----------------|-----------|---------------------|
| T1 | 单元测试 | 纯逻辑模块：拼装/家族守卫/打包、经济公式（I_eff/离线/升级/养成加成） | 否（Node 直跑，零引擎依赖） | V1/V2/V3（已论证） | 1,2,3,5,6 + 经济公式 |
| T2 | 集成测试 | 系统间货币流与服务层：dish-unlock、customer-dish、serve 幂等、时钟防回拨 | 否（headless 服务层 harness，mock 引擎与 wx） | — | 3,6,7 + C1/C2 |
| T3 | 烟雾测试 | 主包体积门禁：读 `project.config.json` 非忽略文件累加，断言 <4MB | 是（需微信构建产物；门禁逻辑已 Node 可跑） | V4、R2/R4 | 主包体积门禁（ADR-3） |
| T4 | Playtest | 核心循环好玩度（占位，未落地） | 是（真机人工/半自动） | R1/R3/R7（体验侧） | 主观 + 关键不变量回归 |

**分层原则**：
- T1/T2 必须**可离线、可 Node 直跑、可 CI 秒级反馈**——一切可纯逻辑验证的都上 T1/T2，不依赖真机。
- T3 是**体积/启动的硬门禁**，失败即阻断发布（见 `.github/workflows/ci.yml` 的 `size-gate` job）。
- T4 是人工主导的体验验证，本 Sprint 未落地，不进自动 CI 阻断。

---

## 2. 目录结构（真实落盘）

```
tests/
├── README.md            # 本文件（约定 + 真实清单）
├── unit/                # T1 单元测试：拼装 / 经济公式
│   ├── assembly.spec.js       # ★Sprint2新增：atlas 零增长(1)、家族守卫(2)、pack/unpack、tint 契约
│   └── economy.spec.js        # I_eff / 离线封顶(5) / 升级成本 / 货币守恒钩子(3) / 解锁原子扣费(6)
├── integration/         # T2 集成测试：跨系统货币流与服务层
│   ├── customer-dish.int.js        # 顾客需求-解锁匹配(7)
│   ├── dish-unlock.int.js          # 菜品解锁原子扣费(6) 跨系统：解锁→账本→顾客可服务性
│   └── qa-gaps.int.js              # ★Sprint2新增：C1 serve 幂等(requestId) + C2 时钟防回拨(clock)/跨批次守恒(economy-harness)
├── smoke/               # T3 烟雾测试：构建/体积门禁
│   └── build-size.gate.js          # 主包 <4MB 门禁（读 project.config.json packOptions.ignore 累加）
├── fixtures/            # 共享测试数据（不随游戏运行加载）
│   ├── animals.json            # 示例动物参数（cat_01/birb_02/blob_03/fish_99 等）
│   └── economy-config.json      # 货币定义/升级成本/离线参数
└── helpers/             # 测试 harness（mock，无引擎）
    ├── mock-wx-storage.js      # wx.getStorage/setStorage 内存实现
    ├── seeded-rng.js           # 可种子 RNG，保证概率测试可复现
    ├── economy-harness.js      # 内存账本，供集成测试注入（assertConservation）
    └── clock.js                # 可注入时钟，模拟服务端时间戳（离线/免费抽防回拨）
```

> 占位但未落地（本 Sprint 不做，留待对应 epic / E3）：`gacha.spec.js`、`cultivation.spec.js`、`gacha-economy.int.js`、`idle-economy-gacha.int.js`、`bond-idle.int.js`、`device-boot.smoke.js`、`playtest/` 下文件、`fixtures/gacha-config.json`。其中抽卡相关（gacha.*、cultivation.*、bond-idle.*）随 **E3 抽卡**落地；device-boot / playtest 随真实微信构建环境接入启用。

### 命名规范
- 单元测试：`{module}.spec.js`，纯逻辑断言（jest）。
- 集成测试：`{a}-{b}.int.js`，跨模块，使用 `helpers/` harness。
- 烟雾测试：`{purpose}.gate.js`（门禁，布尔阻断）。

### 如何运行
```bash
# T1 + T2 全量逻辑测试（CI 默认跑，对应 ci.yml 的 test job）
npm test

# 仅单测 / 仅集成
npm run test:unit        # jest tests/unit
npm run test:int         # jest tests/integration

# T3 主包体积门禁（CI 对应 size-gate job；也可本地直接跑）
node tests/smoke/build-size.gate.js
```

---

## 3. 关键待测不变量（Invariants）

> 每条不变量标注：来源、Given、Assert、**落点（真实文件）**。带 ★ 为本 Sprint（Sprint 2）新增覆盖。

### 不变量 1 · atlas 字节零增长 ★（Sprint2 新增覆盖）
- **来源**：tech-prototype V1 / ADR-2；assembly-demo.js `registerAnimal` 断言。
- **Given**：当前 `atlasBytes = BASE`（BASE 须以真实烘焙图集替换 R-ATLAS-CONST 常量）；注册 N 只新动物（仅写 JSON 参数，不增贴图）。
- **Assert**：`atlasBytes_after − atlasBytes_before == 0`；单只参数 `≤ 64B`（V2）。
- **落点**：`tests/unit/assembly.spec.js`（经 `AssemblyRegistry.atlasDelta`）。

### 不变量 2 · 跨家族组合运行时抛错 ★（Sprint2 新增覆盖）
- **来源**：tech-prototype V3 / ADR-2；R-GUARD-NUANCE（白名单例外）。
- **Given**：动物参数含跨家族部件（如鱼头 + 哺乳身）。
- **Assert**：`validateFamily` 抛 `FamilyIsolationError`；同家族组合通过；`universal` 槽位与显式多家族槽位（L0=[mammal,bird]、L2=[round,aquatic]）跨家族声明**不**误报。
- **落点**：`tests/unit/assembly.spec.js`。

### 不变量 3 · 货币守恒（星券产出 = 消耗 + 贮存）
- **来源**：system-gacha §3.6 / system-idle §3.1 / system-cultivation §3.3；E6 单值源。
- **Given**：一个关闭交易批次，期间发生若干笔产出与消耗，经 `economy-harness` 账本记录。
- **Assert**：`Σ产出 == Σ消耗 + Δ余额`；钻石不经由放置经营产出路径进入；同一 `requestId` 重复提交只计一次。
- **落点**：`tests/unit/economy.spec.js`（守恒钩子）+ `tests/integration/qa-gaps.int.js`（C2 harness 跨批次守恒）。

### 不变量 4 · 保底计数正确（未覆盖）
- **来源**：system-gacha §2/§3.1/§3.2；tech-prototype R-GACHA-OUT-OF-SCOPE。
- **状态**：**未覆盖**——抽卡（E3）本 Sprint 不实现，故 `tests/unit/gacha.spec.js` 未落地。随 E3 落地补齐。
- **落点（规划）**：`tests/unit/gacha.spec.js`（E3-S1/S2/S3）。

### 不变量 5 · 离线收益封顶
- **来源**：system-idle §3.2 / §4；tech-prototype R-LOGIC（服务端时间戳结算）。
- **Given**：`T_off`（离线时长）、`T_cap`（初始 14400s）、`offline_factor=0.20`、`I_eff`，时钟经 `helpers/clock.js` 注入。
- **Assert**：
  - `accumulated == I_eff × offline_factor × min(T_off, T_cap)`；
  - `T_off` 超过 `T_cap` 部分不累积；
  - 本地时钟回拨不影响结果（以注入服务端 `now` 为准）。
- **落点**：`tests/unit/economy.spec.js`（离线）+ `tests/integration/qa-gaps.int.js`（C2 clock 防回拨）。

### 不变量 6 · 菜品解锁扣费原子性
- **来源**：system-idle-restaurant v0.2 §3.5 + E6 单值源账本 + E11。
- **Given**：玩家对第 `n` 道菜发起解锁（持有 `star`/`food`），交易携带唯一 `requestId`，经 E6 统一事务接口。
- **Assert**：
  - **success**：星券与食材在**同一事务中同时扣减**（`unlock_cost_star(n)` 与 `unlock_cost_food(n)`，GDD v0.2，tunable，待 design-strategist 复核）。
  - **no partial**：任一侧不足 → 两侧均不扣减，账本无悬挂（`unlocked_dishes` 不变）。
  - **幂等**：同一 `requestId` 重复提交只计一次。
- **落点**：`tests/unit/economy.spec.js`（原子扣费单测）+ `tests/integration/dish-unlock.int.js`（跨系统）。

### 不变量 7 · 顾客需求-解锁匹配
- **来源**：system-idle-restaurant v0.2 §2/§3.4 + E12。
- **Given**：顾客上门携带需求菜品 `d`，已知 `unlocked_dishes` 与三岗在岗状态。
- **Assert**：
  - `d ∉ unlocked_dishes` → 不可服务：不贡献 `I_eff`、不结算、无惩罚。
  - `d ∈ unlocked_dishes` 且**任一岗位在岗** → 可服务并计入 `I_eff`。
  - 结果可复现（固定输入 → 确定输出，seeded）。
- **落点**：`tests/integration/customer-dish.int.js`。

### 附加不变量（经济公式自洽，落点同 3/5）
- 在线 `I_eff` 三分支乘区（座位 C / 工位 station / 菜谱 recipe）正确，无双计（system-idle §3.1）。
- 升级成本曲线：`seats 200×1.5^n`、`stations/recipes 150×1.4^n`，上限锁定置灰（system-idle §3.3）。
- 养成加成：idle +3%/只（前 10 上岗计，上限 +30%）、碎片 +10%（上限 +20%）、挚友 `T_serve −5%`，数值与 GDD 完全一致（system-cultivation §3.2）。
- `packAnimal` 对 `deform` 打包前钳制，超界不静默 `&0xFF` 回绕（R-ENCODE）。

---

## 4. CI（真实，见 `.github/workflows/ci.yml`）

> 微信小游戏主包硬上限 **4MB**（ADR-3）。真实 CI 已落地于 `.github/workflows/ci.yml`，两个 job：
> - `test`：`npm ci` → `npm test`（jest tests/unit + tests/integration，零真机依赖）。
> - `size-gate`：`npm ci` → `node tests/smoke/build-size.gate.js`（主包 <4MB 硬门禁）。

```yaml
# .github/workflows/ci.yml（真实实现）
name: ci
on: [push, pull_request]
jobs:
  test:        # T1 + T2：逻辑回归
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm ci
      - run: npm test
  size-gate:   # T3：主包体积门禁（硬卡）
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm ci
      - run: node tests/smoke/build-size.gate.js
```

### 门禁阈值（与 tech-prototype §4 对齐）
| 项 | 阈值 | 动作 |
|----|------|------|
| 主包体积 | `< 4MB`（硬）｜ `> 1.9MB` 告警 | 超硬限 → 阻断；超告警 → 标黄 |
| 单分包体积 | `< 16MB` | 超 → 阻断 |
| 真机启动 | 引擎插件注入 + 首屏可交互（V6/V7） | 失败 → 阻断（待 device-boot.smoke.js 接入后启用） |

> `build-size.gate.js` 当前直接读仓库内 `project.config.json` 的 `packOptions.ignore` 累加非忽略文件（等价于发布包内容），无需先跑 Cocos 构建即可在 CI 秒级回归。待真实微信构建环境接入后，`device-boot.smoke.js` 与分包 <16MB 检查再补。

---

## 5. 与 tech-prototype / GDD 的追溯映射（真实落点）

| 测试资产 | 对应来源 | 状态 |
|----------|----------|------|
| `assembly.spec.js` ★ | tech-prototype V1/V2/V3、ADR-2、assembly-demo.js | Sprint 2 新增 |
| `economy.spec.js` | system-idle §3.1/§3.2/§3.3、system-cultivation §3.2/§3.3 | Sprint 1 |
| `dish-unlock.int.js` | system-idle-restaurant v0.2 §3.5 + E11 + E6 | Sprint 1 |
| `customer-dish.int.js` | system-idle-restaurant v0.2 §2/§3.4 + E12 + E4 | Sprint 1 |
| `qa-gaps.int.js` ★ | Sprint1 QA（C1 serve 幂等 / C2 clock+harness 死 helper 回收） | Sprint 2 新增 |
| `build-size.gate.js` | ADR-3、tech-prototype §4（首包预算）、§7（V4） | Sprint 2 新增 |
| `gacha.spec.js` | system-gacha §2/§3.1–§3.5 | **未落地（E3 延后）** |
| `cultivation.spec.js` / `bond-idle.int.js` | system-cultivation §2/§3.1/§3.2 | **未落地（E3 延后）** |

---

> 文件状态：v0.2 已落地（Sprint 1 + Sprint 2）。下一步：E3 抽卡落地时补齐 gacha/cultivation 套件与 device-boot/playtest；D-NOTE-1~5 设计评审结论落地到对应 epic 后再补集成用例（见 `production/sprint-2.md` §4 待办）。
