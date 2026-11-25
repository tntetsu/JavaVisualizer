/**
 * messages-en.test.js — エラーメッセージの英語の文面の漏れを見つける（PyVisualizer の ADR-010 と同じ方針）
 *
 * Java では、エラーを作る場所で日本語の説明と、英語表示で使う本物の Java（javac・JVM）の文面を対にして渡す。
 * エンジンのソースから、コンパイルエラー・構文エラーを作る呼び出しを集め、英語の文面の引数があることを確かめる。
 * 実行時の例外（JavaError）は、メッセージがもともと本物の Java と同じ英語なので対象外。
 * 文面が本物と一致することは oracle.test.js（tests/compile-errors）で確かめる。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ENGINE = new URL('../src/engine/', import.meta.url).pathname;

/** 呼び出し式 name( … ) の引数を、括弧・文字列・テンプレート文字列を考えながら数える */
function argCounts(src, name) {
  const out = [];
  const re = new RegExp(`(?<![\\w.])${name}\\(`, 'g');
  for (const m of src.matchAll(re)) {
    let i = m.index + m[0].length, depth = 1, args = 0, nonEmpty = false;
    const line = src.slice(0, m.index).split('\n').length;
    while (i < src.length && depth > 0) {
      const c = src[i];
      if (c === '"' || c === "'" || c === '`') {
        const q = c; i++;
        while (i < src.length && src[i] !== q) {
          if (src[i] === '\\') i++;
          else if (q === '`' && src[i] === '$' && src[i + 1] === '{') {   // ${ … } の中の括弧を数える
            let d = 1; i += 2;
            while (i < src.length && d > 0) { if (src[i] === '{') d++; else if (src[i] === '}') d--; i++; }
            continue;
          }
          i++;
        }
        nonEmpty = true; i++; continue;
      }
      if ('([{'.includes(c)) depth++;
      else if (')]}'.includes(c)) depth--;
      else if (c === ',' && depth === 1) { args++; nonEmpty = false; i++; continue; }
      if (depth > 0 && !/\s/.test(c)) nonEmpty = true;
      i++;
    }
    out.push({ line, args: args + (nonEmpty ? 1 : 0) });
  }
  return out;
}

const files = readdirSync(ENGINE).filter(f => f.endsWith('.js'));
// [呼び出しの名前, 英語の文面が何番目の引数か]
const SITES = [['compileError', 3], ['err', 3], ['new JavaSyntaxError', 4], ['new JavaCompileError', 3]];

test('コンパイルエラー・構文エラーを作る呼び出しには、javac の英語の文面がある', () => {
  const missing = [];
  for (const f of files) {
    const src = readFileSync(join(ENGINE, f), 'utf8');
    for (const [name, need] of SITES) {
      for (const { line, args } of argCounts(src, name.replace('new ', 'new '))) {
        // 関数の定義そのもの（const compileError = (msg, loc, javac) => …）は数えない
        const text = src.split('\n')[line - 1];
        if (/=\s*\(.*\)\s*=>|constructor\(|function /.test(text)) continue;
        if (args < need) missing.push(`${f}:${line} ${text.trim().slice(0, 80)}`);
      }
    }
  }
  // Phase 0 で英語の文面がまだないもの（まだ対応していない構文の説明）。Phase 3 で英語を付ける
  const KNOWN = [/はまだ対応していません/];
  const real = missing.filter(m => !KNOWN.some(k => k.test(m)));
  assert.deepEqual(real, []);
});
