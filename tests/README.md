# 测试框架脚手架（结构占位 · 无实现）

> 项目：可爱小动物「卡牌收集 + 餐厅放置经营」治愈系微信小游戏
> 阶段：Phase 4 预生产 · 仅脚手架（目录约定 / 分层策略 / 不变量 / CI 占位）
> 版本：v0.1 · 作者：engineering-lead（程基岩）· 对齐：tech-prototype.md（L1–L5、V1–V7、R1–R7、ADR-1~4）+ 三份 GDD
> 状态：草稿，待主理人游承峰审批

> ⚠️ 本文件只定义**结构与约定**，不含任何测试代码或游戏逻辑。具体 `*.spec.js` / `*.test.js` 在实现阶段按本约定落地。

---

## 1. 测试策略分层

| 层 | 名称 | 对象 | 是否需引擎/真机 | 对应验证项 | 主要不变量（见 §3） |
|----|------|------|----------------|-----------|---------------------|
| T1 | 单元测试 | 纯逻辑模块：拼装/家族守卫/打包、经济公式（I_eff/离线/升级/抽卡/保底/碎片/加成/三岗/适配）、解锁原子扣费 | 否（Node 直跑，零引擎依赖） | V1/V2/V3（已论证） | 1,2,4,5,6 + 经济公式 |
| T2 | 集成测试 | 系统间货币流：gacha→economy→cultivation、idle→economy→gacha、bond→I_eff、dish-unlock、customer-dish | 否（headless 服务层 harness，mock 引擎与 wx） | — | 3, 6(集成侧), 7（货币守恒 + 解锁原子 + 需求匹配） |
| T3 | 烟雾测试 | 真机构建启动：构建成功、主包 <4MB、引擎插件注入、首屏 boot、分包按需命中 | 是（微信开发者工具 / 真机） | V4/V6/V7、R2/R4 | 主包体积门禁 |
| T4 | Playtest | 核心循环好玩度：垂直切片（拼装→餐厅→抽卡）可玩性、留存代理指标 | 是（真机人工/半自动） | R1/R3/R7（体验侧） | 主观 + 关键不变量回归 |

**分层原则**：
- T1/T2 必须**可离线、可 Node 直跑、可 CI 秒级反馈**——一切可纯逻辑验证的都上 T1/T2，不依赖真机。
- T3 是**体积/启动的硬门禁**，失败即阻断发布（§4）。
- T4 是人工主导的体验验证，不进自动 CI 阻断，仅出观察表（playtest/ 下）。

---

## 2. 目录结构约定

```
tests/
├── README.md            # 本文件（脚手架与约定）
├── unit/                # T1 单元测试：拼装 / 经济公式 / 抽卡 / 养成
│   ├── assembly.spec.js       # atlas 零增长、家族守卫、pack/unpack、tint 契约
│   ├── economy.spec.js        # I_eff / 离线 / 升级成本 / 货币守恒钩子
│   ├── gacha.spec.js          # 摇号分布 / 保底 / 十连 / 新手 / 碎片
│   └── cultivation.spec.js    # 好感/XP/羁绊阶层/加成
├── integration/         # T2 集成测试：跨系统货币流
│   ├── gacha-economy.int.js        # 抽卡扣费+碎片→养成账本一致性
│   ├── idle-economy-gacha.int.js   # 餐厅产星券→抽卡可用
│    └── bond-idle.int.js            # 家人上岗→I_eff +3%/只 上限 +30%
├── smoke/               # T3 烟雾测试：构建/启动/分包
│   ├── build-size.gate.js           # 主包 <4MB 门禁（读构构建产物）
│   └── device-boot.smoke.js         # 真机/开发者工具启动脚本（占位）
├── playtest/            # T4 体验验证：脚本 + 观察表（人工）
│   ├── vertical-slice.checklist.md  # 拼装→餐厅→抽卡 可玩性清单
│   └── retention-proxy.md           # 次留/7留 代理指标观测表
├── fixtures/            # 共享测试数据（不随游戏运行加载）
│   ├── animals.json            # 示例动物参数（cat_01/birb_02/blob_03/fish_99 等）
│   ├── gacha-config.json       # 概率表/保底/碎片/升星配置
│   └── economy-config.json     # 货币定义/升级成本/离线参数
└── helpers/             # 测试 harness（mock，无引擎）
    ├── mock-wx-storage.js      # wx.getStorage/setStorage 内存实现
    ├── seeded-rng.js           # 可种子 RNG，保证抽卡/概率测试可复现
    ├── economy-harness.js      # 内存账本，供集成测试注入
    └── clock.js                # 可注入时钟，模拟服务端时间戳（离线/免费抽防回拨）
```

### 命名规范
- 单元测试：`{module}.spec.js`，纯逻辑断言（Node `assert` / jest / vitest）。
- 集成测试：`{a}-{b}.int.js`，跨模块，使用 `helpers/` harness。
- 烟雾测试：`{purpose}.gate.js`（门禁，布尔阻断）/ `{purpose}.smoke.js`（真机脚本）。
- Playtest：`.checklist.md` / `.md` 观察表。
- 描述块（describe）按「模块 → 不变量」组织，便于与不变量表（§3）双向追溯。

### 如何运行（占位命令）
```bash
# T1 单元测试（最快，CI 默认跑）
npm run test:unit            # 等价 jest tests/unit
# 或单文件
npx jest tests/unit/gacha.spec.js

# T2 集成测试
npm run test:int             # jest tests/integration

# T1 + T2 全量逻辑测试
npm test

# T3 烟雾：需先构建 + 微信开发者工具 CLI
npm run build                # Cocos 构建（引擎外置）
npm run test:smoke           # 启动开发者工具、读产物、跑 build-size.gate + device-boot

# T4 Playtest：人工/半自动，仅打开清单
npm run playtest             # 打开 tests/playtest/vertical-slice.checklist.md
```
> 占位说明：上述 `npm scripts` 在实现阶段于 `package.json` 落地；本脚手架不创建脚本文件。

---

## 3. 关键待测不变量（Invariants）

> 每条不变量标注：来源（GDD/ADR/验证项）、给定（Given）、断言（Assert）、落点（测试文件）。实现阶段据此写 `*.spec.js`。

### 不变量 1 · atlas 字节零增长
- **来源**：tech-prototype V1 / ADR-2；assembly-demo.js `registerAnimal` 断言。
- **Given**：当前 `atlasBytes = BASE`（BASE 须以真实烘焙图集替换 R-ATLAS-CONST 常量）；注册 N 只新动物（仅写 JSON 参数，不增贴图）。
- **Assert**：`atlasBytes_after − atlasBytes_before == 0`；单只参数 `≤ 64B`（V2）。
- **落点**：`tests/unit/assembly.spec.js`（E2-S4）。

### 不变量 2 · 跨家族组合运行时抛错
- **来源**：tech-prototype V3 / ADR-2；R-GUARD-NUANCE（白名单例外）。
- **Given**：动物参数含跨家族部件（如鱼头 + 哺乳身）。
- **Assert**：`validateFamily` 抛 `FamilyIsolationError`；同家族组合通过；`universal` 槽位与显式多家族槽位（L0=[mammal,bird]、L2=[round,aquatic]）跨家族声明**不**误报。
- **落点**：`tests/unit/assembly.spec.js`（E2-S2）。

### 不变量 3 · 货币守恒（星券产出 = 消耗 + 贮存）
- **来源**：system-gacha §3.6 / system-idle §3.1 / system-cultivation §3.3；E6 单值源。
- **Given**：一个关闭交易批次，期间发生若干笔产出（放置/抽卡每日免费/回收）与消耗（抽卡/升级/升星），经 `economy-harness` 账本记录。
- **Assert**：`Σ产出 == Σ消耗 + Δ余额`（即期末余额 − 期初余额 == 净产出 − 净消耗）；钻石不经由放置经营产出路径进入；同一 `requestId` 重复提交只计一次。
- **落点**：`tests/unit/economy.spec.js`（守恒钩子）+ `tests/integration/*`（跨系统流）。

### 不变量 4 · 保底计数正确
- **来源**：system-gacha §2/§3.1/§3.2；tech-prototype R-GACHA-OUT-OF-SCOPE。
- **Given**：连续抽卡序列，含单抽/十连/每日免费抽混合，使用 `seeded-rng` 可控。
- **Assert**：
  - `pity ∈ [0,50]`，每次抽 +1，SSR 获取后归零；
  - 跨货币（星券/钻石）共享同一 `pity`；
  - `pity ≥ 50` → 本次必出 SSR（硬保底）；
  - 软保底 `c∈[41,49]`：`SSR_rate(c)=min(1.0, 0.10+0.09×(c−40))`（c=41≈19%、c=45≈55%、c=49≈91%）；
  - 十连保底 ≥1 SR；新手前 10 抽保底 ≥1 SR；
  - 大样本蒙特卡洛：R≈60% / SR≈30% / SSR≈10% / N=0%（容差 ±1%）。
- **落点**：`tests/unit/gacha.spec.js`（E3-S1/S2/S3）。

### 不变量 5 · 离线收益封顶
- **来源**：system-idle §3.2 / §4；tech-prototype R-LOGIC（服务端时间戳结算）。
- **Given**：`T_off`（离线时长）、`T_cap`（初始 14400s，可扩至 12h）、`offline_factor=0.20`、`I_eff`（由在线公式算得），时钟经 `helpers/clock.js` 注入。
- **Assert**：
  - `accumulated == I_eff × offline_factor × min(T_off, T_cap)`；
  - `T_off` 超过 `T_cap` 部分不累积（软上限防通胀）；
  - 本地时钟回拨不影响结果（以注入的服务端 `now` 为准）。
- **落点**：`tests/unit/economy.spec.js`（E4-S2 / 离线）。

### 不变量 6 · 菜品解锁扣费原子性
- **来源**：system-idle-restaurant v0.2 §3.5 解锁公式 + E6 单值源账本 + 新增 E11。
- **Given**：玩家对第 `n` 道菜发起解锁（持有 `star`/`food` 余额），交易携带唯一 `requestId`，经 E6 统一事务接口。
- **Assert**：
  - **success 路径**：星券与食材在**同一服务端事务中同时扣减**（扣减额 = `unlock_cost_star(n)` 与 `unlock_cost_food(n)`，公式引用 GDD v0.2，标 tunable，待 design-strategist 复核）。
  - **no partial state**：任一侧余额不足 → 两侧**均不扣减**，账本无悬挂、无半完成解锁（`unlocked_dishes` 不变）。
  - **幂等**：同一 `requestId` 重复提交只计一次（复用不变量 3 的 `requestId` 语义，E6 单值源去重）。
- **落点**：`tests/unit/economy.spec.js`（原子扣费单测，E11-S1）+ 建议新增 `tests/integration/dish-unlock.int.js`（跨系统：解锁 → 账本 → 顾客可服务性，E11/E12 联动）。

### 不变量 7 · 顾客需求-解锁匹配
- **来源**：system-idle-restaurant v0.2 §2/§3.4 + 新增 E12。
- **Given**：顾客上门携带需求菜品 `d`（携带 `dish_demand`），已知 `unlocked_dishes` 集合与三岗在岗员工状态。
- **Assert**：
  - 若 `d ∉ unlocked_dishes` → 该顾客**不可被服务**：不贡献 `I_eff`、不触发结算、无惩罚（占位不产出，UI 提示解锁）。
  - 若 `d ∈ unlocked_dishes` 且**任一岗位有在岗员工**（GDD 未定义菜种↔特定岗位耦合，不要求菜-岗匹配，避免 over-constrain）→ 可服务且计入 `I_eff`（结算星券/食材）。
  - 需求匹配结果**可复现**（固定输入 → 确定输出，seeded）。
- **落点**：建议新增 `tests/integration/customer-dish.int.js`（E12-S2 + E4-S4/S5 联动）+ 对应 §5 追溯表补两行。

### 附加不变量（经济公式自洽，落点同不变量 3/5）
- 在线 `I_eff` 三分支乘区（座位 C / 工位 station / 菜谱 recipe）正确，无双计（system-idle §3.1）。
- 升级成本曲线：`seats 200×1.5^n`、`stations/recipes 150×1.4^n`，上限锁定按钮置灰（system-idle §3.3）。
- 养成加成：idle +3%/只（前 10 上岗计，上限 +30%）、碎片 +10%（上限 +20%）、挚友 `T_serve −5%`，数值与经营/抽卡 GDD 完全一致（system-cultivation §3.2）。
- `packAnimal` 对 `deform` 打包前钳制，超界不静默 `&0xFF` 回绕（R-ENCODE）。

---

## 4. CI 占位（构建 + 分包体积门禁）

> 微信小游戏主包硬上限 **4MB**（ADR-3）。以下为 CI 流程占位，落地于 `.github/workflows/ci.yml` 或等价平台流水线。

```yaml
# .github/workflows/ci.yml（占位骨架，非完整实现）
name: wechat-minigame-ci
on: [push, pull_request]

jobs:
  logic-tests:               # T1 + T2：快速逻辑回归，零真机依赖
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm ci
      - run: npm test            # jest tests/unit + tests/integration

  build-and-gate:            # T3：构建 + 主包体积门禁（硬卡）
    needs: logic-tests
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npm run build       # Cocos 构建（引擎外置，不计入主包）
      - name: 主包体积门禁
        run: node tests/smoke/build-size.gate.js
        # 门禁逻辑（占位）：
        #   读构建产物主包目录大小 mainBytes
        #   assert mainBytes < 4 * 1024 * 1024            // 硬上限
        #   warn  if mainBytes > 1.9 * 1024 * 1024         // 接近首屏预算上沿(tech-prototype §4)
        #   assert 每个分包 < 16 * 1024 * 1024             // 微信分包上限
        #   失败 → 非零退出，阻断合并/发布
      - name: 真机启动烟雾（可选，需 self-hosted + 微信开发者工具）
        if: github.event_name == 'push' && github.ref == 'refs/heads/main'
        run: npm run test:smoke   # device-boot.smoke.js（V4/V6/V7、R2/R4 待证伪）
```

### 门禁阈值（与 tech-prototype §4 对齐）
| 项 | 阈值 | 动作 |
|----|------|------|
| 主包体积 | `< 4MB`（硬）｜ `> 1.9MB` 告警 | 超硬限 → 阻断；超告警 → 标黄 |
| 单分包体积 | `< 16MB` | 超 → 阻断 |
| 真机启动 | 引擎插件注入 + 首屏可交互（V6/V7） | 失败 → 阻断（仅 main 分支跑） |

### 待证伪项的 CI 处理
- V4（主包 <4MB）、V6（引擎插件）、V7（分包命中）、R2/R4（耗时）由 T3 门禁与真机 smoke 覆盖，**当前为占位**，待真实构建环境接入后启用。
- R1/R3/R7（帧率/低色域 tint/内存）归入 T4 Playtest 观测，不阻断自动 CI。

---

## 5. 与 tech-prototype / GDD 的追溯映射

| 测试资产 | 对应来源 |
|----------|----------|
| `assembly.spec.js` | tech-prototype V1/V2/V3、ADR-2、assembly-demo.js |
| `economy.spec.js` | system-idle §3.1/§3.2/§3.3、system-gacha §3.6、system-cultivation §3.2/§3.3 |
| `gacha.spec.js` | system-gacha §2/§3.1/§3.2/§3.3/§3.4/§3.5 |
| `cultivation.spec.js` | system-cultivation §2/§3.1/§3.2 |
| `integration/*` | E6 货币单值源 + 三份 GDD 跨系统接口（§7） |
| `build-size.gate.js` | ADR-3、tech-prototype §4（首包预算）、§7（V4） |
| `dish-unlock.int.js` | system-idle-restaurant v0.2 §3.5（解锁原子扣费公式）+ E11（菜品解锁经济）+ E6 单值源 |
| `customer-dish.int.js` | system-idle-restaurant v0.2 §2/§3.4（顾客需求/匹配）+ E12（顾客系统）+ E4（三岗在岗判定） |

---

> 文件状态：脚手架 v0.1，待主理人游承峰审批。下一步：审批后由实现阶段按本约定落地 `tests/unit`、`tests/integration` 具体用例与 `package.json` 脚本，并把 `build-size.gate.js` 接入 CI。
