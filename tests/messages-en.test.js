/**
 * messages-en.test.js — エラーメッセージの英語の文面の漏れを見つける（PyVisualizer の ADR-010 と同じ方針）
 *
 * Java では、エラーを作る場所で日本語の説明と、英語表示で使う本物の Java（javac・JVM）の文面を対にして渡す。
 * エンジンのソースから、コンパイルエラー・構文エラーを作る呼び出しを集め、英語の文面の引数があることを確かめる。
 * 実行時の例外（JavaError）は、メッセージがもともと本物の Java と同じ英語なので対象外。
 * 文面が本物と一致することは oracle.test.js（tests/compile-errors）で確かめる。
 * あわせて、画面の英語表示（言語プロファイルの localizeError。ADR-006）に日本語が残らないことを、すべての誤りの題材で確かめる。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { whatToEnglish } from '../src/engine/messages-en.js';
import { JavaDebugger } from '../src/engine/java-debugger.js';
import { localizeJavaError } from '../src/lang/java.js';
import { localizeErrorMessage } from 'js-visualizer/src/utils/error-message.js';

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
      for (const { line, args } of argCounts(src, name)) {
        // 関数の定義そのもの（const compileError = (msg, loc, javac) => …）は数えない
        const text = src.split('\n')[line - 1];
        if (/=\s*\(.*\)\s*=>|constructor\(|function /.test(text)) continue;
        if (args < need) missing.push(`${f}:${line} ${text.trim().slice(0, 80)}`);
      }
    }
  }
  assert.deepEqual(missing, []);
});

test('「まだ対応していません」の構文の名前は、すべて英語の表にある', () => {
  const src = readFileSync(join(ENGINE, 'parse.js'), 'utf8');
  const names = [...src.matchAll(/unsupported\('([^']+)'/g)].map(m => m[1]);
  assert.ok(names.length > 20);
  const untranslated = names.filter(n => /[぀-ヿ一-鿿]/.test(whatToEnglish(n)));
  assert.deepEqual(untranslated, []);
  // 型「…」・文「…」・式「…」の形
  assert.equal(whatToEnglish('型「Foo<T>」'), 'type "Foo<T>"');
});

const ROOT = new URL('..', import.meta.url).pathname;
const JAPANESE = /[぀-ヿ一-鿿]/;
const englishOf = (src, stdin = '') => {
  try { new JavaDebugger(src, { stdin }); } catch (e) { return localizeJavaError(e.message, 'en'); }
  return null;
};

for (const f of readdirSync(join(ROOT, 'tests/compile-errors')).filter(x => x.endsWith('.java')).sort()) {
  test(`英語表示：${f} は javac と同じ文面で、日本語が残らない`, () => {
    const en = englishOf(readFileSync(join(ROOT, 'tests/compile-errors', f), 'utf8'));
    assert.ok(en, 'エラーにならない');
    assert.match(en, /^(Syntax|Compile) error \(line \d+\): /);
    assert.ok(!JAPANESE.test(en), en);
  });
}

for (const f of readdirSync(join(ROOT, 'tests/cases')).filter(x => x.startsWith('uncaught_') && x.endsWith('.java')).sort()) {
  test(`英語表示：${f} は JVM と同じ 1 行で、日本語が残らない`, () => {
    const stdinFile = join(ROOT, 'tests/cases', f.replace(/\.java$/, '.stdin'));
    const en = englishOf(readFileSync(join(ROOT, 'tests/cases', f), 'utf8'), existsSync(stdinFile) ? readFileSync(stdinFile, 'utf8') : '');
    assert.match(en, /^Exception in thread "main" [\w.]+(: .*)? \(line \d+\)$/);
    assert.ok(!JAPANESE.test(en), en);
  });
}

test('英語表示：日本語表示のときはそのまま、登録のないメッセージは JS 用の英語化に任せる', () => {
  const ja = 'コンパイルエラー（1行目）: x';
  assert.equal(localizeJavaError(ja, 'ja'), ja);
  assert.equal(localizeJavaError('実行が最大ステップ数 50,000 を超えたため停止しました', 'en'), localizeErrorMessage('実行が最大ステップ数 50,000 を超えたため停止しました', 'en'));
});
