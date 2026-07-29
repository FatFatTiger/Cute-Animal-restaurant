'use strict';

/**
 * 测试辅助：内存 mock canvas 2d context，记录所有绘制调用（不依赖真机 / 真 canvas）。
 * 供 tests/unit/ui-state.spec.js 验证 applyCommands 在 Node 下消费绘制指令而不抛错。
 */

function createMockCanvas(width, height) {
  const calls = [];
  const rec = (m) => (...args) => calls.push(Object.assign({ m }, namedArgs(m, args)));
  const ctx = {
    canvas: { width: width || 375, height: height || 667 },
    fillStyle: '#000000',
    strokeStyle: '#000000',
    font: '',
    textAlign: 'left',
    textBaseline: 'top',
    lineWidth: 1,
    fillRect: rec('fillRect'),
    strokeRect: rec('strokeRect'),
    clearRect: rec('clearRect'),
    fillText: rec('fillText'),
    beginPath: rec('beginPath'),
    arc: rec('arc'),
    fill: rec('fill'),
    stroke: rec('stroke'),
    moveTo: rec('moveTo'),
    lineTo: rec('lineTo'),
    save: rec('save'),
    restore: rec('restore'),
  };
  return {
    width: width || 375,
    height: height || 667,
    getContext: () => ctx,
    _ctx: ctx,
    _calls: calls,
  };
}

function namedArgs(m, args) {
  switch (m) {
    case 'fillRect':
    case 'strokeRect':
    case 'clearRect':
      return { x: args[0], y: args[1], w: args[2], h: args[3] };
    case 'fillText':
      return { text: args[0], x: args[1], y: args[2] };
    case 'arc':
      return { x: args[0], y: args[1], r: args[2] };
    case 'moveTo':
    case 'lineTo':
      return { x: args[0], y: args[1] };
    default:
      return {};
  }
}

module.exports = { createMockCanvas };
