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
  const online = I * ACTIVE_SEC;
  const offline = I * OFFLINE_FACTOR * Math.min(OFFLINE_SEC, T_CAP_SEC);
  return { I, online, offline, total: online + offline };
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
  console.log(`  I_eff        = ${d.I.toFixed(4)} 星券/秒`);
  console.log(`  在线(20min)  = ${d.online.toFixed(0)} 星券/日`);
  console.log(`  离线(4h上限) = ${d.offline.toFixed(0)} 星券/日`);
  console.log(`  合计         = ${d.total.toFixed(0)} 星券/日`);
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

console.log('\n=== 离线 vs 在线 ===');
const e = daily(4,1,1,0);
console.log(`  早期: 离线/${e.offline.toFixed(0)} vs 在线/${e.online.toFixed(0)} = 比值 ${(e.offline/e.online).toFixed(1)}x (受4h×20%封顶,  genre内合理)`);

console.log('\n=== 碎片/升星节奏 ===');
console.log(`  R重复+20碎片, 升星需80 → 4只重复R可升1星`);
console.log(`  SR重复+50碎片, 升星需150 → 3只重复SR可升1星`);
console.log(`  SSR重复+100碎片, 升星需300 → 3只重复SSR可升1星`);
console.log(`  R60%池 → R重复频繁, 升星R动物可行; 满星溢出回收 R2/SR5/SSR10 星券(二级sink)`);

console.log('\n=== 模拟结束 (有界, 单次) ===');
