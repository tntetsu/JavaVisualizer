/**
 * state-changes.js — JavaDebugger のトレースから、変数の状態の変化の列を作る（tests/line-state.test.js が使う）
 *
 * 本物の Java 側（tests/tools/TraceStates.java）と同じ時点・同じ書き方にする。
 */
import { isArray, isObject, isString, isChar, isDouble, doubleToString, quoteString } from '../../src/engine/values.js';
import { isThrowable } from '../../src/engine/objects.js';
import { isBuiltin } from '../../src/engine/builtins.js';

/** TraceStates.java の repr と同じ書き方 */
export function srepr(v, depth = 0) {
  if (v === null || v === undefined) return 'null';
  if (isString(v)) return quoteString(v.s);
  if (isChar(v)) return `'${String.fromCharCode(v.code)}'`;
  if (isDouble(v)) return doubleToString(v.v);
  if (isBuiltin(v)) return `<${v.name}>`;   // Scanner など（TraceStates.java と同じく型名だけ）
  if (isArray(v)) return depth >= 3 ? '[…]' : `[${v.map(x => srepr(x, depth + 1)).join(', ')}]`;
  if (isObject(v)) {
    if (isThrowable(v)) return `<${v.cls.name}>`;
    if (depth >= 3) return `${v.cls.name}{…}`;
    const keys = Object.keys(v.fields).sort();
    return `${v.cls.name}{${keys.map(k => `${k}=${srepr(v.fields[k], depth + 1)}`).join(', ')}}`;
  }
  return String(v);
}

/** JavaDebugger のトレースから、変数の状態の変化の列を作る */
export function stateChanges(trace) {
  const changes = [];
  const prev = new Map();      // callId → 前回のスナップショット
  const lastLine = new Map();  // callId → 直前のイベントの行
  for (let i = 0; i < trace.length; i++) {
    const ev = trace[i];
    if (ev.callDepth === 0) continue;   // メソッドの外（static フィールドの初期化）
    const key = ev.callStack[ev.callStack.length - 1].callId;
    const next = trace[i + 1];
    const first = !prev.has(key);
    const leaving = !next || next.callDepth < ev.callDepth;
    // 行は enter のイベントで追う（exit のイベントの位置はノードの始まりで、実行している場所ではない）
    const newLine = ev.phase === 'enter' && lastLine.get(key) !== ev.loc.line;
    if (ev.phase === 'enter') lastLine.set(key, ev.loc.line);
    if (!(first || leaving || newLine)) continue;
    const vars = ev.frameEnvs[ev.frameEnvs.length - 1] ?? {};
    const cur = {};
    for (const [k, v] of Object.entries(vars)) if (k !== 'this') cur[k] = srepr(v);
    const old = prev.get(key) ?? {};
    for (const k of Object.keys(cur).sort()) if (old[k] !== cur[k]) changes.push(`${ev.callStack[ev.callStack.length - 1].name}:${k}=${cur[k]}`);
    prev.set(key, cur);
  }
  return changes;
}

