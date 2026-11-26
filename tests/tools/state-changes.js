/**
 * state-changes.js — JavaDebugger のトレースから、変数の状態の変化の列を作る（tests/line-state.test.js が使う）
 *
 * 本物の Java 側（tests/tools/TraceStates.java）と同じ時点・同じ書き方にする。
 */
import { isArray, isList, isSet, isMap, isEntry, isLambda, isObject, isString, isChar, isDouble, doubleToString, quoteString } from '../../src/engine/values.js';
import { isStringBuilder } from '../../src/engine/collections.js';
import { isThrowable } from '../../src/engine/objects.js';
import { isBuiltin } from '../../src/engine/builtins.js';

/** Java の Collections.sort と同じ並べ方（UTF-16 の符号の順） */
const sortJava = (xs) => [...xs].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

/** TraceStates.java の repr と同じ書き方 */
export function srepr(v, depth = 0) {
  if (v === null || v === undefined) return 'null';
  if (isString(v)) return quoteString(v.s);
  if (isChar(v)) return `'${String.fromCharCode(v.code)}'`;
  if (isDouble(v)) return doubleToString(v.v);
  if (isBuiltin(v)) return `<${v.name}>`;
  if (isLambda(v)) return '<lambda>';   // ラムダ式・メソッド参照の値（ADR-010）
  // ストリーム・Optional（ADR-011）
  if (v.__type__ === 'JStream') return '<stream>';
  if (v.__type__ === 'JOptional') return v.present ? `${v.kind}[${srepr(v.value, depth + 1)}]` : `${v.kind}.empty`;   // Scanner など（TraceStates.java と同じく型名だけ）
  if (isStringBuilder(v)) return `StringBuilder(${quoteString(v.fields.value.s)})`;
  // マップ・集合・Map.Entry（ADR-009）。Map.of・Set.of は本物の順序が実行ごとに変わるので、文字列の順に並べる
  if (isMap(v)) {
    if (depth >= 3) return '{…}';
    const items = v.entries.map(e => `${srepr(e.key, depth + 1)}=${srepr(e.value, depth + 1)}`);
    return `{${(v.kind === 'Map' ? sortJava(items) : items).join(', ')}}`;
  }
  if (isSet(v)) {
    if (depth >= 3) return '[…]';
    const items = v.map(x => srepr(x, depth + 1));
    return `[${(v.__jset === 'Set' && !v.__jview ? sortJava(items) : items).join(', ')}]`;
  }
  if (isEntry(v)) return depth >= 3 ? '…=…' : `${srepr(v.key, depth + 1)}=${srepr(v.value, depth + 1)}`;
  if (isList(v)) return depth >= 3 ? '[…]' : `[${v.map(x => srepr(x, depth + 1)).join(', ')}]`;
  if (isArray(v)) return depth >= 3 ? '[…]' : `[${v.map(x => srepr(x, depth + 1)).join(', ')}]`;
  if (isObject(v)) {
    if (isThrowable(v)) return `<${v.cls.name}>`;
    if (v.__enum) return `${v.cls.name}.${v.__enum.name}`;
    // 入れ子のクラスは、JDI と同じく Main$Point と書く
    const cn = v.cls.outer ? v.cls.qualifiedName.replace(/\./g, '$') : v.cls.name;
    if (depth >= 3) return `${cn}{…}`;
    const keys = Object.keys(v.fields).sort();
    return `${cn}{${keys.map(k => `${k}=${srepr(v.fields[k], depth + 1)}`).join(', ')}}`;
  }
  return String(v);
}

/** JavaDebugger のトレースから、変数の状態の変化の列を作る */
export function stateChanges(trace) {
  const changes = [];
  const prev = new Map();      // callId → 前回のスナップショット
  const lastLine = new Map();  // callId → 直前のイベントの行
  const returnedTo = new Set(); // 呼んだ先から戻ってきて、まだ記録していないフレームの callId
  for (let i = 0; i < trace.length; i++) {
    const ev = trace[i];
    if (ev.callDepth === 0) continue;   // メソッドの外（static フィールドの初期化）
    if (ev.callStack[ev.callStack.length - 1].name === 'lambda') continue;   // ラムダ式の本体は比べない（TraceStates.java と同じ。ADR-010）
    const key = ev.callStack[ev.callStack.length - 1].callId;
    const next = trace[i + 1];
    const first = !prev.has(key);
    const leaving = !next || next.callDepth < ev.callDepth;
    // 行は enter のイベントで追う（exit のイベントの位置はノードの始まりで、実行している場所ではない）
    const newLine = ev.phase === 'enter' && lastLine.get(key) !== ev.loc.line;
    if (ev.phase === 'enter') lastLine.set(key, ev.loc.line);
    // 呼んだ先（ラムダ式など）から戻った最初のイベント：JDI も、戻った所（行の途中）で止まる。
    // ただし forEach などの組み込みのメソッドの中（LambdaCall）に戻ったときは、本物は JDK の中なので止まらない
    if (i > 0 && trace[i - 1].callDepth > ev.callDepth) returnedTo.add(key);
    const returned = returnedTo.has(key) && ev.nodeType !== 'LambdaCall';
    if (returned) returnedTo.delete(key);
    if (!(first || leaving || newLine || returned)) continue;
    const vars = ev.frameEnvs[ev.frameEnvs.length - 1] ?? {};
    const cur = {};
    for (const [k, v] of Object.entries(vars)) if (k !== 'this') cur[k] = srepr(v);
    const old = prev.get(key) ?? {};
    for (const k of Object.keys(cur).sort()) if (old[k] !== cur[k]) changes.push(`${ev.callStack[ev.callStack.length - 1].name}:${k}=${cur[k]}`);
    prev.set(key, cur);
  }
  return changes;
}

