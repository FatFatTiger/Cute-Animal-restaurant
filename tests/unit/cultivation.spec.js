'use strict';

/**
 * 养成（cultivation）单测 · Phase 5 新增（任务 QA-P5-001）
 *
 * 覆盖宠物「每日撸毛上限」机制：PET_DAILY_CAP = 20（见 src/config/tunables.js:60）。
 * 该机制已在 src/cultivation.js 实现：
 *   - canPet(id, at)：used >= PET_DAILY_CAP 时返回 { ok:false, reason:'DAILY_CAP' }
 *   - pet(id, opts)：canPet 失败即早退，不累计好感度 A、不累加日计数
 *
 * 验收点（任务 QA-P5-001 要求的两项断言）：
 *   1) 达到日上限后，对应动作（撸毛）在 canPet 层被判定为「禁用/置灰」
 *      —— UI（撸毛馆按钮）以 canPet().ok === false 作为置灰决策信号；
 *   2) 达到上限后再次 pet，返回 ok:false 且好感度 A 与日计数「不再累计」。
 *
 * 红线：本文件只写测试，不改动任何游戏逻辑 / 锁参 / 架构。
 */

const { Cultivation } = require('../../src/cultivation');
const { TUNED } = require('../../src/config/tunables');

// 单只 critter 在同一天内连撸 n 次；每次把时间推进一个「超过冷却(30s)」的步长，
// 以排除 COOLDOWN 干扰，同时总推进 ≪ 1 天，确保不触发「跨天清零」。
const DAY_MS = 86400000;
const PET_STEP_MS = (TUNED.PET_COOLDOWN_SEC + 1) * 1000; // 31s > 30s 冷却

function petTimes(c, id, n, startMs) {
  let t = startMs;
  const results = [];
  for (let i = 0; i < n; i++) {
    results.push(c.pet(id, { at: t }));
    t += PET_STEP_MS; // 下一次落在前一次冷却之后
  }
  return { results, endMs: t };
}

describe('cultivation · 宠物每日上限 PET_DAILY_CAP', () => {
  // 起始时间选在「当天第 1 秒」且固定在 day=1，避免依赖真实 Date.now，保证 n 次连撸都在同一天
  // （封顶 21 次 × 31s = 651s ≪ 86400s 一天）。
  const dayStart = Math.floor(1.5 * DAY_MS) + 1000;

  it('达到日上限后 canPet 返回 ok:false 且 reason=DAILY_CAP（动作置灰/禁用）', () => {
    const c = new Cultivation();
    const id = 'critter-a';
    const { endMs } = petTimes(c, id, TUNED.PET_DAILY_CAP, dayStart);
    // 已达上限时再查一次：决策信号应为「禁用」
    const check = c.canPet(id, endMs);
    expect(check.ok).toBe(false);
    expect(check.reason).toBe('DAILY_CAP');
  });

  it('达到日上限后再次 pet 返回 ok:false，且好感度 A 与日计数不再累计', () => {
    const c = new Cultivation();
    const id = 'critter-b';
    const before = petTimes(c, id, TUNED.PET_DAILY_CAP, dayStart);
    const affinityAtCap = c.affinityOf(id); // 应为 PET_DAILY_CAP × PET_AFFINITY_GAIN = 20
    expect(affinityAtCap).toBe(TUNED.PET_DAILY_CAP * TUNED.PET_AFFINITY_GAIN);

    // 第 (cap+1) 次尝试撸毛
    const over = c.pet(id, { at: before.endMs });
    expect(over.ok).toBe(false);
    expect(over.reason).toBe('DAILY_CAP');
    // 不再累计：好感度 A 封顶不变
    expect(c.affinityOf(id)).toBe(affinityAtCap);
    // 不再累计：日计数封顶在 PET_DAILY_CAP（canPet 仍判 DAILY_CAP 证明确实未回落）
    expect(c.canPet(id, before.endMs).ok).toBe(false);
  });

  it('边界：恰好 PET_DAILY_CAP 次成功，(cap+1) 次被拒（不超发）', () => {
    const c = new Cultivation();
    const id = 'critter-c';
    const { results } = petTimes(c, id, TUNED.PET_DAILY_CAP, dayStart);
    // 前 cap 次全部成功，且好感度按 PET_AFFINITY_GAIN 线性累加
    results.forEach((r, i) => {
      expect(r.ok).toBe(true);
      expect(r.gain).toBe(TUNED.PET_AFFINITY_GAIN);
      expect(r.affinity).toBe((i + 1) * TUNED.PET_AFFINITY_GAIN);
    });
    // 第 cap+1 次被拒
    const extra = c.pet(id, { at: dayStart + TUNED.PET_DAILY_CAP * PET_STEP_MS });
    expect(extra.ok).toBe(false);
    expect(extra.reason).toBe('DAILY_CAP');
  });

  it('跨天清零：次日上限重置，可重新撸满 PET_DAILY_CAP 次（好感度 A 跨天累积）', () => {
    const c = new Cultivation();
    const id = 'critter-d';
    // 当天撸满
    petTimes(c, id, TUNED.PET_DAILY_CAP, dayStart);
    expect(c.canPet(id, dayStart + TUNED.PET_DAILY_CAP * PET_STEP_MS).ok).toBe(false); // 当天仍禁用
    // 跨到第二天（推进 ≥1 天，同时远超冷却）
    const nextDay = dayStart + DAY_MS + PET_STEP_MS;
    expect(c.canPet(id, nextDay).ok).toBe(true); // 次日上限重置
    // 次日可重新撸满 cap 次（证明「日计数」清零，而非永久封印）
    const { results } = petTimes(c, id, TUNED.PET_DAILY_CAP, nextDay);
    results.forEach((r) => expect(r.ok).toBe(true));
    // 次日 (cap+1) 次仍被拒（按自然日重新计上限）
    const extra = c.pet(id, { at: nextDay + TUNED.PET_DAILY_CAP * PET_STEP_MS });
    expect(extra.ok).toBe(false);
    expect(extra.reason).toBe('DAILY_CAP');
    // 好感度 A 跨天累积（bond 持续），但日上限按天独立封顶
    expect(c.affinityOf(id)).toBe(TUNED.PET_DAILY_CAP * TUNED.PET_AFFINITY_GAIN * 2);
  });
});
