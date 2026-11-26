/**
 * values.js — Java の値の表現・表示・型の変換（ADR-002）
 *
 * | Java | 表現 |
 * |---|---|
 * | int・short・byte | JS の number（演算のたびに 32 ビットに切り詰める。short・byte は代入のときに切り詰める） |
 * | long | BigInt（64 ビットに切り詰める） |
 * | double | JDouble（{ v }。int と区別するための印付きの数。スナップショットでは参照を保持する＝不変） |
 * | char | JChar（{ code }。不変） |
 * | boolean | JS の boolean |
 * | String | JString（{ s }。不変。同一性を持つので == と equals の違いが出る。リテラルは実行ごとに共有＝intern） |
 * | 配列 | JS の配列＋列挙されない印 __jelem（要素の型の文字列。'int'・'int[]'・'String'） |
 * | クラスのインスタンス | { __type__: 'JObject', cls, fields: {…} }（objects.js） |
 * | null | JS の null |
 */
import { registerEnglish } from './messages-en.js';

export class JavaError extends Error {
  /**
   * エンジンの中で起きた、Java の例外になる誤り（ArithmeticException など）。評価器が Java の例外のオブジェクトに変える。
   * @param {string} cls 例外のクラスの名前（'ArithmeticException'）
   * @param {string|null} message Java の getMessage() の文面（本物の Java と同じ英語）
   * @param {object} [loc]
   */
  constructor(cls, message, loc) {
    super(message ?? cls);
    this.name = 'JavaError';
    this.cls = cls;
    this.javaMessage = message;
    this.loc = loc;
  }
}

/** コンパイルエラー（静的な検査で見つけた誤り）。javac は本物の javac の文面 */
export class JavaCompileError extends Error {
  /**
   * @param {string} message 日本語の説明
   * @param {string|null} javac 本物の javac の文面（英語表示で使う。ADR-006）
   */
  constructor(message, loc, javac = null) {
    super(`コンパイルエラー（${loc?.line ?? '?'}行目）: ${message}`);
    registerEnglish(this.message, `Compile error (line ${loc?.line ?? '?'}): ${javac ?? message}`);
    this.name = 'CompileError';
    this.loc = loc;
    this.line = loc?.line;
    this.javac = javac;
  }
}

// ── 値の種類 ──────────────────────────────────────────────────────────────────

export class JDouble {
  constructor(v) { this.v = v; }
  toString() { return doubleToString(this.v); }
}
export class JChar {
  constructor(code) { this.code = code & 0xffff; }
  toString() { return String.fromCharCode(this.code); }
}
export class JString {
  constructor(s) { this.s = s; }
  toString() { return this.s; }
}

export const makeDouble = (v) => new JDouble(v);
export const makeChar = (c) => new JChar(c);
export const makeString = (s) => new JString(s);

export const isInt = (v) => typeof v === 'number';
export const isLong = (v) => typeof v === 'bigint';
export const isDouble = (v) => v instanceof JDouble;
export const isChar = (v) => v instanceof JChar;
export const isBool = (v) => typeof v === 'boolean';
export const isString = (v) => v instanceof JString;
/** Java の配列（ArrayList などのリストは含まない） */
export const isArray = (v) => Array.isArray(v) && v.__jlist === undefined;
/** ArrayList・List.of のリスト（JS の配列＋列挙されない印 __jlist。ADR-007） */
export const isList = (v) => Array.isArray(v) && v.__jlist !== undefined;
export const isObject = (v) => v !== null && typeof v === 'object' && v.__type__ === 'JObject';
/** 数値の型（char を含む。boolean は含まない） */
export const isNumeric = (v) => isInt(v) || isLong(v) || isDouble(v) || isChar(v);

/** JS の数値にする（表示・色分け・棒の長さ用） */
export function num(v) {
  if (typeof v === 'number') return v;
  if (typeof v === 'bigint') return Number(v);
  if (v instanceof JDouble) return v.v;
  if (v instanceof JChar) return v.code;
  return NaN;
}

// ── 型 ────────────────────────────────────────────────────────────────────────

export const PRIMITIVES = new Set(['int', 'long', 'short', 'byte', 'double', 'float', 'char', 'boolean']);
export const isPrimitiveType = (t) => PRIMITIVES.has(t);
export const isArrayType = (t) => typeof t === 'string' && t.endsWith('[]');
export const elemTypeOf = (t) => t.slice(0, -2);

/** 型の既定値（フィールド・配列の要素） */
export function defaultValue(t) {
  switch (t) {
    case 'int': case 'short': case 'byte': return 0;
    case 'long': return 0n;
    case 'double': case 'float': return makeDouble(0);
    case 'char': return makeChar(0);
    case 'boolean': return false;
  }
  return null;
}

/** 実行時の値の型の名前（メッセージ用） */
export function typeName(v) {
  if (v === null) return 'null';
  if (isInt(v)) return 'int';
  if (isLong(v)) return 'long';
  if (isDouble(v)) return 'double';
  if (isChar(v)) return 'char';
  if (isBool(v)) return 'boolean';
  if (isString(v)) return 'String';
  if (isList(v)) return v.__jlistElem ? `ArrayList<${v.__jlistElem}>` : 'ArrayList';
  if (isArray(v)) return `${v.__jelem}[]`;
  if (isObject(v)) return v.cls.name;
  return typeof v;
}

/** 配列を作る（要素の型の印を付ける） */
export function makeArray(elemType, items) {
  const a = [...items];
  Object.defineProperty(a, '__jelem', { value: elemType, enumerable: false, writable: true });
  return a;
}

/**
 * リストを作る（ArrayList。ADR-007）。kind は 'ArrayList'（変更できる）か 'List'（List.of。変更できない）、
 * elemType は要素の型（'Integer'・'String'。分からなければ null）
 */
export function makeList(items, { kind = 'ArrayList', elemType = null } = {}) {
  const a = [...items];
  Object.defineProperty(a, '__jlist', { value: kind, enumerable: false, writable: true });
  Object.defineProperty(a, '__jlistElem', { value: elemType, enumerable: false, writable: true });
  return a;
}

/** スナップショットのクローン（配列の要素の型・リストの印を保つ。共通コアの createCloner に渡す） */
export function javaCloneHook(v, clone, seen) {
  if (!Array.isArray(v) || (v.__jelem === undefined && v.__jlist === undefined)) return undefined;
  const c = [];
  seen.set(v, c);
  for (const x of v) c.push(clone(x));
  if (v.__jelem !== undefined) Object.defineProperty(c, '__jelem', { value: v.__jelem, enumerable: false });
  if (v.__jlist !== undefined) {
    Object.defineProperty(c, '__jlist', { value: v.__jlist, enumerable: false });
    Object.defineProperty(c, '__jlistElem', { value: v.__jlistElem, enumerable: false });
  }
  return c;
}

// ── 型の文字列（ジェネリクス・ラッパー型。ADR-007） ─────────────────────────────

/** ラッパー型 → プリミティブの型 */
export const BOXES = { Integer: 'int', Long: 'long', Double: 'double', Character: 'char', Boolean: 'boolean', Short: 'short', Byte: 'byte', Float: 'float' };
/** ラッパー型ならプリミティブの型に、そうでなければそのまま（int・Integer → int） */
export const unboxType = (t) => (t && BOXES[t]) || t;
/** プリミティブの型ならラッパー型に（int → Integer） */
export const boxType = (t) => Object.keys(BOXES).find(k => BOXES[k] === t) ?? t;
/** 型引数を除いた型の名前（ArrayList<Integer> → ArrayList） */
export const baseType = (t) => (typeof t === 'string' ? t.replace(/<.*>$/, '') : t);
/** 型引数の並び（Map<String,List<Integer>> → ['String', 'List<Integer>']。なければ []） */
export function typeArgs(t) {
  const m = typeof t === 'string' && t.match(/^[^<]*<(.*)>$/);
  if (!m || m[1] === '') return [];
  const out = [];
  let depth = 0, cur = '';
  for (const c of m[1]) {
    if (c === ',' && depth === 0) { out.push(cur.trim()); cur = ''; continue; }
    if (c === '<') depth++;
    if (c === '>') depth--;
    cur += c;
  }
  out.push(cur.trim());
  return out;
}

// ── 整数の切り詰め ────────────────────────────────────────────────────────────

export const toInt = (x) => x | 0;
export const toLong = (x) => BigInt.asIntN(64, x);

/** double → int（Java の (int) のキャスト：NaN は 0、範囲外は端の値、小数は 0 の方向に切り捨て） */
export function doubleToInt(d) {
  if (Number.isNaN(d)) return 0;
  if (d >= 2147483647) return 2147483647;
  if (d <= -2147483648) return -2147483648;
  return Math.trunc(d) | 0;
}
export function doubleToLong(d) {
  if (Number.isNaN(d)) return 0n;
  if (d >= 9223372036854775807) return 9223372036854775807n;
  if (d <= -9223372036854775808) return -9223372036854775808n;
  return BigInt(Math.trunc(d));
}

/**
 * 値をプリミティブの型 t に変換する（代入・引数・キャスト・複合代入の暗黙のキャスト）。
 * 代入で許されない変換（int x = 3.5 など）は静的な検査（check.js）で先に見つける前提で、ここでは変換だけをする。
 */
export function coerce(v, t) {
  if (v === null || v === undefined) return v;
  switch (t) {
    case 'int':
      if (isInt(v)) return v;
      if (isChar(v)) return v.code;
      if (isLong(v)) return Number(BigInt.asIntN(32, v));
      if (isDouble(v)) return doubleToInt(v.v);
      return v;
    case 'short': return isNumeric(v) ? (coerce(v, 'int') << 16) >> 16 : v;
    case 'byte': return isNumeric(v) ? (coerce(v, 'int') << 24) >> 24 : v;
    case 'long':
      if (isLong(v)) return v;
      if (isInt(v)) return BigInt(v);
      if (isChar(v)) return BigInt(v.code);
      if (isDouble(v)) return doubleToLong(v.v);
      return v;
    case 'double': case 'float':
      if (isDouble(v)) return v;
      if (isNumeric(v)) return makeDouble(num(v));
      return v;
    case 'char':
      if (isChar(v)) return v;
      if (isInt(v)) return makeChar(v);
      if (isLong(v)) return makeChar(Number(BigInt.asUintN(16, v)));
      if (isDouble(v)) return makeChar(doubleToInt(v.v));
      return v;
  }
  return v;
}

// ── 表示 ──────────────────────────────────────────────────────────────────────

/**
 * 正の有限の値を一意に表す最短の 10 進の桁（Java の Double.toString と同じ選び方）。
 * 値 = digits[0].digits[1..] × 10^exp。桁は JS の最短の桁（toExponential()）と同じだが、
 * 最短が 1 桁のときは、2 桁の候補も含めて元の値にいちばん近いものを選ぶ（Double.toString の仕様。4.9E-324）
 * @returns {{ digits: string, exp: number }}
 */
export function shortestDecimal(a) {
  let [mant, expS] = a.toExponential().split('e');
  if (mant.length === 1) {
    const two = a.toExponential(1);
    if (Number(two) === a) [mant, expS] = two.replace(/0e/, 'e').split('e');
  }
  return { digits: mant.replace('.', ''), exp: Number(expS) };
}

/**
 * Java の Double.toString と同じ書き方（JDK 19 以降：一意に戻せる最短の桁）。
 * 桁は JS の最短の桁と同じなので、指数表記にするかどうかと書き方だけを Java に合わせる：
 * 10^-3 以上 10^7 未満は小数で書き（1.0・0.001）、それ以外は 1.0E7・1.0E-4 の形。
 */
export function doubleToString(d) {
  if (Number.isNaN(d)) return 'NaN';
  if (d === Infinity) return 'Infinity';
  if (d === -Infinity) return '-Infinity';
  if (d === 0) return Object.is(d, -0) ? '-0.0' : '0.0';
  const sign = d < 0 ? '-' : '';
  const a = Math.abs(d);
  const { digits, exp } = shortestDecimal(a);
  if (a >= 1e-3 && a < 1e7) {
    if (exp >= 0) {
      const intPart = digits.slice(0, exp + 1).padEnd(exp + 1, '0');
      const frac = digits.slice(exp + 1) || '0';
      return `${sign}${intPart}.${frac}`;
    }
    return `${sign}0.${'0'.repeat(-exp - 1)}${digits}`;
  }
  return `${sign}${digits[0]}.${digits.slice(1) || '0'}E${exp}`;
}

/**
 * String.valueOf と同じ文字列（文字列の連結・println）。オブジェクトの toString は評価器が呼ぶので、
 * ここではユーザー定義の toString を持たないものだけを扱う（objStr に任せる）。
 * @param {(o: object) => string} [objStr] オブジェクト・配列の文字列
 */
export function javaStr(v, objStr) {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'bigint') return v.toString();
  if (typeof v === 'boolean') return String(v);
  if (v instanceof JDouble) return doubleToString(v.v);
  if (v instanceof JChar) return String.fromCharCode(v.code);
  if (v instanceof JString) return v.s;
  if (objStr) return objStr(v);
  return String(v);
}

/** 文字列を Java のリテラルの形で書く（"abc"・'a'。ビューの表示用） */
export function quoteString(s) {
  return '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\t/g, '\\t').replace(/\r/g, '\\r') + '"';
}
export function quoteChar(code) {
  const c = String.fromCharCode(code);
  const esc = { '\n': '\\n', '\t': '\\t', '\r': '\\r', "'": "\\'", '\\': '\\\\', '\0': '\\u0000' }[c];
  return `'${esc ?? c}'`;
}

/** ビューに見せる書き方（スカラー） */
export function literalOf(v) {
  if (v === null || v === undefined) return 'null';
  if (v instanceof JString) return quoteString(v.s);
  if (v instanceof JChar) return quoteChar(v.code);
  return javaStr(v);
}
