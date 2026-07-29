'use strict';

/**
 * 存档持久化（零 wx 依赖；运行时按环境选后端）。
 *
 * 后端优先级：wx.Storage → global.localStorage → 内存 Map（Node / 测试）。
 * 仅 persist 账本快照 + lastSeenMs（服务端时间戳），绝不存任何逻辑状态。
 * 锁参红线（offline_factor / T_cap）不在此文件，离线计算在 ieff.js。
 */

const KEY = 'cozy-resto-save-v1';

function _backend() {
  try {
    if (typeof wx !== 'undefined' && wx && typeof wx.getStorageSync === 'function') return 'wx';
  } catch (_) { /* ignore */ }
  try {
    if (typeof global !== 'undefined' && global.localStorage && typeof global.localStorage.getItem === 'function') return 'ls';
  } catch (_) { /* ignore */ }
  return 'mem';
}

let _mem = null;

function loadRaw() {
  const b = _backend();
  try {
    if (b === 'wx') return wx.getStorageSync(KEY) || null;
    if (b === 'ls') {
      const s = global.localStorage.getItem(KEY);
      return s ? JSON.parse(s) : null;
    }
    return _mem;
  } catch (_) { return null; }
}

function saveRaw(obj) {
  const b = _backend();
  try {
    if (b === 'wx') { wx.setStorageSync(KEY, obj); return true; }
    if (b === 'ls') { global.localStorage.setItem(KEY, JSON.stringify(obj)); return true; }
    _mem = obj;
    return true;
  } catch (_) { return false; }
}

function loadGame() { return loadRaw(); }
function saveGame(state) { return saveRaw(state); }
function clearSave() {
  const b = _backend();
  try {
    if (b === 'wx') wx.removeStorageSync(KEY);
    else if (b === 'ls') global.localStorage.removeItem(KEY);
    else _mem = null;
  } catch (_) { /* ignore */ }
}

module.exports = { loadGame, saveGame, clearSave, KEY };
