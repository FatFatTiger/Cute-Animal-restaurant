'use strict';

const { Ledger } = require('../../src/economy/ledger');
const { createIdleEngine } = require('../../src/economy/idle');
const { loadGame, saveGame, clearSave } = require('../../src/economy/storage');
const { TUNED, LOCKED } = require('../../src/config/tunables');

// 可注入时钟（测试用，避免依赖真实 Date.now）
function makeClock(startMs) {
  let t = startMs || 1000000;
  return {
    now: () => t,
    advance: (ms) => { t += ms; },
  };
}

describe('idle engine · 在线累积（场景无关，真实秒）', () => {
  it('按 I_eff × dt 累积星券、foodRate × dt 累积食材', () => {
    const ledger = new Ledger({});
    const clock = makeClock(1000000);
    const idle = createIdleEngine({ ledger, getIeff: () => 0.54, getFoodRate: () => 0.1, clock });
    clock.advance(1000); // +1s
    const g = idle.tick(clock.now());
    // 双流修订：在线宿舍流星券 = dormRate × dt = 0.25 × 0.54 × 1 = 0.135（不再是满 I_eff=0.54）
    expect(g.star).toBeCloseTo(0.135, 5);
    expect(g.food).toBeCloseTo(0.1, 5);
    // 跨秒边界 flush 上一桶到 ledger
    clock.advance(2000); // 进入第 2 秒 → flush 第 1 秒桶
    idle.tick(clock.now());
    const snap = ledger.snapshot();
    expect(snap.star).toBeCloseTo(0.135, 5);
    expect(snap.food).toBeCloseTo(0.1, 5);
  });

  it('每秒桶聚合：同秒内多帧不重复入账（_seen 受控）', () => {
    const ledger = new Ledger({});
    const clock = makeClock(2000000);
    const idle = createIdleEngine({ ledger, getIeff: () => 1, getFoodRate: () => 0, clock });
    // 10 帧落在同一秒内（每帧 50ms）
    for (let i = 0; i < 10; i++) { clock.advance(50); idle.tick(clock.now()); }
    expect(ledger.getBalance('star')).toBe(0); // 同秒未 flush
    clock.advance(1000); // 跨入下一秒（bucket 2000 → 2001）
    idle.tick(clock.now());
    // 双流修订：rate = dormRate = 0.25 × 1 = 0.25；10×50ms × 0.25 = 0.125
    expect(ledger.getBalance('star')).toBeCloseTo(0.125, 5);
  });

  it('dt 为负（时钟回拨）时不 accrual、不报错', () => {
    const ledger = new Ledger({});
    const clock = makeClock(3000000);
    const idle = createIdleEngine({ ledger, getIeff: () => 1, getFoodRate: () => 0, clock });
    clock.advance(-500);
    const g = idle.tick(clock.now());
    expect(g.star).toBe(0);
    expect(ledger.getBalance('star')).toBe(0);
  });
});

describe('idle engine · 离线收益（待领取上限 + 领取）', () => {
  it('offline_factor=0.20 折扣累积进 pending（不直接入账本），食材=0', () => {
    const ledger = new Ledger({});
    const clock = makeClock(5000000);
    const idle = createIdleEngine({ ledger, getIeff: () => 1, getFoodRate: () => 1, clock });
    const off = idle.applyOffline(clock.now() - 100000); // 离线 100s
    // 双流修订：离线=宿舍 only → dormRate × offline_factor × T_off = 0.25 × 1 × 0.2 × 100 = 5
    expect(off.pending).toBeCloseTo(TUNED.DORM_SHARE * 1 * LOCKED.OFFLINE_FACTOR * 100, 5); // 5 进 pending
    expect(off.seconds).toBeCloseTo(100, 5);
    const snap = ledger.snapshot();
    expect(snap.star).toBe(0); // 不直接入账
    expect(snap.food).toBe(0); // 离线不计食材
  });

  it('防回拨：lastSeen 晚于 now → pending 不变', () => {
    const ledger = new Ledger({});
    const clock = makeClock(5000000);
    const idle = createIdleEngine({ ledger, getIeff: () => 1, getFoodRate: () => 0, clock });
    const off = idle.applyOffline(clock.now() + 100000); // 未来时间戳
    expect(off.pending).toBe(0);
    expect(ledger.snapshot().star).toBe(0);
  });

  it('受 cap 限制：超大离线仅填满 pending 至 cap，超出不累积；重复结算不双计', () => {
    const ledger = new Ledger({});
    const clock = makeClock(5000000);
    const idle = createIdleEngine({ ledger, getIeff: () => 1, getFoodRate: () => 0, clock });
    // 双流修订：cap base 由 I_eff 改为 dormRate = DORM_SHARE × I_eff（I_eff=1 → 0.25 × 1）
    const cap = TUNED.DORM_SHARE * 1 * LOCKED.OFFLINE_FACTOR * TUNED.OFFLINE_CAP_HOURS * 3600; // dormRate=0.25 时 cap 值
    const off = idle.applyOffline(clock.now() - 20000000); // 离线 20000s > cap 时长(4h=14400s)，触发封顶
    expect(off.pending).toBeCloseTo(cap, 5);
    expect(off.capped).toBe(true);
    clock.advance(1000000); // 继续离线
    const off2 = idle.applyOffline(clock.now() - 1000000);
    expect(off2.pending).toBeCloseTo(cap, 5); // 已封顶，不再增加
  });

  it('领取：pending → 入账本且清零；二次领取无副作用', () => {
    const ledger = new Ledger({});
    const clock = makeClock(5000000);
    const idle = createIdleEngine({ ledger, getIeff: () => 1, getFoodRate: () => 0, clock });
    idle.applyOffline(clock.now() - 100000); // pending = dormRate×0.2×100 = 5
    expect(idle.hasPending()).toBe(true);
    const amt = idle.claimPending();
    expect(amt).toBeCloseTo(5, 5);
    expect(ledger.snapshot().star).toBeCloseTo(5, 5);
    expect(idle.getPending()).toBe(0);
    expect(idle.hasPending()).toBe(false);
    expect(idle.claimPending()).toBe(0);
  });

  it('onShow 结算后台期间离线收益进 pending（仍不直接入账）', () => {
    const ledger = new Ledger({});
    const clock = makeClock(5000000);
    const idle = createIdleEngine({ ledger, getIeff: () => 1, getFoodRate: () => 0, clock });
    idle.markHidden();
    clock.advance(100000); // 后台 100s
    const r = idle.settleOnShow();
    // 双流修订：后台 100s 离线=宿舍 only → 0.25 × 0.2 × 100 = 5
    expect(r.pending).toBeCloseTo(5, 5);
    expect(ledger.snapshot().star).toBe(0); // 仍未入账
  });
});

describe('storage · 持久化（内存后端，Node 可测）', () => {
  it('save/load 往返', () => {
    clearSave();
    saveGame({ ledger: { star: 10, food: 5, diamond: 0, shard: 0 }, lastSeenMs: 12345 });
    const loaded = loadGame();
    expect(loaded.lastSeenMs).toBe(12345);
    expect(loaded.ledger.star).toBe(10);
    expect(loaded.ledger.food).toBe(5);
  });

  it('无存档时 loadGame 返回 null', () => {
    clearSave();
    expect(loadGame()).toBeNull();
  });
});
