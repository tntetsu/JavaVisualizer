/**
 * collections.js — ArrayList・List.of・Collections・StringBuilder・ラッパー型のメソッド（Phase 5。ADR-007）
 *
 * | Java | 表現 |
 * |---|---|
 * | ArrayList・List.of | JS の配列＋列挙されない印 __jlist（'ArrayList' か、変更できない 'List'）。配列のビューがそのまま使える |
 * | StringBuilder | 組み込みのクラスのインスタンス（fields.value に今の文字列の String） |
 * | Integer・Double など | 中身のプリミティブの値そのもの（Integer は JS の number）。== は値で比べる（本物は -128〜127 の外では別のオブジェクト） |
 *
 * メソッドは (receiver, name, args, ctx, argTypes) を受け取り、見つからなければ undefined を返す。
 * ctx.str(v) は String.valueOf、ctx.equals(a, b) は Java の equals（ユーザーの equals を呼ぶ）。
 * argTypes は静的な検査が付けた引数の型（remove(int) と remove(Object) の区別に使う）。
 */
import {
  JavaError, makeString, makeChar, makeDouble, makeList, isList, isString, isChar, isDouble, isInt, isLong, isBool, num,
} from './values.js';
import { JClass, ObjectClass, makeObject } from './objects.js';
import { JBuiltin } from './builtins.js';

const S = (s) => makeString(s);
const oob = (i, n) => new JavaError('IndexOutOfBoundsException', `Index ${i} out of bounds for length ${n}`);
const unsupported = () => new JavaError('UnsupportedOperationException', null);

// ── 比較（Collections.sort・max・min） ──────────────────────────────────────────

/** 自然な順序（Comparable）での比較。数・文字・文字列だけ（ほかは ClassCastException） */
export function naturalCompare(a, b, ctx) {
  if (a === null || b === null) throw new JavaError('NullPointerException', null);
  // 自作のクラス（Comparable）・enum は ctx.compareTo（ユーザーの compareTo を呼ぶ。ADR-008）
  if (a && typeof a === 'object' && a.__type__ === 'JObject' && ctx?.compareTo) return ctx.compareTo(a, b);
  if (isString(a) && isString(b)) {
    const n = Math.min(a.s.length, b.s.length);
    for (let i = 0; i < n; i++) if (a.s.charCodeAt(i) !== b.s.charCodeAt(i)) return a.s.charCodeAt(i) - b.s.charCodeAt(i);
    return a.s.length - b.s.length;
  }
  if (isBool(a) && isBool(b)) return (a ? 1 : 0) - (b ? 1 : 0);
  if (isLong(a) && isLong(b)) return a < b ? -1 : a > b ? 1 : 0;
  if ((isInt(a) || isDouble(a) || isChar(a)) && (isInt(b) || isDouble(b) || isChar(b))) {
    const x = num(a), y = num(b);
    return x < y ? -1 : x > y ? 1 : 0;
  }
  throw new JavaError('ClassCastException', 'class cannot be cast to class java.lang.Comparable');
}

/** 安定なソート（Java の List.sort・Collections.sort はマージソートで安定） */
function sortInPlace(list, cmp) {
  const sorted = list.map((v, i) => [v, i]).sort((p, q) => cmp(p[0], q[0]) || p[1] - q[1]).map(p => p[0]);
  sorted.forEach((v, i) => { list[i] = v; });
}

/** リストの toString（[1, 2, 3]） */
export const listString = (list, ctx) => `[${list.map(x => (x === list ? '(this Collection)' : ctx.str(x))).join(', ')}]`;

// ── ArrayList・List.of ────────────────────────────────────────────────────────

const INDEX_TYPES = new Set(['int', 'short', 'byte', 'char']);

export function callListMethod(list, name, args, ctx, argTypes = []) {
  const mutable = list.__jlist === 'ArrayList';
  const need = () => { if (!mutable) throw unsupported(); };
  const checkIndex = (i) => { if (i < 0 || i >= list.length) throw oob(i, list.length); };
  const indexOf = (o) => list.findIndex(x => ctx.equals(o, x));
  const a0 = args[0];
  switch (name) {
    case 'size': return list.length;
    case 'isEmpty': return list.length === 0;
    case 'get': checkIndex(a0); return list[a0];
    case 'set': { need(); checkIndex(a0); const old = list[a0]; list[a0] = args[1]; return old; }
    case 'add':
      need();
      if (args.length === 1) { list.push(a0); return true; }
      if (a0 < 0 || a0 > list.length) throw new JavaError('IndexOutOfBoundsException', `Index: ${a0}, Size: ${list.length}`);
      list.splice(a0, 0, args[1]);
      return undefined;
    case 'addAll': need(); list.push(...a0); return a0.length > 0;
    case 'remove': {
      need();
      // remove(int) は位置で、remove(Object) は値で消す（引数の静的な型で決まる。型が分からなければ値の種類で）
      const byIndex = argTypes[0] ? INDEX_TYPES.has(argTypes[0]) : isInt(a0);
      if (byIndex) { checkIndex(a0); return list.splice(a0, 1)[0]; }
      const i = indexOf(a0);
      if (i < 0) return false;
      list.splice(i, 1);
      return true;
    }
    case 'contains': return indexOf(a0) >= 0;
    case 'indexOf': return indexOf(a0);
    case 'lastIndexOf': { for (let i = list.length - 1; i >= 0; i--) if (ctx.equals(a0, list[i])) return i; return -1; }
    case 'clear': need(); list.length = 0; return undefined;
    case 'sort': need(); if (a0 !== null) return undefined; sortInPlace(list, (x, y) => naturalCompare(x, y, ctx)); return undefined;
    case 'toString': return S(listString(list, ctx));
    case 'equals': return isList(a0) && a0.length === list.length && list.every((x, i) => ctx.equals(x, a0[i]));
    case 'hashCode': return list.reduce((h, x) => (Math.imul(31, h) + ctx.hashCode(x)) | 0, 1);
  }
  return undefined;
}

/** List.of(…)・Collections の static メソッド */
export function createCollectionBuiltins() {
  return new Map([
    ['List', new JBuiltin('List', {
      of: (args) => {
        if (args.some(x => x === null)) throw new JavaError('NullPointerException', null);
        return makeList(args, { kind: 'List' });
      },
    }, 'java.util')],
    ['Collections', new JBuiltin('Collections', {
      sort: ([list], ctx) => { if (list.__jlist !== 'ArrayList') throw unsupported(); sortInPlace(list, (x, y) => naturalCompare(x, y, ctx)); return undefined; },
      reverse: ([list]) => { if (list.__jlist !== 'ArrayList') throw unsupported(); list.reverse(); return undefined; },
      swap: ([list, i, j]) => {
        if (i < 0 || i >= list.length) throw oob(i, list.length);
        if (j < 0 || j >= list.length) throw oob(j, list.length);
        [list[i], list[j]] = [list[j], list[i]];
        return undefined;
      },
      max: ([list], ctx) => {
        if (!list.length) throw new JavaError('NoSuchElementException', null);
        return list.reduce((m, x) => (naturalCompare(x, m, ctx) > 0 ? x : m));
      },
      min: ([list], ctx) => {
        if (!list.length) throw new JavaError('NoSuchElementException', null);
        return list.reduce((m, x) => (naturalCompare(x, m, ctx) < 0 ? x : m));
      },
      frequency: ([list, o], ctx) => list.filter(x => ctx.equals(o, x)).length,
    }, 'java.util')],
  ]);
}

// ── StringBuilder ─────────────────────────────────────────────────────────────

export const StringBuilderClass = new JClass('StringBuilder', ObjectClass, { builtin: true, pkg: 'java.lang' });
export const isStringBuilder = (v) => v !== null && typeof v === 'object' && v.__type__ === 'JObject' && v.cls === StringBuilderClass;

/** new StringBuilder()・new StringBuilder("abc")・new StringBuilder(16) */
export function makeStringBuilder(args, ctx) {
  const o = makeObject(StringBuilderClass);
  o.fields.value = S(args.length && !isInt(args[0]) ? ctx.str(args[0]) : '');
  return o;
}

const sioobe = (msg) => new JavaError('StringIndexOutOfBoundsException', msg);

/** 文字（char）を 1 文字の文字列に、ほかは String.valueOf に */
const piece = (v, ctx) => (isChar(v) ? String.fromCharCode(v.code) : ctx.str(v));

export function callStringBuilderMethod(sb, name, args, ctx) {
  const s = sb.fields.value.s;
  const set = (t) => { sb.fields.value = S(t); return sb; };
  const a0 = args[0];
  switch (name) {
    case 'append': return set(s + piece(a0, ctx));
    case 'insert':
      if (a0 < 0 || a0 > s.length) throw sioobe(`offset ${a0}, length ${s.length}`);
      return set(s.slice(0, a0) + piece(args[1], ctx) + s.slice(a0));
    case 'reverse': return set([...s].reverse().join(''));
    case 'toString': return S(s);
    case 'length': return s.length;
    case 'charAt':
      if (a0 < 0 || a0 >= s.length) throw sioobe(`index ${a0},length ${s.length}`);
      return makeChar(s.charCodeAt(a0));
    case 'setCharAt':
      if (a0 < 0 || a0 >= s.length) throw sioobe(`index ${a0},length ${s.length}`);
      set(s.slice(0, a0) + String.fromCharCode(args[1].code) + s.slice(a0 + 1));
      return undefined;
    case 'deleteCharAt':
      if (a0 < 0 || a0 >= s.length) throw sioobe(`index ${a0},length ${s.length}`);
      return set(s.slice(0, a0) + s.slice(a0 + 1));
    case 'delete': {
      const end = Math.min(args[1], s.length);
      if (a0 < 0 || a0 > end) throw sioobe(`start ${a0}, end ${args[1]}, length ${s.length}`);
      return set(s.slice(0, a0) + s.slice(end));
    }
    case 'indexOf': return s.indexOf(a0.s);
    case 'isEmpty': return s.length === 0;
    case 'setLength': {
      if (a0 < 0) throw sioobe(`String index out of range: ${a0}`);
      set(a0 <= s.length ? s.slice(0, a0) : s + '\0'.repeat(a0 - s.length));
      return undefined;
    }
  }
  return undefined;
}

// ── ラッパー型（Integer・Double・Character・Boolean・Long）のインスタンスのメソッド ──────────

/** 値の種類が同じで、値が等しいか（Integer.equals(Long) は false） */
function sameBoxed(a, b) {
  if (isInt(a)) return isInt(b) && a === b;
  if (isLong(a)) return isLong(b) && a === b;
  if (isDouble(a)) return isDouble(b) && Object.is(a.v, b.v);   // Double.equals：NaN は等しく、0.0 と -0.0 は違う
  if (isChar(a)) return isChar(b) && a.code === b.code;
  if (isBool(a)) return isBool(b) && a === b;
  return false;
}

export function callWrapperMethod(v, name, args, ctx) {
  const a0 = args[0];
  switch (name) {
    case 'equals': return sameBoxed(v, a0);
    case 'compareTo': return naturalCompare(v, a0, ctx);
    case 'intValue': return isLong(v) ? Number(BigInt.asIntN(32, v)) : isDouble(v) ? Math.trunc(v.v) | 0 : num(v);
    case 'longValue': return BigInt(Math.trunc(num(v)));
    case 'doubleValue': return makeDouble(num(v));
    case 'charValue': return v;
    case 'booleanValue': return v;
    case 'toString': return S(ctx.str(v));
    case 'hashCode': return ctx.hashCode(v);
  }
  return undefined;
}
