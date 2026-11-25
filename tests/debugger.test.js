/**
 * debugger.test.js — JavaDebugger と共通コア・画面（JSVisualizer の TraceBuilder）の組み合わせ（ADR-003）
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { TraceBuilder } from 'js-visualizer/src/core/trace-builder.js';
import { JavaDebugger } from '../src/engine/java-debugger.js';

const ROOT = new URL('..', import.meta.url).pathname;
const wrap = (body, extra = '') => `public class Main {\n    public static void main(String[] args) {\n${body}\n    }\n}\n${extra}`;

/** humanStep で止まる所（行:ノード型） */
const stops = (src) => {
  const dbg = new JavaDebugger(src);
  const out = [];
  while (!dbg.humanStep().done) {
    const e = dbg.getCurrentEvent();
    out.push(`L${e.loc.line}:${e.nodeType}`);
  }
  return { dbg, out };
};

test('C 形式の for は、宣言・条件・本体・更新で止まる', () => {
  const { out } = stops(wrap('        int s = 0;\n        for (int i = 0; i < 2; i++) {\n            s += i;\n        }'));
  assert.deepEqual(out, [
    'L3:VariableDeclaration',
    'L4:VariableDeclaration', 'L4:BinaryExpression', 'L5:AssignmentExpression', 'L4:UpdateExpression',
    'L4:BinaryExpression', 'L5:AssignmentExpression', 'L4:UpdateExpression', 'L4:BinaryExpression',
  ]);
});

test('拡張 for の各回で止まり、その時点でループ変数がその回の値になっている（LoopBinding）', () => {
  const { dbg, out } = stops(wrap('        int[] a = {5, 7};\n        int s = 0;\n        for (int v : a) {\n            s += v;\n        }'));
  assert.deepEqual(out, [
    'L3:VariableDeclaration', 'L4:VariableDeclaration',
    'L5:LoopBinding', 'L6:AssignmentExpression', 'L5:LoopBinding', 'L6:AssignmentExpression',
  ]);
  const bindings = dbg.trace.filter(e => e.phase === 'exit' && e.nodeType === 'LoopBinding');
  assert.deepEqual(bindings.map(e => [e.value, e.frameEnvs.at(-1).v]), [[5, 5], [7, 7]]);
});

test('catch で例外を捕まえた所で止まる（CatchBinding）', () => {
  const { out } = stops(wrap('        try {\n            int z = 1 / 0;\n        } catch (ArithmeticException e) {\n            System.out.println("caught");\n        }'));
  assert.deepEqual(out, ['L5:CatchBinding', 'L6:ExpressionStatement']);
});

test('switch は当てはまった case で止まる（CaseMatch）', () => {
  const { out } = stops(wrap('        int k = 2;\n        switch (k) {\n            case 1: k = 10; break;\n            case 2: k = 20; break;\n        }'));
  assert.deepEqual(out, ['L3:VariableDeclaration', 'L6:CaseMatch', 'L6:AssignmentExpression']);
});

test('new のコンストラクタも、メソッドの呼び出しと同じく入る・最初の文・出るで止まる', () => {
  const { out } = stops(wrap('        P p = new P(3);', 'class P {\n    int x;\n    P(int x) {\n        this.x = x;\n    }\n}\n'));
  assert.deepEqual(out, ['L3:NewExpression', 'L9:ExpressionStatement', 'L9:AssignmentExpression', 'L3:NewExpression', 'L3:VariableDeclaration']);
});

test('main はフレームとしてコールスタックに積まれ、static フィールドの初期化はその前', () => {
  const dbg = new JavaDebugger('public class Main {\n    static int n = 5;\n    public static void main(String[] args) {\n        n++;\n    }\n}\n');
  const field = dbg.trace.find(e => e.nodeType === 'FieldDeclaration' && e.phase === 'exit');
  assert.equal(field.callStack.length, 0);
  assert.equal(field.env.at(-1)['Main.n'], 5);
  const upd = dbg.trace.find(e => e.nodeType === 'UpdateExpression' && e.phase === 'exit');
  assert.deepEqual(upd.callStack.map(f => f.name), ['main']);
});

test('配列の要素の型の印は、スナップショットでも残る（クローンの hook）', () => {
  const dbg = new JavaDebugger(wrap('        double[] d = new double[2];'));
  const decl = dbg.trace.find(e => e.nodeType === 'VariableDeclaration' && e.phase === 'exit');
  assert.equal(decl.frameEnvs.at(-1).d.__jelem, 'double');
});

for (const f of readdirSync(join(ROOT, 'samples')).filter(x => x.endsWith('.java'))) {
  test(`TraceBuilder（画面）がトレースを読める：${f}`, () => {
    const src = readFileSync(join(ROOT, 'samples', f), 'utf8');
    const dbg = new JavaDebugger(src);
    const b = new TraceBuilder(dbg.trace, src, dbg.ast);
    assert.ok(b.buildHumanIndices().size > 0);
    assert.ok(dbg._getHumanIndices().size > 0);
    assert.ok(b.buildHeatmap().size > 0);
    b.buildCallTree();
    b.buildRecursionTree();
    b.buildLifetime();
    b.buildCFG();
  });
}

test('式の値は、その式を評価した時点の中身で記録される（共通コアの ADR-017。式評価のビューで配列が最後の状態にならない）', () => {
  const src = wrap('        int[] arr = {3, 1};\n        int tmp = arr[0];\n        arr[0] = arr[1];\n        arr[1] = tmp;');
  const dbg = new JavaDebugger(src);
  // 4 行目の arr[0] = arr[1] で評価した arr は、その時点の {3, 1}
  const ids = dbg.trace.filter(e => e.phase === 'exit' && e.nodeType === 'Identifier' && e.loc.line === 5);
  assert.deepEqual([...ids[0].value], [3, 1]);
  assert.equal(ids[0].value, ids[0].frameEnvs.at(-1).arr);
});

test('呼び出し先（f・obj.m）は呼び出しの最初の子として記録され、ユーザーのメソッドは JSFunction の印、組み込みは JS の関数（ADR-003 追記）', () => {
  const dbg = new JavaDebugger(wrap('        int r = twice(3);\n        System.out.println(r);', 'class X {}\n').replace('public class Main {\n', 'public class Main {\n    static int twice(int k) { return k * 2; }\n'));
  const calls = dbg.trace.map((e, i) => [e, i]).filter(([e]) => e.phase === 'enter' && e.nodeType === 'CallExpression');
  const calleeOf = (i) => dbg.trace[dbg.trace[i + 1].matchIdx];
  const user = calleeOf(calls[0][1]);
  assert.equal(user.nodeType, 'Identifier');
  assert.equal(user.value.__type__, 'JSFunction');
  assert.equal(user.value.name, 'twice');
  const println = calleeOf(calls[1][1]);
  assert.equal(println.nodeType, 'MemberExpression');
  assert.equal(typeof println.value, 'function');
});

test('制御フローのビュー（Java のプロファイル）：クラスの中のメソッドが描かれ、空のグローバルは出ない', async () => {
  const { setLanguage } = await import('js-visualizer/src/lang/index.js');
  const { createJavaProfile } = await import('../src/lang/java.js');
  setLanguage(createJavaProfile({}));
  const src = readFileSync(join(ROOT, 'samples', '05_bubble_sort.java'), 'utf8');
  const dbg = new JavaDebugger(src);
  const scopes = new TraceBuilder(dbg.trace, src, dbg.ast).buildCFG();
  assert.deepEqual(scopes.map(s => s.name), ['bubbleSort', 'main']);
});
