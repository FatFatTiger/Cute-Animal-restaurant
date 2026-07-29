'use strict';

/**
 * Jest 配置（零引擎依赖，Node 直跑）。
 * 仅跑 T1（tests/unit）+ T2（tests/integration）纯逻辑测试；T3/T4 真机占位不在此跑。
 */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/tests/unit', '<rootDir>/tests/integration'],
  testMatch: ['**/*.spec.js', '**/*.int.js'],
  verbose: true,
};
