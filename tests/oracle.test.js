/**
 * oracle.test.js — 本物の Java との比較テスト（出力・例外・コンパイルエラー）
 *
 * - tests/cases/*.java と samples/*.java：標準出力と、捕まえられなかった例外の 1 行が一致すること。
 *   同じ名前の .stdin があれば、入力（Scanner）として両方に渡す
 * - tests/compile-errors/*.java：最初のコンパイルエラーの行と、javac の文面（英語表示で使う）が一致すること
 *
 * 本物の Java は `java ファイル.java` で起動する（1 本 0.7 秒ほど。並列に起動する）。java が必要。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cpus } from 'node:os';
import { runReal, runOurs } from './tools/java-oracle.js';

const ROOT = new URL('..', import.meta.url).pathname;
const list = (dir) => readdirSync(join(ROOT, dir)).filter(f => f.endsWith('.java')).sort().map(f => join(dir, f));

/** 本物の Java の結果を、同時に cpu の数まで起動して集める */
async function realResults(files) {
  const out = new Map();
  const queue = [...files];
  const worker = async () => {
    while (queue.length) {
      const f = queue.shift();
      out.set(f, await runReal(join(ROOT, f), { stdin: stdinOf(f) }));
    }
  };
  await Promise.all(Array.from({ length: Math.min(cpus().length, 8) }, worker));
  return out;
}

/** 入力欄の内容：ファイルと同じ名前の .stdin（なければ空） */
const stdinOf = (f) => (existsSync(join(ROOT, f.replace(/\.java$/, '.stdin'))) ? readFileSync(join(ROOT, f.replace(/\.java$/, '.stdin')), 'utf8') : '');

const runFiles = [...list('tests/cases'), ...list('samples')];
const errorFiles = list('tests/compile-errors');
const real = await realResults([...runFiles, ...errorFiles]);

for (const f of runFiles) {
  test(`実行：${f}`, () => {
    const r = real.get(f);
    const o = runOurs(readFileSync(join(ROOT, f), 'utf8'), stdinOf(f));
    assert.equal(r.compileError, null, `本物の Java でコンパイルエラー: ${JSON.stringify(r.compileError)}`);
    assert.equal(o.compileError, null, `コンパイルエラー: ${o.compileError?.ja}`);
    assert.equal(o.stdout, r.stdout);
    assert.equal(o.exception, r.exception);
  });
}

for (const f of errorFiles) {
  test(`コンパイルエラー：${f}`, () => {
    const r = real.get(f);
    const o = runOurs(readFileSync(join(ROOT, f), 'utf8'));
    assert.ok(r.compileError, '本物の Java がコンパイルエラーにならない');
    assert.ok(o.compileError, `コンパイルエラーにならない（出力: ${JSON.stringify(o.stdout)}、例外: ${o.exception}）`);
    assert.deepEqual({ line: o.compileError.line, message: o.compileError.message }, r.compileError);
  });
}
