/**
 * capture-dom.mjs — Java 版の画面の表示を、変更の前と後で比べる（画面の回帰テスト）
 *
 * 比べる相手（既定は最後のコミット HEAD）を一時的な作業ツリー（git worktree）にビルドし、今の作業中のソースのビルドと並べて、
 * 全サンプル × ステップの位置（最初・「人」で 5 回・式で 3 回・「人」でさらに 15 回・最後）× 全タブの、
 * ビューの HTML・コード表示・ステップの表示・エラー表示・コンソールを比べる。
 *
 *   node scripts/capture-dom.mjs                         HEAD と、今の作業中のソースを比べる（npm run test:dom）
 *   node scripts/capture-dom.mjs --base <コミット・タグ>   比べる相手を変える（例：--base HEAD~3）
 *   node scripts/capture-dom.mjs --only 28_hash_map,32_lambdas   一部のサンプルだけ
 *   node scripts/capture-dom.mjs --perturb              今の側だけ文字の幅をわざと変える（正規化がレイアウトの違いを吸収できるかの確認用）
 *
 * 表示を意図して変えたときは、出てきた違いが意図どおりかを読んで確かめる（違いがあれば終了コード 1）。
 * 矢印・図の座標や幅（px）は、文字の幅で変わるので、比べる前に取り除く（normalize）。何が・どの順に・どんな文字・
 * どの class で表示されるかを比べ、どこに描かれるかは比べない。
 * 基準をファイルとして置かないのは、全サンプルで 35 MB ほどになり、表示を変えるたびに git の履歴が大きくなるため。
 * 全サンプルで 5 分ほどかかる。npm test には入れていない。
 */
import * as esbuild from 'esbuild';
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { build } from './build.mjs';

const ROOT = resolve(new URL('..', import.meta.url).pathname);
const arg = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : null; };
const BASE = arg('--base') ?? 'HEAD';
const ONLY = arg('--only') ? new Set(arg('--only').split(',')) : null;
const PERTURB = process.argv.includes('--perturb');
const WAIT = Number(process.env.TAB_WAIT ?? 60);   // タブを切り替えてから記録するまでの待ち時間（ms）

/**
 * 表示の HTML から、レイアウトで決まる数（座標・幅・高さ）を取り除く。
 * SVG の座標の属性・style の位置と大きさ・px の値を消し、ほかの属性と文字はそのまま残す
 */
export function normalize(html) {
  return html
    .replace(/\s(d|x|y|x1|x2|y1|y2|cx|cy|r|rx|ry|width|height|viewBox|points|transform|stroke-dasharray)="[^"]*"/g, '')
    .replace(/(left|top|right|bottom|width|height|min-width|max-width|min-height|max-height|flex-basis|transform)\s*:\s*[^;"]*;?/g, '')
    .replace(/(-?\d+(\.\d+)?)px/g, 'Npx')
    .replace(/\sstyle="\s*"/g, '');
}

// ── 比べる相手のビルド（一時的な作業ツリー） ─────────────────────────────────────

const baseDir = mkdtempSync(join(tmpdir(), 'javavisualizer-dom-base-'));
const git = (...a) => execFileSync('git', a, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();
console.log(`比べる相手：${BASE}（${git('rev-parse', '--short', BASE)}）をビルドしています…`);
git('worktree', 'add', '--detach', baseDir, BASE);
const cleanup = () => { try { git('worktree', 'remove', '--force', baseDir); } catch { rmSync(baseDir, { recursive: true, force: true }); } };
process.on('exit', cleanup);
symlinkSync(join(ROOT, 'node_modules'), join(baseDir, 'node_modules'));
execFileSync('node', ['scripts/build.mjs'], { cwd: baseDir, stdio: ['ignore', 'ignore', 'inherit'] });
const baseIds = JSON.parse(execFileSync('node', ['-e', 'import("./scripts/build.mjs").then(m => console.log(JSON.stringify(m.readSamples().samples.map(s => s.id))))'], { cwd: baseDir }).toString());

console.log('今の作業中のソースをビルドしています…');
const codes = await build();
const serve = async (dir, port) => (await esbuild.context({})).serve({ servedir: join(dir, 'web'), host: '127.0.0.1', port });
const before = await serve(baseDir, Number(process.env.PORT ?? 8128));
const after = await serve(ROOT, Number(process.env.PORT ?? 8128) + 1);
const browser = await chromium.launch();

/** 1 本のサンプルの、全位置 × 全タブの表示を記録する */
async function capture(port, id, perturb) {
  const context = await browser.newContext({ viewport: { width: 1500, height: 950 }, locale: 'ja-JP' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`http://127.0.0.1:${port}/?code=/samples/${id}.json`, { waitUntil: 'networkidle' });
  if (perturb) await page.addStyleTag({ content: '* { letter-spacing: 0.7px !important; }' });
  // クリックは DOM の click() で行う（ツールチップなどが重なっても止まらないように）
  const domClick = (sel) => page.evaluate((q) => document.querySelector(q)?.click(), sel);
  await domClick('#btn-run');
  await page.waitForTimeout(300);
  const tabs = await page.locator('#view-tabs [data-view]').evaluateAll(els => els.map(e => e.dataset.view));
  const click = async (sel, n = 1) => {
    for (let i = 0; i < n; i++) {
      if (!(await page.locator(sel).isEnabled())) break;
      await domClick(sel);
    }
  };
  const positions = [
    ['start', async () => {}],
    ['human5', async () => click('#btn-human-forward', 5)],
    ['expr3', async () => click('#btn-expr-forward', 3)],
    ['human20', async () => click('#btn-human-forward', 15)],
    ['end', async () => click('#btn-end')],
  ];
  const out = {};
  for (const [pos, act] of positions) {
    await act();
    for (const t of tabs) {
      await domClick(`#view-tabs [data-view="${t}"]`);
      await page.waitForTimeout(WAIT);
      const s = await page.evaluate(() => ({
        view: document.querySelector('#view-container')?.innerHTML ?? '',
        console: document.querySelector('#console-panel')?.innerText ?? '',
        counter: document.querySelector('#step-counter')?.textContent ?? '',
        error: document.querySelector('#error-msg')?.hidden ? '' : document.querySelector('#error-msg')?.innerText ?? '',
        code: document.querySelector('#code-display')?.innerHTML ?? '',
      }));
      out[`${pos}|${t}`] = normalize(s.view);
      out[`${pos}|code`] = normalize(s.code);   // コード表示はタブで変わらないので、位置ごとに 1 つ
      out[`${pos}|status`] = `ステップ ${s.counter} / エラー ${s.error} / コンソール ${s.console}`;
    }
  }
  out.pageerrors = errors.join('\n');
  await context.close();
  return out;
}

/** 違う所を表示する（最初の 3 件）。違いの数を返す */
function compare(id, a, b) {
  let diff = 0;
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (a[k] === b[k]) continue;
    diff++;
    if (diff <= 3) {
      const x = a[k] ?? '（なし）', y = b[k] ?? '（なし）';
      let i = 0; while (i < x.length && x[i] === y[i]) i++;
      console.log(`    ${k}\n      前: …${x.slice(Math.max(0, i - 80), i + 120)}\n      後: …${y.slice(Math.max(0, i - 80), i + 120)}`);
    }
  }
  return diff;
}

const ids = codes.map(c => c.id).filter(id => !ONLY || ONLY.has(id));
let changed = 0, added = 0, total = 0;
for (const id of ids) {
  if (!baseIds.includes(id)) { added++; console.log(`+ ${id}：新しいサンプル（比べる相手がない）`); continue; }
  const a = await capture(before.port, id, false);
  const b = await capture(after.port, id, PERTURB);
  total += Object.keys(b).length;
  const d = compare(id, a, b);
  if (d) changed++;
  console.log(`${d ? '✗' : '✓'} ${id}${d ? `：${d} 件が違う` : ''}${b.pageerrors ? `（ブラウザのエラー：${b.pageerrors.split('\n')[0]}）` : ''}`);
}
await browser.close();
console.log(changed ? `${ids.length - added} 本のうち ${changed} 本で表示が変わった（意図した変更かを確かめる）` : `${ids.length - added} 本・${total} 件の表示がすべて変更前と同じ${added ? `（新しいサンプル ${added} 本は比べていない）` : ''}`);
process.exit(changed ? 1 : 0);
