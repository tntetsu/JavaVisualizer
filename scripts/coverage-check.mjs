/**
 * coverage-check.mjs — テストを流してカバレッジを測り、テストが通っていない行のうち、理由が書かれていないものを一覧にする
 *
 *   node scripts/coverage-check.mjs            全テスト（npm test と同じ）を流して調べる（npm run coverage:check）
 *   node scripts/coverage-check.mjs --lcov <lcov.info>   すでにある結果を使う（テストを流さない）
 *   node scripts/coverage-check.mjs --list     通っていない行をすべて（登録済みのものも）表示する
 *
 * 通っていない行は、次のどちらかにする（CLAUDE.md の「カバレッジの抜け」）：
 *   1. テストを足す：本物の Java と比べられるもの → tests/cases/ か tests/compile-errors/、比べられないもの → tests/*.test.js
 *   2. テストで届かない理由を tests/coverage-allowlist.json に書く（静的な検査が先に止める守りの行など）
 * 登録は「ファイル・行の中身（前後の空白を除く）・その中身の何番目か」で照らし合わせる。行番号はコードを直すとずれるため使わない。
 * 登録した行が通るようになった・消えたときは「古い登録」として表示する（登録から外す）。
 * 理由のない行があれば終了コード 1。古い登録は、表示するだけで失敗にはしない：Node のカバレッジは、テストのファイルごとの
 * プロセスの結果を合わせるときに、実際には通っていない行（守りの throw など）を通ったと数えることがある（2026-11-26、
 * テストのファイルを足しただけで interpreter.js の throw の行が「通った」になった。どのテストを単独で流しても 0 回）。
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const ROOT = resolve(new URL('..', import.meta.url).pathname);
const ALLOW = join(ROOT, 'tests/coverage-allowlist.json');
const arg = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : null; };

let lcovFile = arg('--lcov');
let tmp = null;   // 測った結果を置く一時ディレクトリ（最後に消す）
if (!lcovFile) {
  tmp = mkdtempSync(join(tmpdir(), 'javavisualizer-coverage-'));
  process.on('exit', () => rmSync(tmp, { recursive: true, force: true }));
  lcovFile = join(tmp, 'lcov.info');
  console.log('テストを流してカバレッジを測っています（2 分ほど）…');
  try {
    execFileSync('node', ['--test', '--experimental-test-coverage', '--test-coverage-include=src/**',
      '--test-reporter=dot', '--test-reporter-destination=stdout', '--test-reporter=lcov', `--test-reporter-destination=${lcovFile}`,
      'tests/**/*.test.js'], { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] });
  } catch {
    console.log('テストが失敗した（先に npm test で直す）');
    process.exit(1);
  }
}

// lcov：SF:ファイル、DA:行,回数、LF/LH：行の数・通った行の数、BRF/BRH：分岐の数・通った分岐の数
const uncovered = [];   // { file, line, code, nth }
let lf = 0, lh = 0, brf = 0, brh = 0;
let file = null, src = null;
const seen = new Map();   // file|code → これまでの数（同じ中身の行を区別する）
for (const l of readFileSync(lcovFile, 'utf8').split('\n')) {
  if (l.startsWith('SF:')) { file = l.slice(3); src = readFileSync(join(ROOT, file), 'utf8').split('\n'); continue; }
  if (l.startsWith('LF:')) lf += Number(l.slice(3));
  if (l.startsWith('LH:')) lh += Number(l.slice(3));
  if (l.startsWith('BRF:')) brf += Number(l.slice(4));
  if (l.startsWith('BRH:')) brh += Number(l.slice(4));
  const m = l.match(/^DA:(\d+),(\d+)/);
  if (!m || m[2] !== '0') continue;
  const code = src[Number(m[1]) - 1].trim();
  if (code === '' || code === '}' || code.startsWith('//') || code.startsWith('*')) continue;   // 中身のない行は数えない
  const key = `${file}|${code}`;
  const nth = seen.get(key) ?? 0;
  seen.set(key, nth + 1);
  uncovered.push({ file, line: Number(m[1]), code, nth });
}

/** @type {Record<string, {code: string, nth?: number, why: string}[]>} */
const allow = JSON.parse(readFileSync(ALLOW, 'utf8'));
const allowed = (u) => (allow[u.file] ?? []).find(a => a.code === u.code && (a.nth ?? 0) === u.nth);
const fresh = uncovered.filter(u => !allowed(u));
const stale = Object.entries(allow).flatMap(([f, list]) => list.filter(a => !uncovered.some(u => u.file === f && u.code === a.code && u.nth === (a.nth ?? 0))).map(a => ({ file: f, ...a })));

console.log(`カバレッジ：行 ${(100 * lh / lf).toFixed(1)}%（${lh}/${lf}）・分岐 ${(100 * brh / brf).toFixed(1)}%（${brh}/${brf}）`);
console.log(`通っていない行 ${uncovered.length} 行（理由を登録済み ${uncovered.length - fresh.length} 行）`);
if (process.argv.includes('--list')) {
  for (const u of uncovered) console.log(`  ${allowed(u) ? ' ' : '!'} ${u.file}:${u.line}  ${u.code.slice(0, 110)}${allowed(u) ? `  ← ${allowed(u).why}` : ''}`);
}
if (fresh.length) {
  console.log(`\nテストが通っていない、理由のない行 ${fresh.length} 行（テストを足すか、tests/coverage-allowlist.json に理由を書く）：`);
  for (const u of fresh) console.log(`  ${u.file}:${u.line}  ${u.code.slice(0, 120)}${u.nth ? `（同じ中身の ${u.nth + 1} 番目）` : ''}`);
}
if (stale.length) {
  console.log(`\n古い登録 ${stale.length} 件（今はテストが通っている・コードがない。tests/coverage-allowlist.json から外す。測り方のぶれのこともあるので、失敗にはしない）：`);
  for (const a of stale) console.log(`  ${a.file}  ${a.code.slice(0, 120)}`);
}
if (process.argv.includes('--write-template')) {
  // 理由のない行を、理由が空の登録として書き足す（理由は手で書く）
  for (const u of fresh) (allow[u.file] ??= []).push({ code: u.code, ...(u.nth ? { nth: u.nth } : {}), why: '' });
  writeFileSync(ALLOW, `${JSON.stringify(allow, null, 2)}\n`);
  console.log(`\n${fresh.length} 行を、理由が空の登録として書き足した（why を書く）`);
}
const empty = Object.values(allow).flat().filter(a => !a.why).length;
if (empty) console.log(`\n理由（why）が空の登録が ${empty} 件ある`);
process.exit(fresh.length || empty ? 1 : 0);
