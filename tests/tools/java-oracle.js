/**
 * java-oracle.js — 本物の Java と JavaVisualizer のエンジンで同じプログラムを実行し、同じ形の結果にする（比較テスト用）
 *
 * 結果の形：{ stdout, exception, compileError }
 * - exception：捕まえられなかった例外の 1 行（java.lang.ArithmeticException: / by zero）。なければ null
 * - compileError：最初のコンパイルエラー { line, message }（message は javac の文面）。なければ null
 *
 * 本物の Java は `java ファイル.java`（JDK 11 以降の単一ファイルの実行）で動かす。入力（Scanner）は、どちらにも同じ文字列を渡す。
 */
import { execFile } from 'node:child_process';
import { joinConsoleLines } from 'js-interpreter/core';
import { runJava } from '../../src/engine/java-debugger.js';

/**
 * 例外の 1 行を比べられる形にする。NullPointerException の詳しいメッセージ（JEP 358）は、変数名の情報（-g）の
 * 有無で文面が変わる（<local1>）ので、クラスだけを比べる（表示の仕方は Phase 3 で決める）
 */
export function normalizeException(line) {
  if (line === null) return null;
  return line.startsWith('java.lang.NullPointerException') ? 'java.lang.NullPointerException' : line;
}

/** 本物の Java で実行する */
export function runReal(file, { timeout = 20000, stdin = '' } = {}) {
  return new Promise((resolve) => {
    const child = execFile('java', [file], { timeout, maxBuffer: 1 << 24 }, (error, stdout, stderr) => {
      let exception = null, compileError = null;
      const m = stderr.match(/^Exception in thread "main" (.*)$/m);
      if (m) exception = normalizeException(m[1]);
      const c = stderr.match(/^[^\n]*\.java:(\d+): error: (.*)$/m);
      if (c) compileError = { line: Number(c[1]), message: c[2] };
      if (error && !m && !c) exception = `<<java failed: ${stderr.trim().split('\n')[0]}>>`;
      resolve({ stdout, exception, compileError });
    });
    child.stdin.end(stdin);
  });
}

/** JavaVisualizer のエンジンで実行する */
export function runOurs(source, stdin = '') {
  const out = (logs) => joinConsoleLines(logs).map(l => l.text + '\n').join('');
  try {
    const { consoleLogs } = runJava(source, { maxSteps: 2_000_000, stdin });
    // 最後の行が改行で終わっていない出力（print）も、本物と同じく改行なしにする
    return { stdout: rawOutput(consoleLogs) ?? out(consoleLogs), exception: null, compileError: null };
  } catch (e) {
    if (e.name === 'SyntaxError' || e.name === 'CompileError') {
      return { stdout: '', exception: null, compileError: { line: e.line, message: e.javac ?? e.message, ja: e.message } };
    }
    return { stdout: rawOutput(e.partialConsoleLogs ?? []), exception: normalizeException(e.cause?.javaException ?? `<<${e.message}>>`), compileError: null };
  }
}

/** 出力の断片をそのままつなげる（改行の有無も含めて本物と比べるため） */
function rawOutput(logs) {
  return logs.map(l => (l.eol === undefined ? `${l.text}\n` : l.text + (l.eol ? '\n' : ''))).join('');
}
