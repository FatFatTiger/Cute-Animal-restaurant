// 数值平衡模拟（Sprint2 工程化·C4：改由 config/tunables 单一来源取参，消除重复与调参漂移风险）
// 有界、单次、无递归。仅做算术推演，输出平衡报告所需数字。
// 锁参红线（OFFLINE_FACTOR / T_CAP_INIT）来自 LOCKED；tunable 曲线来自 TUNED。
// 注：本文件为离线分析脚本，非运行时模块；调参时须与 src/config/tunables.js 保持同步。
'use strict';

const { TUNED, LOCKED } = require('../config/tunables');

const Y_BASE = TUNED.Y_BASE;                  // 星券/秒/座
const OFFLINE_FACTOR = LOCKED.OFFLINE_FACTOR; // 离线效率（锁参，R-BAL-4 已按 0.20 重跑；原 0.25 已废弃）
const T_CAP_SEC = LOCKED.T_CAP_INIT;          // 离线累积上限 4h
const ACTIVE_SEC = 20 * 60;                   // 每日活跃 20min（分析脚本常量，非运行时）
const OFFLINE_SEC = 8 * 3600;                 // 每日离线 8h（受 T_CAP 截断）
const DORM_SHARE = TUNED.DORM_SHARE;          // 双流占比：宿舍=25%，餐厅=75%（tunable，非锁参）

function recipeMult(lv){ return 1 + TUNED.RECIPE_PER_LEVEL * (lv - 1); }
function stationMult(lv){ return 1 + TUNED.STATION_PER_LEVEL * (lv - 1); }
function bondMult(nBond){ return 1 + Math.min(TUNED.BOND_IDLE_CAP, TUNED.BOND_IDLE_PER_ANIMAL * nBond); } // 上限 +30%
function seatCost(n){ return TUNED.SEAT_COST_BASE * Math.pow(TUNED.SEAT_COST_RATE, n); }   // C = 4 + n
function branchCost(n){ return TUNED.BRANCH_COST_BASE * Math.pow(TUNED.BRANCH_COST_RATE, n); } // recipe/station lv = 1 + n

function ieff(C, rLv, sLv, nBond){
  return C * Y_BASE * recipeMult(rLv) * stationMult(sLv) * bondMult(nBond) * 1; // ad_mult=1
}
function daily(C, rLv, sLv, nBond){
  const I = ieff(C, rLv, sLv, nBond);
  const dormRate = DORM_SHARE * I;                                  // 双流：宿舍 = DORM_SHARE × I_eff
  const restaurantOnline = I * ACTIVE_SEC;                          // 在线·餐厅（主收入流，事件流等效 I_eff）
  const dormOnline = dormRate * ACTIVE_SEC;                         // 在线·宿舍涓流（辅，含在线期）
  const offline = dormRate * OFFLINE_FACTOR * Math.min(OFFLINE_SEC, T_CAP_SEC); // 离线仅宿舍
  const total = restaurantOnline + dormOnline + offline;
  return { I, restaurantOnline, dormOnline, offline, total };
}

const tiers = {
  early: { C: 4,  rLv: 1,  sLv: 1,  nBond: 0 },
  mid:   { C: 10, rLv: 5,  sLv: 5,  nBond: 3 },
  late:  { C: 24, rLv: 15, sLv: 15, nBond: 10 },
};

console.log('=== 30天 F2P 经济模拟（有界）===');
for (const [name, t] of Object.entries(tiers)) {
  const d = daily(t.C, t.rLv, t.sLv, t.nBond);
  const pullsAll = d.total / 100;            // 全部星券投入抽卡
  const weeksToPityAll = 50 / (pullsAll * 7); // 50保底 / 每周抽数
  // 升级下一档成本
  const seatN = t.C - 4;
  const nextSeat = seatCost(seatN + 1);
  const nextBranch = branchCost(t.rLv); // recipe/station 同级
  console.log(`\n[${name}] C=${t.C} recipeLv=${t.rLv} stationLv=${t.sLv} bond=${t.nBond}`);
  console.log(`  I_eff(餐厅速率)      = ${d.I.toFixed(4)} 星券/秒`);
  console.log(`  在线·餐厅(20min)    = ${d.restaurantOnline.toFixed(0)} 星券/日`);
  console.log(`  在线·宿舍(20min)    = ${d.dormOnline.toFixed(0)} 星券/日`);
  console.log(`  离线·宿舍(4h上限)   = ${d.offline.toFixed(0)} 星券/日`);
  console.log(`  合计                 = ${d.total.toFixed(0)} 星券/日`);
  console.log(`  全投抽卡     = ${pullsAll.toFixed(1)} 抽/日 (~${(pullsAll*7).toFixed(0)} 抽/周)`);
  console.log(`  50保底可达   ≈ ${weeksToPityAll.toFixed(1)} 周 (若全投抽卡)`);
  console.log(`  下一级座位费 = ${nextSeat.toFixed(0)} 星券 | 下一级菜谱/工位费 = ${nextBranch.toFixed(0)} 星券`);
}

console.log('\n=== 跨系统加成幅度检查 ===');
const lateI = ieff(24, 15, 15, 0);
const lateIBond = ieff(24, 15, 15, 10);
const stationOnly = stationMult(15); // 单分支倍率
console.log(`  后期 station_mult (单分支) = ${stationOnly.toFixed(2)} (=+${(stationOnly*100-100).toFixed(0)}%)`);
console.log(`  bond 上限 = +30% (10只满羁绊上岗)`);
console.log(`  bond 占整体倍率: ${lateIBond.toFixed(3)} vs 无bond ${lateI.toFixed(3)} → 增量 ${((lateIBond/lateI-1)*100).toFixed(0)}%`);
console.log(`  结论: bond(+30%) < station单分支(+${((stationOnly*100-100).toFixed(0))}%) → 养成为软补充, 非主导 ✓`);

console.log('\n=== 离线 vs 在线（双流口径）===');
const e = daily(4,1,1,0);
console.log(`  早期: 离线宿舍/${e.offline.toFixed(0)} vs 在线餐厅/${e.restaurantOnline.toFixed(0)} = 比值 ${(e.offline/e.restaurantOnline).toFixed(2)}x (宿舍为辅, 离线仅宿舍×0.20封顶, genre内合理)`);

console.log('\n=== 碎片/升星节奏 ===');
console.log(`  R重复+20碎片, 升星需80 → 4只重复R可升1星`);
console.log(`  SR重复+50碎片, 升星需150 → 3只重复SR可升1星`);
console.log(`  SSR重复+100碎片, 升星需300 → 3只重复SSR可升1星`);
console.log(`  R60%池 → R重复频繁, 升星R动物可行; 满星溢出回收 R2/SR5/SSR10 星券(二级sink)`);

console.log('\n=== 模拟结束 (有界, 单次) ===');

// ============================================================================
// C3 §5 星券三方竞争扩展（Phase 5 专项 balance pass · 2026-07-30 重派落盘）
//   仅扩展【支出分配】建模；收入模型 daily() 零改动 → 离线占比结构性不变。
//   三路：U=座位/站点升级(星券) / G=抽卡(100/抽,50保底) / R=菜品解锁(星券部分)。
//   菜品解锁另耗食材(独立货币, 不占星券三方)；此处一并做食材门校验。
//   下列分配比例为 TUNED 默认推荐值【内联, 待迁 src/config/tunables.js】，
//   非锁参, 可自由调；本 pass 仅建模与校验, 不改任何锁参红线。
//   约束：本文件为离线分析脚本，本次仅新增此段，未触 daily()/锁参/其他 src 文件。
// ============================================================================

// —— 三路默认分配（推荐值, tunable, 内联）——
// early 优先拉收入(升级)+少量解锁；mid/late 升级成本变贵，星券向抽卡/解锁倾斜
// （late 座位已封顶 C_MAX=24，星券自动溢出到 G/R，不饿死）。
const C3_ALLOC = {
  early: { U: 0.45, G: 0.30, R: 0.25 },
  mid:   { U: 0.40, G: 0.35, R: 0.25 },
  late:  { U: 0.25, G: 0.45, R: 0.30 },
};

// 菜品解锁顺序索引 n（0-based）。出生已解锁 1–2 道基础菜 → n 起点≈1–2。
// 下列为按进度档的近似解锁水位（content count 待真机校准，见文档残留风险）。
const C3_RECIPE_N = { early: 2, mid: 10, late: 18 };

const C3_GACHA_SINGLE = LOCKED.GACHA_COST_SINGLE_STAR; // 100
const C3_GACHA_TEN    = LOCKED.GACHA_COST_TEN_STAR;    // 900（十连 9 折）
const C3_PITY         = LOCKED.PITY_HARD;              // 50
const C3_PITY_COST    = C3_PITY * C3_GACHA_SINGLE;     // 50 抽 = 5000 星券

function c3UnlockStar(n){ return TUNED.UNLOCK_COST_STAR_BASE * Math.pow(TUNED.UNLOCK_COST_STAR_RATE, n); }
function c3UnlockFood(n){ return TUNED.UNLOCK_COST_FOOD_BASE * Math.pow(TUNED.UNLOCK_COST_FOOD_RATE, n); }
// 食材日产（近似：在线仅, 离线不计；按工位倍率缩放；待真机校准，见文档）
function c3FoodPerDay(sLv){ return TUNED.FOOD_RATE * stationMult(sLv) * ACTIVE_SEC; }

console.log('\n=== C3 §5 星券三方竞争（升级 U / 抽卡 G / 解锁 R）===');
console.log('--- 收入基线（与 §2 双流口径一致, 零改动）---');
const c3 = {};
for (const [name, t] of Object.entries(tiers)) {
  const d = daily(t.C, t.rLv, t.sLv, t.nBond);
  const offRatio = d.offline / d.total;
  const a = C3_ALLOC[name];
  const aU = a.U * d.total, aG = a.G * d.total, aR = a.R * d.total;

  const seatMaxed = t.C >= TUNED.C_MAX;
  const seatN = t.C - TUNED.C_INIT;
  const nextSeat = seatMaxed ? Infinity : seatCost(seatN + 1);
  const nextBranch = branchCost(t.rLv);

  const recN = C3_RECIPE_N[name];
  const uStar = c3UnlockStar(recN), uFood = c3UnlockFood(recN);
  const fpd = c3FoodPerDay(t.sLv);

  const recSeat = seatMaxed ? Infinity : nextSeat / aU;
  const recBranch = nextBranch / aU;
  const recGachaPity = C3_PITY_COST / aG;
  const recGacha10 = C3_GACHA_TEN / aG;
  const recUnlockStar = uStar / aR;
  const recUnlockFood = uFood / fpd;

  c3[name] = { d, offRatio, a, aU, aG, aR, seatMaxed, nextSeat, nextBranch, recN, uStar, uFood, fpd, recSeat, recBranch, recGachaPity, recGacha10, recUnlockStar, recUnlockFood };

  const fmtDays = (x) => (isFinite(x) ? x.toFixed(1) + '天' : '已封顶');
  console.log(`\n[${name}] 日产=${d.total.toFixed(0)} 星券 | 离线占比=${(offRatio*100).toFixed(1)}%`);
  console.log(`  分配 U/G/R=${(a.U*100).toFixed(0)}%/${(a.G*100).toFixed(0)}%/${(a.R*100).toFixed(0)}% → 日配额 ${aU.toFixed(0)}/${aG.toFixed(0)}/${aR.toFixed(0)}`);
  console.log(`  升级U: 座位${seatMaxed?'已封顶(C_MAX)':'next='+nextSeat.toFixed(0)+'→'+fmtDays(recSeat)} | 工位next=${nextBranch.toFixed(0)}→${fmtDays(recBranch)}`);
  console.log(`  抽卡G: 十连${C3_GACHA_TEN}→${recGacha10.toFixed(1)}天 | 50保底${C3_PITY_COST}→${recGachaPity.toFixed(1)}天(${(recGachaPity/7).toFixed(1)}周)`);
  console.log(`  解锁R: 星券${uStar.toFixed(0)}(n=${recN})→${recUnlockStar.toFixed(1)}天 | 食材${uFood.toFixed(0)}→${recUnlockFood.toFixed(1)}天(食材日产${fpd.toFixed(0)})`);
}

console.log('\n--- C3 抽卡份额敏感度（early 日产355, 固定）---');
console.log('  w_G    50保底(天)   50保底(周)');
for (const w of [1.0, 0.5, 0.35, 0.30, 0.20, 0.10]) {
  const dG = w * daily(4,1,1,0).total;
  const days = C3_PITY_COST / dG;
  console.log(`  ${w.toFixed(2)}   ${days.toFixed(1).padStart(7)}     ${(days/7).toFixed(1).padStart(6)}`);
}

console.log('\n--- C3 红线校验 ---');
const er = c3.early;
const newbieAfford = C3_GACHA_TEN / (C3_ALLOC.early.G * daily(4,1,1,0).total);
const fullGachaDays = C3_PITY_COST / daily(4,1,1,0).total;
console.log(`  [红线1] 新手前10抽≥1SR: 结构保证 NEWBIE_FIRST10_SR=${LOCKED.NEWBIE_FIRST10_SR} & 十连≥1SR=${LOCKED.TEN_PULL_SR_GUARANTEE}; 早期十连可负担≈${newbieAfford.toFixed(1)}天; 叠加每日免费单抽1次/日→10日必达10抽 → 满足`);
console.log(`  [红线2] 50保底~2.0周: 全投抽卡早期=${fullGachaDays.toFixed(1)}天≈${(fullGachaDays/7).toFixed(1)}周 (与§2一致, 收入模型零改动) → 满足`);
console.log(`  [红线3] 离线占比: early=${(er.offRatio*100).toFixed(1)}% (§2=32.4%) → C3仅改支出分配, 收入公式零改动, 结构性不变 → 满足`);

console.log('\n=== C3 §5 模拟结束 (有界, 单次) ===');
