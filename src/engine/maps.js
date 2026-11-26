/**
 * maps.js — HashMap・TreeMap・LinkedHashMap・HashSet・TreeSet・LinkedHashSet・Map.of・Set.of・Map.Entry（Phase 5。ADR-009）
 *
 * | Java | 表現 |
 * |---|---|
 * | HashMap など | { __type__: 'JMap', kind, keyType, valType, entries: [JEntry…] }。entries はいつも繰り返しの順。
 * |              | 表の容量・変更回数・入れた順の番号は、列挙されない __t に持つ（スナップショットには写らない） |
 * | Map.Entry | { __type__: 'JEntry', key, value }。HashMap の中の組そのもの（entrySet の要素の setValue が表に効く） |
 * | HashSet など | JS の配列＋列挙されない印 __jset（'HashSet' など）と __jsetElem（要素の型）。中身は繰り返しの順。
 * |              | 裏に HashMap と同じ表（__jsetMap）を持ち、変えるたびに配列を並べ直す（配列のビューがそのまま使える） |
 *
 * 繰り返しの順序は本物の java.util.HashMap と同じにする（ADR-009）：
 * - 表の容量は 16 から（new HashMap<>(n) は n 以上の 2 の累乗）。要素の数が容量の 0.75 倍を超えたら 2 倍にする
 * - 位置は (容量 - 1) & (h ^ (h >>> 16))（h は hashCode）。同じ位置の組は入れた順に並ぶ（2 倍にしても順は保たれる）
 * - 1 つの位置に 9 個目の組が入ると、容量が 64 未満なら 2 倍にする（treeifyBin）。64 以上で木にする場合の順序は再現しない
 * LinkedHashMap・LinkedHashSet は入れた順、TreeMap・TreeSet は自然な順序（compareTo）。
 * Map.of・Set.of は本物では実行のたびに順序が変わる（乱数で決まる）ので、ここでは書いた順にする。
 */
import { JavaError, makeString, isSet, isMap, isEntry, isInt } from './values.js';
import { JBuiltin } from './builtins.js';
import { naturalCompare, cmpWith } from './collections.js';

const S = (s) => makeString(s);
const unsupported = () => new JavaError('UnsupportedOperationException', null);

/** マップの種類 → 順序の決め方 */
const ORDER = { HashMap: 'hash', LinkedHashMap: 'linked', TreeMap: 'tree', Map: 'linked' };
/** 集合の種類 → 裏のマップの種類 */
const SET_BACKING = { HashSet: 'HashMap', LinkedHashSet: 'LinkedHashMap', TreeSet: 'TreeMap', Set: 'Map' };
export const MAP_KINDS = new Set(Object.keys(ORDER));
export const SET_KINDS = new Set(Object.keys(SET_BACKING));

/** n 以上の最小の 2 の累乗（HashMap.tableSizeFor。0・1 は 1） */
export function tableSizeFor(n) {
  let c = 1;
  while (c < n && c < (1 << 30)) c *= 2;
  return c;
}

/** HashMap.hash：上位 16 ビットを下位に混ぜる */
const spread = (h) => (h ^ (h >>> 16)) | 0;

// ── 表（マップ） ────────────────────────────────────────────────────────────────

/**
 * マップを作る
 * @param {string} kind 'HashMap'・'LinkedHashMap'・'TreeMap'・'Map'（Map.of。変更できない）
 * @param {{keyType?: string|null, valType?: string|null, cap?: number}} [opts]
 */
export function newMap(kind, { keyType = null, valType = null, cap = 16, cmp = null } = {}) {
  const m = { __type__: 'JMap', kind, keyType, valType, entries: [] };
  // cmp：TreeMap の比べ方（new TreeMap<>(Comparator.reverseOrder())。null なら自然な順序。ADR-010）
  Object.defineProperty(m, '__t', { value: { cap, modCount: 0, seq: 0, cmp }, enumerable: false });
  return m;
}

function newEntry(key, value, hash, seq) {
  const e = { __type__: 'JEntry', key, value };
  Object.defineProperty(e, '__h', { value: hash, enumerable: false, writable: true });
  Object.defineProperty(e, '__seq', { value: seq, enumerable: false, writable: true });
  return e;
}

/** Map.entry(k, v)（変更できない組） */
export function immutableEntry(key, value) {
  const e = newEntry(key, value, 0, 0);
  Object.defineProperty(e, '__immutable', { value: true, enumerable: false });
  return e;
}

const order = (m) => ORDER[m.kind];
const binOf = (m, e) => e.__h & (m.__t.cap - 1);

/** 表の並び（entries）を、繰り返しの順に並べ直す */
function reorder(m) {
  if (order(m) === 'hash') m.entries.sort((a, b) => binOf(m, a) - binOf(m, b) || a.__seq - b.__seq);
}

/** キー k の組（なければ null）。HashMap は同じ位置・同じハッシュの組だけを、本物と同じく key.equals(相手) で比べる */
function findEntry(m, k, ctx, hash) {
  if (order(m) === 'tree') {
    if (k === null && !m.__t.cmp) throw new JavaError('NullPointerException', null);
    return m.entries.find(e => cmpWith(m.__t.cmp, k, e.key, ctx) === 0) ?? null;
  }
  if (order(m) === 'hash') {
    const h = hash ?? spread(ctx.hashCode(k));
    for (const e of m.entries) if (e.__h === h && (e.key === k || (k !== null && ctx.equals(k, e.key)))) return e;
    return null;
  }
  // LinkedHashMap も HashMap と同じくハッシュで探す（user の hashCode が呼ばれる）
  if (m.kind === 'LinkedHashMap') {
    const h = hash ?? spread(ctx.hashCode(k));
    for (const e of m.entries) if (e.__h === h && (e.key === k || (k !== null && ctx.equals(k, e.key)))) return e;
    return null;
  }
  if (k === null) throw new JavaError('NullPointerException', null);   // Map.of は null のキーを受け付けない
  return m.entries.find(e => ctx.equals(k, e.key)) ?? null;
}

/** キー k に値 v を入れる。前の値（なければ null）を返す */
export function mapPut(m, k, v, ctx, { ifAbsent = false } = {}) {
  const t = m.__t;
  const kind = order(m);
  const hashed = kind === 'hash' || m.kind === 'LinkedHashMap';
  const h = hashed ? spread(ctx.hashCode(k)) : 0;
  const found = findEntry(m, k, ctx, hashed ? h : undefined);
  if (found) {
    const old = found.value;
    if (!ifAbsent || old === null) found.value = v;
    return old;
  }
  const e = newEntry(k, v, h, t.seq++);
  if (kind === 'tree') {
    // TreeMap：大きい方の最初の位置に入れる（はじめの 1 つも compare(key, key) で型を確かめる）
    if (m.entries.length === 0) cmpWith(m.__t.cmp, k, k, ctx);
    let i = m.entries.findIndex(x => cmpWith(m.__t.cmp, k, x.key, ctx) < 0);
    if (i < 0) i = m.entries.length;
    m.entries.splice(i, 0, e);
  } else {
    // 同じ位置にすでに 8 個以上あれば、9 個目を入れたあと、容量が 64 未満なら 2 倍にする（treeifyBin）
    const binCount = kind === 'hash' ? m.entries.filter(x => binOf(m, x) === binOf(m, e)).length : 0;
    m.entries.push(e);
    if (hashed && binCount >= 8 && t.cap < 64) t.cap *= 2;
    if (hashed && m.entries.length > Math.floor(t.cap * 0.75)) t.cap *= 2;
    reorder(m);
  }
  t.modCount++;
  return null;
}

/** キー k の組を除く。除いた値（なければ null）を返す */
export function mapRemove(m, k, ctx) {
  const e = findEntry(m, k, ctx);
  if (!e) return null;
  m.entries.splice(m.entries.indexOf(e), 1);
  m.__t.modCount++;
  return e.value;
}

function mapClear(m) {
  if (m.entries.length) m.__t.modCount++;
  m.entries.length = 0;   // 表の容量は変わらない（本物も clear で小さくしない）
}

/** 別のマップの組をすべて入れる（相手の繰り返しの順に） */
function putAll(m, other, ctx) {
  for (const e of [...other.entries]) mapPut(m, e.key, e.value, ctx);
}

/** new HashMap<>(別のマップ) の容量（本物の putMapEntries：ceil(要素の数 / 0.75) 以上の 2 の累乗。空なら 16） */
const copyCapacity = (n) => (n === 0 ? 16 : tableSizeFor(Math.ceil(n / 0.75)));

/**
 * new HashMap<>()・new HashMap<>(容量)・new HashMap<>(別のマップ)（TreeMap・LinkedHashMap も）
 * @param {string} kind
 * @param {any[]} args
 * @param {{keyType?: string, valType?: string}} types 静的な検査が付けた型引数
 */
export function constructMap(kind, args, types, ctx) {
  const a0 = args[0];
  if (args.length === 0) return newMap(kind, types);
  if (isInt(a0)) {
    if (a0 < 0) throw new JavaError('IllegalArgumentException', `Illegal initial capacity: ${a0}`);
    return newMap(kind, { ...types, cap: tableSizeFor(a0) });
  }
  if (kind === 'TreeMap' && !isMap(a0)) return newMap(kind, { ...types, cmp: a0 });   // 比べ方（null は自然な順序）
  if (a0 === null) throw new JavaError('NullPointerException', null);
  const m = newMap(kind, { ...types, cap: copyCapacity(a0.entries.length) });
  putAll(m, a0, ctx);
  return m;
}

// ── 集合 ────────────────────────────────────────────────────────────────────

/** 集合（配列）を作る。backing は裏のマップ（なければ作る） */
export function newSet(kind, { elemType = null, cap = 16, view = null, cmp = null } = {}) {
  const a = [];
  Object.defineProperty(a, '__jset', { value: kind, enumerable: false, writable: true });
  Object.defineProperty(a, '__jsetElem', { value: elemType, enumerable: false, writable: true });
  Object.defineProperty(a, '__jsetMap', { value: view ? null : newMap(SET_BACKING[kind], { cap, cmp }), enumerable: false });
  // keySet()・entrySet()：元のマップ（繰り返しの途中で元が変わったら ConcurrentModificationException。ADR-009）
  if (view) Object.defineProperty(a, '__jview', { value: view, enumerable: false });
  return a;
}

/** 配列の中身を、裏のマップの繰り返しの順にそろえる */
function syncSet(s) {
  const keys = s.__jsetMap.entries.map(e => e.key);
  s.length = 0;
  s.push(...keys);
}

export function setAdd(s, x, ctx) {
  const m = s.__jsetMap;
  if (findEntry(m, x, ctx)) return false;
  mapPut(m, x, true, ctx);
  syncSet(s);
  return true;
}

function setRemove(s, x, ctx) {
  const m = s.__jsetMap;
  if (!findEntry(m, x, ctx)) return false;
  mapRemove(m, x, ctx);
  syncSet(s);
  return true;
}

/** new HashSet<>(コレクション) の容量（本物：HashMap.newHashMap(max(要素の数, 12))） */
const setCopyCapacity = (n) => tableSizeFor(Math.ceil(Math.max(n, 12) / 0.75));

/** new HashSet<>()・new HashSet<>(容量)・new HashSet<>(コレクション)（TreeSet・LinkedHashSet も） */
export function constructSet(kind, args, elemType, ctx) {
  const a0 = args[0];
  if (args.length === 0) return newSet(kind, { elemType });
  if (isInt(a0)) {
    if (a0 < 0) throw new JavaError('IllegalArgumentException', `Illegal initial capacity: ${a0}`);
    return newSet(kind, { elemType, cap: tableSizeFor(a0) });
  }
  if (kind === 'TreeSet' && !Array.isArray(a0)) return newSet(kind, { elemType, cmp: a0 });   // 比べ方（ADR-010）
  if (a0 === null) throw new JavaError('NullPointerException', null);
  const s = newSet(kind, { elemType, cap: setCopyCapacity(a0.length) });
  for (const x of [...a0]) setAdd(s, x, ctx);
  return s;
}

/** 集合が変わったかを調べるための、元のマップ（自分の表か、keySet などの元のマップ） */
export const sourceMap = (c) => (isSet(c) ? c.__jview ?? c.__jsetMap : c?.__jview ?? null);

/** keySet()・values()・entrySet()：元のマップの今の中身（繰り返しの途中で元が変わると ConcurrentModificationException） */
function keySetView(m) {
  const s = newSet('Set', { elemType: m.keyType, view: m });
  s.push(...m.entries.map(e => e.key));
  return s;
}
function entrySetView(m) {
  const s = newSet('Set', { elemType: m.keyType ? `Entry<${m.keyType},${m.valType}>` : null, view: m });
  s.push(...m.entries);
  return s;
}
function valuesView(m, makeList) {
  const l = makeList(m.entries.map(e => e.value), { kind: 'Collection', elemType: m.valType });
  Object.defineProperty(l, '__jview', { value: m, enumerable: false });
  return l;
}

// ── 文字列・等しさ・ハッシュ ────────────────────────────────────────────────

/** {the=3, over=1} */
export const mapString = (m, ctx) => `{${m.entries.map(e => `${e.key === m ? '(this Map)' : ctx.str(e.key)}=${e.value === m ? '(this Map)' : ctx.str(e.value)}`).join(', ')}}`;
/** [a, b] */
export const setString = (s, ctx) => `[${s.map(x => (x === s ? '(this Collection)' : ctx.str(x))).join(', ')}]`;
/** the=3 */
export const entryString = (e, ctx) => `${ctx.str(e.key)}=${ctx.str(e.value)}`;

function mapEquals(m, o, ctx) {
  if (m === o) return true;
  if (!isMap(o) || o.entries.length !== m.entries.length) return false;
  return m.entries.every(e => {
    const f = findEntry(o, e.key, ctx);
    return f !== null && ctx.equals(e.value, f.value);
  });
}

function setEquals(s, o, ctx) {
  if (s === o) return true;
  if (!isSet(o) || o.length !== s.length) return false;
  return o.every(x => setContains(s, x, ctx));
}

function setContains(s, x, ctx) {
  if (s.__jsetMap) return findEntry(s.__jsetMap, x, ctx) !== null;
  return s.some(y => ctx.equals(x, y));   // keySet・entrySet のビュー
}

const entryHash = (e, ctx) => ctx.hashCode(e.key) ^ ctx.hashCode(e.value);
export const mapHashCode = (m, ctx) => m.entries.reduce((h, e) => (h + entryHash(e, ctx)) | 0, 0);
export const setHashCode = (s, ctx) => s.reduce((h, x) => (h + ctx.hashCode(x)) | 0, 0);
export const entryHashCode = entryHash;
export const entryEquals = (e, o, ctx) => isEntry(o) && ctx.equals(e.key, o.key) && ctx.equals(e.value, o.value);

// ── メソッド ────────────────────────────────────────────────────────────────

const noSuch = () => new JavaError('NoSuchElementException', null);
const nn = (f) => { if (f === null || f === undefined) throw new JavaError('NullPointerException', null); };

/**
 * マップのメソッド。見つからなければ undefined を返す（void のメソッドは null ではなく VOID を返す）
 * @param {Function} makeList values() のリストを作る関数（values.js の makeList）
 */
export function callMapMethod(m, name, args, ctx, makeList) {
  const mutable = m.kind !== 'Map';
  const need = () => { if (!mutable) throw unsupported(); };
  const [a0, a1] = args;
  switch (name) {
    case 'size': return m.entries.length;
    case 'isEmpty': return m.entries.length === 0;
    case 'get': return findEntry(m, a0, ctx)?.value ?? null;
    case 'getOrDefault': { const e = findEntry(m, a0, ctx); return e ? e.value : a1; }
    case 'containsKey': return findEntry(m, a0, ctx) !== null;
    case 'containsValue': return m.entries.some(e => ctx.equals(a0, e.value));
    case 'put': need(); return mapPut(m, a0, a1, ctx);
    case 'putIfAbsent': need(); return mapPut(m, a0, a1, ctx, { ifAbsent: true });
    case 'replace': { need(); const e = findEntry(m, a0, ctx); if (!e) return null; const old = e.value; e.value = a1; return old; }
    case 'remove': need(); return mapRemove(m, a0, ctx);
    case 'clear': need(); mapClear(m); return VOID;
    case 'putAll': need(); putAll(m, a0, ctx); return VOID;
    case 'keySet': return keySetView(m);
    case 'values': return valuesView(m, makeList);
    case 'entrySet': return entrySetView(m);
    // ラムダ式を受け取るメソッド（ADR-010）。本物の HashMap と同じ手順で、値が null になったら組を除く
    case 'forEach': nn(a0); for (const e of [...m.entries]) ctx.call(a0, [e.key, e.value], 'accept'); return VOID;
    case 'replaceAll': need(); nn(a0); for (const e of m.entries) e.value = ctx.call(a0, [e.key, e.value], 'apply'); return VOID;
    case 'merge': {
      need(); nn(args[2]);
      if (a1 === null) throw new JavaError('NullPointerException', null);
      const e = findEntry(m, a0, ctx);
      const v = e && e.value !== null ? ctx.call(args[2], [e.value, a1], 'apply') : a1;
      if (v === null) mapRemove(m, a0, ctx); else if (e) e.value = v; else mapPut(m, a0, v, ctx);
      return v;
    }
    case 'computeIfAbsent': {
      need(); nn(a1);
      const e = findEntry(m, a0, ctx);
      if (e && e.value !== null) return e.value;
      const v = ctx.call(a1, [a0], 'apply');
      if (v !== null) { if (e) e.value = v; else mapPut(m, a0, v, ctx); }
      return v;
    }
    case 'computeIfPresent': {
      need(); nn(a1);
      const e = findEntry(m, a0, ctx);
      if (!e || e.value === null) return null;
      const v = ctx.call(a1, [a0, e.value], 'apply');
      if (v === null) mapRemove(m, a0, ctx); else e.value = v;
      return v;
    }
    case 'compute': {
      need(); nn(a1);
      const e = findEntry(m, a0, ctx);
      const v = ctx.call(a1, [a0, e ? e.value : null], 'apply');
      if (v === null) { if (e) mapRemove(m, a0, ctx); return null; }
      if (e) e.value = v; else mapPut(m, a0, v, ctx);
      return v;
    }
    case 'firstKey': if (!m.entries.length) throw noSuch(); return m.entries[0].key;
    case 'lastKey': if (!m.entries.length) throw noSuch(); return m.entries[m.entries.length - 1].key;
    case 'toString': return S(mapString(m, ctx));
    case 'equals': return mapEquals(m, a0, ctx);
    case 'hashCode': return mapHashCode(m, ctx);
  }
  return undefined;
}

/** 集合のメソッド */
export function callSetMethod(s, name, args, ctx) {
  const own = s.__jsetMap;
  const mutable = own && s.__jset !== 'Set';
  const need = () => { if (!mutable) throw unsupported(); };
  const a0 = args[0];
  switch (name) {
    case 'size': return s.length;
    case 'isEmpty': return s.length === 0;
    case 'contains': return setContains(s, a0, ctx);
    case 'containsAll': return a0.every(x => setContains(s, x, ctx));
    case 'add': need(); return setAdd(s, a0, ctx);
    case 'remove':
      // keySet().remove(k) は元のマップから除く
      if (!own && s.__jview && !isEntry(s[0])) {
        const had = findEntry(s.__jview, a0, ctx) !== null;
        if (had) { mapRemove(s.__jview, a0, ctx); s.splice(s.findIndex(x => ctx.equals(a0, x)), 1); }
        return had;
      }
      need();
      return setRemove(s, a0, ctx);
    case 'addAll': { need(); let ch = false; for (const x of [...a0]) ch = setAdd(s, x, ctx) || ch; return ch; }
    case 'removeAll': { need(); let ch = false; for (const x of [...a0]) ch = setRemove(s, x, ctx) || ch; return ch; }
    case 'retainAll': {
      need();
      let ch = false;
      for (const x of [...s]) if (!a0.some(y => ctx.equals(x, y))) ch = setRemove(s, x, ctx) || ch;
      return ch;
    }
    case 'clear': need(); mapClear(own); s.length = 0; return VOID;
    case 'forEach': nn(a0); for (const x of [...s]) ctx.call(a0, [x], 'accept'); return VOID;
    case 'removeIf': {
      need(); nn(a0);
      let ch = false;
      for (const x of [...s]) if (ctx.call(a0, [x], 'test')) ch = setRemove(s, x, ctx) || ch;
      return ch;
    }
    case 'first': if (!s.length) throw noSuch(); return s[0];
    case 'last': if (!s.length) throw noSuch(); return s[s.length - 1];
    case 'toString': return S(setString(s, ctx));
    case 'equals': return setEquals(s, a0, ctx);
    case 'hashCode': return setHashCode(s, ctx);
  }
  return undefined;
}

/** Map.Entry のメソッド */
export function callEntryMethod(e, name, args, ctx) {
  switch (name) {
    case 'getKey': return e.key;
    case 'getValue': return e.value;
    case 'setValue': { if (e.__immutable) throw new JavaError('UnsupportedOperationException', 'not supported'); const old = e.value; e.value = args[0]; return old; }
    case 'toString': return S(entryString(e, ctx));
    case 'equals': return entryEquals(e, args[0], ctx);
    case 'hashCode': return entryHash(e, ctx);
  }
  return undefined;
}

/** void のメソッドの戻り値の印（undefined は「メソッドが見つからない」に使うため） */
export const VOID = Symbol.for('java.void');

// ── Map.of・Set.of・Map.entry ────────────────────────────────────────────────

export function createMapBuiltins() {
  return new Map([
    ['Map', new JBuiltin('Map', {
      of: (args, ctx) => {
        const m = newMap('Map');
        for (let i = 0; i < args.length; i += 2) {
          if (args[i] === null || args[i + 1] === null) throw new JavaError('NullPointerException', null);
          if (findEntry(m, args[i], ctx)) throw new JavaError('IllegalArgumentException', `duplicate key: ${ctx.str(args[i])}`);
          m.entries.push(immutableEntry(args[i], args[i + 1]));
        }
        return m;
      },
      entry: ([k, v]) => {
        if (k === null || v === null) throw new JavaError('NullPointerException', null);
        return immutableEntry(k, v);
      },
    }, 'java.util')],
    ['Set', new JBuiltin('Set', {
      of: (args, ctx) => {
        const s = newSet('Set');
        for (const x of args) {
          if (x === null) throw new JavaError('NullPointerException', null);
          if (setContains(s, x, ctx)) throw new JavaError('IllegalArgumentException', `duplicate element: ${ctx.str(x)}`);
          s.__jsetMap.entries.push(newEntry(x, true, 0, s.__jsetMap.__t.seq++));
          s.push(x);
        }
        return s;
      },
    }, 'java.util')],
  ]);
}
