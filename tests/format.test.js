/**
 * format.test.js — 小数の表示（Double.toString）と書式（printf・String.format の %f・%e）を、本物の Java と大量の値で比べる
 *
 * 値は、乱数のビット列・桁の少ない 10 進数・10 の累乗の境目・x.xx5 の形（丸めの境目）を混ぜる。
 * 本物の Java（tests/tools/FormatEcho.java）が必要。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { doubleToString, makeDouble } from '../src/engine/values.js';
import { javaFormat } from '../src/engine/builtins.js';

/** 再現できる乱数（xorshift） */
function rng(seed) {
  let s = seed >>> 0;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 2 ** 32; };
}

function values() {
  const r = rng(20261125);
  const vs = [0, -0, 1, -1, 0.1, 0.2, 0.3, 1 / 3, 2 / 3, 100, 1e7, 1e-3, 1e-4, 9999999.999999998, 5e-324, Number.MAX_VALUE,
    Infinity, -Infinity, NaN, 2.675, 1.005, 0.125, 0.375, 2.5, 1e21, 1e22, 1e23, 123456789.125];
  const buf = new DataView(new ArrayBuffer(8));
  for (let i = 0; i < 400; i++) {   // 乱数のビット列（有限の値だけ）
    buf.setUint32(0, Math.floor(r() * 2 ** 32)); buf.setUint32(4, Math.floor(r() * 2 ** 32));
    const v = buf.getFloat64(0);
    if (Number.isFinite(v)) vs.push(v);
  }
  for (let i = 0; i < 400; i++) {   // 桁の少ない 10 進数（よく使う大きさ）
    const digits = 1 + Math.floor(r() * 6);
    const exp = Math.floor(r() * 16) - 8;
    vs.push(Number(`${Math.floor(r() * 10 ** digits)}e${exp}`) * (r() < 0.3 ? -1 : 1));
  }
  for (let e = -6; e <= 9; e++) for (const m of [1, 9.999999, 1.0000001, 5]) vs.push(m * 10 ** e);   // 指数表記の境目
  for (let i = 0; i < 200; i++) vs.push(Math.floor(r() * 100000) / 1000 + 0.0005);                // 丸めの境目（x.xxx5）
  return vs;
}

const bits = (v) => {
  const buf = new DataView(new ArrayBuffer(8));
  buf.setFloat64(0, v);
  return buf.getBigUint64(0).toString(16);
};

const FORMATS = ['toString', '%f', '%.2f', '%.0f', '%.3f', '%10.4f', '%e', '%.3e', '%,.2f', '%+.1f'];

test('Double.toString・%f・%e が本物の Java と一致する', () => {
  const vs = values();
  const lines = [];
  for (const v of vs) for (const f of FORMATS) lines.push([f, v]);
  const input = lines.map(([f, v]) => `${f}\t${bits(v)}`).join('\n') + '\n';
  const out = execFileSync('java', ['tests/tools/FormatEcho.java'], { input, maxBuffer: 1 << 26 }).toString().split('\n');
  const ctx = { str: String };
  const diffs = [];
  lines.forEach(([f, v], i) => {
    const ours = f === 'toString' ? doubleToString(v) : javaFormat(f, [makeDouble(v)], ctx);
    if (ours !== out[i]) diffs.push(`${f} ${v}: java=${out[i]} ours=${ours}`);
  });
  assert.deepEqual(diffs.slice(0, 20), [], `${diffs.length} 件の違い（全 ${lines.length} 件）`);
});
