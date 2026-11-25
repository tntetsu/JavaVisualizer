/**
 * parse.test.js — Lezer の木 → AST の変換と、構文エラーの説明（ADR-003・ADR-004）
 *
 * 構文エラーの javac の文面と行は oracle.test.js（tests/compile-errors）で本物と比べる。ここでは日本語の説明と、
 * ESTree の名前の AST になっていることを確かめる。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse } from '../src/engine/parse.js';

const wrap = (body) => `public class Main {\n    public static void main(String[] args) {\n${body}\n    }\n}\n`;
const syntaxError = (src) => {
  try { parse(src); } catch (e) { return e; }
  return null;
};

test('入門の構文が ESTree の名前の AST になる', () => {
  const ast = parse(wrap('        int x = 1;\n        for (int i = 0; i < 3; i++) { x += i; }\n        int[] a = {1, 2};\n        for (int v : a) x++;\n        System.out.println(x > 2 ? "big" : "small");'));
  const main = ast.body[0].body.body[0];
  assert.equal(main.type, 'MethodDefinition');
  assert.equal(main.value.type, 'FunctionExpression');
  assert.deepEqual(main.value.body.body.map(s => s.type),
    ['VariableDeclaration', 'ForStatement', 'VariableDeclaration', 'ForOfStatement', 'ExpressionStatement']);
  assert.equal(main.value.body.body[0].varType, 'int');
  assert.equal(main.value.body.body[2].declarations[0].init.type, 'ArrayExpression');
  const call = main.value.body.body[4].expression;
  assert.equal(call.type, 'CallExpression');
  assert.equal(call.callee.type, 'MemberExpression');
  assert.equal(call.arguments[0].type, 'ConditionalExpression');
});

test('文には end を付けず、式にだけ付ける（PyVisualizer の ADR-008）', () => {
  const ast = parse(wrap('        int x = 1 + 2;'));
  const decl = ast.body[0].body.body[0].value.body.body[0];
  assert.equal(decl.end, null);
  assert.deepEqual(decl.declarations[0].init.end, { line: 3, column: 21 });
});

test('-2147483648 は 1 つのリテラル（int の範囲に入る）', () => {
  const ast = parse(wrap('        int m = -2147483648;'));
  const init = ast.body[0].body.body[0].value.body.body[0].declarations[0].init;
  assert.equal(init.type, 'Literal');
  assert.equal(init.value, '-2147483648');
});

const SYNTAX = [
  ['        int x = 3\n        x++;', 3, '文の終わりに「;」がありません'],
  ['        System.out.println("abc);', 3, '文字列の「"」が閉じていません'],
  ['        System.out.println((1 + 2);', 3, '「)」が足りません'],
  ['        if (true) {\n            int x = 1;', 6, '「}」が足りません'],
  ['        int x = 1;\n    }\n    }', 6, '「}」が多すぎます'],
  ['        int x = 1;\n        if x > 1 { }', 4, 'if の条件は「(」と「)」で囲みます'],
  ['        else { }', 3, '対応する if のない else があります'],
  ["        char c = 'ab';", 3, '文字（char）は'],
  ['        int x == 3;', 3, '「==」ではなく「=」'],
  ['        for i in range(3):\n            print(i)', 3, 'for の書き方が正しくありません'],
];

for (const [body, line, text] of SYNTAX) {
  test(`構文エラーの説明：${text}`, () => {
    const e = syntaxError(wrap(body));
    assert.ok(e, '構文エラーにならない');
    assert.equal(e.line, line);
    assert.match(e.message, new RegExp(`^構文エラー（${line}行目）: .*${text.replace(/[()[\]]/g, '\\$&')}`));
    assert.ok(e.javac, 'javac の文面がない');
  });
}

const UNSUPPORTED = [
  ['        Runnable r = () -> {};', 'ラムダ式'],
  ['        int k = switch (1) { default -> 0; };', 'switch 式'],
  ['        float f = 1;', null],   // float は検査（check.js）で「まだ対応していません」
];

for (const [body, what] of UNSUPPORTED.filter(([, w]) => w)) {
  test(`まだ対応していない構文は、そう分かるメッセージにする：${what}`, () => {
    const e = syntaxError(wrap(body));
    assert.ok(e);
    assert.match(e.message, new RegExp(`${what} はまだ対応していません`));
  });
}

test('interface・enum・record は「まだ対応していません」', () => {
  for (const [src, what] of [['interface A {}', 'インターフェース'], ['enum C { R }', '列挙型（enum）'], ['record P(int x) {}', 'レコード（record）']]) {
    const e = syntaxError(src);
    assert.match(e.message, new RegExp(`${what.replace(/[()]/g, '\\$&')} はまだ対応していません`));
  }
});
