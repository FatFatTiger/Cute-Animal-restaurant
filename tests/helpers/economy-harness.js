'use strict';

/**
 * 内存账本 harness，供集成测试注入 + 货币守恒校验（不变量 3）。
 */
const { Ledger } = require('../../src/economy/ledger');

function makeHarness(opts) {
  const initial = (opts && opts.initial) || {};
  const ledger = new Ledger(initial);
  return {
    ledger,
    /**
     * 守恒：期末 − 期初 == 净产出 − 净消耗（逐货币）。
     * @param {object} produced 各货币本批次产出合计
     * @param {object} consumed 各货币本批次消耗合计
     */
    assertConservation(produced, consumed) {
      const fin = ledger.snapshot();
      const perCurrency = {};
      let allOk = true;
      for (const c of Object.keys(fin)) {
        const d = fin[c] - (initial[c] || 0);
        const net = (produced[c] || 0) - (consumed[c] || 0);
        const ok = d === net;
        perCurrency[c] = ok;
        if (!ok) allOk = false;
      }
      return { allOk, perCurrency, final: fin };
    },
  };
}

module.exports = { makeHarness };
