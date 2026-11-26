/**
 * precedence.test.js — 演算子の優先順位と結合の向きを、本物の Java と大量の式で比べる
 *
 * @lezer/cpp で、*p = *q が *(p = *q) と読まれるなど、Lezer の文法の式の木が当てにならない例が見つかった（CppVisualizer）。
 * @lezer/java（と parse.js の変換）が同じ誤りをしていないことを、次の方法で確かめる：
 * 1. 乱数で式の木を作り、Java の優先順位の表で「要るかっこだけ」を付けて文字列にする（かっこの少ない、紛らわしい式になる）
 * 2. その式を println する Java のプログラムを、本物の Java とこちらで実行し、結果を比べる
 * 優先順位や結合の向きを誤って読むと、計算結果が変わる（または、本物ではコンパイルできるのに、こちらでは型の誤りになる）。
 * 表そのものが誤っていると、本物の Java がコンパイルエラーになる（それも検出する）。
 * 本物の Java が必要（1 回の起動で全部の式を実行する）。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runReal, runOurs } from './tools/java-oracle.js';

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
}
const rand = rng(20261126);
const pick = (xs) => xs[Math.floor(rand() * xs.length)];

// Java の優先順位（大きいほど強く結び付く）。二項演算子は左結合、条件演算子と代入は右結合
const BIN = {
  '*': 13, '/': 13, '%': 13, '+': 12, '-': 12, '<<': 11, '>>': 11, '>>>': 11,
  '<': 10, '<=': 10, '>': 10, '>=': 10, '==': 9, '!=': 9, '&': 8, '^': 7, '|': 6, '&&': 5, '||': 4,
};
const UNARY = 14, COND = 3, ASSIGN = 2, ATOM = 16;

/** 子 c を、強さ p の場所に置くときの文字列（足りなければかっこを付ける） */
const wrap = (c, need) => (c.prec < need ? `(${c.s})` : c.s);

const INT_VARS = ['a', 'b', 'c', 'd', 'e'];
const BOOL_VARS = ['p', 'q'];

/** int（か long）の式。{ s: 文字列, prec: いちばん外の演算子の強さ } */
function intExpr(depth, allowLong = true) {
  const r = rand();
  if (depth <= 0 || r < 0.15) {
    return rand() < 0.7 ? { s: pick(INT_VARS), prec: ATOM } : { s: String(Math.floor(rand() * 9) + 1), prec: ATOM };
  }
  if (r < 0.27) {
    const op = pick(['-', '~', '+']);
    const x = intExpr(depth - 1, allowLong);
    return { s: `${op} ${wrap(x, UNARY)}`, prec: UNARY };   // 「- -a」が「--a」にならないよう空白を入れる
  }
  if (r < 0.33) {
    const x = intExpr(depth - 1, allowLong);
    return { s: `(${allowLong ? pick(['int', 'long']) : 'int'}) ${wrap(x, UNARY)}`, prec: UNARY };
  }
  if (r < 0.42) {
    const t = boolExpr(depth - 1), x = intExpr(depth - 1, allowLong), y = intExpr(depth - 1, allowLong);
    // 条件演算子：条件は || より強いもの、2 つ目は何でも、3 つ目は条件演算子まで（右結合）
    return { s: `${wrap(t, COND + 1)} ? ${x.s} : ${wrap(y, COND)}`, prec: COND };
  }
  const op = pick(['*', '/', '%', '+', '-', '<<', '>>', '>>>', '&', '^', '|']);
  const p = BIN[op];
  const x = intExpr(depth - 1, allowLong), y = intExpr(depth - 1, allowLong);
  return { s: `${wrap(x, p)} ${op} ${wrap(y, p + 1)}`, prec: p };
}

/** boolean の式 */
function boolExpr(depth) {
  const r = rand();
  if (depth <= 0 || r < 0.12) return { s: pick(BOOL_VARS), prec: ATOM };
  if (r < 0.2) { const x = boolExpr(depth - 1); return { s: `!${wrap(x, UNARY)}`, prec: UNARY }; }
  if (r < 0.55) {
    const op = pick(['<', '<=', '>', '>=', '==', '!=']);
    const x = intExpr(depth - 1), y = intExpr(depth - 1);
    return { s: `${wrap(x, BIN[op])} ${op} ${wrap(y, BIN[op] + 1)}`, prec: BIN[op] };
  }
  if (r < 0.62) {
    const t = boolExpr(depth - 1), x = boolExpr(depth - 1), y = boolExpr(depth - 1);
    return { s: `${wrap(t, COND + 1)} ? ${x.s} : ${wrap(y, COND)}`, prec: COND };
  }
  const op = pick(['&&', '||', '&', '^', '|', '==', '!=']);
  const p = BIN[op];
  const x = boolExpr(depth - 1), y = boolExpr(depth - 1);
  return { s: `${wrap(x, p)} ${op} ${wrap(y, p + 1)}`, prec: p };
}

/** 代入を含む文（右結合の代入・複合代入・条件演算子の 2 つ目の代入） */
function assignStmt() {
  const v = pick(INT_VARS), w = pick(INT_VARS.filter(x => x !== v));
  const x = intExpr(2, false);   // int の変数に入れるので long にしない
  switch (Math.floor(rand() * 4)) {
    case 0: return `${v} = ${w} = ${x.s};`;
    case 1: return `${v} ${pick(['+=', '-=', '*=', '^=', '|=', '&='])} ${w} ${pick(['+=', '-=', '^='])} ${wrap(x, ASSIGN)};`;
    case 2: { const t = boolExpr(1); return `${v} = ${wrap(t, COND + 1)} ? ${w} = ${x.s} : ${pick(INT_VARS)};`; }
    default: return `${v} = ${w}++ + -${pick(INT_VARS)} - --${pick(INT_VARS)};`;
  }
}

const N_INT = 600, N_BOOL = 400, N_ASSIGN = 150;
const exprs = [
  ...Array.from({ length: N_INT }, () => `System.out.println(${intExpr(4).s});`),
  ...Array.from({ length: N_BOOL }, () => `System.out.println(${boolExpr(4).s});`),
  ...Array.from({ length: N_ASSIGN }, () => `${assignStmt()} System.out.println(a + " " + b + " " + c + " " + d + " " + e);`),
];

// 1 つのメソッドが大きくなりすぎない（64KB の上限）よう、50 個ずつのメソッドに分ける。0 で割ったら EX と書く
const methods = [];
for (let i = 0; i < exprs.length; i += 50) {
  methods.push(`    static void m${i / 50}() {\n${exprs.slice(i, i + 50).map(s => `        try { ${s} } catch (ArithmeticException ex) { System.out.println("EX"); }`).join('\n')}\n    }`);
}
const src = `public class Main {
    static int a = 7, b = -3, c = 12, d = 5, e = -8;
    static boolean p = true, q = false;
${methods.join('\n')}
    public static void main(String[] args) {
${methods.map((_, i) => `        m${i}();`).join('\n')}
    }
}
`;

test(`演算子の優先順位と結合の向き：乱数で作った ${exprs.length} 個の式の結果が本物の Java と一致する`, async () => {
  const file = join(mkdtempSync(join(tmpdir(), 'javavisualizer-prec-')), 'Main.java');
  writeFileSync(file, src);
  const real = await runReal(file, { timeout: 60000 });
  assert.equal(real.compileError, null, `本物の Java でコンパイルエラー（優先順位の表の誤り）：${JSON.stringify(real.compileError)}`);
  const ours = runOurs(src);
  assert.equal(ours.compileError, null, `こちらでコンパイルエラー：${ours.compileError?.ja}`);
  const r = real.stdout.split('\n'), o = ours.stdout.split('\n');
  const lines = exprs;
  for (let i = 0; i < r.length; i++) {
    if (r[i] !== o[i]) assert.fail(`${i + 1} 個目の式で違う：${lines[i] ?? ''}\n  本物: ${r[i]}\n  こちら: ${o[i]}`);
  }
  assert.equal(o.length, r.length);
});
