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

test('ADR-007 例：ArrayList の表示・remove の 2 つの意味・Integer の ==', async () => {
  const { javaValueModel: m } = await import('../src/lang/java.js');
  const src = 'import java.util.ArrayList;\n\npublic class Main {\n    public static void main(String[] args) {\n        ArrayList<Integer> scores = new ArrayList<>();\n        scores.add(70);\n        scores.add(85);\n        scores.add(1, 90);\n        System.out.println(scores);\n        scores.remove(0);\n        scores.remove(Integer.valueOf(85));\n        System.out.println(scores);\n        Integer a = 1000, b = 1000;\n        System.out.println((a == b) + " " + a.equals(b));\n    }\n}\n';
  const dbg = new JavaDebugger(src);
  assert.deepEqual(joinConsoleLines(dbg.consoleLogs).map(l => l.text), ['[70, 90, 85]', '[90]', 'false true']);
  const list = dbg.trace.find(e => e.phase === 'exit' && e.nodeType === 'ExpressionStatement' && e.loc.line === 8).frameEnvs.at(-1).scores;
  assert.equal(m.label(list), 'ArrayList<Integer>(3)');
  assert.deepEqual(m.brackets(list), ['[', ']']);
});

test('ADR-008 例：enum の表示・switch 式・インターフェースの new はコンパイルエラー', async () => {
  const { javaValueModel: m } = await import('../src/lang/java.js');
  const src = 'public class Main {\n    enum Color { RED, GREEN, BLUE }\n\n    public static void main(String[] args) {\n        Color c = Color.GREEN;\n        System.out.println(c + " " + c.ordinal());\n        String s = switch (c) { case RED -> "赤"; case GREEN -> "緑"; case BLUE -> "青"; };\n        System.out.println(s);\n    }\n}\n';
  const dbg = new JavaDebugger(src);
  assert.deepEqual(joinConsoleLines(dbg.consoleLogs).map(l => l.text), ['GREEN 1', '緑']);
  const c = dbg.trace.filter(e => e.phase === 'exit' && e.nodeType === 'VariableDeclaration').at(-1).frameEnvs.at(-1).c;
  assert.equal(m.literal(c), 'Color.GREEN');
  const e = compileError(main('        Shape s = new Shape();', 'interface Shape {\n    double area();\n}\n'));
  assert.equal(e.javac, 'Shape is abstract; cannot be instantiated');
});

test('ADR-009 例：HashMap の順序と表示・null を int に取り出す・繰り返しの途中で変える・マップを拡張 for で回す', async () => {
  const { javaValueModel: m } = await import('../src/lang/java.js');
  const src = [
    'import java.util.*;',
    '',
    'public class Main {',
    '    public static void main(String[] args) {',
    '        Map<String, Integer> count = new HashMap<>();',
    '        for (String w : "the cat sat on the mat".split(" ")) {',
    '            count.put(w, count.getOrDefault(w, 0) + 1);',
    '        }',
    '        System.out.println(count);',
    '        Set<String> seen = new HashSet<>(count.keySet());',
    '        System.out.println(seen);',
    '        int n = count.get("dog");',
    '    }',
    '}',
    '',
  ].join('\n');
  const err = compileError(src);   // 実行時エラーで止まる（途中までのトレースを持つ）
  // 本物の Java と同じ順序（ハッシュ表の並び。入れた順ではない）
  assert.deepEqual(joinConsoleLines(err.partialConsoleLogs).map(l => l.text), ['{the=2, mat=1, cat=1, sat=1, on=1}', '[the, mat, cat, sat, on]']);
  // 本物と同じ文面の NullPointerException（日本語の説明では、何が null だったかを書く）
  assert.match(err.message, /Cannot invoke "java\.lang\.Integer\.intValue\(\)" because the return value of "java\.util\.Map\.get\(Object\)" is null/);
  assert.match(err.message, /int の値を取り出せません/);
  // 画面では、マップは辞書（"the": 2）、集合はリストと同じかっこで見せる
  const env = err.partialTrace.filter(e => e.phase === 'exit' && e.nodeType === 'VariableDeclaration' && e.loc.line === 10).at(-1).frameEnvs.at(-1);
  assert.equal(m.kind(env.count), 'mapping');
  assert.equal(m.label(env.count), 'HashMap<String, Integer>(5)');
  assert.deepEqual(m.entries(env.count).map(([k, v]) => `${k}: ${m.literal(v)}`), ['"the": 2', '"mat": 1', '"cat": 1', '"sat": 1', '"on": 1']);
  assert.equal(m.label(env.seen), 'HashSet<String>(5)');
  assert.deepEqual(m.brackets(env.seen), ['[', ']']);

  // 繰り返しの途中で集合から除くと ConcurrentModificationException
  const cme = compileError([
    'import java.util.*;', '', 'public class Main {', '    public static void main(String[] args) {',
    '        Set<String> names = new HashSet<>(List.of("Alice", "Bob", "Carol"));',
    '        for (String n : names) {', '            if (n.startsWith("A")) {', '                names.remove(n);', '            }', '        }',
    '    }', '}', '',
  ].join('\n'));
  assert.match(cme.message, /java\.util\.ConcurrentModificationException/);
  // マップをそのまま拡張 for で回すのはコンパイルエラー
  const e = compileError('import java.util.*;\n' + main('        Map<String, Integer> m = new HashMap<>();\n        for (String k : m) System.out.println(k);'));
  assert.equal(e.javac, 'for-each not applicable to expression type');
});

test('ADR-010 例：ラムダ式の呼び出しと「人」のステップ・外側の変数の入れ直し・var', () => {
  const src = [
    'import java.util.*;',
    'import java.util.function.*;',
    '',
    'public class Main {',
    '    public static void main(String[] args) {',
    '        List<Integer> xs = new ArrayList<>(List.of(3, 1, 2));',
    '        xs.sort((a, b) -> a - b);',
    '        xs.forEach(x -> System.out.println(x * 10));',
    '        Function<Integer, Integer> square = x -> x * x;',
    '        int s = square.apply(5);',
    '        System.out.println(xs + " " + s);',
    '    }',
    '}',
    '',
  ].join('\n');
  const dbg = new JavaDebugger(src);
  assert.deepEqual(joinConsoleLines(dbg.consoleLogs).map(l => l.text), ['10', '20', '30', '[1, 2, 3] 25']);
  // 「人」のステップ：forEach の各回で、ラムダ式の呼び出し（8 行目）→ 本体（lambda のフレーム）→ 戻り、に止まる
  const stops = [];
  while (!dbg.humanStep().done) {
    const e = dbg.getCurrentEvent();
    stops.push(`${e.loc.line}:${e.callStack.at(-1).name}`);
  }
  const forEachStops = stops.filter(x => x.startsWith('8:'));
  assert.deepEqual(forEachStops, Array(3).fill(['8:main', '8:lambda', '8:main']).flat());
  // コールスタックのビューで、ラムダ式の値は ƒ x -> x * x と見せる
  const sq = dbg.trace.filter(e => e.phase === 'exit' && e.nodeType === 'VariableDeclaration' && e.loc.line === 9).at(-1).frameEnvs.at(-1).square;
  assert.equal(javaValueModel.kind(sq), 'function');
  assert.equal(sq.name, 'x -> x * x');

  // 外側の変数をラムダ式の中で入れ直す・入れ直した変数を使うのはコンパイルエラー
  const e1 = compileError('import java.util.*;\n' + main('        int sum = 0;\n        List<Integer> xs = List.of(1, 2);\n        xs.forEach(x -> sum += x);'));
  assert.equal(e1.javac, 'local variables referenced from a lambda expression must be final or effectively final');
  const e2 = compileError('import java.util.function.*;\n' + main('        var f = (Integer x) -> x;'));
  assert.equal(e2.javac, 'cannot infer type for local variable f');
});

test('ADR-011 例：ストリームは要素ごとに filter → map → forEach と進む・Optional の表示・count は long', () => {
  const src = [
    'import java.util.*;',
    'import java.util.stream.*;',
    '',
    'public class Main {',
    '    public static void main(String[] args) {',
    '        List<String> words = List.of("banana", "kiwi", "fig");',
    '        words.stream()',
    '            .filter(w -> w.length() > 3)',
    '            .map(w -> w.toUpperCase())',
    '            .forEach(w -> System.out.println(w));',
    '        Optional<String> first = words.stream().filter(w -> w.startsWith("k")).findFirst();',
    '        System.out.println(first + " " + words.stream().count());',
    '    }',
    '}',
    '',
  ].join('\n');
  const dbg = new JavaDebugger(src);
  assert.deepEqual(joinConsoleLines(dbg.consoleLogs).map(l => l.text), ['BANANA', 'KIWI', 'Optional[kiwi] 3']);
  // 「人」のステップでラムダ式に入る行の順：banana は 8→9→10、kiwi も 8→9→10、fig は 8 だけ（filter で落ちる）
  const lines = [];
  while (!dbg.humanStep().done) {
    const e = dbg.getCurrentEvent();
    if (e.callStack.at(-1).name === 'lambda' && e.loc.line <= 10) lines.push(e.loc.line);
  }
  assert.deepEqual(lines, [8, 9, 10, 8, 9, 10, 8]);
  // Optional は Optional[kiwi] の形で見せる
  const first = dbg.trace.filter(e => e.phase === 'exit' && e.nodeType === 'VariableDeclaration' && e.loc.line === 11).at(-1).frameEnvs.at(-1).first;
  assert.deepEqual(javaValueModel.brackets(first), ['Optional[', ']']);
  // count() は long なので、int に入れるとコンパイルエラー
  const e = compileError('import java.util.*;\n' + main('        List<Integer> xs = List.of(1, 2);\n        int c = xs.stream().count();'));
  assert.equal(e.javac, 'incompatible types: possible lossy conversion from long to int');
});
