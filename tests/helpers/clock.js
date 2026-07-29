'use strict';

/**
 * 可注入时钟，模拟服务端时间戳（离线收益 / 免费抽防回拨）。
 * 无引擎依赖；离线时长一律以注入的 now 为准（防本地时钟回拨）。
 */
class Clock {
  constructor(now) {
    this._now = now != null ? now : 0;
  }
  now() {
    return this._now;
  }
  advance(ms) {
    this._now += ms;
    return this._now;
  }
  set(ms) {
    this._now = ms;
    return this._now;
  }
}

module.exports = { Clock };
