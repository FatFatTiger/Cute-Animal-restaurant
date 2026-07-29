'use strict';

/**
 * 无引擎：内存版 wx 存储，仅供需要「持久化」占位逻辑的集成测试使用。
 * 纯逻辑层（本 Sprint）不直接依赖真机 wx；此 mock 用于后续接入 E1 存档封装时的契约占位。
 */
class MockWxStorage {
  constructor() {
    this._m = new Map();
  }
  getStorageSync(k) {
    return this._m.has(k) ? this._m.get(k) : '';
  }
  setStorageSync(k, v) {
    this._m.set(k, v);
    return true;
  }
  removeStorageSync(k) {
    return this._m.delete(k);
  }
  getStorage(k, cb) {
    setTimeout(() => cb({ data: this.getStorageSync(k) }), 0);
  }
  setStorage(k, v, cb) {
    this.setStorageSync(k, v);
    if (cb) setTimeout(() => cb(), 0);
  }
}

/** 安装一个内存存储实例（纯逻辑无全局副作用）。 */
function install() {
  return new MockWxStorage();
}

module.exports = { MockWxStorage, install };
