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

test('ADR-002 例 5：コールスタック・メモリのビューで、変数名の前に宣言の型が出る（int a・double b・String s・int[] x）', async () => {
  const { createJavaProfile } = await import('../src/lang/java.js');
  const profile = createJavaProfile({});
  const dbg = new JavaDebugger(main('        int a = 1;\n        double b = 2;\n        String s = "x";\n        int[] x = {1};\n        x[0] = 2;'));
  const ev = dbg.trace.filter(e => e.phase === 'exit' && e.nodeType === 'AssignmentExpression').at(-1);
  const frame = ev.callStack.at(-1);
  assert.deepEqual(['args', 'a', 'b', 's', 'x'].map(n => profile.varType(n, frame, ev.callStack)), ['String[]', 'int', 'double', 'String', 'int[]']);
});

test('ADR-002 例 6：メモリのビューで、String はヒープの箱。同じリテラルは同じ箱、new String は別の箱', async () => {
  const { javaValueModel: m } = await import('../src/lang/java.js');
  const dbg = new JavaDebugger(main('        String s1 = "hello";\n        String s2 = "hello";\n        String s3 = new String("hello");\n        int n = 0;'));
  const vars = dbg.trace.filter(e => e.phase === 'exit' && e.nodeType === 'VariableDeclaration').at(-1).frameEnvs.at(-1);
  assert.ok(m.onHeap(vars.s1));
  assert.equal(vars.s1, vars.s2);
  assert.notEqual(vars.s1, vars.s3);
  assert.equal(m.label(vars.s1), 'String');
  assert.equal(m.literal(vars.s3), '"hello"');
});

test('ADR-005 例 1：nextInt のあとの nextLine は行の残り（空）を返す', () => {
  const src = 'import java.util.Scanner;\n\npublic class Main {\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        int n = sc.nextInt();\n        String rest = sc.nextLine();\n        String line = sc.nextLine();\n        System.out.println(n + "[" + rest + "][" + line + "]");\n    }\n}\n';
  const dbg = new JavaDebugger(src, { stdin: '12\nhello\n' });
  assert.deepEqual(joinConsoleLines(dbg.consoleLogs).map(l => l.text), ['12[][hello]']);
});

test('ADR-005 例 2：数として読めない入力・入力の終わり・import の忘れ', () => {
  const read = (body, stdin, imp = 'import java.util.Scanner;\n') => {
    try { new JavaDebugger(`${imp}public class Main {\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n${body}\n    }\n}\n`, { stdin }); return null; } catch (e) { return e; }
  };
  assert.match(read('        int a = sc.nextInt();', 'five').message, /入力欄の値を、読もうとした型（int など）として読めませんでした。java\.util\.InputMismatchException$/);
  assert.match(read('        String a = sc.nextLine();', '').message, /入力欄に、読む値（行）がもうありません。java\.util\.NoSuchElementException: No line found$/);
  const e = read('', '', '');
  assert.equal(e.name, 'CompileError');
  assert.equal(e.javac, 'cannot find symbol');
});

test('ADR-004 例 4：if の片方だけで値を入れた変数を使うと、実行する前にコンパイルエラー（条件が真でも）', () => {
  const e = compileError(main('        int y;\n        boolean c = true;\n        if (c) {\n            y = 1;\n        }\n        System.out.println(y);'));
  assert.equal(e?.name, 'CompileError');
  assert.equal(e.line, 8);
  assert.equal(e.javac, 'variable y might not have been initialized');
  // else でも値を入れれば通る
  assert.equal(compileError(main('        int y;\n        if (true) {\n            y = 1;\n        } else {\n            y = 2;\n        }\n        System.out.println(y);')), null);
});

test('ADR-006 例 1：値の書き方（long に L を付けない・double は Double.toString・char・String のエスケープ・配列・オブジェクト）', async () => {
  const { javaValueModel: m } = await import('../src/lang/java.js');
  const dbg = new JavaDebugger(main('        long big = 10000000000L;\n        double d = 1e10;\n        char c = \'a\';\n        String s = "hi\\n";\n        int[] a = {1, 2, 3};\n        int z = 0;'));
  const v = dbg.trace.filter(e => e.phase === 'exit' && e.nodeType === 'VariableDeclaration').at(-1).frameEnvs.at(-1);
  assert.deepEqual([v.big, v.d, v.c, v.s].map(x => m.literal(x)), ['10000000000', '1.0E10', "'a'", '"hi\\n"']);
  assert.equal(m.label(v.a), 'int[3]');
  assert.deepEqual(m.brackets(v.a), ['{', '}']);
});

test('ADR-006 例 2：英語表示は javac・JVM と同じ文面', async () => {
  const { localizeJavaError } = await import('../src/lang/java.js');
  const en = (src) => { try { new JavaDebugger(src); } catch (e) { return [e.name, localizeJavaError(e.message, 'en')]; } return null; };
  assert.deepEqual(en(main('        System.out.println("start");\n        int x = 3.5;')),
    ['CompileError', 'Compile error (line 4): incompatible types: possible lossy conversion from double to int']);
  assert.deepEqual(en(main('        int x = 3\n        x++;')), ['SyntaxError', "Syntax error (line 3): ';' expected"]);
  assert.deepEqual(en(main('        int z = 0;\n        System.out.println(5 / z);')),
    ['ExecutionError', 'Exception in thread "main" java.lang.ArithmeticException: / by zero (line 4)']);
});

test('ADR-006 例 3：NullPointerException は何が null だったかを書く（日本語・英語）', async () => {
  const { localizeJavaError } = await import('../src/lang/java.js');
  const src = main('        Node n = new Node();\n        System.out.println(n.next.value);', 'class Node {\n    int value;\n    Node next;\n}\n');
  let e;
  try { new JavaDebugger(src); } catch (x) { e = x; }
  assert.equal(e.message, '実行時エラー（4行目）: 「n.next」が null（何も指していない）なので、フィールド value を読めません。java.lang.NullPointerException: Cannot read field "value" because "n.next" is null');
  assert.equal(localizeJavaError(e.message, 'en'), 'Exception in thread "main" java.lang.NullPointerException: Cannot read field "value" because "n.next" is null (line 4)');
});

test('ADR-006 例 4：入力欄の見出しは Scanner の文言', async () => {
  const { createJavaProfile } = await import('../src/lang/java.js');
  const p = createJavaProfile({});
  assert.equal(p.inputText.ja.label, '入力（Scanner で読みます。空白や改行で区切ります）');
  assert.ok(p.supportsInput);
});
