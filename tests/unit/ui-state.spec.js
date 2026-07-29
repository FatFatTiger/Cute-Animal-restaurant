'use strict';

/**
 * T1 单元测试 · E7 渲染层（纯函数 buildScene + applyCommands + 按钮命中）
 * 零 canvas / 零 wx 依赖，Node 直跑，验证「状态 → 视图」映射与不变量 UI 表现。
 *
 * 不变量关联：不变量 7（顾客需求-解锁匹配）的可视化呈现——
 *   - 已解锁 + 在岗 → 需求气泡亮色、可服务；
 *   - 未解锁（占位）→ 气泡置灰 + 🔒，零产出（与逻辑层一致）。
 * 抽卡结果按稀有度色板渲染（SSR=金），与 LOCKED 稀有度语义对齐。
 */

const {
  buildScene,
  buildRestaurant,
  buildHub,
  buildGachaMarket,
  buildWarehouse,
  buildLounge,
  buildRoster,
  applyCommands,
  hitGachaButton,
  getGachaButtons,
  getHubRegions,
  hitHubRegion,
  getMarketButtons,
  hitMarketButton,
  getTopBackButton,
  hitBackButton,
  getWarehouseButtons,
  hitWarehouseButton,
  getLoungePetSpots,
  hitLoungePet,
  getLoungeButtons,
  getRestaurantUnlockButton,
  hitRestaurantUnlock,
  SCENE,
  RARITY_COLORS,
} = require('../../src/ui/render');
const { createMockCanvas } = require('../helpers/mock-canvas');
const { Roster } = require('../../src/roster');
const { Cultivation } = require('../../src/cultivation');
const { Ledger } = require('../../src/economy/ledger');

// 基础场景（覆盖三岗员工 + 已解锁顾客 + 账本）
function baseState(over) {
  return Object.assign(
    {
      canvas: { w: 375, h: 667 },
      seats: 4,
      ledger: { star: 100, diamond: 0, food: 20, shard: 0 },
      staff: [
        { id: 's1', role: 'chef', affinityRole: 'chef', level: 1 },
        { id: 's2', role: 'waiter', affinityRole: 'waiter', level: 2 },
        { id: 's3', role: 'host', affinityRole: 'host', level: 1 },
      ],
      unlockedDishes: ['dish_1', 'dish_2'],
      customers: [{ id: 'c1', dishDemand: 'dish_1', seatId: 0, serviceable: true }],
      floats: [],
      lastGacha: null,
      pity: 5,
    },
    over
  );
}

describe('E7 buildScene 纯函数（不依赖 canvas）', () => {
  it('返回绘制指令数组，含 clear 背景', () => {
    const cmds = buildScene(baseState());
    expect(Array.isArray(cmds)).toBe(true);
    expect(cmds.length).toBeGreaterThan(0);
    expect(cmds.some((c) => c.op === 'clear')).toBe(true);
  });

  it('员工三岗：含 staff 色块 + 角色等级标签', () => {
    const cmds = buildScene(baseState());
    const labels = cmds.filter((c) => c.tag === 'staff-label');
    expect(labels.length).toBe(3);
    expect(labels.some((l) => /chef/i.test(l.text))).toBe(true);
    expect(labels.some((l) => /host/i.test(l.text))).toBe(true);
    expect(labels.some((l) => /L2/.test(l.text))).toBe(true); // waiter L2
  });

  it('顾客需求气泡：已解锁→亮色可服务；未解锁→置灰 🔒', () => {
    const ok = buildScene(baseState({ customers: [{ id: 'c', dishDemand: 'dish_1', seatId: 0, serviceable: true }] }));
    const locked = buildScene(baseState({ customers: [{ id: 'c', dishDemand: 'dish_9', seatId: 0, serviceable: false }] }));

    const okText = ok.find((c) => c.tag === 'demand-text');
    expect(okText.text).toContain('dish_1');
    expect(okText.locked).toBeFalsy();

    const lockedCmd = locked.find((c) => c.tag === 'demand' && c.locked === true);
    expect(lockedCmd).toBeTruthy();
    const lockedText = locked.find((c) => c.tag === 'demand-text');
    expect(lockedText.text).toContain('🔒');
  });

  it('结算浮动数字：floats 渲染为 float 文本（含星券数值）', () => {
    const cmds = buildScene(baseState({ floats: [{ x: 100, y: 100, text: '+0.54★', color: '#ffd166' }] }));
    const f = cmds.find((c) => c.tag === 'float');
    expect(f).toBeTruthy();
    expect(f.text).toContain('0.54');
  });

  it('抽卡结果：稀有度色块（SSR=金色）+ 动物名（按 RARITY_COLORS）', () => {
    const cmds = buildScene(
      baseState({
        lastGacha: { type: 'single', ok: true, draws: [{ animalId: 'ssr_01', rarity: 'SSR', isDuplicate: false, shardGain: 0 }], totalShard: 0 },
      })
    );
    const chip = cmds.find((c) => c.tag === 'rarity' && c.rarity === 'SSR');
    expect(chip).toBeTruthy();
    expect(chip.fill).toBe(RARITY_COLORS.SSR);
    const t = cmds.find((c) => c.tag === 'rarity-text' && c.animalId === 'ssr_01');
    expect(t.text).toContain('ssr_01');
  });

  it('HUD 显示星券 / 食材 / pity', () => {
    const cmds = buildScene(baseState());
    const hud = cmds.find((c) => c.tag === 'hud');
    expect(hud.text).toContain('100');
    expect(hud.text).toContain('20');
    expect(hud.text).toContain('Pity 5');
  });

  it('空状态（无员工/无顾客/无抽卡）不抛错且仍返回指令', () => {
    const cmds = buildScene(baseState({ staff: [], customers: [], lastGacha: null, ledger: {} }));
    expect(Array.isArray(cmds)).toBe(true);
    expect(cmds.some((c) => c.op === 'clear')).toBe(true);
  });
});

describe('E7 applyCommands（mock canvas，零真机依赖）', () => {
  it('在 mock 2d ctx 上消费指令不抛错，并记录 draw 调用', () => {
    const canvas = createMockCanvas(375, 667);
    const ctx = canvas.getContext('2d');
    const cmds = buildScene(
      baseState({
        lastGacha: { type: 'single', ok: true, draws: [{ animalId: 'r_01', rarity: 'R', isDuplicate: true, shardGain: 20 }], totalShard: 20 },
      })
    );
    expect(() => applyCommands(ctx, cmds)).not.toThrow();
    expect(canvas._calls.some((c) => c.m === 'fillRect')).toBe(true);
    expect(canvas._calls.some((c) => c.m === 'fillText')).toBe(true);
    expect(canvas._calls.some((c) => c.m === 'arc')).toBe(true);
  });

  it('ctx 为空时安全返回不抛', () => {
    expect(() => applyCommands(null, buildScene(baseState()))).not.toThrow();
  });
});

describe('E7 抽卡按钮命中检测', () => {
  it('点击单抽按钮区域命中 single', () => {
    const b = getGachaButtons(375, 667)[0];
    expect(hitGachaButton(b.x + 5, b.y + 5, 375, 667)).toBe('single');
  });
  it('点击十连按钮区域命中 ten', () => {
    const b = getGachaButtons(375, 667)[1];
    expect(hitGachaButton(b.x + 5, b.y + 5, 375, 667)).toBe('ten');
  });
  it('点击空白区域返回 null', () => {
    expect(hitGachaButton(10, 10, 375, 667)).toBeNull();
  });
  it('非数值坐标安全返回 null', () => {
    expect(hitGachaButton(undefined, undefined, 375, 667)).toBeNull();
  });
});

// —— Phase 1 多场景导航新增用例 ——

function hubState(over) {
  return Object.assign({
    canvas: { w: 375, h: 667 },
    ledger: { star: 120, diamond: 5, food: 30, shard: 2 },
    navigation: { scene: SCENE.HUB, prev: null },
    rosterCount: 0,
    frame: 0,
  }, over);
}

function marketState(over) {
  return Object.assign({
    canvas: { w: 375, h: 667 },
    ledger: { star: 500, diamond: 0, food: 100, shard: 0 },
    pity: 7,
    pityMax: 50,
    newbie: false,
    lastGacha: null,
    frame: 0,
  }, over);
}

describe('Phase 1 · buildHub 中枢（4 区域 / 锁定区不可点）', () => {
  it('返回指令含 clear + 标题 + 4 区域', () => {
    const cmds = buildHub(hubState());
    expect(Array.isArray(cmds)).toBe(true);
    expect(cmds.some((c) => c.op === 'clear')).toBe(true);
    expect(cmds.some((c) => c.tag === 'hub-title')).toBe(true);
    const regions = cmds.filter((c) => c.tag === 'hub-region');
    expect(regions.length).toBe(4);
  });

  it('4 区域标识正确：暖爪餐厅/动才市场可点，囤囤仓/撸毛馆锁定', () => {
    const regions = getHubRegions(375, 667);
    const byId = {};
    regions.forEach((r) => { byId[r.id] = r; });
    expect(byId[SCENE.RESTAURANT].label).toBe('暖爪餐厅');
    expect(byId[SCENE.GACHA_MARKET].label).toBe('动才市场');
    expect(byId[SCENE.WAREHOUSE].label).toBe('囤囤仓');
    expect(byId[SCENE.STAFF_LOUNGE].label).toBe('撸毛馆');
    expect(byId[SCENE.RESTAURANT].clickable).toBe(true);
    expect(byId[SCENE.GACHA_MARKET].clickable).toBe(true);
    expect(byId[SCENE.WAREHOUSE].locked).toBe(true);
    expect(byId[SCENE.STAFF_LOUNGE].locked).toBe(true);
  });

  it('锁定区渲染 🔒「即将开放」遮罩，可点区无锁定遮罩', () => {
    const cmds = buildHub(hubState());
    const lockedLabels = cmds.filter((c) => c.tag === 'hub-locked-label');
    expect(lockedLabels.length).toBe(2);
    expect(lockedLabels.every((c) => /即将开放/.test(c.text))).toBe(true);
    // 可点区不应有锁定遮罩
    const lockedIds = cmds.filter((c) => c.tag === 'hub-locked').map((c) => c.id);
    expect(lockedIds).not.toContain(SCENE.RESTAURANT);
    expect(lockedIds).not.toContain(SCENE.GACHA_MARKET);
  });

  it('HUD 只读四货币（★星券 💎钻石 🍖食材 🔷碎片）', () => {
    const cmds = buildHub(hubState());
    const hud = cmds.find((c) => c.tag === 'hud');
    expect(hud.text).toContain('★ 120');
    expect(hud.text).toContain('💎 5');
    expect(hud.text).toContain('🍖 30');
    expect(hud.text).toContain('🔷 2');
  });

  it('每区域门口有迎宾小动物（复用角色绘制库，critter 指令）', () => {
    const cmds = buildHub(hubState());
    const critters = cmds.filter((c) => c.tag === 'critter-body' && /^hub-/.test(c.id || ''));
    expect(critters.length).toBe(4);
  });
});

describe('Phase 1 · buildHub 命中检测 hitHubRegion', () => {
  function centerOf(id) {
    const r = getHubRegions(375, 667).find((x) => x.id === id);
    return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
  }
  it('点中暖爪餐厅 → RESTAURANT', () => {
    const p = centerOf(SCENE.RESTAURANT);
    expect(hitHubRegion(p.x, p.y, 375, 667)).toBe(SCENE.RESTAURANT);
  });
  it('点中动才市场 → GACHA_MARKET', () => {
    const p = centerOf(SCENE.GACHA_MARKET);
    expect(hitHubRegion(p.x, p.y, 375, 667)).toBe(SCENE.GACHA_MARKET);
  });
  it('点中囤囤仓（锁定）→ null（不可点）', () => {
    const p = centerOf(SCENE.WAREHOUSE);
    expect(hitHubRegion(p.x, p.y, 375, 667)).toBeNull();
  });
  it('点中撸毛馆（锁定）→ null（不可点）', () => {
    const p = centerOf(SCENE.STAFF_LOUNGE);
    expect(hitHubRegion(p.x, p.y, 375, 667)).toBeNull();
  });
  it('点击空白区域 → null', () => {
    expect(hitHubRegion(10, 10, 375, 667)).toBeNull();
  });
});

describe('Phase 1 · buildGachaMarket 动才市场（保底 / 按钮 / IAP 占位）', () => {
  it('返回指令含标题 + 保底 + IAP 占位面板 + 抽卡按钮', () => {
    const cmds = buildGachaMarket(marketState());
    expect(cmds.some((c) => c.tag === 'market-title')).toBe(true);
    expect(cmds.some((c) => c.tag === 'market-pity')).toBe(true);
    expect(cmds.some((c) => c.tag === 'market-iap-panel')).toBe(true);
    expect(cmds.some((c) => c.tag === 'market-iap-note')).toBe(true);
    // 抽卡按钮（单抽/十连）存在
    const ids = getMarketButtons(375, 667).map((b) => b.id);
    expect(ids).toEqual(expect.arrayContaining(['single', 'ten']));
  });

  it('保底显示：距保底 X/50 + 软提示「再招 N 次必得 SR」', () => {
    const cmds = buildGachaMarket(marketState({ pity: 7, pityMax: 50 }));
    const pity = cmds.find((c) => c.tag === 'market-pity');
    const hint = cmds.find((c) => c.tag === 'market-pity-hint');
    expect(pity.text).toContain('7/50');
    expect(hint.text).toContain('43'); // 50-7
  });

  it('IAP 占位按钮存在且文案标注占位（未实现真实支付）', () => {
    const cmds = buildGachaMarket(marketState());
    const note = cmds.find((c) => c.tag === 'market-iap-note');
    expect(note.text).toContain('占位');
    const ex = getMarketButtons(375, 667).find((b) => b.id === 'exchange');
    expect(ex).toBeTruthy();
    expect(ex.label).toContain('换钻');
  });

  it('上次抽卡结果渲染为稀有度色块', () => {
    const cmds = buildGachaMarket(marketState({
      lastGacha: { type: 'single', ok: true, draws: [{ animalId: 'sr_01', rarity: 'SR', isDuplicate: false, shardGain: 0 }], totalShard: 0 },
    }));
    const chip = cmds.find((c) => c.tag === 'rarity' && c.rarity === 'SR');
    expect(chip).toBeTruthy();
    expect(chip.fill).toBe(RARITY_COLORS.SR);
  });

  it('回村按钮存在于市场场景', () => {
    const ex = getMarketButtons(375, 667).find((b) => b.id === 'back');
    expect(ex).toBeTruthy();
    expect(ex.label).toContain('回动才村');
  });
});

describe('Phase 1 · buildGachaMarket 命中检测 hitMarketButton', () => {
  function centerOf(id) {
    const b = getMarketButtons(375, 667).find((x) => x.id === id);
    return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
  }
  it('点中单抽 → single', () => {
    const p = centerOf('single');
    expect(hitMarketButton(p.x, p.y, 375, 667)).toBe('single');
  });
  it('点中十连 → ten', () => {
    const p = centerOf('ten');
    expect(hitMarketButton(p.x, p.y, 375, 667)).toBe('ten');
  });
  it('点中换钻/礼包 → exchange', () => {
    const p = centerOf('exchange');
    expect(hitMarketButton(p.x, p.y, 375, 667)).toBe('exchange');
  });
  it('点中回村 → back', () => {
    const p = centerOf('back');
    expect(hitMarketButton(p.x, p.y, 375, 667)).toBe('back');
  });
  it('点击空白区域 → null', () => {
    expect(hitMarketButton(200, 200, 375, 667)).toBeNull();
  });
});

describe('Phase 1 · 回村按钮 hitBackButton（餐厅/市场通用）', () => {
  it('命中顶部回村按钮返回 back', () => {
    const b = getTopBackButton(375, 667);
    expect(hitBackButton(b.x + 5, b.y + 5, 375, 667)).toBe('back');
  });
  it('空白处返回 null', () => {
    expect(hitBackButton(200, 300, 375, 667)).toBeNull();
  });
});

describe('Phase 1 · 角色保真（圆润 critter + 分层软阴影 + idle 动效）', () => {
  it('buildScene 含圆润 roundrect + 分层软阴影 ellipse + critter 指令', () => {
    const cmds = buildScene(baseState());
    expect(cmds.some((c) => c.op === 'roundrect')).toBe(true);
    expect(cmds.some((c) => c.op === 'ellipse' && c.tag === 'critter-shadow')).toBe(true);
    expect(cmds.some((c) => c.tag === 'critter-body')).toBe(true);
    expect(cmds.some((c) => c.tag === 'critter-ear')).toBe(true);
  });

  it('帧计数驱动 idle 动效：不同 frame 同一 critter 的 y 位置不同', () => {
    const a = buildScene(baseState({ frame: 0 })).find((c) => c.tag === 'critter-body');
    const b = buildScene(baseState({ frame: 25 })).find((c) => c.tag === 'critter-body');
    expect(a.y).not.toBe(b.y);
  });

  it('applyCommands 在 mock 上消费 ellipse/roundrect 不抛错并记录调用', () => {
    const canvas = createMockCanvas(375, 667);
    const ctx = canvas.getContext('2d');
    const cmds = buildScene(baseState({ frame: 3 }));
    expect(() => applyCommands(ctx, cmds)).not.toThrow();
    expect(canvas._calls.some((c) => c.m === 'ellipse')).toBe(true);
    expect(canvas._calls.some((c) => c.m === 'roundRect')).toBe(true);
  });

  it('buildHub 也使用 critter 保真（圆润 + 软阴影 + idle）', () => {
    const a = buildHub(hubState({ frame: 0 }));
    const b = buildHub(hubState({ frame: 25 }));
    expect(a.some((c) => c.op === 'ellipse' && c.tag === 'critter-shadow')).toBe(true);
    const bodyA = a.find((c) => c.tag === 'critter-body' && /^hub-/.test(c.id || ''));
    const bodyB = b.find((c) => c.tag === 'critter-body' && /^hub-/.test(c.id || ''));
    expect(bodyA.y).not.toBe(bodyB.y);
  });
});

// —— roundRect 严格真机回归（WeChat macOS WebKit lib 3.17.0：radii 必须 sequence）——
// 根因：旧实现把 radii 作为单个 number 传入 ctx.roundRect，在 strict sequence 实现的真机抛
// "cannot be converted to a sequence"，每帧 tick → runUi 顶层 catch 连刷。修复后一律传 4 元素数组。
// 本组用例构造「严格真机 ctx」：roundRect 在第 5 参非 Array 时抛错，模拟真机解析。

function createStrictRectCtx() {
  const roundRectCalls = [];
  const noop = () => {};
  const ctx = {
    fillStyle: '#000000',
    strokeStyle: '#000000',
    font: '',
    textAlign: 'left',
    textBaseline: 'top',
    lineWidth: 1,
    beginPath: noop,
    closePath: noop,
    fill: noop,
    stroke: noop,
    fillRect: noop,
    strokeRect: noop,
    moveTo: noop,
    lineTo: noop,
    arc: noop,
    ellipse: noop,
    fillText: noop,
    save: noop,
    restore: noop,
  };
  // 严格实现：radii 必须是 sequence（Array），否则抛错 —— 模拟 WeChat macOS WebKit 3.17.0
  ctx.roundRect = function (x, y, w, h, radii) {
    if (!(radii instanceof Array)) {
      throw new Error('radii must be sequence');
    }
    roundRectCalls.push({ x, y, w, h, radii });
  };
  ctx._roundRectCalls = roundRectCalls;
  return ctx;
}

describe('roundRect 严格真机回归（WeChat macOS WebKit 3.17.0，radii 必须 sequence）', () => {
  it('roundrect 指令以 4 元素数组 radii 落 roundRect，严格 ctx 不抛', () => {
    const ctx = createStrictRectCtx();
    expect(() =>
      applyCommands(ctx, [{ op: 'roundrect', x: 10, y: 10, w: 100, h: 50, r: 8, fill: '#fff' }])
    ).not.toThrow();
    expect(ctx._roundRectCalls.length).toBe(1);
    const call = ctx._roundRectCalls[0];
    expect(Array.isArray(call.radii)).toBe(true);
    expect(call.radii.length).toBeGreaterThanOrEqual(1);
    expect(call.radii[0]).toBe(8);
  });

  it('r: undefined / r: NaN 兜底为 8，严格 ctx 不抛且 radii 全为 8', () => {
    const ctxU = createStrictRectCtx();
    expect(() =>
      applyCommands(ctxU, [{ op: 'roundrect', x: 0, y: 0, w: 40, h: 20, fill: '#0f0' }])
    ).not.toThrow();
    const ctxN = createStrictRectCtx();
    expect(() =>
      applyCommands(ctxN, [{ op: 'roundrect', x: 0, y: 0, w: 40, h: 20, r: NaN, fill: '#0f0' }])
    ).not.toThrow();
    expect(Array.isArray(ctxU._roundRectCalls[0].radii)).toBe(true);
    expect(ctxU._roundRectCalls[0].radii.every((v) => v === 8)).toBe(true);
    expect(ctxN._roundRectCalls[0].radii.every((v) => v === 8)).toBe(true);
  });

  it('不合法 x/y/w/h（NaN/undefined/字符串）兜底为 0，严格 ctx 不抛', () => {
    const ctx = createStrictRectCtx();
    expect(() =>
      applyCommands(ctx, [{ op: 'roundrect', x: NaN, y: undefined, w: NaN, h: 'bad', r: 5, stroke: '#ff0' }])
    ).not.toThrow();
    const call = ctx._roundRectCalls[0];
    expect(call.x).toBe(0);
    expect(call.y).toBe(0);
    expect(call.w).toBe(0);
    expect(call.h).toBe(0);
    expect(call.radii.every((v) => v === 5)).toBe(true);
  });

  it('真实场景样本指令全部含合法 radii 数组：无 roundrect cmd 让严格 ctx 抛异常', () => {
    const ctx = createStrictRectCtx();
    const samples = [
      buildScene(baseState({ frame: 7 })),
      buildHub(hubState()),
      buildGachaMarket(marketState()),
    ];
    expect(() => {
      samples.forEach((cmds) => applyCommands(ctx, cmds));
    }).not.toThrow();
    // 所有被调用的 roundRect 其 radii 均为 Array（核心回归断言）
    expect(ctx._roundRectCalls.length).toBeGreaterThan(0);
    expect(
      ctx._roundRectCalls.every((c) => Array.isArray(c.radii) && c.radii.length >= 1)
    ).toBe(true);
  });

  it('mock-canvas 录制器记录 radii（args[4]），便于回归断言它是数组', () => {
    const canvas = createMockCanvas(375, 667);
    const ctx = canvas.getContext('2d');
    applyCommands(ctx, [{ op: 'roundrect', x: 5, y: 5, w: 50, h: 30, r: 12, fill: '#abc' }]);
    const rec = canvas._calls.find((c) => c.m === 'roundRect');
    expect(rec).toBeTruthy();
    expect(Array.isArray(rec.radii)).toBe(true);
    expect(rec.radii[0]).toBe(12);
  });
});

// —— Sprint 5 · 餐厅三区重构（RESTAURANT 分支）：迎宾区/就餐区/后厨区 + 无抽卡按钮 ——

describe('Sprint 5 · buildRestaurant 三区重构（迎宾区/就餐区/后厨区，餐厅无抽卡按钮）', () => {
  it('输出含三区标牌文字（迎宾区/就餐区/后厨区）', () => {
    const cmds = buildRestaurant(baseState());
    expect(cmds.some((c) => c.tag === 'zone-label-welcome' && c.text === '迎宾区')).toBe(true);
    expect(cmds.some((c) => c.tag === 'zone-label-dining' && c.text === '就餐区')).toBe(true);
    expect(cmds.some((c) => c.tag === 'zone-label-kitchen' && c.text === '后厨区')).toBe(true);
  });

  it('餐厅不含单抽/十连按钮（无 label 为单抽/十连的 button-label cmd）', () => {
    const cmds = buildRestaurant(baseState());
    const gachaBtns = cmds.filter((c) => c.tag === 'button-label' && (/单抽/.test(c.text) || /十连/.test(c.text)));
    expect(gachaBtns.length).toBe(0);
  });

  it('输出含至少 1 个顾客（落座或排队）的 critter / 需求气泡', () => {
    const cmds = buildRestaurant(baseState());
    const hasCustomer =
      cmds.some((c) => c.tag === 'critter-body' && /^cust-/.test(c.id || '')) ||
      cmds.some((c) => c.tag === 'demand');
    expect(hasCustomer).toBe(true);
  });

  it('员工按 role 分区域：三岗各 1 名，岗位小标含 迎/服/厨', () => {
    const cmds = buildRestaurant(baseState());
    const staffLabels = cmds.filter((c) => c.tag === 'staff-label');
    expect(staffLabels.length).toBe(3);
    expect(staffLabels.some((l) => /迎/.test(l.text))).toBe(true);
    expect(staffLabels.some((l) => /服/.test(l.text))).toBe(true);
    expect(staffLabels.some((l) => /厨/.test(l.text))).toBe(true);
  });

  it('后厨区含烹饪图元：锅(pot roundrect) + 火苗(flame ellipse)', () => {
    const cmds = buildRestaurant(baseState());
    expect(cmds.some((c) => c.tag === 'pot' && c.op === 'roundrect')).toBe(true);
    expect(cmds.some((c) => c.tag === 'flame' && c.op === 'ellipse')).toBe(true);
  });

  it('顾客确定性分流：前 seats 个落座就餐区，其余排队迎宾区（无随机）', () => {
    const many = baseState({
      seats: 4,
      customers: [
        { id: 'c0', dishDemand: 'dish_1', serviceable: true },
        { id: 'c1', dishDemand: 'dish_2', serviceable: true },
        { id: 'c2', dishDemand: 'dish_1', serviceable: true },
        { id: 'c3', dishDemand: 'dish_2', serviceable: true },
        { id: 'c4', dishDemand: 'dish_1', serviceable: true },
        { id: 'c5', dishDemand: 'dish_2', serviceable: true },
      ],
    });
    const cmds = buildRestaurant(many);
    const custCritters = cmds.filter((c) => c.tag === 'critter-body' && /^cust-/.test(c.id || ''));
    expect(custCritters.length).toBe(6);
    const bubbles = cmds.filter((c) => c.tag === 'demand');
    expect(bubbles.length).toBe(6);
  });
});

// —— Phase 2 · 囤囤仓 / 撸毛馆 / 图鉴（fallback 实现，待 engineering-lead 复核签字）——

describe('Phase 2 · buildWarehouse 囤囤仓（聚合 + 双入口解锁）', () => {
  function whState(over) {
    return Object.assign({
      canvas: { w: 375, h: 667 },
      warehouse: {
        ledger: { star: 500, diamond: 0, food: 100, shard: 0 },
        dishes: [
          { id: 'dish_1', unlocked: true, costStar: 0, costFood: 0 },
          { id: 'dish_2', unlocked: true, costStar: 0, costFood: 0 },
        ],
        nextDish: { id: 'dish_3', costStar: 200, costFood: 40 },
      },
      frame: 0,
    }, over);
  }

  it('含标题 / 四币 HUD / 已解锁菜数 / 下一道成本', () => {
    const cmds = buildWarehouse(whState());
    expect(cmds.some((c) => c.tag === 'warehouse-title')).toBe(true);
    const hud = cmds.find((c) => c.tag === 'hud');
    expect(hud.text).toContain('500');
    expect(cmds.some((c) => c.tag === 'warehouse-dish-count' && /2 道菜/.test(c.text))).toBe(true);
    expect(cmds.some((c) => c.tag === 'warehouse-next-cost' && /dish_3/.test(c.text))).toBe(true);
  });

  it('可负担时显示解锁按钮；不足时提示且无按钮', () => {
    const ok = buildWarehouse(whState());
    expect(ok.some((c) => c.tag === 'button-label' && /解锁 dish_3/.test(c.text))).toBe(true);
    const poor = buildWarehouse(whState({
      warehouse: { ledger: { star: 0, diamond: 0, food: 0, shard: 0 }, dishes: [{ id: 'dish_1', unlocked: true }], nextDish: { id: 'dish_2', costStar: 200, costFood: 40 } },
    }));
    expect(poor.some((c) => c.tag === 'button-label' && /解锁/.test(c.text))).toBe(false);
    expect(poor.some((c) => c.tag === 'warehouse-insufficient')).toBe(true);
  });

  it('不含抽卡按钮（单抽 / 十连）', () => {
    const cmds = buildWarehouse(whState());
    expect(cmds.filter((c) => c.tag === 'button-label' && (/单抽/.test(c.text) || /十连/.test(c.text))).length).toBe(0);
  });

  it('命中解锁按钮返回 dishId；空白处 null', () => {
    const b = getWarehouseButtons(375, 667, whState())[0];
    expect(hitWarehouseButton(b.x + 5, b.y + 5, 375, 667, whState())).toBe('dish_3');
    expect(hitWarehouseButton(5, 5, 375, 667, whState())).toBeNull();
  });
});

describe('Phase 2 · buildLounge 撸毛馆（去重动物 + 撸毛热区，仅好感度）', () => {
  function loungeState(over) {
    return Object.assign({
      canvas: { w: 375, h: 667 },
      lounge: { owned: [
        { id: 'r_01', rarity: 'R', affinity: 10, bondTier: 0 },
        { id: 'sr_01', rarity: 'SR', affinity: 50, bondTier: 50 },
      ] },
      frame: 0,
    }, over);
  }

  it('含标题 + 图鉴入口按钮 + 每只动物 critter + 好感度', () => {
    const cmds = buildLounge(loungeState());
    expect(cmds.some((c) => c.tag === 'lounge-title')).toBe(true);
    expect(cmds.some((c) => c.tag === 'button-label' && /图鉴/.test(c.text))).toBe(true);
    expect(cmds.filter((c) => c.tag === 'critter-body' && /^lounge-/.test(c.id || '')).length).toBe(2);
    expect(cmds.some((c) => c.tag === 'lounge-affinity' && /10\/100/.test(c.text))).toBe(true);
  });

  it('无拥有动物时显示空态提示', () => {
    const cmds = buildLounge(loungeState({ lounge: { owned: [] } }));
    expect(cmds.some((c) => c.tag === 'lounge-empty')).toBe(true);
  });

  it('命中 critter 热区返回 id；空白处 null', () => {
    const spots = getLoungePetSpots(loungeState(), 375, 667);
    expect(spots.length).toBe(2);
    const s0 = spots[0];
    expect(hitLoungePet(s0.x, s0.y, 375, 667, loungeState())).toBe('r_01');
    expect(hitLoungePet(5, 5, 375, 667, loungeState())).toBeNull();
  });
});

describe('Phase 2 · buildRoster 图鉴（全量目录 + 🔒剪影，只读）', () => {
  function rosterState(view) {
    return { canvas: { w: 375, h: 667 }, roster: { view }, frame: 0 };
  }

  it('含标题；拥有显示 critter+色条，未拥有显示 🔒剪影', () => {
    const view = [
      { id: 'r_01', rarity: 'R', owned: true },
      { id: 'sr_01', rarity: 'SR', owned: false },
      { id: 'ssr_01', rarity: 'SSR', owned: true },
    ];
    const cmds = buildRoster(rosterState(view));
    expect(cmds.some((c) => c.tag === 'roster-title')).toBe(true);
    expect(cmds.some((c) => c.tag === 'roster-owned-label' && c.text === 'r_01')).toBe(true);
    expect(cmds.some((c) => c.tag === 'roster-rarity-bar')).toBe(true);
    expect(cmds.some((c) => c.tag === 'roster-locked-mark' && c.text === '?')).toBe(true);
  });
});

describe('Phase 2 · HUB 解锁门控（evalHubUnlock）', () => {
  it('未达门槛：囤囤仓 / 撸毛馆仍锁定不可点', () => {
    const regions = getHubRegions(375, 667, {});
    const byId = {};
    regions.forEach((r) => { byId[r.id] = r; });
    expect(byId[SCENE.WAREHOUSE].clickable).toBe(false);
    expect(byId[SCENE.STAFF_LOUNGE].clickable).toBe(false);
    expect(hitHubRegion(10, 10, 375, 667, {})).toBeNull(); // 空白处（非任一区域）
  });

  it('达门槛：囤囤仓(dish≥3) / 撸毛馆(roster≥6) 可点', () => {
    const ctx = { dishUnlockedCount: 3, rosterOwnedCount: 6 };
    const regions = getHubRegions(375, 667, ctx);
    const byId = {};
    regions.forEach((r) => { byId[r.id] = r; });
    expect(byId[SCENE.WAREHOUSE].clickable).toBe(true);
    expect(byId[SCENE.STAFF_LOUNGE].clickable).toBe(true);
    const r = getHubRegions(375, 667, ctx).find((x) => x.id === SCENE.WAREHOUSE);
    expect(hitHubRegion(r.x + r.w / 2, r.y + r.h / 2, 375, 667, ctx)).toBe(SCENE.WAREHOUSE);
  });
});

describe('Phase 2 · roster / cultivation 模块（拨测）', () => {
  it('Roster.register 去重登记；registerMany 接受抽卡结果', () => {
    const r = new Roster({ catalog: [{ id: 'r_01', rarity: 'R' }] });
    r.register({ animalId: 'r_01', isDuplicate: false });
    r.register({ animalId: 'r_01', isDuplicate: true }); // 重复不计
    r.registerMany([{ animalId: 'r_02', isDuplicate: false }, { animalId: 'r_01', isDuplicate: false }]);
    expect(r.owned().sort()).toEqual(['r_01', 'r_02']);
  });

  it('Cultivation.pet 仅涨好感度，不产生货币（ledger 不变）', () => {
    const cult = new Cultivation({});
    const ledger = new Ledger({ star: 100, diamond: 0, food: 50, shard: 0 });
    const before = JSON.stringify(ledger.snapshot());
    const res = cult.pet('r_01', { at: 1000000 });
    expect(res.ok).toBe(true);
    expect(res.gain).toBe(1);
    expect(cult.affinityOf('r_01')).toBe(1);
    expect(JSON.stringify(ledger.snapshot())).toBe(before); // 无货币产出
  });

  it('Cultivation.pet 冷却生效：冷却期内无效', () => {
    const cult = new Cultivation({});
    expect(cult.pet('r_01', { at: 1000 }).ok).toBe(true);
    const r2 = cult.pet('r_01', { at: 1000 + 5000 }); // <30s 冷却
    expect(r2.ok).toBe(false);
    expect(r2.reason).toBe('COOLDOWN');
  });
});

describe('Phase 2 · 餐厅双入口解锁按钮（决策② 双入口）', () => {
  function restState(over) {
    return baseState(Object.assign({
      ledger: { star: 500, diamond: 0, food: 200, shard: 0 },
      warehouse: { nextDish: { id: 'dish_3', costStar: 200, costFood: 40 } },
    }, over));
  }

  it('可负担时下一道菜显示解锁按钮', () => {
    const cmds = buildRestaurant(restState());
    expect(cmds.some((c) => c.tag === 'button-label' && /解锁 dish_3/.test(c.text))).toBe(true);
  });

  it('不足时不显示解锁按钮', () => {
    const cmds = buildRestaurant(restState({ ledger: { star: 0, diamond: 0, food: 0, shard: 0 } }));
    expect(cmds.some((c) => c.tag === 'button-label' && /解锁/.test(c.text))).toBe(false);
  });

  it('命中解锁按钮返回 dishId；不破坏三区标牌', () => {
    const b = getRestaurantUnlockButton(375, 667, restState());
    expect(hitRestaurantUnlock(b.x + 5, b.y + 5, 375, 667, restState())).toBe('dish_3');
    const cmds = buildRestaurant(restState());
    expect(cmds.some((c) => c.tag === 'zone-label-welcome' && c.text === '迎宾区')).toBe(true);
    expect(cmds.some((c) => c.tag === 'zone-label-dining' && c.text === '就餐区')).toBe(true);
    expect(cmds.some((c) => c.tag === 'zone-label-kitchen' && c.text === '后厨区')).toBe(true);
  });
});

