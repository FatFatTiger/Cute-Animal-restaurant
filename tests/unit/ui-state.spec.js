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
  buildHub,
  buildGachaMarket,
  applyCommands,
  hitGachaButton,
  getGachaButtons,
  getHubRegions,
  hitHubRegion,
  getMarketButtons,
  hitMarketButton,
  getTopBackButton,
  hitBackButton,
  SCENE,
  RARITY_COLORS,
} = require('../../src/ui/render');
const { createMockCanvas } = require('../helpers/mock-canvas');

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

