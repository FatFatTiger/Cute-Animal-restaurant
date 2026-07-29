'use strict';

/**
 * 主包体积门禁（T3 smoke / CI 硬阻断）
 *
 * 读取 `project.config.json` 的 `packOptions.ignore`（微信小游戏发布包排除清单），
 * 累加「非忽略文件」的真实字节，断言 < 4MB（4194304）。超限则 process.exit(1) 阻断 CI。
 *
 * 设计说明（构建近似）：
 *  - 微信小游戏主包硬上限 4MB（ADR-3）。本脚本以「文件系统真实字节」近似微信构建产物主包体积，
 *    作为 V4（主包<4MB）的构造性证明与 CI 硬门禁（真机构建/分包命中归 R4/R6/V4–V7，仍待真机证伪）。
 *  - `.git`（VCS 目录）从不在微信发布包内，显式跳过；其余一律按 `packOptions.ignore` 判定。
 *  - 运行方式：`node tests/smoke/build-size.gate.js`（CI 的 size-gate job 即调用此脚本）。
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const PROJECT_CONFIG = path.join(ROOT, 'project.config.json');
const BUILD_LIMIT = 4 * 1024 * 1024; // 4MB 主包硬上限

function loadIgnoreList() {
  const cfg = JSON.parse(fs.readFileSync(PROJECT_CONFIG, 'utf8'));
  return (cfg.packOptions && cfg.packOptions.ignore) || [];
}

function isIgnored(relPath, entry) {
  if (entry.type === 'folder') {
    return relPath === entry.value || relPath.startsWith(entry.value + '/');
  }
  // file
  return relPath === entry.value;
}

/**
 * 递归累加非忽略文件字节。
 * @param {string} dir       当前目录（绝对）
 * @param {Array}  ignoreList project.config packOptions.ignore
 * @param {object} acc       { bytes, files[] }
 */
function walk(dir, ignoreList, acc) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const ent of entries) {
    const abs = path.join(dir, ent.name);
    const rel = path.relative(ROOT, abs);
    if (rel === '.git') continue; // VCS 目录，从不在微信发布包内
    let ignored = false;
    for (const ig of ignoreList) {
      if (isIgnored(rel, ig)) {
        ignored = true;
        break;
      }
    }
    if (ignored) continue;
    if (ent.isDirectory()) {
      walk(abs, ignoreList, acc);
    } else if (ent.isFile()) {
      const st = fs.statSync(abs);
      acc.bytes += st.size;
      acc.files.push(rel);
    }
  }
}

function main() {
  const ignoreList = loadIgnoreList();
  const acc = { bytes: 0, files: [] };
  walk(ROOT, ignoreList, acc);

  const kb = (acc.bytes / 1024).toFixed(2);
  const limitMb = (BUILD_LIMIT / (1024 * 1024)).toFixed(0);

  console.log('=== 微信主包体积门禁（构建近似）===');
  console.log(`发布包文件数 : ${acc.files.length}`);
  console.log(`发布包字节数 : ${acc.bytes} B (≈ ${kb} KB)`);
  console.log(`主包硬上限   : ${BUILD_LIMIT} B (${limitMb} MB)`);
  console.log(`忽略规则数   : ${ignoreList.length}（来自 project.config.json packOptions.ignore）`);

  if (acc.bytes >= BUILD_LIMIT) {
    console.error(
      `❌ 主包体积超限: ${acc.bytes} B >= ${BUILD_LIMIT} B（${limitMb}MB）。阻断合并/发布。`
    );
    process.exit(1);
  }
  console.log('✓ 主包体积 < 4MB，门禁通过。');
  process.exit(0);
}

main();
