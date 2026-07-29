'use strict';

/**
 * 微信小游戏壳 · EL-WXSHELL-001（V7 真机修复版 + E7 canvas 渲染循环）
 *
 * 关键修复（V7）：微信小游戏是「渲染驱动」运行时，真机要求启动时至少创建一个
 * canvas 作为首屏，否则真机会一直卡在 loading。本壳用微信原生 `wx.createCanvas()`
 * + `getContext('2d')`，不引入 Cocos / 引擎（保持主包 <4MB）。
 *
 * E7（Sprint 4 · EL-E7-001）：在真机分支接入 canvas 渲染循环 —— 每帧用
 * `buildScene(state)`（纯函数，来自 src/ui/render.js）把 Restaurant / GachaEngine /
 * Ledger 的只读状态映射为绘制指令，再 `applyCommands(ctx, cmds)` 落到 2d 上下文；
 * `wx.onTouchStart` 监听抽卡按钮命中，点击触发 E3 抽卡并演出结果。
 * Phase 1（sprint-5）：扩展为多场景导航 —— NavigationState(HUB/RESTAURANT/GACHA_MARKET)
 * 按 scene 分发 buildHub / buildRestaurant / buildGachaMarket；触摸按场景路由（中枢区域 /
 * 餐厅回村 / 市场单抽十连与换钻占位）。修订：2026-07-29 pivot to canvas2d（用户 OP1-A）。
 *
 * 纯逻辑层（src/ 的 E4/E11/E12 + E3）不重写、只被引用；UI 不持有游戏状态。
 *
 * 目标：让现有 src/ 纯逻辑在微信真机 boot 且「可见可玩」（告别黑屏）；
 *      本地 `node game.js` 也能跑通（wx typeof 守卫），且输出与改造前一致
 *      （I_eff = 0.540000 + booted OK）。
 */

// —— 环境守卫：wx 仅在微信运行时存在；node 下 typeof wx === 'undefined' ——
const IN_WECHAT = typeof wx !== 'undefined';

// —— 渲染层（纯函数 + 2d 指令落地，零引擎依赖）——
const {
  buildScene, buildHub, buildGachaMarket, buildWarehouse, buildLounge, buildRoster,
  applyCommands, hitHubRegion, hitMarketButton, hitBackButton, hitWarehouseButton,
  hitLoungePet, getLoungeButtons, hitRestaurantUnlock, SCENE,
} = require('./src/ui/render');
// 注意：餐厅场景不再引用 hitGachaButton（抽卡按钮仅存于动才市场 GACHA_MARKET）

// —— 锁参（纯 JS；pity 上限 / 新手窗口只从此读，不硬编码）——
const { LOCKED } = require('./src/config/tunables');

// —— Phase 2 模块（roster 图鉴 / cultivation 撸毛；agent 空回，主理人兜底落盘，待复核）——
const { Roster } = require('./src/roster');
const { Cultivation } = require('./src/cultivation');
const { DEFAULT_ROSTER } = require('./src/gacha/index');

// 全量动物目录（flat，供图鉴 🔒 剪影 + 撸毛馆稀有度着色）
function flattenCatalog(rosterByRarity) {
  const out = [];
  for (const r of ['SSR', 'SR', 'R']) {
    const bucket = (rosterByRarity && rosterByRarity[r]) || [];
    for (const id of bucket) out.push({ id, rarity: r });
  }
  return out;
}
const CATALOG = flattenCatalog(DEFAULT_ROSTER);
const CATALOG_MAP = {};
CATALOG.forEach((e) => { CATALOG_MAP[e.id] = e.rarity; });

// —— IAP 占位 / dev 调试发钻（受 flag 保护，默认关闭；保持双货币隔离：钻石不靠 idle 获得）——
const DEV_IAP_GRANT = false; // 真实微信 IAP 需商户平台配置 + 后端，本期不做；dev 路径仅本地调试
const DEV_IAP_GRANT_AMOUNT = 60; // 单次 dev 发钻量（清晰标注，非 IAP 产出）

// —— 全局错误捕获（真机静默卡 loading 时，把错误暴露出来）——
if (IN_WECHAT && typeof wx.onError === 'function') {
  wx.onError(function (err) {
    const msg = err && err.message ? err.message : String(err);
    console.error('[bootshell] wx.onError:', msg);
  });
}

// 复用现有纯逻辑模块（相对路径，微信 / node 均支持 CommonJS require）。
// 放在 main 内 try 中，确保「模块加载失败」也能被捕获弹窗，而非静默卡死。
function buildWorld(Mods) {
  const { Restaurant, createStaff, spawnCustomer } = Mods.restaurant;
  const { Ledger } = Mods.ledger;
  const { GachaEngine } = Mods.gacha;

  // 四货币单值源账本（初始为空，首次服务即入账）；gacha 与 restaurant 共享同一账本，
  // 以便「服务赚星券 → 抽卡花星券」形成闭环（双货币隔离由各自 apply 路径保证）。
  const ledger = new Ledger({ star: 0, diamond: 0, food: 0, shard: 0 });

  // 三岗各 1 名在岗员工（含主适配岗，制造策略纵深）—— 须在构造 Restaurant 前创建
  const chef = createStaff({ id: 'staff_chef', affinityRole: 'chef', level: 1 });
  const waiter = createStaff({ id: 'staff_waiter', affinityRole: 'waiter', level: 1 });
  const host = createStaff({ id: 'staff_host', affinityRole: 'host', level: 1 });

  // 餐厅：initialDishes 默认 ['dish_1','dish_2'] → 2 道已解锁菜
  const restaurant = new Restaurant({
    ledger,
    initialDishes: ['dish_1', 'dish_2'],
    staff: [chef, waiter, host],
    C: 4,
    recipeLv: 1,
    stationLv: 1,
    bondFamilyCount: 0,
    adMult: 1,
    activeBonus: 0,
  });

  restaurant.schedule.assign('staff_chef', 'chef');
  restaurant.schedule.assign('staff_waiter', 'waiter');
  restaurant.schedule.assign('staff_host', 'host');

  // 抽卡引擎（共享 ledger；星券扣费经 E6 ledger 幂等，不回改既有不变量）
  const gacha = new GachaEngine({ ledger });

  // Phase 2：图鉴注册表（去重拥有动物）+ 养成（撸毛仅好感度，不产货币）
  const roster = new Roster({ gacha, catalog: CATALOG });
  const cultivation = new Cultivation({});

  // 1 名演示顾客（rng=()=>0 确定取 dishPool[0]=dish_1，确保可服务）
  const customer = spawnCustomer(() => 0, ['dish_1', 'dish_2'], {
    id: 'cust_demo',
    seatId: 0,
  });

  return {
    ledger,
    restaurant,
    gacha,
    roster,
    cultivation,
    customer,
    customers: [customer],
    unlockedPool: ['dish_1', 'dish_2'],
    custSeq: 1,
  };
}

/** 组装囤囤仓只读视图（四币 + 已解锁菜 + 下一道可解锁成本）。 */
function buildWarehouseView(world) {
  const ledger = world.ledger.snapshot();
  const unlocked = world.restaurant.getUnlockedDishes();
  const next = world.restaurant.dishes.nextCost();
  const nextId = 'dish_' + (unlocked.length + 1);
  return {
    ledger,
    dishes: unlocked.map((id) => ({ id, unlocked: true, costStar: 0, costFood: 0 })),
    nextDish: { id: nextId, costStar: next.star, costFood: next.food },
  };
}

/** 组装撸毛馆只读视图（去重拥有动物 + 好感度 / 羁绊阶层）。 */
function buildLoungeView(world) {
  const owned = world.roster.owned().map((id) => ({
    id,
    rarity: CATALOG_MAP[id] || 'R',
    affinity: world.cultivation.affinityOf(id),
    bondTier: world.cultivation.bondTier(id),
  }));
  return { owned };
}

function bootDemo(Mods) {
  const world = buildWorld(Mods);
  const { restaurant, ledger, customer } = world;

  // 跑一次服务周期（dt = 1 秒）
  const Ieff = restaurant.computeIeff();
  const result = restaurant.serve(customer, 1.0, 'boot-demo-serve-1');

  // —— 输出（console 在微信 / node 均可用）——
  console.log('[bootshell] demo: 2 unlocked dishes, 3 on-duty staff (chef/waiter/host), 1 customer demanding', customer.dishDemand);
  console.log('[bootshell] I_eff =', Ieff.toFixed(6));
  console.log('[bootshell] service result =', JSON.stringify({
    serviceable: result.serviceable,
    unlocked: result.unlocked,
    staffed: result.staffed,
    Ieff: result.Ieff != null ? Number(result.Ieff.toFixed(6)) : null,
    earned: result.earned,
    ledgerOk: result.ledgerOk,
    dup: result.dup,
  }));
  console.log('[bootshell] ledger snapshot =', JSON.stringify(ledger.snapshot()));

  console.log('[bootshell] runtime =', IN_WECHAT ? 'WeChat (wx detected)' : 'node (wx absent, typeof guard OK)');
  console.log('[bootshell] WeChat mini-game shell booted OK');
  return world;
}

/**
 * 真机渲染循环（仅 WeChat 分支调用；node 不进入）。
 * Phase 1 多场景导航：NavigationState(scene, prev) 驱动每帧按 scene 分发
 * buildHub / buildRestaurant(buildScene) / buildGachaMarket；触摸按当前场景路由：
 *   HUB      → hitHubRegion（仅 暖爪餐厅 / 动才市场 可点；仓库/撸毛馆锁定忽略）
 *   RESTAURANT→ 回村按钮 + 既有单抽/十连（保留 E7）
 *   GACHA_MARKET→ hitMarketButton（单抽/十连/换钻占位/回村）
 * 经营循环仅在 RESTAURANT 推进（模块状态独立于 UI 存活，切场不丢收益）。
 */
function runUi(world, canvas, ctx, Mods) {
  const { matchServiceable, spawnCustomer } = Mods.restaurant;

  // 真机演示：注入初始可抽资金（不影响 node bootDemo 的账本快照，node 不走此分支）
  world.ledger.apply('ui-seed', { star: 500, food: 100 });

  const floats = [];
  let lastGacha = null;

  // —— Phase 1 导航状态机（首启着陆即中枢 HUB）——
  const nav = { scene: SCENE.HUB, prev: null };
  let frameCount = 0;

  function spawnNextCustomer() {
    const pool = world.unlockedPool;
    const c = spawnCustomer(() => Math.random(), pool, {
      id: 'cust_live_' + world.custSeq++,
      seatId: world.custSeq % 4,
    });
    world.customers = [c];
    return c;
  }
  spawnNextCustomer();

  function currentState() {
    const unlocked = world.restaurant.getUnlockedDishes();
    const onDuty = world.restaurant.schedule.onDutyRoles();
    const customers = world.customers.map((c) => {
      const m = matchServiceable(c, { unlockedDishes: new Set(unlocked), onDutyRoles: onDuty });
      return { id: c.id, dishDemand: c.dishDemand, seatId: c.seatId, serviceable: m.serviceable };
    });
    return {
      canvas: { w: canvas.width, h: canvas.height },
      seats: 4,
      ieff: world.restaurant.getIeff(),
      ledger: world.ledger.snapshot(),
      staff: world.restaurant.getStaff(),
      unlockedDishes: unlocked,
      customers,
      floats,
      lastGacha,
      pity: world.gacha.getPity(),
      pityMax: LOCKED.PITY_HARD,
      newbie: world.gacha.getPulls() < LOCKED.GACHA_NEWBIE_PULLS,
      navigation: nav,
      frame: frameCount,
      unlockCtx: { dishUnlockedCount: unlocked.length, rosterOwnedCount: world.roster.count() },
      warehouse: buildWarehouseView(world),
      lounge: buildLoungeView(world),
      roster: { view: world.roster.view() },
      rosterCount: world.roster.count(),
    };
  }

  function tick() {
    frameCount += 1;
    // 经营循环仅在餐厅场景推进（切到市场/中枢时餐厅仍在后台累积，回餐厅即见最新收益）
    if (nav.scene === SCENE.RESTAURANT) {
      const c = world.customers[0];
      if (c) {
        const reqId = 'live-serve-' + c.id + '-' + Date.now();
        const res = world.restaurant.serve(c, 1.0, reqId);
        if (res.serviceable && res.earned && res.earned.star > 0) {
          floats.push({
            x: Math.round(canvas.width / 2),
            y: Math.round(canvas.height * 0.3),
            text: '+' + res.earned.star.toFixed(2) + '★',
            color: '#ffd166',
            ttl: 60,
          });
        }
        spawnNextCustomer(); // 轮换顾客，保持可见可玩
      }
      for (let i = floats.length - 1; i >= 0; i--) {
        floats[i].ttl -= 1;
        if (floats[i].ttl <= 0) floats.splice(i, 1);
      }
    }
    // 按当前场景分发 build*（纯函数）→ applyCommands 落 2d 上下文
    const scene = nav.scene === SCENE.HUB ? buildHub(currentState())
      : nav.scene === SCENE.GACHA_MARKET ? buildGachaMarket(currentState())
      : nav.scene === SCENE.WAREHOUSE ? buildWarehouse(currentState())
      : nav.scene === SCENE.STAFF_LOUNGE ? buildLounge(currentState())
      : nav.scene === SCENE.ROSTER ? buildRoster(currentState())
      : buildScene(currentState());
    applyCommands(ctx, scene);
  }

  // 触发一次抽卡（单抽/十连），结果由 build* 演出
  function pull(type) {
    const reqId = 'ui-pull-' + Date.now() + '-' + Math.floor(Math.random() * 1e6);
    try {
      const r = world.gacha['draw' + (type === 'ten' ? 'Ten' : 'Single')]({ requestId: reqId, currency: 'star' });
      lastGacha = r;
      if (r && r.ok && Array.isArray(r.draws)) world.roster.registerMany(r.draws); // 去重登记拥有动物
    } catch (err) {
      console.error('[bootshell] gacha error', err && err.message);
    }
  }

  // 动才市场「换钻/礼包」：真实微信 IAP 需商户平台配置 + 后端，本期占位；
  // 仅在 DEV_IAP_GRANT=true 时走 dev 发钻路径（清晰标注，非 IAP 产出，保持双货币隔离）。
  function openIapPlaceholder() {
    if (typeof wx === 'undefined') return;
    if (DEV_IAP_GRANT) {
      world.ledger.apply('dev-iap-grant-' + Date.now(), { diamond: DEV_IAP_GRANT_AMOUNT });
      if (typeof wx.showModal === 'function') {
        wx.showModal({ title: '[DEV] 钻石发放', content: '已发放 ' + DEV_IAP_GRANT_AMOUNT + ' 钻石（dev 调试路径，非微信 IAP 产出）', showCancel: false });
      }
      return;
    }
    if (typeof wx.showModal === 'function') {
      wx.showModal({
        title: '钻石充值（占位）',
        content: '钻石充值需微信商户平台配置（商户号 / 支付后端），本期为占位，暂未接入真实支付。',
        showCancel: false,
      });
    }
  }

  // 触摸：按当前场景路由
  if (typeof wx !== 'undefined' && typeof wx.onTouchStart === 'function') {
    wx.onTouchStart(function (e) {
      const t = e && e.touches && e.touches[0];
      if (!t) return;
      const x = t.x != null ? t.x : t.clientX;
      const y = t.y != null ? t.y : t.clientY;
      const W = canvas.width;
      const H = canvas.height;

      if (nav.scene === SCENE.HUB) {
        // 命中可点区域（解锁判定已内置于 hitHubRegion：锁定区返回 null）
        const region = hitHubRegion(x, y, W, H, currentState().unlockCtx);
        if (region) {
          nav.prev = nav.scene;
          nav.scene = region;
        }
      } else if (nav.scene === SCENE.WAREHOUSE) {
        if (hitBackButton(x, y, W, H) === 'back') { nav.prev = nav.scene; nav.scene = SCENE.HUB; return; }
        const dishId = hitWarehouseButton(x, y, W, H, currentState());
        if (dishId) {
          const reqId = 'ui-warehouse-unlock-' + dishId + '-' + Date.now();
          world.restaurant.unlockDish(dishId, reqId); // 双入口：仓库解锁（原子扣 star+food）
          return;
        }
      } else if (nav.scene === SCENE.STAFF_LOUNGE) {
        if (hitBackButton(x, y, W, H) === 'back') { nav.prev = nav.scene; nav.scene = SCENE.HUB; return; }
        const rb = getLoungeButtons(W, H).roster;
        if (x >= rb.x && x <= rb.x + rb.w && y >= rb.y && y <= rb.y + rb.h) {
          nav.prev = nav.scene; nav.scene = SCENE.ROSTER; return;
        }
        const petId = hitLoungePet(x, y, W, H, currentState());
        if (petId) { world.cultivation.pet(petId, { at: Date.now() }); return; } // 仅好感度+视觉，无货币
      } else if (nav.scene === SCENE.ROSTER) {
        if (hitBackButton(x, y, W, H) === 'back') { nav.prev = nav.scene; nav.scene = SCENE.STAFF_LOUNGE; return; }
      } else if (nav.scene === SCENE.RESTAURANT) {
        // 餐厅场景不含抽卡按钮（抽卡仅在动才市场）；保留回村热区 + 双入口解锁
        if (hitBackButton(x, y, W, H) === 'back') { nav.prev = nav.scene; nav.scene = SCENE.HUB; return; }
        const dishId = hitRestaurantUnlock(x, y, W, H, currentState());
        if (dishId) {
          const reqId = 'ui-restaurant-unlock-' + dishId + '-' + Date.now();
          world.restaurant.unlockDish(dishId, reqId); // 双入口：餐厅解锁
          return;
        }
      } else if (nav.scene === SCENE.GACHA_MARKET) {
        const hit = hitMarketButton(x, y, W, H);
        if (hit === 'back') { nav.prev = nav.scene; nav.scene = SCENE.HUB; return; }
        if (hit === 'single' || hit === 'ten') { pull(hit); return; }
        if (hit === 'exchange') { openIapPlaceholder(); return; }
      }
    });
  }

  const frame = function () {
    try {
      tick();
    } catch (err) {
      console.error('[bootshell] tick error', err && err.message);
    }
    if (typeof wx !== 'undefined' && typeof wx.requestAnimationFrame === 'function') {
      wx.requestAnimationFrame(frame);
    } else {
      setTimeout(frame, 1000 / 30);
    }
  };
  frame();
}

function main() {
  try {
    // —— 真机首屏修复：必须先创建 canvas，否则真机卡 loading ——
    let canvas = null;
    let ctx = null;
    if (IN_WECHAT && typeof wx.createCanvas === 'function') {
      canvas = wx.createCanvas();
      ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      console.log('[bootshell] canvas created, w=' + canvas.width + ' h=' + canvas.height);
    } else if (IN_WECHAT) {
      console.warn('[bootshell] wx.createCanvas unavailable on this runtime');
    }

    const Mods = {
      restaurant: require('./src/restaurant/restaurant'),
      ledger: require('./src/economy/ledger'),
      gacha: require('./src/gacha/index'),
    };

    // 保持 bootDemo 行为（node 下打印 I_eff=0.54 + booted OK；真机下打印后进入渲染循环）
    const world = bootDemo(Mods);

    // 真机：进入 canvas 渲染循环（node 不进入）
    if (IN_WECHAT && canvas && ctx) {
      runUi(world, canvas, ctx, Mods);
    }
  } catch (err) {
    const stack = err && err.stack ? err.stack : err && err.message ? err.message : String(err);
    console.error('[bootshell] BOOT ERROR:', stack);
    if (IN_WECHAT && typeof wx.showModal === 'function') {
      wx.showModal({
        title: 'BOOT ERROR',
        content: (err && err.message ? err.message : String(err)).slice(0, 600),
        showCancel: false,
      });
    }
  }
}

// 入口：微信小游戏约定 game.js 顶层立即执行；node 下直接执行同理。
main();

// 兼容模块引用（不影响顶层执行）
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { buildWorld, bootDemo, main };
}
