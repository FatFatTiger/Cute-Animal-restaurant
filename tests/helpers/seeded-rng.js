'use strict';

/**
 * 可种子 RNG（mulberry32），保证顾客流 / 需求序列可复现（不变量 7 复现性）。
 * 无引擎依赖，纯函数。
 */
function makeSeededRng(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

module.exports = { makeSeededRng };
