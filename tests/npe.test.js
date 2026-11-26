/**
 * npe.test.js — NullPointerException の詳しいメッセージ（JEP 358）を本物の Java と比べる（ADR-006）
 *
 * 本物は、tests/tools/RunWithDebugInfo.java で -g（変数名の情報）付きでコンパイルして実行する（IDE で実行したときと同じ。
 * `java Main.java` は -g なしなので "<local1>" になる）。
 * switch（文字列）と拡張 for は、本物ではコンパイラが作った変数の名前（"<local7>"）になり再現できないので、
 * 実際の式の名前を書く（このテストの最後で、こちらの文面を確かめる）。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir, cpus } from 'node:os';
import { join } from 'node:path';
import { runOurs } from './tools/java-oracle.js';
import { runJava } from '../src/engine/java-debugger.js';

const ROOT = new URL('..', import.meta.url).pathname;
const program = (body) => `public class Main {
    static Node head;
    public static void main(String[] args) {
        Node n = new Node();
        String s = null;
        int[] a = null;
        int[][] grid = new int[2][];
        String[] names = new String[2];
        Node[] nodes = new Node[1];
        int i = 0;
${body}
    }
    static Node make() { return null; }
}
class Node {
    int value;
    Node next;
    String name;
    int[] data;
    Node getNext() { return next; }
    void move(int d, String why) { }
    int sum() { return data.length; }
    void link() { next.value = 1; }
}
`;

const CASES = {
  field_read: '        System.out.println(n.next.value);',
  field_write: '        n.next.value = 3;',
  field_compound: '        n.next.value += 3;',
  field_inc: '        n.next.value++;',
  invoke_string: '        System.out.println(s.length());',
  invoke_user: '        n.next.move(1, "x");',
  return_value: '        System.out.println(n.getNext().value);',
  static_return: '        System.out.println(make().value);',
  array_load: '        System.out.println(a[0]);',
  array_store: '        a[i] = 1;',
  array_compound: '        a[i] += 1;',
  array_length: '        System.out.println(a.length);',
  array_2d: '        System.out.println(grid[1][0]);',
  array_2d_store: '        grid[i][0] = 5;',
  object_array: '        System.out.println(names[1].length());',
  node_array: '        System.out.println(nodes[i].value);',
  static_field: '        System.out.println(head.value);',
  static_qualified: '        System.out.println(Main.head.value);',
  string_equals: '        System.out.println(s.equals("x"));',
  string_char_at: '        System.out.println(s.charAt(i));',
  string_substring: '        System.out.println(s.substring(1, 2));',
  string_index_of: '        System.out.println(s.indexOf(\'c\'));',
  throw_null: '        RuntimeException e = null;\n        throw e;',
  nested: '        System.out.println(n.next.next.value);',
  field_string: '        System.out.println(n.name.toUpperCase());',
  this_field: '        System.out.println(n.sum());',
  this_field_write: '        n.link();',
};

const dir = mkdtempSync(join(tmpdir(), 'npe-'));
const realOf = (name) => new Promise((resolve) => {
  const f = join(dir, `${name}.java`);
  writeFileSync(f, program(CASES[name]));
  execFile('java', [join(ROOT, 'tests/tools/RunWithDebugInfo.java'), f], { timeout: 60000 }, (err, stdout, stderr) => {
    resolve(stderr.match(/^Exception in thread "main" (.*)$/m)?.[1] ?? `<<${stderr.trim().split('\n')[0]}>>`);
  });
});

const real = new Map();
{
  const queue = Object.keys(CASES);
  await Promise.all(Array.from({ length: Math.min(cpus().length, 8) }, async () => {
    while (queue.length) { const k = queue.shift(); real.set(k, await realOf(k)); }
  }));
}

/** こちらの例外の 1 行（比較用の正規化をしない） */
function oursOf(body) {
  try {
    runJava(program(body));
  } catch (e) {
    return e;
  }
  return null;
}

for (const name of Object.keys(CASES)) {
  test(`NullPointerException の文面：${name}`, () => {
    const e = oursOf(CASES[name]);
    assert.ok(e, '例外にならない');
    assert.equal(e.cause?.javaException, real.get(name));
  });
}

test('switch（文字列）と拡張 for は、実際の式の名前を書く（本物はコンパイラが作った名前 "<local7>"）', () => {
  assert.equal(oursOf('        switch (s) {\n            case "a": break;\n        }').cause.javaException,
    'java.lang.NullPointerException: Cannot invoke "String.hashCode()" because "s" is null');
  assert.equal(oursOf('        for (int x : a) {\n        }').cause.javaException,
    'java.lang.NullPointerException: Cannot read the array length because "a" is null');
});

test('比較テスト（oracle）の正規化：NullPointerException はクラスだけを比べる', () => {
  assert.equal(runOurs(program(CASES.field_read)).exception, 'java.lang.NullPointerException');
});
