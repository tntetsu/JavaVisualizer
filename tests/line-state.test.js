/**
 * line-state.test.js — 変数の状態の変化の列を本物の Java と比べる（開発計画書 7 節）
 *
 * 本物の Java 側（tests/tools/TraceStates.java。JDI）は、メソッドに入ったとき・各行の実行前・メソッドを抜けるときに、
 * そのフレームのローカル変数（this を除く）の値を読み、前回から変わったものを「メソッド名:変数名=値」として順に記録する。
 * JavaDebugger 側は、トレースのうち同じ時点に当たるイベント（フレームの最初のイベント、同じフレームで行が変わった
 * 最初のイベント、メソッドを抜ける直前のイベント）で同じように記録する。呼び出しはフレームの callId で区別する。
 * 同じ時点で変わった変数は、どちらも名前の順に並べる。
 *
 * 出力の比較（oracle.test.js）では見えない、途中の変数の値の誤り（型の変換・参照の共有・スコープ）を見つけるためのテスト。
 * 例外で終わるプログラム（uncaught_*）は対象外。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { cpus } from 'node:os';
import { JavaDebugger } from '../src/engine/java-debugger.js';
import { stateChanges } from './tools/state-changes.js';

const ROOT = new URL('..', import.meta.url).pathname;
const files = [
  ...readdirSync(join(ROOT, 'samples')).map(f => join('samples', f)),
  ...readdirSync(join(ROOT, 'tests/cases')).filter(f => !f.startsWith('uncaught_')).map(f => join('tests/cases', f)),
].filter(f => f.endsWith('.java')).sort();

/** 入力欄の内容：ファイルと同じ名前の .stdin（なければ空） */
const stdinFile = (f) => join(ROOT, f.replace(/\.java$/, '.stdin'));
const stdinOf = (f) => (existsSync(stdinFile(f)) ? readFileSync(stdinFile(f), 'utf8') : '');

function realChanges(file) {
  return new Promise((resolve, reject) => {
    execFile('java', [join(ROOT, 'tests/tools/TraceStates.java'), join(ROOT, file), ...(existsSync(stdinFile(file)) ? [stdinFile(file)] : [])], { maxBuffer: 1 << 26, timeout: 120000 }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr || err.message)); else resolve(JSON.parse(stdout));
    });
  });
}

const results = new Map();
{
  const queue = [...files];
  await Promise.all(Array.from({ length: Math.min(cpus().length, 8) }, async () => {
    while (queue.length) { const f = queue.shift(); results.set(f, await realChanges(f)); }
  }));
}

for (const f of files) {
  test(`変数の状態の変化：${f}`, () => {
    const expected = results.get(f);
    assert.equal(expected.error, null);
    const dbg = new JavaDebugger(readFileSync(join(ROOT, f), 'utf8'), { maxSteps: 2_000_000, stdin: stdinOf(f) });
    assert.deepEqual(stateChanges(dbg.trace), expected.changes);
  });
}
