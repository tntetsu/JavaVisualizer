/**
 * value-model.test.js — 本物の Java と比べられない所のテスト（カバレッジの計測で、テストが通っていないと分かった所）
 *
 * 1. 画面への値の見せ方（言語プロファイルの javaValueModel）：値の種類ごとに、ビューが使う kind・literal・label・shortLabel・
 *    brackets・entries・length の書き方を決めた形で確かめる（ADR-002・006・007・009・010・011）。画面の HTML そのものは
 *    scripts/capture-dom.mjs（npm run test:dom）で変更の前後を比べる
 * 2. 本物と値が違うことにしているもの：println(オブジェクト) のハッシュ値（Point@1b6d3586 の数）、Math.random() の列。
 *    値は比べられないので、形（本物と同じ書き方）と、何度実行しても同じになることを確かめる
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { joinConsoleLines } from 'js-interpreter/core';
import { JavaDebugger } from '../src/engine/java-debugger.js';
import { javaValueModel as m } from '../src/lang/java.js';

const output = (src) => joinConsoleLines(new JavaDebugger(src).consoleLogs).map(l => l.text);

/** プログラムを最後まで実行し、main の最後の文の時点の変数を返す */
function lastVars(body, extra = '') {
  const src = `import java.util.*;\nimport java.util.function.*;\nimport java.util.stream.*;\n\npublic class Main {\n${extra}\n    public static void main(String[] args) {\n${body}\n        int end = 0;\n    }\n}\n`;
  const dbg = new JavaDebugger(src);
  return dbg.trace.filter(e => e.phase === 'exit' && e.nodeType === 'VariableDeclaration').at(-1).frameEnvs.at(-1);
}

/** ビューが使う書き方をまとめる */
const view = (v) => ({
  kind: m.kind(v), label: m.label(v), shortLabel: m.shortLabel(v), brackets: m.brackets(v).join(''), length: m.length(v),
  entries: m.entries(v).map(([k, x]) => `${k}: ${['sequence', 'mapping', 'object'].includes(m.kind(x)) ? m.label(x) : m.literal(x)}`),
});

test('値の見せ方：スカラー（int・double・char・boolean・null・String・enum）', () => {
  const v = lastVars('        int i = 3;\n        double d = 3;\n        char c = \'a\';\n        boolean b = true;\n        String s = "hi";\n        String n = null;\n        Color col = Color.RED;',
    '    enum Color { RED, GREEN }');
  assert.deepEqual([v.i, v.d, v.c, v.b, v.s, v.n, v.col].map(x => [m.kind(x), m.literal(x)]),
    [['number', '3'], ['number', '3.0'], ['string', "'a'"], ['bool', 'true'], ['string', '"hi"'], ['none', 'null'], ['string', 'Color.RED']]);
  // String はメモリのビューでヒープの箱に置く（ADR-002 追記）。ほかのスカラーは置かない
  assert.deepEqual([v.s, v.i, v.c].map(x => m.onHeap(x)), [true, false, false]);
  assert.equal(m.label(v.s), 'String');
});

test('値の見せ方：配列・リスト・集合は、配列のビューで見せ、かっこで書き分ける（ADR-007・009）', () => {
  const v = lastVars([
    '        int[] a = {1, 2, 3};',
    '        int[][] g = new int[2][2];',
    '        ArrayList<Integer> l = new ArrayList<>(List.of(1, 2));',
    '        List<String> fixed = List.of("x");',
    '        Set<String> s = new HashSet<>(List.of("b", "a"));',
    '        Set<Integer> t = new TreeSet<>(List.of(2, 1));',
  ].join('\n'));
  assert.deepEqual(view(v.a), { kind: 'sequence', label: 'int[3]', shortLabel: 'int[]', brackets: '{}', length: 3, entries: ['0: 1', '1: 2', '2: 3'] });
  assert.deepEqual([m.label(v.g), m.label(v.g[0])], ['int[][2]', 'int[2]']);
  assert.deepEqual(view(v.l), { kind: 'sequence', label: 'ArrayList<Integer>(2)', shortLabel: 'ArrayList<Integer>', brackets: '[]', length: 2, entries: ['0: 1', '1: 2'] });
  assert.equal(m.label(v.fixed), 'List(1)');
  assert.deepEqual(view(v.s), { kind: 'sequence', label: 'HashSet<String>(2)', shortLabel: 'HashSet<String>', brackets: '[]', length: 2, entries: ['0: "a"', '1: "b"'] });
  assert.equal(m.label(v.t), 'TreeSet<Integer>(2)');
});

test('値の見せ方：マップは辞書、Map.Entry と Optional は中の値を持つ箱（ADR-009・011）', () => {
  const v = lastVars([
    '        Map<String, Integer> map = new HashMap<>();',
    '        map.put("a", 1);',
    '        Map<Color, List<Integer>> byColor = new TreeMap<>();',
    '        byColor.put(Color.RED, new ArrayList<>());',
    '        Map<Point, Integer> byPoint = new HashMap<>();',
    '        byPoint.put(new Point(), 1);',
    '        Map.Entry<String, Integer> e = Map.entry("k", 2);',
    '        Optional<String> some = Optional.empty();',
    '        some = List.of("x").stream().findFirst();',
    '        Optional<String> none = List.of("x").stream().filter(s -> s.isEmpty()).findFirst();',
    '        OptionalInt mx = IntStream.of(3, 1).max();',
  ].join('\n'), '    enum Color { RED }\n    static class Point { int x; }');
  assert.deepEqual(view(v.map), { kind: 'mapping', label: 'HashMap<String, Integer>(1)', shortLabel: 'HashMap<String, Integer>', brackets: '{}', length: 1, entries: ['"a": 1'] });
  // キーの書き方：enum は Color.RED、オブジェクトは中身を書かない（Point{…}）
  assert.deepEqual(view(v.byColor).entries, ['Color.RED: ArrayList<Integer>(0)']);
  assert.deepEqual(view(v.byPoint).entries, ['Point{…}: 1']);
  assert.deepEqual(view(v.e), { kind: 'object', label: 'Map.Entry', shortLabel: 'Map.Entry', brackets: 'Entry{}', length: 2, entries: ['key: "k"', 'value: 2'] });
  assert.deepEqual(view(v.some), { kind: 'object', label: 'Optional', shortLabel: 'Optional', brackets: 'Optional[]', length: 1, entries: ['value: "x"'] });
  assert.deepEqual([m.length(v.none), m.entries(v.none), m.emptyText(v.none)], [0, [], 'Optional.empty']);
  assert.deepEqual([m.label(v.mx), m.brackets(v.mx).join('')], ['OptionalInt', 'OptionalInt[]']);
});

test('値の見せ方：オブジェクト・ラムダ式・ストリーム・クラス（ADR-002・010・011）', () => {
  const v = lastVars([
    '        Point p = new Point();',
    '        Function<Integer, Integer> f = x -> x * 2;',
    '        BinaryOperator<Integer> add = Integer::sum;',
    '        Stream<String> st = Stream.of("a");',
    '        IntStream is = IntStream.range(0, 3);',
  ].join('\n'), '    static class Point { int x = 1; String name = "p"; }');
  assert.deepEqual(view(v.p), { kind: 'object', label: 'Point', shortLabel: 'Point', brackets: 'Point{}', length: 2, entries: ['x: 1', 'name: "p"'] });
  assert.deepEqual([m.kind(v.f), v.f.name, m.kind(v.add), v.add.name], ['function', 'x -> x * 2', 'function', 'Integer::sum']);
  assert.deepEqual([m.kind(v.st), m.literal(v.st), m.literal(v.is)], ['string', 'Stream', 'IntStream']);
  // 値のないもの（void のメソッドの戻り値）は void と書く
  assert.equal(m.literal(undefined), 'void');
  assert.equal(m.kind(undefined), 'undefined');
});

test('println(オブジェクト)：本物と同じ形（クラス名@16 進数・配列は [I@…）で、同じオブジェクトは同じ数、hashCode() と一致', () => {
  const out = output([
    'public class Main {',
    '    static class Inner { }',
    '    public static void main(String[] args) {',
    '        Point p = new Point();',
    '        Point q = new Point();',
    '        System.out.println(p);',
    '        System.out.println(p);',
    '        System.out.println(q);',
    '        System.out.println(Integer.toHexString(p.hashCode()));',
    '        System.out.println(new int[2]);',
    '        System.out.println(new int[2][2]);',
    '        System.out.println(new String[1]);',
    '        System.out.println(new double[1]);',
    '        System.out.println(new Inner());',
    '        System.out.println(p.equals(p) + " " + p.equals(q));',
    '    }',
    '}',
    'class Point { }',
    '',
  ].join('\n'));
  assert.match(out[0], /^Point@[0-9a-f]+$/);
  assert.equal(out[1], out[0]);
  assert.notEqual(out[2], out[0]);
  assert.equal(out[3], out[0].split('@')[1]);
  assert.match(out[4], /^\[I@[0-9a-f]+$/);
  assert.match(out[5], /^\[\[I@[0-9a-f]+$/);
  assert.match(out[6], /^\[Ljava\.lang\.String;@[0-9a-f]+$/);
  assert.match(out[7], /^\[D@[0-9a-f]+$/);
  assert.match(out[8], /^Main\$Inner@[0-9a-f]+$/);
  assert.equal(out[9], 'true false');
  // 何度実行しても同じ数（画面の表示が実行ごとに変わらない）
  assert.deepEqual(output(['public class Main {', '    public static void main(String[] args) {', '        System.out.println(new Object());', '    }', '}', ''].join('\n')),
    output(['public class Main {', '    public static void main(String[] args) {', '        System.out.println(new Object());', '    }', '}', ''].join('\n')));
});

test('Math.random()：0 以上 1 未満の double で、何度実行しても同じ列（本物とは違う値。ADR-002）', () => {
  const src = ['public class Main {', '    public static void main(String[] args) {', '        for (int i = 0; i < 5; i++) {',
    '            double r = Math.random();', '            System.out.println(r >= 0 && r < 1);', '            System.out.println(r);', '        }', '    }', '}', ''].join('\n');
  const a = output(src), b = output(src);
  assert.deepEqual(a, b);
  const values = a.filter((_, i) => i % 2 === 1);
  assert.ok(a.filter((_, i) => i % 2 === 0).every(x => x === 'true'));
  assert.equal(new Set(values).size, 5);   // 同じ値が続かない
});

test('main がないプログラムは、本物の java コマンドと同じ文面のエラー', () => {
  let e = null;
  try { new JavaDebugger('public class Main {\n    static void run() { }\n}\n'); } catch (x) { e = x; }
  assert.ok(e);
  assert.equal(e.javac, "error: can't find main(String[]) method in class: Main");
});
