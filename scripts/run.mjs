/**
 * run.mjs — Java のファイルを JavaVisualizer のエンジンで実行し、出力を表示する（確認用）
 *
 *   node scripts/run.mjs Main.java [入力のファイル]   # 入力のファイルは Scanner が読む（入力欄の内容）
 *
 * 標準出力にプログラムの出力、標準エラーに例外・エラーとトレースの長さを出す。
 * 例外で終わったときは、本物の Java と同じ 1 行（Exception in thread "main" …）を標準エラーに出す。
 */
import { runJava } from '../src/engine/java-debugger.js';
import { joinConsoleLines } from 'js-interpreter/core';
import { readFileSync } from 'node:fs';

const lines = (logs) => joinConsoleLines(logs).map(l => l.text);
const src = readFileSync(process.argv[2], 'utf8');
try {
  const { trace, consoleLogs } = runJava(src, { stdin: process.argv[3] ? readFileSync(process.argv[3], 'utf8') : '' });
  for (const l of lines(consoleLogs)) process.stdout.write(l + '\n');
  console.error(`[trace ${trace.length}]`);
} catch (e) {
  if (e.partialConsoleLogs) for (const l of lines(e.partialConsoleLogs)) process.stdout.write(l + '\n');
  if (e.cause?.javaException) console.error(`Exception in thread "main" ${e.cause.javaException}`);
  console.error(e.message);
  process.exitCode = 1;
}
