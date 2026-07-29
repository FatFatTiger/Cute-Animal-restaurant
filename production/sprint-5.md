# Sprint 5 · 多场景导航 Phase 1（HUB 中枢 + 餐厅 + 动才市场）交付记录

> 任务标签：EL-SPRINT5-001
> 阶段：Phase 5 Sprint 5（多场景导航 Phase 1）
> 主导：engineering-lead（程基岩）· 主理人：游承峰
> 范围：在 E7 canvas MVP 上实现**多场景导航 Phase 1（HUB 中枢 + 餐厅 + 动才市场）**，并把技术文档对账到「微信原生 canvas2d」pivot（用户 OP1-A）。
> **只写工程代码与文档编辑**，不写游戏设计、不动锁参、不碰美术文档（已由 art-director 改完）。

## 1. 交付清单

### A. 场景路由（src/ui/render.js 扩展 + game.js runUi）
- A.1 `src/ui/render.js` 新增纯函数（零 wx、零 canvas 依赖，Node 可测）：
  - `buildHub(state)`：中枢 cozy 地图（暖色天光 + 远山椭圆 + 4 区域圆角建筑 + 迎宾小动物 + 只读四货币 HUD），首启着陆即中枢。
  - `buildGachaMarket(state)`：动才市场（保底显示「距保底 X/50」+「再招 N 次必得 SR」、单抽/十连按钮、抽卡结果演出、IAP 占位子面板「换钻/礼包（占位）」）。
  - `buildRestaurant`（升级自 E7 `buildScene`，**导出名 `buildScene` 保持兼容**）：员工/顾客改为圆润 critter + 软阴影 + idle 动效；保留全部原有 tag（bg/hud/restaurant/seat/staff-label/demand/demand-text/float/rarity/rarity-text），既有单测不破。
  - 区域命中：`getHubRegions(w,h)` + `hitHubRegion(x,y,w,h)`（锁定区 仓库/撸毛馆 返回 null 不可点）。
  - 市场命中：`getMarketButtons(w,h)` + `hitMarketButton(x,y,w,h)`（single/ten/exchange/back）。
  - 回村：`getTopBackButton(w,h)` + `hitBackButton(x,y,w,h)`（餐厅/市场通用）。
  - 角色保真：`appendCritter(...)` 统一入口（圆润躯干 + 双耳 + 双眸 + 分层软阴影 + 帧正弦 idle）；`applyCommands` 新增 `ellipse` / `roundrect` 指令 op（旧环境无缝降级为方角/圆，不崩）。
- A.2 `game.js` `runUi` 扩展为导航状态机：
  - `NavigationState = { scene: 'HUB'|'RESTAURANT'|'GACHA_MARKET', prev }`，首启 `scene='HUB'`。
  - 每帧按 `scene` 分发 `buildHub` / `buildRestaurant` / `buildGachaMarket` → `applyCommands`。
  - 触摸路由：**HUB**→`hitHubRegion`（仅 暖爪餐厅/动才市场 可点，仓库/撸毛馆锁定忽略）；**RESTAURANT**→回村按钮 + 保留单抽/十连（E7）；**GACHA_MARKET**→`hitMarketButton`（单抽/十连/换钻/回村）。
  - 经营循环仅在 RESTAURANT 推进（模块状态独立于 UI 存活，切场不丢收益）。
  - IAP 占位：`exchange` 点击 → `wx.showModal` 说明「钻石充值需微信商户平台配置，本期占位」；**不实现真实支付**。
  - 受 flag 保护的 dev 调试发钻路径：`DEV_IAP_GRANT=false`（默认关）时走占位；置 `true` 走 `ledger.apply('dev-iap-grant-*', {diamond: 60})` 并弹 dev 标注弹窗——**保持双货币隔离（钻石不靠 idle 获得）**。

### B. Node 兼容与守卫
- `node game.js` 仍走 `IN_WECHAT=false` 分支，`bootDemo` 行为不变：`I_eff = 0.540000` + `booted OK`。
- `buildHub` / `buildGachaMarket` / `buildRestaurant` 全为纯函数（无 `wx` / 无 canvas），`applyCommands` 对 ctx 为空安全返回。
- 新增 `ellipse` / `roundrect` op 在 `tests/helpers/mock-canvas.js` 中记录为 no-op，Node 单测不抛错。

### C. 测试（tests/unit/ui-state.spec.js 扩展 + mock-canvas）
- C.1 新增 Phase 1 用例 **26 个**，覆盖：
  - `buildHub`：4 区域标识正确、锁定区（仓库/撸毛馆）渲染 🔒「即将开放」且 `hitHubRegion` 返回 null、可点区（餐厅/市场）命中返回 id、HUD 只读四货币、每区域门口迎宾小动物（critter 指令）。
  - `buildGachaMarket`：标题 + 保底（X/50 + 软提示）+ IAP 占位面板/文案 + 抽卡按钮存在 + 上次结果稀有度色块。
  - `hitHubRegion` / `hitMarketButton` / `hitBackButton` 命中与空白返回 null。
  - 角色保真：含 `roundrect` + 分层 `ellipse` 软阴影 + `critter-*` 指令；不同 `frame` 同一 critter 的 y 位置不同（idle 动效）；`applyCommands` 在 mock 上消费 `ellipse`/`roundRect` 不抛错。
- C.2 基线 85 → **111 全绿**（8 套件）。`mock-canvas` 新增 `ellipse` / `roundRect` 记录。

### D. 技术文档对账（OP1 授权，仅编辑两份）
- D.1 `docs/architecture/tech-prototype.md`：引擎由「Cocos Creator + 微信引擎插件」改为「微信原生 canvas2d（pivot 2026-07-29，用户 OP1-A）」；**删除 Spine / ASTC / WebGL shader tint 表述**；重写 ADR-1（canvas2d）、ADR-2（程序化绘制函数库，零位图）、ADR-3（主包预算去 atlas）、ADR-4（分层 fill 替代 shader tint）；同步 §1/§2/§4/§7/§8。保留**不变量 #1（零位图/贴图零增长）/#2（家族硬隔离）**。编辑处均加「修订：2026-07-29 pivot to canvas2d」说明。
- D.2 `HANDOFF.md`：同步改引擎行（微信原生 canvas2d）、资产行（程序化绘制函数库/零位图）、分色行（canvas2d 分层 fill）；§4 预算改为零位图后 ≈0.4–0.9MB；§7 风险去除 Cocos 构建表述；顶部加修订说明。
- D.3 **未触碰** `art/art-bible.md` / `art/asset-spec.md`（art-director 已改，依指令勿碰）；`design/gdd/system-scene-map.md`（v0.1 待复核，已落盘未跟踪）。

## 2. 纪律遵守
- **锁参红线未动**：R60/SR30/SSR10、N 不入池、50 保底、十连≥1SR、新手前 10≥1SR、双货币隔离、四货币、offline_factor=0.20 —— 全部由 `src/config/tunables.js` 的 LOCKED 读取，render 层抽卡成本/保底上限改从 LOCKED 取（消除硬编码漂移）。
- **不变量 #1（零位图）/ #2（家族硬隔离）** 保持不变；角色绘制走 `appendCritter` 统一入口。
- **不重写 src/ 逻辑**：仅引用 `src/restaurant` / `src/gacha` / `src/economy`（E4/E11/E12/E3 只读 getter / `drawSingle`/`drawTen` / `snapshot`）。
- **不碰 Cocos**：全仓零 Cocos 依赖，微信原生 canvas2d。
- **主包 <4MB**：size-gate 实测 ≈84.80KB（< 4MB）；零位图后预算显著低于上沿。
- **Node 安全**：wx/canvas 双 `typeof` 守卫；纯函数可单测。
- **未 commit**（高影响动作需用户/主理人批准）：本 sprint 仅落盘 + 自证，回报拟提交说明。

## 3. 验证（自证落盘，防空回）
- `git status --short`：确认 4 个工程文件 modified（`game.js`、`src/ui/render.js`、`tests/helpers/mock-canvas.js`、`tests/unit/ui-state.spec.js`）+ 文档（`docs/architecture/tech-prototype.md`、`HANDOFF.md`）。
- `npm test`：**111 passed / 8 suites**（基线 85 + 新增 26）。
- `node tests/smoke/build-size.gate.js`：**发布包 ≈84.80KB < 4MB**，exit 0。
- `node game.js`：`[bootshell] I_eff = 0.540000` + `booted OK`（IN_WECHAT=false 路径不变）。

## 4. 已知风险 / 张力
| # | 张力 | 表现 | 处置 | 状态 |
|---|------|------|------|------|
| T1 | 仓库/撸毛馆/图鉴延后 | Phase 1 GDD 仅 HUB + 餐厅 + 动才市场；仓库(WAREHOUSE)/撸毛馆(STAFF_LOUNGE) 中枢显示 🔒「即将开放」不可点 | 中枢几何已留 4 区域位，Phase 2 直接填 build*/命中即可 | 待 Phase 2 |
| T2 | `roster` 模块未显式落地 | `system-scene-map.md` §3.2 指出 E7 无 roster 对象，员工 inline 创建；撸毛馆/图鉴依赖持久化拥有动物注册表 | Phase 1 未触及；Phase 2 落地 `roster` 后再实现撸毛馆 | 待工程确认 |
| T3 | IAP 真实支付未接入 | 动才市场「换钻/礼包」仅占位（`wx.showModal` 说明），无微信商户配置/后端 | 受 `DEV_IAP_GRANT` flag 保护 dev 发钻路径；真实支付需商户平台 + 后端，本期不做 | 待用户定（OP2） |
| T4 | 中枢→餐厅多 1 次点击 | 是否打断挂机节奏 | 中枢极简、餐厅默认高频、回村 1 点击；真机验证 | 真机验证 |
| T5 | 渐变天光为扁平暖色块近似 | 微信 canvas2d `createLinearGradient` 未用（指令集保持简单、Node 安全） | 用暖色天空块 + 远山椭圆近似 cozy；如需更柔可后续加 gradient op | 增强可选 |

## 5. Phase 2 待办（仓库 / 撸毛馆 / roster）
| 项 | 依赖 | 落点 |
|----|------|------|
| 仓库(WAREHOUSE) 只读展示场景 | 无（读 `ledger` / `restaurant.getUnlockedDishes()` / 未来 `roster`） | `buildWarehouse` + `hitWarehouseRegion` |
| 撸毛馆(STAFF_LOUNGE) 拥有动物陈列 + 互动 | **`roster` 模块先行**（T2） | `buildStaffLounge` + `hitStaffLoungeRegion` + 动物详情 overlay |
| `roster` 拥有动物注册表 | gacha 结果回写 + 5 只 N 新手动物 | `src/roster/index.js`（参照 `system-scene-map.md` §3.2 依赖提示） |
| 图鉴子页（🔒未拥有剪影） | `roster` | STAFF_LOUNGE 子页 |
| IAP 真实支付 / 礼包 | 微信商户平台 + 后端 | 替换 `openIapPlaceholder` 占位 |
| 演出 overlay（抽卡全屏 / 动物详情） | UIOverlay 层 | `system-scene-map.md` §3.3 `UIOverlay` |

## 6. 跨文档不一致 / 未能解决项（回传主理人）
- **OP1（已闭合，本 sprint 执行）**：tech-prototype ADR-1/2 + art-bible §A + HANDOFF 的 Cocos+位图 atlas+shader tint 表述，已按零位图 canvas2d 重写。**但 `art/art-bible.md` §A 资产附录（PNG atlas / ASTC / Spine / 着色器 tint）的 Cocos 表述由 art-director 在 art 修订中处理**（本 sprint 依指令未碰美术文档）；建议主理人复核 art-bible §A 与 tech-prototype 现在是否完全对齐（两端都说「零位图 canvas2d」，但 art-bible §A 的逐条资产清单可能仍含 Spine/ASTC 词）。
- **OP2（IAP 入口归属）**：本 sprint 将「换钻/礼包」并入动才市场作占位子面板（GDD §8-OP2 选项 A）；真实支付/礼包形态待用户定。
- **锁参一致性**：全部锁参未动，新增渲染/导航代码不引入新经济/货币/概率改动，与 `system-scene-map.md` §4 合规表一致。
- **`system-scene-map.md` 仍是 v0.1 待复核 draft**：本 sprint 依其撰写实现，但其 §0.1 冲突披露已随本 sprint 的 pivot 文档修订而闭合。建议 lead 复核后转正。

---
*修订：2026-07-29 pivot to canvas2d（用户 OP1-A）。工程实现，不含新游戏设计。*
