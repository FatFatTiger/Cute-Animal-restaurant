'use strict';

/**
 * T1 单元测试 · 抽卡系统（Epic 3）
 * 覆盖：不变量 4（保底计数正确）+ E3-S1~S5 核心逻辑。
 *
 *  - 概率分布蒙特卡洛：R≈60% / SR≈30% / SSR≈10%（容差 ±1%，N=0% 不入池）
 *  - 硬保底 pity≥50 → SSR；软保底阶梯 c∈[41,49]（≈19% / 55% / 91%）
 *  - 十连 9 折保底 ≥1SR；新手前 10 抽 ≥1SR
 *  - pity 跨货币共享、SSR 获取归零
 *  - 重复转碎片（R20/SR50/SSR100）
 *  - 幂等：同 requestId 不双扣、弱网不扣费
 *
 * 零引擎依赖，jest 直跑。RNG 可注入（seeded）保证可复现。
 */

const { GachaEngine, isAtLeastSR } = require('../../src/gacha/index');
const { Ledger } = require('../../src/economy/ledger');
const { LOCKED } = require('../../src/config/tunables');
const { makeSeededRng } = require('../helpers/seeded-rng');

// 蒙特卡洛样本量（性能与置信度平衡）
const MC = 15000;

function freshEngine(overrides) {
  return new GachaEngine(
    Object.assign(
      { ledger: new Ledger({ star: 1e9 }), rng: makeSeededRng(1), newbieWindow: false },
      overrides || {}
    )
  );
}

// 统计单抽稀有度分布（每样本独立新引擎，pity=0 即基线概率表）
function sampleBaseDistribution(samples) {
  const counts = { R: 0, SR: 0, SSR: 0 };
  for (let i = 0; i < samples; i++) {
    const e = freshEngine({ rng: makeSeededRng(((i + 1) * 2654435761) >>> 0) });
    const res = e.drawSingle({ currency: 'star', requestId: 'base-' + i });
    counts[res.draws[0].rarity]++;
  }
  return counts;
}

// 固定 pity 下的 SSR 出现率（每样本独立新引擎，initialPity=pity，仅抽 1 次）
function ssrFractionAtPity(pity, samples) {
  let ssr = 0;
  for (let i = 0; i < samples; i++) {
    const e = freshEngine({
      rng: makeSeededRng(((i + 1) * 40503) >>> 0),
      initialPity: pity,
    });
    const res = e.drawSingle({ currency: 'star', requestId: 'soft-' + pity + '-' + i });
    if (res.draws[0].rarity === 'SSR') ssr++;
  }
  return ssr / samples;
}

describe('不变量 4 · 概率分布蒙特卡洛（R60/SR30/SSR10，N=0%）', () => {
  const counts = sampleBaseDistribution(MC);
  const total = MC;

  it('基线概率表 R≈60% / SR≈30% / SSR≈10%（容差 ±1%）', () => {
    expect(Math.abs(counts.R / total - 0.60)).toBeLessThanOrEqual(0.01);
    expect(Math.abs(counts.SR / total - 0.30)).toBeLessThanOrEqual(0.01);
    expect(Math.abs(counts.SSR / total - 0.10)).toBeLessThanOrEqual(0.01);
  });

  it('N 不入抽卡池（0%）', () => {
    expect(counts.R + counts.SR + counts.SSR).toBe(total); // 无任何 N
  });
});

describe('不变量 4 · 硬保底 pity≥50 → SSR', () => {
  it('连续非 SSR 抽满 50 次（pity→50），第 51 抽必出 SSR 且 SSR 后归零', () => {
    const e = freshEngine({
      rng: makeSeededRng(7),
      decide: (ctx) => (ctx.pity >= LOCKED.PITY_HARD ? 'SSR' : 'R'),
    });
    let ssrCount = 0;
    for (let i = 0; i < 51; i++) {
      const res = e.drawSingle({ currency: 'star', requestId: 'hard-' + i });
      const rarity = res.draws[0].rarity;
      if (i < 50) expect(rarity).toBe('R'); // 前 50 次强制非 SSR，pity 爬升
      else expect(rarity).toBe('SSR'); // 第 51 抽（pity=50）硬保底
      if (rarity === 'SSR') ssrCount++;
    }
    expect(ssrCount).toBe(1);
    expect(e.getPity()).toBe(0); // SSR 后归零
  });

  it('pity 每次抽 +1，SSR 获取即归零（单抽/十连一致）', () => {
    const e = freshEngine({
      rng: makeSeededRng(11),
      decide: (ctx) => (ctx.pity >= 10 ? 'SSR' : 'R'), // 第 11 抽（pity=10）出 SSR
    });
    for (let i = 0; i < 10; i++) {
      e.drawSingle({ currency: 'star', requestId: 'p' + i });
      expect(e.getPity()).toBe(i + 1);
    }
    e.drawSingle({ currency: 'star', requestId: 'p10' }); // pity=10 → SSR
    expect(e.getPity()).toBe(0); // 归零

    // 十连：10 抽内无 SSR → pity +10；末尾不触发 SSR（decide 仅在 pity≥10 出）
    const e2 = freshEngine({ rng: makeSeededRng(12), decide: () => 'R' });
    e2.drawTen({ currency: 'star', requestId: 'ten-pity' });
    expect(e2.getPity()).toBe(10);
  });
});

describe('不变量 4 · 软保底阶梯（c∈[41,49]）', () => {
  it('SSR_rate(41)≈19%', () => {
    expect(ssrFractionAtPity(41, MC)).toBeCloseTo(0.19, 1); // ±0.05
  });
  it('SSR_rate(45)≈55%', () => {
    expect(ssrFractionAtPity(45, MC)).toBeCloseTo(0.55, 1);
  });
  it('SSR_rate(49)≈91%', () => {
    expect(ssrFractionAtPity(49, MC)).toBeCloseTo(0.91, 1);
  });
});

describe('不变量 4 · 十连保底 ≥1SR（E3-S3）', () => {
  it('任意账号十连必含 ≥1 SR（保底后处理）', () => {
    for (let t = 0; t < 300; t++) {
      const e = freshEngine({ rng: makeSeededRng(((t + 1) * 7919) >>> 0) });
      const res = e.drawTen({ currency: 'star', requestId: 'ten-' + t });
      const has = res.draws.some((d) => isAtLeastSR(d.rarity));
      expect(has).toBe(true);
    }
  });

  it('全 R 十连：强制末位为 SR（保底顺延语义）', () => {
    const e = freshEngine({ rng: makeSeededRng(1), decide: () => 'R' });
    const res = e.drawTen({ currency: 'star', requestId: 'ten-allR' });
    const srs = res.draws.filter((d) => isAtLeastSR(d.rarity));
    expect(srs.length).toBe(1);
    expect(res.draws[9].rarity).toBe('SR'); // 末位被强制
  });
});

describe('不变量 4 · 新手前 10 抽保底 ≥1SR（E3-S3）', () => {
  it('新账号前 10 次单抽必含 ≥1 SR', () => {
    for (let t = 0; t < 300; t++) {
      const e = freshEngine({ rng: makeSeededRng(((t + 1) * 104729) >>> 0), newbieWindow: true }); // 启用新手保底
      let got = false;
      for (let i = 0; i < 10; i++) {
        const res = e.drawSingle({ currency: 'star', requestId: 'nb-' + t + '-' + i });
        if (isAtLeastSR(res.draws[0].rarity)) got = true;
      }
      expect(got).toBe(true);
    }
  });

  it('新手窗口结束后不再强制保底（第 11 抽可正常为 R）', () => {
    const e = freshEngine({ rng: makeSeededRng(3), newbieWindow: true, decide: () => 'R' });
    const first10 = [];
    for (let i = 0; i < 10; i++) first10.push(e.drawSingle({ currency: 'star', requestId: 'nb11-' + i }));
    const srInFirst10 = first10.filter((r) => isAtLeastSR(r.draws[0].rarity)).length;
    expect(srInFirst10).toBe(1); // 首个 R 被强制为 SR，仅 1 个
    const eleventh = e.drawSingle({ currency: 'star', requestId: 'nb11-10' });
    expect(e.getPulls()).toBe(11);
    expect(eleventh.draws[0].rarity).toBe('R'); // 窗口结束（pulls>=10）不再强制
  });
});

describe('不变量 4 · pity 跨货币共享 + SSR 归零', () => {
  it('星券/钻石交替抽仍共享同一 pity 计数', () => {
    const e = freshEngine({
      ledger: new Ledger({ star: 1e9, diamond: 1e9 }),
      rng: makeSeededRng(5),
      decide: (ctx) => (ctx.pity >= LOCKED.PITY_HARD ? 'SSR' : 'R'),
    });
    for (let i = 0; i < 50; i++) {
      const cur = i % 2 === 0 ? 'star' : 'diamond';
      e.drawSingle({ currency: cur, requestId: 'mix-' + i });
    }
    expect(e.getPity()).toBe(50); // 50 次非 SSR → pity 50（跨货币共享）
    const final = e.drawSingle({ currency: 'star', requestId: 'mix-final' });
    expect(final.draws[0].rarity).toBe('SSR'); // 硬保底
  });

  it('双货币隔离：抽卡只动 star/diamond，不碰 food', () => {
    const ledger = new Ledger({ star: 1e9, food: 123, diamond: 0 });
    const e = new GachaEngine({ ledger, rng: makeSeededRng(9), newbieWindow: false });
    e.drawSingle({ currency: 'star', requestId: 'iso' });
    expect(ledger.getBalance('food')).toBe(123); // food 不变
  });
});

describe('E3-S4 · 重复转碎片（R20/SR50/SSR100）', () => {
  it('重复动物转对应碎片入账（R20）', () => {
    const ledger = new Ledger({ star: 1e9 });
    const e = new GachaEngine({
      ledger,
      rng: makeSeededRng(2),
      newbieWindow: false,
      decide: () => 'R',
      pickAnimal: () => 'r_dup',
    });
    const r1 = e.drawSingle({ currency: 'star', requestId: 'd1' }); // 首抽：新
    expect(r1.draws[0].isDuplicate).toBe(false);
    expect(r1.totalShard).toBe(0);
    const r2 = e.drawSingle({ currency: 'star', requestId: 'd2' }); // 重复：碎片 +20
    expect(r2.draws[0].isDuplicate).toBe(true);
    expect(r2.totalShard).toBe(20);
    expect(ledger.getBalance('shard')).toBe(20);
  });

  it('SSR 重复转 100 碎片', () => {
    const ledger = new Ledger({ star: 1e9 });
    const e = new GachaEngine({
      ledger,
      rng: makeSeededRng(2),
      newbieWindow: false,
      decide: () => 'SSR',
      pickAnimal: () => 'ssr_dup',
    });
    e.drawSingle({ currency: 'star', requestId: 's1' });
    const r2 = e.drawSingle({ currency: 'star', requestId: 's2' });
    expect(r2.totalShard).toBe(100);
    expect(ledger.getBalance('shard')).toBe(100);
  });
});

describe('E3-S1/E3-S5 · 幂等与弱网（服务端权威 requestId）', () => {
  it('同 requestId 重复提交只结算一次（不双扣）', () => {
    const ledger = new Ledger({ star: 1000 });
    const e = new GachaEngine({ ledger, rng: makeSeededRng(3), newbieWindow: false });
    const r1 = e.drawSingle({ currency: 'star', requestId: 'idem' });
    const r2 = e.drawSingle({ currency: 'star', requestId: 'idem' }); // 重复
    expect(r1.ok).toBe(true);
    expect(r2).toBe(r1); // 同一缓存结果
    expect(ledger.getBalance('star')).toBe(900); // 仅扣 100 一次
  });

  it('货币不足 → 不发起、不扣费，同 requestId 复重返回失败', () => {
    const ledger = new Ledger({ star: 50 }); // < 100
    const e = new GachaEngine({ ledger, rng: makeSeededRng(4), newbieWindow: false });
    const r1 = e.drawSingle({ currency: 'star', requestId: 'poor' });
    const r2 = e.drawSingle({ currency: 'star', requestId: 'poor' });
    expect(r1.ok).toBe(false);
    expect(r1.reason).toBe('INSUFFICIENT');
    expect(r2.ok).toBe(false);
    expect(ledger.getBalance('star')).toBe(50); // 未扣
  });

  it('十连不足 900 星券 → 不扣费', () => {
    const ledger = new Ledger({ star: 800 });
    const e = new GachaEngine({ ledger, rng: makeSeededRng(6), newbieWindow: false });
    const r = e.drawTen({ currency: 'star', requestId: 'poor-ten' });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('INSUFFICIENT');
    expect(ledger.getBalance('star')).toBe(800);
  });
});
