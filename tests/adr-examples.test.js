/**
 * adr-examples.test.js — ADR の「利用者に見える例」をそのままテストにしたもの
 *
 * テスト名に ADR 番号を付ける。例は ADR の本文と同じプログラム・同じ結果にする。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { joinConsoleLines } from 'js-interpreter/core';
import { JavaDebugger } from '../src/engine/java-debugger.js';
import { javaValueModel } from '../src/lang/java.js';

const main = (body, extra = '') => `public class Main {\n    public static void main(String[] args) {\n${body}\n    }\n}\n${extra}`;
const output = (src) => joinConsoleLines(new JavaDebugger(src).consoleLogs).map(l => l.text);
const stops = (src) => {
  const dbg = new JavaDebugger(src);
  const out = [];
  while (!dbg.humanStep().done) {
    const e = dbg.getCurrentEvent();
    out.push({ line: e.loc.line, vars: e.frameEnvs.at(-1) ?? {} });
  }
  return out;
};
const compileError = (src) => {
  try { new JavaDebugger(src); } catch (e) { return e; }
  return null;
};

test('ADR-002 例 1：整数の割り算は切り捨て、int はあふれると負になる', () => {
  assert.deepEqual(output(main([
    '        int a = 7 / 2;',
    '        double b = 7 / 2.0;',
    '        int over = Integer.MAX_VALUE + 1;',
    '        System.out.println(a + " " + b + " " + over);',
  ].join('\n'))), ['3 3.5 -2147483648']);
});

test('ADR-002 例 2：変数のビューで、int の 3 と double の 3.0 は書き分けられる', () => {
  const s = stops(main('        int i = 3;\n        double d = 3;'));
  const vars = s.at(-1).vars;
  assert.equal(javaValueModel.literal(vars.i), '3');
  assert.equal(javaValueModel.literal(vars.d), '3.0');
});

test('ADR-002 例 3：文字列の == は同じオブジェクトかを比べる（リテラルは共有される）', () => {
  assert.deepEqual(output(main([
    '        String s1 = "hello";',
    '        String s2 = "hel" + "lo";',
    '        String part = "hel";',
    '        String s3 = part + "lo";',
    '        System.out.println((s1 == s2) + " " + (s1 == s3) + " " + s1.equals(s3));',
  ].join('\n'))), ['true false true']);
});

test('ADR-002 例 4：配列は参照。別の変数から変えると、元の変数からも変わって見える', () => {
  const s = stops(main('        int[] x = {1, 2, 3};\n        int[] y = x;\n        y[0] = 100;'));
  const last = s.at(-1).vars;
  assert.equal(last.x[0], 100);
  assert.equal(last.x, last.y);   // スナップショットでも同じ配列を指す
});

test('ADR-003 例 1：拡張 for は各回で止まり、その時点で v がその回の値になっている', () => {
  const s = stops(main('        int[] a = {5, 7};\n        int sum = 0;\n        for (int v : a) {\n            sum += v;\n        }'));
  assert.deepEqual(s.map(x => [x.line, x.vars.v ?? null, x.vars.sum ?? null]), [
    [3, null, null], [4, null, 0],
    [5, 5, 0], [6, 5, 5],
    [5, 7, 5], [6, 7, 12],
  ]);
});

test('ADR-003 例 2：catch で捕まえた所と、switch の当てはまった case で止まる', () => {
  const s1 = stops(main('        try {\n            int z = 1 / 0;\n        } catch (ArithmeticException e) {\n            System.out.println("caught");\n        }'));
  assert.deepEqual(s1.map(x => x.line), [5, 6]);
  const s2 = stops(main('        int k = 2;\n        switch (k) {\n            case 1: k = 10; break;\n            case 2: k = 20; break;\n        }'));
  assert.deepEqual(s2.map(x => x.line), [3, 6, 6]);
});

test('ADR-004 例 1：型の合わない代入は、実行する前にコンパイルエラーになる', () => {
  const e = compileError(main('        System.out.println("start");\n        int x = 3.5;'));
  assert.equal(e?.name, 'CompileError');
  assert.equal(e.line, 4);
  assert.match(e.message, /double の値を int の変数に入れると、値が失われるおそれがあります/);
  assert.equal(e.javac, 'incompatible types: possible lossy conversion from double to int');
});

test('ADR-004 例 2：実行されない場所の誤り（宣言していない変数）も見つける', () => {
  const e = compileError(main('        int x = 1;\n        if (x > 5) {\n            System.out.println(y);\n        }'));
  assert.equal(e?.name, 'CompileError');
  assert.equal(e.line, 5);
  assert.match(e.message, /「y」という変数は宣言されていません/);
});

test('ADR-004 例 3：if (x = 1) は、= と == の取り違えを知らせる', () => {
  const e = compileError(main('        int x = 1;\n        if (x = 1) { }'));
  assert.match(e.message, /「=」ではなく「==」を使います/);
  assert.equal(e.javac, 'incompatible types: int cannot be converted to boolean');
});
