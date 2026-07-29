'use strict';

/**
 * 微信小游戏壳 · EL-WXSHELL-001（V7 真机修复版）
 *
 * 关键修复：微信小游戏是「渲染驱动」运行时，真机要求启动时至少创建一个
 * canvas 作为首屏，否则真机会一直卡在 loading（模拟器不强制，故模拟器能
 * booted OK 而真机卡）。本壳为纯逻辑、零渲染，故需显式 `wx.createCanvas()`。
 *
 * 同时：把整个启动（含 require）包进 try/catch + 注册 wx.onError，
 *      任何真机错误都会以弹窗/日志暴露，不再「干卡 loading 无信息」。
 *
 * 目标：让现有 src/ 纯逻辑（零引擎/微信依赖）能在微信真机 boot，
 *      本地 `node game.js` 也能跑通（wx typeof 守卫）。
 */

// —— 环境守卫：wx 仅在微信运行时存在；node 下 typeof wx === 'undefined' ——
const IN_WECHAT = typeof wx !== 'undefined';

// —— 全局错误捕获（真机静默卡 loading 时，把错误暴露出来）——
if (IN_WECHAT && typeof wx.onError === 'function') {
  wx.onError(function (err) {
    // err 可能是 Error 或字符串
    const msg = (err && err.message) ? err.message : String(err);
    console.error('[bootshell] wx.onError:', msg);
  });
}

// 复用现有纯逻辑模块（相对路径，微信/ node 均支持 CommonJS require）。
// 放在 main 内 try 中，确保「模块加载失败」也能被捕获弹窗，而非静默卡死。
function bootDemo(Mods) {
  const { Restaurant, createStaff, spawnCustomer } = Mods.restaurant;
  const { Ledger } = Mods.ledger;

  // 四货币单值源账本（初始为空，首次服务即入账）
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

  // 1 名顾客，携带「已解锁菜」需求（rng=()=>0 确定取 dishPool[0]=dish_1，确保可服务）
  const customer = spawnCustomer(() => 0, ['dish_1', 'dish_2'], {
    id: 'cust_demo',
    seatId: 0,
  });

  // 跑一次服务周期（dt = 1 秒）
  const Ieff = restaurant.computeIeff();
  const result = restaurant.serve(customer, 1.0, 'boot-demo-serve-1');

  // —— 输出（console 在微信/ node 均可用）——
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
  return result;
}

function main() {
  try {
    // —— 真机首屏修复：必须先创建 canvas，否则真机卡 loading ——
    if (IN_WECHAT && typeof wx.createCanvas === 'function') {
      const canvas = wx.createCanvas();
      const ctx = canvas.getContext('2d');
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
    };

    bootDemo(Mods);
  } catch (err) {
    const stack = (err && err.stack) ? err.stack : (err && err.message ? err.message : String(err));
    console.error('[bootshell] BOOT ERROR:', stack);
    if (IN_WECHAT && typeof wx.showModal === 'function') {
      wx.showModal({
        title: 'BOOT ERROR',
        content: ((err && err.message) ? err.message : String(err)).slice(0, 600),
        showCancel: false,
      });
    }
  }
}

// 入口：微信小游戏约定 game.js 顶层立即执行；node 下直接执行同理。
main();

// 兼容模块引用（不影响顶层执行）
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { bootDemo, main };
}
