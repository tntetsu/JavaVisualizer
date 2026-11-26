/**
 * objects.js — クラス・インスタンス・例外（ADR-002）
 *
 * | Java | 表現 |
 * |---|---|
 * | クラス | JClass（JS のクラスのインスタンス。スナップショットでは参照を保持する） |
 * | インスタンス | { __type__: 'JObject', cls, fields: {…} }（fields はその時点の値としてスナップショットに残る） |
 * | 例外 | 例外のクラスのインスタンス（fields.message に getMessage() の値） |
 *
 * static フィールドは、グローバルのスコープに「クラス名.フィールド名」の名前で置く（ADR-002。Phase 0 の仮の置き場所）。
 */
import { JavaError, makeString, isString } from './values.js';

export class JClass {
  /**
   * @param {string} name
   * @param {JClass|null} superClass
   * @param {{ builtin?: boolean, node?: object, pkg?: string }} [opts]
   */
  constructor(name, superClass = null, { builtin = false, node = null, pkg = null } = {}) {
    this.name = name;
    this.superClass = superClass;
    this.builtin = builtin;
    this.node = node;
    this.pkg = pkg;                 // 'java.lang' など（例外の表示で使う）
    this.fields = [];               // { name, type, static, init, node }
    this.methods = new Map();       // name → Method[]
    this.ctors = [];                // Method[]
    this.initialized = false;       // static フィールドの初期化が済んだか
    this.kind = 'class';            // 'class' | 'interface' | 'enum'（ADR-008）
    this.abstract = false;          // 抽象クラス・インターフェース
    this.interfaces = [];           // JClass[]（implements・インターフェースの extends）
    this.outer = null;              // 入れ子の型なら外側の型の名前（Main.Color）
    this.constants = [];            // enum の定数（JObject。初期化のときに作る）
  }
  /** 例外のメッセージなどに使う名前（java.lang.ArithmeticException・Main.Color） */
  get qualifiedName() { return this.pkg ? `${this.pkg}.${this.name}` : this.outer ? `${this.outer}.${this.name}` : this.name; }
  toString() { return `class ${this.name}`; }
}

export const isClass = (v) => v instanceof JClass;
export const isJObject = (v) => v !== null && typeof v === 'object' && v.__type__ === 'JObject';

/** c が base（クラスかインターフェース）の下にあるか（継承と実装をたどる） */
export function isSubclassOf(c, base) {
  for (let k = c; k; k = k.superClass) {
    if (k === base) return true;
    if (k.interfaces.some(i => isSubclassOf(i, base))) return true;
  }
  return false;
}

/** c が名前 name のクラス・インターフェースの下にあるか（instanceof・キャスト・引数の型） */
export function isSubtypeName(c, name) {
  for (let k = c; k; k = k.superClass) {
    if (k.name === name) return true;
    if (k.interfaces.some(i => isSubtypeName(i, name))) return true;
  }
  return false;
}

/** クラスとその上のクラス・インターフェースを、近い順に並べる（メソッドを探す順） */
export function lookupOrder(cls) {
  const out = [];
  const seen = new Set();
  const visitIfaces = (k) => {
    for (const i of k.interfaces) {
      if (seen.has(i)) continue;
      seen.add(i);
      out.push(i);
      visitIfaces(i);
    }
  };
  for (let k = cls; k; k = k.superClass) { if (!seen.has(k)) { seen.add(k); out.push(k); } }
  for (let k = cls; k; k = k.superClass) visitIfaces(k);
  return out;
}

/** クラスの階層をたどって、インスタンスのフィールドの宣言を集める（上のクラスから順に） */
export function instanceFields(cls) {
  const chain = [];
  for (let k = cls; k; k = k.superClass) chain.unshift(k);
  return chain.flatMap(k => k.fields.filter(f => !f.static));
}

/** static フィールドの宣言を、クラスの階層をたどって探す */
export function findStaticField(cls, name) {
  // クラスの階層と、実装しているインターフェースの定数（ADR-008）
  for (const k of lookupOrder(cls)) {
    const f = k.fields.find(x => x.static && x.name === name);
    if (f) return { cls: k, field: f };
  }
  return null;
}

export function hasInstanceField(cls, name) {
  return instanceFields(cls).some(f => f.name === name);
}

/** メソッドを探す（クラスの階層をたどる）。name の候補をすべて返す（オーバーロードは呼ぶ側で選ぶ） */
export function findMethods(cls, name) {
  const out = [];
  const seen = new Set();
  // クラスの階層を先に、インターフェース（default メソッド・抽象メソッド）をあとに探す
  for (const k of lookupOrder(cls)) {
    for (const m of k.methods.get(name) ?? []) {
      const sig = m.paramTypes.join(',');
      if (seen.has(sig)) continue;   // 下のクラスのオーバーライドを優先
      seen.add(sig);
      out.push(m);
    }
  }
  return out;
}

export function makeObject(cls) {
  return { __type__: 'JObject', cls, fields: {} };
}

// ── 組み込みの例外のクラス ────────────────────────────────────────────────────

const lang = (name, sup) => new JClass(name, sup, { builtin: true, pkg: 'java.lang' });

export const ObjectClass = lang('Object', null);
const Throwable = lang('Throwable', ObjectClass);
const Exception = lang('Exception', Throwable);
const ErrorCls = lang('Error', Throwable);
const RuntimeException = lang('RuntimeException', Exception);
const IllegalArgumentException = lang('IllegalArgumentException', RuntimeException);
const IndexOutOfBoundsException = lang('IndexOutOfBoundsException', RuntimeException);

const NoSuchElementException = new JClass('NoSuchElementException', RuntimeException, { builtin: true, pkg: 'java.util' });

/** 組み込みのインターフェース Comparable（自作のクラスが implements Comparable<T> で使う。ADR-008） */
const Comparable = new JClass('Comparable', null, { builtin: true, pkg: 'java.lang' });
Comparable.kind = 'interface';
Comparable.abstract = true;

/** 組み込みのクラス（例外など）。名前 → JClass */
export const BUILTIN_CLASSES = new Map([
  ObjectClass, Throwable, Exception, ErrorCls, RuntimeException, IllegalArgumentException, IndexOutOfBoundsException,
  lang('ArithmeticException', RuntimeException),
  lang('ArrayIndexOutOfBoundsException', IndexOutOfBoundsException),
  lang('StringIndexOutOfBoundsException', IndexOutOfBoundsException),
  lang('NullPointerException', RuntimeException),
  lang('ClassCastException', RuntimeException),
  lang('NegativeArraySizeException', RuntimeException),
  lang('IllegalStateException', RuntimeException),
  lang('UnsupportedOperationException', RuntimeException),
  lang('NumberFormatException', IllegalArgumentException),
  lang('StackOverflowError', ErrorCls),
  NoSuchElementException,
  Comparable,
  new JClass('InputMismatchException', NoSuchElementException, { builtin: true, pkg: 'java.util' }),
  new JClass('ConcurrentModificationException', RuntimeException, { builtin: true, pkg: 'java.util' }),
].map(c => [c.name, c]));

export const isThrowableClass = (c) => isSubclassOf(c, Throwable);
export const isThrowable = (v) => isJObject(v) && isThrowableClass(v.cls);

/** 例外のオブジェクトを作る（message は JS の文字列か null） */
export function makeThrowable(cls, message) {
  const o = makeObject(cls);
  o.fields.message = message === null || message === undefined ? null : makeString(message);
  return o;
}

/** 例外の getMessage() の JS の文字列（null なら null） */
export function throwableMessage(exc) {
  const m = exc.fields.message;
  return isString(m) ? m.s : null;
}

/** Java が例外の toString() で書く形（java.lang.ArithmeticException: / by zero） */
export function throwableString(exc) {
  const msg = throwableMessage(exc);
  return msg === null ? exc.cls.qualifiedName : `${exc.cls.qualifiedName}: ${msg}`;
}

/** Java の例外を JS の例外として投げるための入れ物 */
export class JThrow extends Error {
  constructor(exc, loc) {
    super(throwableString(exc));
    this.name = 'JThrow';
    this.exc = exc;
    this.loc = loc;
  }
}

/** エンジンの JavaError（ArithmeticException など）や JThrow を、Java の例外のオブジェクトにする。Java の例外でなければ null */
export function toJavaException(err) {
  if (err instanceof JThrow) return err.exc;
  if (err instanceof JavaError) {
    if (err.exc) return err.exc;
    const cls = BUILTIN_CLASSES.get(err.cls);
    if (!cls) throw new Error(`unknown exception class ${err.cls}`);
    const exc = makeThrowable(cls, err.javaMessage);
    // 同じ JavaError を 2 回変換しても、同じ例外のオブジェクトになるようにする
    Object.defineProperty(err, 'exc', { value: exc });
    return exc;
  }
  return null;
}

/** enum の定数か（ADR-008） */
export const isEnumConstant = (v) => isJObject(v) && v.__enum !== undefined;
