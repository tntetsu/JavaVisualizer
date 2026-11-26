/**
 * interpreter.js — Java の評価器（Phase 0 スパイク）
 *
 * JSInterpreter の共通コア（js-interpreter/core：Recorder・制御シグナル・Scope・クローン）を使い、
 * Java の意味論（型の変換・整数の演算・参照・クラス・例外）だけをここで実装する。
 * 実行時の値の表現は values.js・objects.js（ADR-002）、トレースに足したノード型は ADR-003。
 *
 * プログラムの実行：Program を記録し、その中で最初のクラスの static フィールドを初期化してから main を呼ぶ。
 * main はフレームとして積む（コールスタックに main が出る）。ほかのクラスの static フィールドは、
 * そのクラスを初めて使うとき（new・static メソッド・static フィールド）に初期化する（Java と同じ）。
 */
import {
  Recorder, Scope, createCloner, ReturnSignal, BreakSignal, ContinueSignal,
} from 'js-interpreter/core';
import {
  JavaError, JavaCompileError, makeDouble, makeChar, makeString, makeArray, javaCloneHook,
  isInt, isLong, isDouble, isChar, isBool, isString, isArray, isList, isNumeric, num, makeList, BOXES, baseType,
  coerce, defaultValue, isPrimitiveType, isArrayType, elemTypeOf, javaStr, typeName,
} from './values.js';
import {
  JClass, ObjectClass, BUILTIN_CLASSES, isClass, isJObject, isSubclassOf, isSubtypeName, isEnumConstant, instanceFields, findStaticField,
  hasInstanceField, findMethods, makeObject, makeThrowable, isThrowable, throwableString, JThrow, toJavaException,
} from './objects.js';
import { createBuiltins, isBuiltin, callStringMethod, createScanner } from './builtins.js';
import {
  callListMethod, listString, createCollectionBuiltins, makeStringBuilder, isStringBuilder, callStringBuilderMethod, callWrapperMethod,
} from './collections.js';

const MAX_CALL_DEPTH = 3000;

/** スナップショット用のクローン（配列の要素の型の印を保つ） */
export const cloneValue = createCloner(javaCloneHook);

export function createRecorder(maxSteps = 0) {
  return new Recorder(maxSteps, { clone: cloneValue });
}

/** Java のスコープ。types に宣言した変数の型、ctx（メソッドのスコープだけ）に実行中のクラスと this を持つ */
export class JScope extends Scope {
  constructor(parent = null, kind = 'block', ctx = null) {
    super(parent, kind);
    this.types = new Map();
    this.ctx = ctx;
  }
}

/** switch 式の yield（値を持って switch 式を抜ける） */
class YieldSignal {
  constructor(value) { this.value = value; }
}

const isSignal = (r) => r instanceof ReturnSignal || r instanceof BreakSignal || r instanceof ContinueSignal || r instanceof YieldSignal;

/**
 * switch（文・式）を実行する。当てはまった case から（-> の形はその case だけ）文を実行し、
 * break・yield・return などのシグナルを返す（なければ undefined）
 */
function runSwitch(node, env, rt, d, callDepth) {
  const ev = (n, e = env) => evaluate(n, e, rt, d, callDepth);
  const v = ev(node.discriminant);
  if (v === null) throw npeAt(node.discriminant.loc, 'Cannot invoke "String.hashCode()"', node.discriminant, env, rt);
  // case の値は定数なので、記録せずに評価する。enum の case は定数の名前（case RED:）で比べる
  const same = (t) => {
    if (isEnumConstant(v)) return t.type === 'Identifier' && t.name === v.__enum.name;
    const c = _eval(t, env, rt, d, callDepth);
    return isString(v) ? isString(c) && c.s === v.s : num(c) === num(v);
  };
  let idx = node.cases.findIndex(c => c.tests.some(same));
  if (idx < 0) idx = node.cases.findIndex(c => c.default);
  if (idx < 0) return undefined;
  const senv = new JScope(env, 'block');
  // 当てはまった case を CaseMatch として記録する（「人」のステップが止まる。ADR-003）
  const c0 = node.cases[idx];
  rt.recorder.record({ type: 'CaseMatch', loc: c0.head.loc, end: c0.head.end }, senv, d, callDepth, () => v);
  const last = node.arrow ? idx + 1 : node.cases.length;
  for (let i = idx; i < last; i++) {
    for (const st of node.cases[i].consequent) {
      const r = ev(st, senv);
      if (isSignal(r)) return r;
    }
  }
  return undefined;
}

const compileError = (msg, loc, javac) => new JavaCompileError(msg, loc, javac);
const npe = (loc, msg = null) => new JavaError('NullPointerException', msg, loc);

// ── NullPointerException の詳しいメッセージ（JEP 358。Java 21 を -g 付きでコンパイルしたときと同じ文面。ADR-006） ──

/**
 * null だった式の書き方（"n.next"・"Main.head"・"nodes[i]"・the return value of "Node.getNext()"）。書けなければ null
 * @returns {{ text: string, quoted: boolean }|null}
 */
function describeNull(node, env, rt) {
  switch (node.type) {
    case 'Identifier': {
      const name = node.name;
      if (localScope(name, env)) return { text: name, quoted: true };
      const ctx = ctxOf(env);
      if (ctx.cls && hasInstanceField(ctx.cls, name)) return { text: `this.${name}`, quoted: true };
      const sf = ctx.cls && findStaticField(ctx.cls, name);
      if (sf) return { text: `${sf.cls.name}.${name}`, quoted: true };
      return null;
    }
    case 'ThisExpression': return { text: 'this', quoted: true };
    case 'Literal': return { text: node.raw, quoted: true };
    case 'MemberExpression': {
      if (node.computed) {
        const a = describeNull(node.object, env, rt), i = describeNull(node.property, env, rt);
        return a?.quoted && i?.quoted ? { text: `${a.text}[${i.text}]`, quoted: true } : null;
      }
      if (node.object.type === 'Identifier' && (rt.classes.has(node.object.name)) && !localScope(node.object.name, env)) {
        return { text: `${node.object.name}.${node.property.name}`, quoted: true };
      }
      const o = describeNull(node.object, env, rt);
      return o?.quoted ? { text: `${o.text}.${node.property.name}`, quoted: true } : null;
    }
    case 'CallExpression': {
      const sig = methodDescriptor(node);
      return sig ? { text: `the return value of "${sig}"`, quoted: false } : null;
    }
  }
  return null;
}

/** String のメソッドの引数の型（NullPointerException のメッセージの "String.length()" の形） */
function stringMethodParams(name, argNodes) {
  const n = argNodes.length;
  const charArg = argNodes[0]?.type === 'Literal' && argNodes[0].jtype === 'char';
  switch (name) {
    case 'charAt': case 'repeat': return 'int';
    case 'substring': return n === 2 ? 'int, int' : 'int';
    case 'indexOf': case 'lastIndexOf': return [charArg ? 'int' : 'String', ...(n > 1 ? ['int'] : [])].join(', ');
    case 'equals': return 'Object';
    case 'contains': return 'CharSequence';
    case 'replace': return charArg ? 'char, char' : 'CharSequence, CharSequence';
    case 'formatted': return 'Object[]';
    case 'compareTo': case 'equalsIgnoreCase': case 'startsWith': case 'endsWith': case 'concat': case 'split': return 'String';
  }
  return '';
}

/** 呼び出しの式のメソッドの書き方（"Node.move(int, String)"）。静的な検査が付けた型の印から作る */
function methodDescriptor(node) {
  const recv = node.recvType;
  if (!recv) return null;
  const name = node.callee.type === 'Identifier' ? node.callee.name : node.callee.property.name;
  const params = node.signature !== undefined ? node.signature.split(',').filter(Boolean).join(', ')
    : recv === 'String' ? stringMethodParams(name, node.arguments) : '';
  return `${recv}.${name}(${params})`;
}

/** 「何をしようとしたか」（英語の action）の日本語 */
function actionJa(action) {
  let m;
  if ((m = action.match(/^Cannot read field "(\w+)"$/))) return `フィールド ${m[1]} を読めません`;
  if ((m = action.match(/^Cannot assign field "(\w+)"$/))) return `フィールド ${m[1]} に値を入れられません`;
  if ((m = action.match(/^Cannot invoke "(?:[\w.]+\.)?(\w+)\(.*\)"$/))) return `メソッド ${m[1]}() を呼べません`;
  if (/^Cannot load from/.test(action)) return '配列の要素を読めません';
  if (/^Cannot store to/.test(action)) return '配列の要素に値を入れられません';
  if (action === 'Cannot read the array length') return '配列の長さ（length）を読めません';
  if (action === 'Cannot throw exception') return '例外として投げられません';
  return null;
}

/**
 * NullPointerException を作る。action は「何をしようとしたか」、nullNode は null だった式。
 * 日本語の表示のための説明（「n.next」が null … なので、フィールド value を読めません）を hint に持たせる
 */
function npeAt(loc, action, nullNode, env, rt) {
  const d = nullNode ? describeNull(nullNode, env, rt) : null;
  const e = npe(loc, d ? `${action} because ${d.quoted ? `"${d.text}"` : d.text} is null` : action);
  const what = d ? (d.quoted ? `「${d.text}」` : `メソッド ${d.text.replace(/^the return value of "(.*)"$/, '$1')} の戻り値`) : null;
  const ja = actionJa(action);
  if (what && ja) e.hint = `${what}が null（何も指していない）なので、${ja}`;
  return e;
}

/** 配列の種類（"int array"・"object array"） */
const arrayKind = (arrType) => {
  const e = arrType && arrType.endsWith('[]') ? arrType.slice(0, -2) : null;
  return e && isPrimitiveType(e) ? `${e} array` : 'object array';
};

// ── 実行の準備 ────────────────────────────────────────────────────────────────

/** AST のクラス宣言から JClass を作る */
export function buildClasses(ast) {
  const classes = new Map();
  for (const decl of ast.body) {
    const name = decl.id.name;
    if (classes.has(name)) throw compileError(`クラス ${name} が 2 回宣言されています`, decl.loc, `duplicate class: ${name}`);
    const cls = new JClass(name, null, { node: decl });
    cls.kind = decl.kind ?? 'class';
    cls.abstract = !!decl.abstract;
    cls.outer = decl.outer ?? null;
    classes.set(name, cls);
  }
  for (const cls of classes.values()) {
    const decl = cls.node;
    if (decl.superClass) {
      const sup = classes.get(baseType(decl.superClass.name)) ?? BUILTIN_CLASSES.get(baseType(decl.superClass.name));
      if (!sup) throw compileError(`クラス ${decl.superClass.name} が見つかりません`, decl.superClass.loc, 'cannot find symbol');
      cls.superClass = sup;
    } else cls.superClass = cls.kind === 'interface' ? null : ObjectClass;
    // implements・インターフェースの extends（Comparable は組み込みのインターフェース。ADR-008）
    cls.interfaces = (decl.interfaces ?? []).map(t => {
      const i = classes.get(baseType(t)) ?? BUILTIN_CLASSES.get(baseType(t));
      if (!i) throw compileError(`インターフェース ${baseType(t)} が見つかりません`, decl.loc, 'cannot find symbol');
      return i;
    });
    // enum の定数は、その enum の型の static final フィールド（初期化は ensureInit が定数を作って行う）
    (decl.constants ?? []).forEach((c, ordinal) => {
      cls.fields.push({ name: c.name, type: cls.name, static: true, final: true, init: null, enumConstant: { ...c, ordinal } });
    });
    for (const m of decl.body.body) {
      if (m.type === 'FieldDeclaration') {
        for (const d of m.declarations) {
          cls.fields.push({ name: d.id.name, type: d.varType, static: m.static, final: m.final, init: d.init, node: m, decl: d });
        }
      } else if (m.type === 'MethodDefinition') {
        const method = {
          name: m.kind === 'constructor' ? cls.name : m.key.name,
          kind: m.kind, cls, static: m.static,
          params: m.value.params.map(p => p.name),
          paramTypes: m.value.params.map(p => p.varType),
          returnType: m.returnType,
          throws: m.throws ?? [],
          abstract: !!m.abstract,
          body: m.value.body, node: m,
        };
        if (m.value.body) Object.defineProperty(m.value.body, 'methodBody', { value: true, enumerable: false });
        if (m.kind === 'constructor') cls.ctors.push(method);
        else {
          if (!cls.methods.has(method.name)) cls.methods.set(method.name, []);
          cls.methods.get(method.name).push(method);
        }
      }
    }
  }
  // 継承の循環
  for (const cls of classes.values()) {
    const seen = new Set();
    for (let k = cls; k; k = k.superClass) {
      if (seen.has(k)) throw compileError(`クラス ${cls.name} の継承が循環しています`, cls.node.loc, `cyclic inheritance involving ${cls.name}`);
      seen.add(k);
    }
  }
  return classes;
}

/**
 * 実行時の状態を作る。
 * @param {Recorder} recorder
 * @param {Map<string, JClass>} classes
 */
export function createRuntime(recorder, classes, { stdin = '' } = {}) {
  const rt = {
    input: { text: stdin.replace(/\r\n?/g, '\n'), pos: 0 },   // Scanner が読む入力欄の内容（ADR-005）
    recorder, classes,
    builtins: createBuiltins(),
    global: new JScope(null, 'global'),
    globalTypes: {},   // static フィールド（Main.count）の型。フレームから参照する（画面の型の表示。ADR-002 追記）
    interned: new Map(),
    callCount: 0,
    methodValues: new Map(),   // メソッドの組 → 呼び出し先の値（methodValue）
    nativeValues: new Map(),   // 組み込みのメソッドの名前 → 呼び出し先の値（nativeValue）
    hashes: new WeakMap(),
    nextHash: 0x1b6d3586,
  };
  rt.intern = (s) => {
    if (!rt.interned.has(s)) rt.interned.set(s, makeString(s));
    return rt.interned.get(s);
  };
  // 組み込みのメソッドに渡す道具（String.valueOf・出力）
  rt.bctx = {
    str: (v) => stringOf(v, rt),
    write: (text) => recorder.write(text),
    intern: rt.intern,
    equals: (a, b) => javaEquals(a, b, rt),
    compareTo: (a, b) => javaCompareTo(a, b, rt),
    hashCode: (v) => javaHashCode(v, rt),
  };
  for (const [k, v] of createCollectionBuiltins()) rt.builtins.set(k, v);
  return rt;
}

/** 深さを、直前に記録したイベントから求める（組み込みのメソッドからユーザーの toString を呼ぶとき） */
function currentDepths(rt) {
  const last = rt.recorder.trace[rt.recorder.trace.length - 1];
  return { depth: last ? last.depth + 1 : 0, callDepth: rt.recorder.callStack.length, loc: last?.loc };
}

/** String.valueOf(v)：オブジェクトはユーザーの toString() があれば呼ぶ */
export function stringOf(v, rt) {
  return javaStr(v, (o) => {
    if (isList(o)) return listString(o, rt.bctx);
    if (isStringBuilder(o)) return o.fields.value.s;
    if (isJObject(o)) {
      const m = findMethods(o.cls, 'toString').find(x => x.paramTypes.length === 0 && !x.static);
      if (m) {
        const { depth, callDepth, loc } = currentDepths(rt);
        const r = callMethod(m, o, [], rt, depth, callDepth, loc);
        return r === null ? 'null' : r.s;
      }
      if (isThrowable(o)) return throwableString(o);
      if (isEnumConstant(o)) return o.__enum.name;
      return `${o.cls.qualifiedName.replace(/\.(?=[^.]*$)/, o.cls.outer ? '$' : '.')}@${identityHash(o, rt).toString(16)}`;
    }
    if (isArray(o)) return `${arrayDescriptor(o.__jelem)}@${identityHash(o, rt).toString(16)}`;
    if (isClass(o)) return `class ${o.name}`;
    return String(o);
  });
}

/** Java の equals（ユーザーの equals(Object) があれば呼ぶ。ArrayList の contains・indexOf・remove などで使う） */
export function javaEquals(a, b, rt) {
  if (a === null || b === null) return a === b;
  if (isString(a)) return isString(b) && a.s === b.s;
  if (isList(a)) return callListMethod(a, 'equals', [b], rt.bctx) === true;
  if (isJObject(a)) {
    const m = findMethods(a.cls, 'equals').find(x => !x.static && x.paramTypes.length === 1 && x.paramTypes[0] === 'Object');
    if (m) {
      const { depth, callDepth, loc } = currentDepths(rt);
      return callMethod(m, a, [b], rt, depth, callDepth, loc) === true;
    }
    return a === b;
  }
  if (isStringBuilder(a)) return a === b;
  return callWrapperMethod(a, 'equals', [b], rt.bctx);
}

/** 自作のクラス（Comparable）・enum の compareTo（Collections.sort などの自然な順序。ADR-008） */
export function javaCompareTo(a, b, rt) {
  const m = findMethods(a.cls, 'compareTo').find(x => !x.static && x.paramTypes.length === 1 && x.body);
  if (m) {
    const { depth, callDepth, loc } = currentDepths(rt);
    return callMethod(m, a, [b], rt, depth, callDepth, loc);
  }
  if (isEnumConstant(a) && isEnumConstant(b)) return a.__enum.ordinal - b.__enum.ordinal;
  throw new JavaError('ClassCastException', `class ${a.cls.name} cannot be cast to class java.lang.Comparable`);
}

/** Java の hashCode（String・ラッパー型は本物と同じ値。オブジェクトはユーザーの hashCode() があれば呼ぶ） */
export function javaHashCode(v, rt) {
  if (v === null) return 0;
  if (isString(v)) return callStringMethod(v, 'hashCode', [], rt.bctx);
  if (isInt(v)) return v;
  if (isLong(v)) return Number(BigInt.asIntN(32, v ^ (BigInt.asUintN(64, v) >> 32n)));
  if (isChar(v)) return v.code;
  if (isBool(v)) return v ? 1231 : 1237;
  if (isDouble(v)) {
    const buf = new DataView(new ArrayBuffer(8));
    buf.setFloat64(0, Number.isNaN(v.v) ? NaN : v.v);
    return (buf.getInt32(0) ^ buf.getInt32(4)) | 0;
  }
  if (isList(v)) return callListMethod(v, 'hashCode', [], rt.bctx);
  if (isJObject(v)) {
    const m = findMethods(v.cls, 'hashCode').find(x => !x.static && x.paramTypes.length === 0);
    if (m) {
      const { depth, callDepth, loc } = currentDepths(rt);
      return callMethod(m, v, [], rt, depth, callDepth, loc);
    }
  }
  return identityHash(v, rt);
}

function identityHash(o, rt) {
  if (!rt.hashes.has(o)) { rt.hashes.set(o, rt.nextHash); rt.nextHash = (rt.nextHash * 1103515245 + 12345) & 0x7fffffff; }
  return rt.hashes.get(o);
}

const DESCRIPTORS = { int: 'I', long: 'J', double: 'D', float: 'F', char: 'C', boolean: 'Z', short: 'S', byte: 'B' };
function arrayDescriptor(elem) {
  if (isArrayType(elem)) return `[${arrayDescriptor(elemTypeOf(elem))}`;
  if (DESCRIPTORS[elem]) return `[${DESCRIPTORS[elem]}`;
  return `[L${elem === 'String' || elem === 'Object' ? `java.lang.${elem}` : elem};`;
}

// ── 名前の解決 ────────────────────────────────────────────────────────────────

/** 実行中のメソッドの情報（クラス・this）。メソッドの外（static フィールドの初期化）は scope の ctx */
function ctxOf(env) {
  for (let e = env; e; e = e.parent) if (e.ctx) return e.ctx;
  return { cls: null, thisObj: null, method: null };
}

/** ローカル変数を宣言したスコープ（メソッドの外へは探さない） */
function localScope(name, env) {
  for (let e = env; e && e.kind !== 'global'; e = e.parent) {
    if (e.types.has(name)) return e;
    if (e.kind === 'function') break;
  }
  return null;
}

const staticKey = (cls, name) => `${cls.name}.${name}`;

/**
 * 変数を宣言する（型を記録し、値があれば入れる）。型はメソッドのフレームの varTypes にも書く（画面の型の表示）
 * @param {any} [value] 省略すると、値を入れない（int y; の形）
 */
function declare(env, name, type, ...value) {
  env.types.set(name, type);
  const frame = ctxOf(env).frame;
  if (frame) frame.varTypes[name] = type;
  if (value.length) env.bindings.set(name, value[0]);
}

/** 変数・フィールド・クラスの名前を参照する */
function lookupName(name, env, rt, loc) {
  const s = localScope(name, env);
  if (s) {
    if (!s.bindings.has(name)) throw compileError(`変数 ${name} に値を入れる前に使っています`, loc, `variable ${name} might not have been initialized`);
    return s.bindings.get(name);
  }
  const ctx = ctxOf(env);
  if (ctx.cls) {
    if (hasInstanceField(ctx.cls, name)) {
      if (!ctx.thisObj) throw compileError(`static メソッドの中では、インスタンスのフィールド ${name} は使えません`, loc, `non-static variable ${name} cannot be referenced from a static context`);
      return ctx.thisObj.fields[name];
    }
    const sf = findStaticField(ctx.cls, name);
    if (sf) { ensureInit(sf.cls, rt); return rt.global.bindings.get(staticKey(sf.cls, name)); }
  }
  if (rt.classes.has(name)) return rt.classes.get(name);
  if (rt.builtins.has(name)) return rt.builtins.get(name);
  if (BUILTIN_CLASSES.has(name)) return BUILTIN_CLASSES.get(name);
  throw compileError(`「${name}」という変数は宣言されていません`, loc, 'cannot find symbol');
}

/**
 * 代入の対象。{ get, set, type } を返す。添字・オブジェクトの式は、ここで評価する（右辺より先。Java の評価の順序）
 */
function lvalue(node, env, rt, d, callDepth) {
  const ev = (n) => evaluate(n, env, rt, d, callDepth);
  if (node.type === 'Identifier') {
    const name = node.name;
    const s = localScope(name, env);
    if (s) {
      return {
        type: s.types.get(name),
        get: () => {
          if (!s.bindings.has(name)) throw compileError(`変数 ${name} に値を入れる前に使っています`, node.loc, `variable ${name} might not have been initialized`);
          return s.bindings.get(name);
        },
        set: (v) => s.bindings.set(name, v),
      };
    }
    const ctx = ctxOf(env);
    if (ctx.cls && hasInstanceField(ctx.cls, name)) {
      if (!ctx.thisObj) throw compileError(`static メソッドの中では、インスタンスのフィールド ${name} は使えません`, node.loc, `non-static variable ${name} cannot be referenced from a static context`);
      return fieldLvalue(ctx.thisObj, name);
    }
    const sf = ctx.cls && findStaticField(ctx.cls, name);
    if (sf) return staticLvalue(sf, rt);
    throw compileError(`「${name}」という変数は宣言されていません`, node.loc, 'cannot find symbol');
  }
  if (node.type === 'MemberExpression' && node.computed) {
    const arr = ev(node.object);
    const idx = coerce(ev(node.property), 'int');
    const check = (store) => {
      if (arr === null) throw npeAt(node.loc, `Cannot ${store ? 'store to' : 'load from'} ${arrayKind(node.objType)}`, node.object, env, rt);
      if (idx < 0 || idx >= arr.length) throw new JavaError('ArrayIndexOutOfBoundsException', `Index ${idx} out of bounds for length ${arr.length}`, node.loc);
    };
    return { type: arr?.__jelem, get: () => { check(false); return arr[idx]; }, set: (v) => { check(true); arr[idx] = v; } };
  }
  if (node.type === 'MemberExpression') {
    const name = node.property.name;
    if (node.object.type === 'Super' || node.object.type === 'ThisExpression') {
      const ctx = ctxOf(env);
      if (!ctx.thisObj) throw compileError('static メソッドの中では this は使えません', node.loc, 'non-static variable this cannot be referenced from a static context');
      if (node.object.type === 'ThisExpression') ev(node.object);
      return fieldLvalue(ctx.thisObj, name, node.loc);
    }
    const obj = ev(node.object);
    if (isClass(obj)) {
      const sf = findStaticField(obj, name);
      if (!sf) throw compileError(`クラス ${obj.name} に static フィールド ${name} はありません`, node.loc, 'cannot find symbol');
      return staticLvalue(sf, rt);
    }
    if (obj === null) {
      // 代入（=）なら「代入」、複合代入・++ なら先に読むので「読む」の NullPointerException
      return {
        type: undefined,
        get: () => { throw npeAt(node.loc, `Cannot read field "${name}"`, node.object, env, rt); },
        set: () => { throw npeAt(node.loc, `Cannot assign field "${name}"`, node.object, env, rt); },
      };
    }
    if (isArray(obj) && name === 'length') throw compileError('配列の length には代入できません', node.loc, 'cannot assign a value to final variable length');
    if (!isJObject(obj)) throw compileError(`${typeName(obj)} にフィールド ${name} はありません`, node.loc, 'cannot find symbol');
    return fieldLvalue(obj, name, node.loc);
  }
  throw compileError('ここには代入できません', node.loc, 'unexpected type');
}

function fieldLvalue(obj, name, loc) {
  const f = instanceFields(obj.cls).find(x => x.name === name);
  if (!f) throw compileError(`クラス ${obj.cls.name} にフィールド ${name} はありません`, loc, 'cannot find symbol');
  return { type: f.type, get: () => obj.fields[name], set: (v) => { obj.fields[name] = v; } };
}

function staticLvalue({ cls, field }, rt) {
  ensureInit(cls, rt);
  const key = staticKey(cls, field.name);
  return { type: field.type, get: () => rt.global.bindings.get(key), set: (v) => rt.global.bindings.set(key, v) };
}

// ── クラスの初期化・オブジェクトの生成 ──────────────────────────────────────

/** static フィールドを初期化する（クラスを初めて使うとき。上のクラスから） */
export function ensureInit(cls, rt) {
  if (!cls || cls.builtin || cls.initialized) return;
  cls.initialized = true;
  ensureInit(cls.superClass, rt);
  const statics = cls.fields.filter(f => f.static);
  for (const f of statics) {
    rt.global.bindings.set(staticKey(cls, f.name), defaultValue(f.type));
    rt.global.types.set(staticKey(cls, f.name), f.type);
    rt.globalTypes[staticKey(cls, f.name)] = f.type;
  }
  const env = new JScope(rt.global, 'block', { cls, thisObj: null, method: null });
  const { depth, callDepth } = currentDepths(rt);
  // enum の定数を、書いた順に作る（コンストラクタの引数があれば呼ぶ）。定数ごとにフィールドの初期化として記録する（ADR-008）
  for (const f of statics.filter(x => x.enumConstant)) {
    const c = f.enumConstant;
    rt.recorder.record({ type: 'FieldDeclaration', loc: c.loc, end: null }, env, depth, callDepth, () => {
      const obj = makeObject(cls);
      Object.defineProperty(obj, '__enum', { value: { name: c.name, ordinal: c.ordinal }, enumerable: false });
      for (const fi of instanceFields(cls)) obj.fields[fi.name] = defaultValue(fi.type);
      const args = c.arguments.map(a => evaluate(a, env, rt, depth + 1, callDepth));
      construct(cls, obj, args, rt, depth + 1, callDepth, c.loc);
      cls.constants.push(obj);
      rt.global.bindings.set(staticKey(cls, f.name), obj);
      return obj;
    });
  }
  runFieldInits(cls, true, null, env, rt, depth, callDepth);
}

/** フィールドの初期化子を、FieldDeclaration ごとに記録して実行する（static か、インスタンスか） */
function runFieldInits(cls, isStatic, obj, env, rt, depth, callDepth) {
  const nodes = [...new Set(cls.fields.filter(f => f.static === isStatic && f.init).map(f => f.node))];
  for (const node of nodes) {
    rt.recorder.record(node, env, depth, callDepth, () => {
      for (const f of cls.fields.filter(x => x.node === node && x.init)) {
        const v = assignConvert(evalInit(f.init, env, rt, depth + 1, callDepth), f.type);
        if (isStatic) rt.global.bindings.set(staticKey(cls, f.name), v);
        else obj.fields[f.name] = v;
      }
      return undefined;
    });
  }
}

/** new クラス名(引数) */
function instantiate(cls, args, rt, depth, callDepth, loc, signature) {
  if (cls.builtin) {
    if (isSubclassOf(cls, ObjectClass) && cls !== ObjectClass) return makeThrowable(cls, isString(args[0]) ? args[0].s : null);
    return makeObject(cls);
  }
  ensureInit(cls, rt);
  const obj = makeObject(cls);
  for (const f of instanceFields(cls)) obj.fields[f.name] = defaultValue(f.type);
  construct(cls, obj, args, rt, depth, callDepth, loc, signature);
  return obj;
}

/** コンストラクタを実行する（なければ既定のコンストラクタ：上のクラスの引数なしのコンストラクタとフィールドの初期化） */
function construct(cls, obj, args, rt, depth, callDepth, loc, signature) {
  if (cls.builtin) {
    if (cls !== ObjectClass && isString(args[0])) obj.fields.message = args[0];
    return;
  }
  if (cls.ctors.length === 0) {
    if (args.length) throw compileError(`クラス ${cls.name} のコンストラクタは引数を受け取りません`, loc, `constructor ${cls.name} in class ${cls.name} cannot be applied to given types;`);
    construct(cls.superClass, obj, [], rt, depth, callDepth, loc);
    const env = new JScope(rt.global, 'block', { cls, thisObj: obj, method: null });
    runFieldInits(cls, false, obj, env, rt, depth, callDepth);
    return;
  }
  const c = chooseMethod(cls.ctors, args, loc, cls.name, signature);
  callMethod(c, obj, args, rt, depth, callDepth, loc);
}

// ── メソッドの呼び出し ────────────────────────────────────────────────────────

/** 実行時の値が型 t の引数として渡せるか。渡せるなら「遠さ」（0 = そのまま）、渡せないなら -1 */
function argDistance(v, t) {
  switch (t) {
    case 'int': return isInt(v) ? 0 : isChar(v) ? 1 : -1;
    case 'long': return isLong(v) ? 0 : isInt(v) || isChar(v) ? 1 : -1;
    case 'double': case 'float': return isDouble(v) ? 0 : isNumeric(v) ? 2 : -1;
    case 'char': return isChar(v) ? 0 : -1;
    case 'short': case 'byte': return -1;
    case 'boolean': return isBool(v) ? 0 : -1;
    case 'String': return v === null || isString(v) ? 0 : -1;
    case 'Object': return v === null ? 1 : isJObject(v) || Array.isArray(v) || isString(v) ? 1 : 5;   // プリミティブは包んで渡す
  }
  if (v === null) return isPrimitiveType(t) ? -1 : 0;
  if (isArrayType(t)) return isArray(v) ? 0 : -1;
  // ラッパー型（Integer は int の値を包む）・リスト
  if (BOXES[t]) { const d = argDistance(v, BOXES[t]); return d === 0 ? 1 : -1; }
  if (/^(ArrayList|List)$/.test(baseType(t))) return isList(v) ? 0 : -1;
  if (isJObject(v)) {
    let dist = 0;
    for (let k = v.cls; k; k = k.superClass, dist++) if (k.name === baseType(t)) return dist;
    if (isSubtypeName(v.cls, baseType(t))) return 3;   // インターフェース
  }
  return -1;
}

/** オーバーロードの中から、実行時の引数の型でいちばん近いものを選ぶ（ADR-002 の簡略版） */
function chooseMethod(cands, args, loc, name, signature) {
  // 静的な検査が、引数の宣言の型で選んだメソッド（JLS 15.12.2）。オーバーライドは呼ぶ側が実行時のクラスで選ぶ
  if (signature !== undefined) {
    const m = cands.find(x => x.paramTypes.join(',') === signature);
    if (m) return m;
  }
  let best = null, bestScore = Infinity;
  for (const m of cands) {
    if (m.paramTypes.length !== args.length) continue;
    let score = 0;
    for (let i = 0; i < args.length && score >= 0; i++) {
      const dd = argDistance(args[i], m.paramTypes[i]);
      score = dd < 0 ? -1 : score + dd;
    }
    if (score >= 0 && score < bestScore) { best = m; bestScore = score; }
  }
  if (!best) {
    const types = args.map(typeName).join(',');
    throw compileError(`${name}(${types}) に当てはまるメソッド（引数の数と型）がありません`, loc, `method ${name} cannot be applied to given types;`);
  }
  return best;
}

/** インスタンスのメソッドを、オブジェクトの実際のクラスから探し直す（オーバーライド） */
function dispatch(obj, m) {
  for (let k = obj.cls; k && k !== m.cls; k = k.superClass) {
    const o = (k.methods.get(m.name) ?? []).find(x => !x.static && x.body && x.paramTypes.join(',') === m.paramTypes.join(','));
    if (o) return o;
  }
  return m;
}

/** 値を型 t の変数に入れるための変換（代入の変換。プリミティブの拡大・定数の縮小） */
function assignConvert(v, t) {
  if (t === 'var' || t === undefined) return v;
  if (isPrimitiveType(t)) {
    // null の Integer などを int に入れる（取り出す）と NullPointerException（ADR-007）
    if (v === null) throw new JavaError('NullPointerException', `Cannot unbox null value to ${t}`);
    return coerce(v, t);
  }
  return v;
}

/** ユーザーのメソッド・コンストラクタを呼ぶ */
export function callMethod(m, target, args, rt, depth, callDepth, loc) {
  if (callDepth + 1 > MAX_CALL_DEPTH) throw new JavaError('StackOverflowError', null, loc);
  // フレームに「変数名 → 宣言の型」の表（varTypes）を持たせる。画面がコールスタック・メモリのビューで
  // int x のように型を表示する（言語プロファイルの varType。ADR-002 追記）。表は宣言のたびに足していく
  const frame = { name: m.name, loc: loc || { line: 0, column: 0 }, args: null, callId: 0, varTypes: {}, globalTypes: rt.globalTypes };
  const ctx = { cls: m.cls, thisObj: target, method: m, frame };
  const fenv = new JScope(rt.global, 'function', ctx);
  if (target) declare(fenv, 'this', m.cls.name, target);
  const vals = args.map((a, i) => assignConvert(a, m.paramTypes[i]));
  m.params.forEach((p, i) => declare(fenv, p, m.paramTypes[i], vals[i]));
  const recorder = rt.recorder;
  rt.callCount += 1;
  frame.args = vals.map(a => cloneValue(a));
  frame.callId = rt.callCount;
  recorder.pushFrame(frame, fenv);
  let result;
  try {
    if (m.kind === 'constructor') {
      const first = m.body.body[0];
      const explicit = first?.type === 'ExpressionStatement' && first.expression.constructorCall;
      if (!explicit) {
        // 暗黙の super()：上のクラスのコンストラクタ、続いてこのクラスのフィールドの初期化子
        construct(m.cls.superClass, target, [], rt, depth, callDepth + 1, loc);
        runFieldInits(m.cls, false, target, fenv, rt, depth, callDepth + 1);
      }
    }
    result = evaluate(m.body, fenv, rt, depth, callDepth + 1);
  } finally {
    recorder.popFrame();
  }
  if (result instanceof ReturnSignal) return m.returnType ? assignConvert(result.value, m.returnType) : undefined;
  return undefined;
}

// ── 演算 ──────────────────────────────────────────────────────────────────────

const divZero = (loc) => new JavaError('ArithmeticException', '/ by zero', loc);

/** 数の昇格：2 項の演算の型 */
function promote(a, b) {
  if (isDouble(a) || isDouble(b)) return 'double';
  if (isLong(a) || isLong(b)) return 'long';
  return 'int';
}
const asLong = (v) => (isLong(v) ? v : BigInt(num(v)));

export function binop(op, a, b, loc, rt) {
  if (op === '+' && (isString(a) || isString(b))) return makeString(stringOf(a, rt) + stringOf(b, rt));
  if (op === '==' || op === '!=') {
    let eq;
    if (isNumeric(a) && isNumeric(b)) {
      const t = promote(a, b);
      eq = t === 'long' ? asLong(a) === asLong(b) : num(a) === num(b);
    } else eq = a === b;
    return op === '==' ? eq : !eq;
  }
  if (isBool(a) && isBool(b) && (op === '&' || op === '|' || op === '^')) {
    return op === '&' ? a && b : op === '|' ? a || b : a !== b;
  }
  if (!isNumeric(a) || !isNumeric(b)) {
    throw compileError(`演算子「${op}」は ${typeName(a)} と ${typeName(b)} の組み合わせには使えません`, loc, `bad operand types for binary operator '${op}'`);
  }
  if (op === '<<' || op === '>>' || op === '>>>') {
    const cnt = Number(asLong(b) & 63n);
    if (isLong(a)) {
      const c = BigInt(cnt & 63);
      if (op === '<<') return BigInt.asIntN(64, a << c);
      if (op === '>>') return a >> c;
      return BigInt.asIntN(64, BigInt.asUintN(64, a) >> c);
    }
    const x = num(a), c = cnt & 31;
    if (op === '<<') return x << c;
    if (op === '>>') return x >> c;
    return (x >>> c) | 0;
  }
  const t = promote(a, b);
  if (t === 'double') {
    const x = num(a), y = num(b);
    switch (op) {
      case '+': return makeDouble(x + y);
      case '-': return makeDouble(x - y);
      case '*': return makeDouble(x * y);
      case '/': return makeDouble(x / y);
      case '%': return makeDouble(x % y);
      case '<': return x < y;
      case '>': return x > y;
      case '<=': return x <= y;
      case '>=': return x >= y;
    }
  } else if (t === 'long') {
    const x = asLong(a), y = asLong(b);
    const w = (v) => BigInt.asIntN(64, v);
    switch (op) {
      case '+': return w(x + y);
      case '-': return w(x - y);
      case '*': return w(x * y);
      case '/': if (y === 0n) throw divZero(loc); return w(x / y);
      case '%': if (y === 0n) throw divZero(loc); return w(x % y);
      case '&': return x & y;
      case '|': return x | y;
      case '^': return x ^ y;
      case '<': return x < y;
      case '>': return x > y;
      case '<=': return x <= y;
      case '>=': return x >= y;
    }
  } else {
    const x = num(a), y = num(b);
    switch (op) {
      case '+': return (x + y) | 0;
      case '-': return (x - y) | 0;
      case '*': return Math.imul(x, y);
      case '/': if (y === 0) throw divZero(loc); return (x / y) | 0;
      case '%': if (y === 0) throw divZero(loc); return (x % y) | 0;
      case '&': return x & y;
      case '|': return x | y;
      case '^': return x ^ y;
      case '<': return x < y;
      case '>': return x > y;
      case '<=': return x <= y;
      case '>=': return x >= y;
    }
  }
  throw compileError(`演算子「${op}」は ${typeName(a)} と ${typeName(b)} の組み合わせには使えません`, loc, `bad operand types for binary operator '${op}'`);
}

function unop(op, v, loc) {
  switch (op) {
    case '!':
      if (!isBool(v)) break;
      return !v;
    case '-':
      if (isDouble(v)) return makeDouble(-v.v);
      if (isLong(v)) return BigInt.asIntN(64, -v);
      if (isNumeric(v)) return (-num(v)) | 0;
      break;
    case '+':
      if (isChar(v)) return v.code;
      if (isNumeric(v)) return v;
      break;
    case '~':
      if (isLong(v)) return ~v;
      if (isInt(v) || isChar(v)) return ~num(v);
      break;
  }
  throw compileError(`演算子「${op}」は ${typeName(v)} には使えません`, loc, `bad operand type ${typeName(v)} for unary operator '${op}'`);
}

/** 値が型 t のインスタンスか（instanceof・キャスト） */
function instanceOf(v, t) {
  if (v === null) return false;
  t = baseType(t);
  if (t === 'Object') return true;
  if (t === 'ArrayList' || t === 'List') return isList(v);
  if (t === 'StringBuilder') return isStringBuilder(v);
  if (BOXES[t]) return argDistance(v, BOXES[t]) === 0;
  if (t === 'String') return isString(v);
  if (isArrayType(t)) return isArray(v);
  if (isJObject(v)) return isSubtypeName(v.cls, t);
  return false;
}

/**
 * ラッパー型の値どうしの ==（参照の比較）。自動ボクシングは valueOf を使い、Integer・Long・Short・Byte は -128〜127、
 * Character は 0〜127、Boolean はいつも同じ箱を返す。Double はいつも新しい箱。
 * 同じ箱を 2 つの変数で指す場合（Integer y = x;）は、本物は true だが、ここでは値の箱を持たないので上の規則で決める
 */
function boxedSame(a, b, type) {
  if (a === null || b === null) return a === b;
  switch (type) {
    case 'Boolean': return a === b;
    case 'Character': return a.code === b.code && a.code <= 127;
    case 'Integer': case 'Short': case 'Byte': return a === b && a >= -128 && a <= 127;
    case 'Long': return a === b && a >= -128n && a <= 127n;
  }
  return false;
}

/** 定数式か（リテラルと、その演算・キャストだけでできた式。final の変数は Phase 0 では数えない） */
function isConstantExpression(n) {
  if (n.constant !== undefined) return n.constant;
  let c;
  switch (n.type) {
    case 'Literal': c = n.jtype !== 'null'; break;
    case 'BinaryExpression': case 'LogicalExpression': c = isConstantExpression(n.left) && isConstantExpression(n.right); break;
    case 'UnaryExpression': c = n.operator !== '++' && n.operator !== '--' && isConstantExpression(n.argument); break;
    case 'CastExpression': c = (isPrimitiveType(n.targetType) || n.targetType === 'String') && isConstantExpression(n.argument); break;
    case 'ConditionalExpression': c = isConstantExpression(n.test) && isConstantExpression(n.consequent) && isConstantExpression(n.alternate); break;
    default: c = false;
  }
  Object.defineProperty(n, 'constant', { value: c, enumerable: false });
  return c;
}

// ── 初期化子・配列 ────────────────────────────────────────────────────────────

/** 変数の初期化子を評価する（配列の初期化子 { … } の要素の型は、パーサーが宣言の型から決めてある） */
function evalInit(init, env, rt, d, callDepth) {
  return evaluate(init, env, rt, d, callDepth);
}

function newArray(elemType, sizes, level) {
  const n = sizes[level];
  if (n < 0) throw new JavaError('NegativeArraySizeException', String(n));
  const items = [];
  for (let i = 0; i < n; i++) {
    items.push(level + 1 < sizes.length ? newArray(elemTypeOf(elemType), sizes, level + 1) : defaultValue(elemType));
  }
  return makeArray(elemType, items);
}

// ── try の後始末 ──────────────────────────────────────────────────────────────

/**
 * try の本体で例外が起きたあと、トレースを整える（JSInterpreter の _trimFailedTryBlock・PyVisualizer と同じ方式）。
 * ① 末尾の、完了した子を持たない enter を除き、② 残った enter の matchIdx を catch の先頭（trace.length）にする。
 */
function trimFailedTry(trace, start) {
  if (trace.length <= start) return;
  let tail = trace.length - 1;
  while (tail >= start && trace[tail].matchIdx === -1) tail--;
  trace.length = tail + 1;
  for (let j = start; j < trace.length; j++) if (trace[j].matchIdx === -1) trace[j].matchIdx = trace.length;
}

// ── 評価 ──────────────────────────────────────────────────────────────────────

/**
 * @param {object} node
 * @param {JScope} env
 * @param {object} rt createRuntime() の戻り値
 */
export function evaluate(node, env, rt, depth = 0, callDepth = 0) {
  if (!node) return undefined;
  // 型の名前（System・Math・クラス名）と、そこから組み込みのオブジェクトを取り出すだけの参照（System.out）は、
  // Java では値を持つ式ではないので記録しない（式評価のビューで class System と置き換わらないように。ADR-003 追記）
  if (isTypeReference(node, env, rt)) return _eval(node, env, rt, depth, callDepth);
  return rt.recorder.record(node, env, depth, callDepth, () => _eval(node, env, rt, depth, callDepth));
}

/** 型の名前（変数・フィールドでない、クラス・組み込みのクラスの名前）か */
function isTypeName(node, env, rt) {
  if (node.type !== 'Identifier') return false;
  const name = node.name;
  if (localScope(name, env)) return false;
  const ctx = ctxOf(env);
  if (ctx.cls && (hasInstanceField(ctx.cls, name) || findStaticField(ctx.cls, name))) return false;
  return rt.classes.has(name) || rt.builtins.has(name) || BUILTIN_CLASSES.has(name);
}

/** 記録しない参照：型の名前と、組み込みのクラスの組み込みのオブジェクト（System.out） */
function isTypeReference(node, env, rt) {
  if (node.type === 'Identifier') return isTypeName(node, env, rt);
  if (node.type === 'MemberExpression' && !node.computed && isTypeName(node.object, env, rt)) {
    const b = rt.builtins.get(node.object.name);
    return !!b && isBuiltin(b.members[node.property.name]);
  }
  return false;
}

function _eval(node, env, rt, depth, callDepth) {
  const d = depth + 1;
  const ev = (n, e = env) => evaluate(n, e, rt, d, callDepth);

  switch (node.type) {
    case 'Program': {
      const mainCls = rt.classes.get(node.body[0]?.id.name);
      const main = mainCls && (mainCls.methods.get('main') ?? []).find(m => m.static && m.paramTypes.length === 1 && m.paramTypes[0] === 'String[]');
      if (!main) {
        throw compileError('最初のクラスに public static void main(String[] args) がありません',
          node.body[0]?.loc ?? node.loc, `error: can't find main(String[]) method in class: ${mainCls?.name ?? ''}`);
      }
      ensureInit(mainCls, rt);
      callMethod(main, null, [makeArray('String', [])], rt, d, callDepth, main.node.loc);
      return undefined;
    }

    case 'BlockStatement': {
      // メソッドの本体のブロックは、引数と同じスコープ（Java では本体で引数と同じ名前を宣言できない）
      const benv = node.methodBody ? env : new JScope(env, 'block');
      for (const s of node.body) {
        const r = ev(s, benv);
        if (isSignal(r)) return r;
      }
      return undefined;
    }
    case 'EmptyStatement': return undefined;
    case 'ExpressionStatement': return ev(node.expression);

    case 'VariableDeclaration': {
      for (const decl of node.declarations) {
        const name = decl.id.name;
        if (localScope(name, env)) {
          throw compileError(`変数 ${name} はすでに宣言されています`, decl.loc, `variable ${name} is already defined in method`);
        }
        let t = decl.varType;
        if (decl.init) {
          const v = evalInit(decl.init, env, rt, d, callDepth);
          if (t === 'var') t = typeName(v);
          declare(env, name, t, assignConvert(v, t));
        } else declare(env, name, t);
      }
      return undefined;
    }

    case 'IfStatement':
      if (ev(node.test)) return ev(node.consequent);
      return node.alternate ? ev(node.alternate) : undefined;

    case 'WhileStatement':
      while (ev(node.test)) {
        const r = ev(node.body);
        if (r instanceof BreakSignal) break;
        if (r instanceof ContinueSignal) continue;
        if (isSignal(r)) return r;
      }
      return undefined;

    case 'DoWhileStatement':
      do {
        const r = ev(node.body);
        if (r instanceof BreakSignal) break;
        if (r instanceof ContinueSignal) continue;
        if (isSignal(r)) return r;
      } while (ev(node.test));
      return undefined;

    case 'ForStatement': {
      const fenv = new JScope(env, 'block');
      if (node.init) ev(node.init, fenv);
      for (;;) {
        if (node.test && !ev(node.test, fenv)) break;
        const r = ev(node.body, fenv);
        if (r instanceof BreakSignal) break;
        if (isSignal(r) && !(r instanceof ContinueSignal)) return r;
        if (node.update) ev(node.update, fenv);
      }
      return undefined;
    }

    case 'ForOfStatement': {
      const coll = ev(node.right);
      if (coll === null) throw npeAt(node.right.loc, 'Cannot read the array length', node.right, env, rt);
      if (!Array.isArray(coll)) throw compileError('拡張 for 文（for (型 変数 : …)）で繰り返せるのは配列とリストだけです', node.right.loc, 'for-each not applicable to expression type');
      // 各回のループ変数への代入を LoopBinding として記録する（「人」のステップが各回で止まる。ADR-003）
      const binding = { type: 'LoopBinding', loc: node.left.loc, end: node.left.end };
      for (let i = 0; i < coll.length; i++) {
        const ienv = new JScope(env, 'block');
        const t = node.varType === 'var' ? (coll.__jelem ?? coll.__jlistElem ?? undefined) : node.varType;
        rt.recorder.record(binding, ienv, d, callDepth, () => {
          declare(ienv, node.left.name, t, assignConvert(coll[i], t));
          return ienv.bindings.get(node.left.name);
        });
        const r = ev(node.body, ienv);
        if (r instanceof BreakSignal) break;
        if (r instanceof ContinueSignal) continue;
        if (isSignal(r)) return r;
      }
      return undefined;
    }

    case 'SwitchStatement': {
      const r = runSwitch(node, env, rt, d, callDepth);
      return r instanceof BreakSignal || r instanceof YieldSignal ? undefined : r;
    }
    case 'SwitchExpression': {
      // switch 式：当てはまった case の値（-> の右の式、または yield の値。ADR-008）
      const r = runSwitch(node, env, rt, d, callDepth);
      if (r instanceof YieldSignal) return r.value;
      throw compileError('switch 式が値を出さずに終わりました（yield が必要です）', node.loc, 'switch expression completes without providing a value');
    }
    case 'YieldStatement': return new YieldSignal(ev(node.argument));

    case 'BreakStatement': return new BreakSignal();
    case 'ContinueStatement': return new ContinueSignal();
    case 'ReturnStatement': return new ReturnSignal(node.argument ? ev(node.argument) : undefined);

    case 'ThrowStatement': {
      const exc = ev(node.argument);
      if (exc === null) throw npeAt(node.loc, 'Cannot throw exception', node.argument, env, rt);
      if (!isThrowable(exc)) throw compileError('throw できるのは例外のオブジェクトだけです', node.loc, 'incompatible types');
      throw new JThrow(exc, node.loc);
    }

    case 'TryStatement': {
      const rec = rt.recorder;
      const traceStart = rec.trace.length;
      const savedCurEnv = rec.curEnv;
      const savedStack = rec.callStack.length;
      let result;
      let pending = null;   // finally のあとで投げ直す例外
      try {
        const r = ev(node.block);
        if (isSignal(r)) result = r;
      } catch (err) {
        // ホストの JS のスタックのあふれは、Java の StackOverflowError として捕まえられる（深さは本物より浅い。ADR-002）
        const exc = toJavaException(err)
          ?? (err instanceof RangeError && /call stack|too much recursion/i.test(err.message) ? makeThrowable(BUILTIN_CLASSES.get('StackOverflowError'), null) : null);
        if (!exc) throw err;   // コンパイルエラー・上限超過は catch で捕まえない
        trimFailedTry(rec.trace, traceStart);
        rec.curEnv = savedCurEnv;
        while (rec.callStack.length > savedStack) rec.popFrame();
        pending = err;
        for (const h of node.handlers) {
          const types = h.types.map(t => rt.classes.get(t) ?? BUILTIN_CLASSES.get(t));
          if (types.some(t => !t)) throw compileError(`例外のクラス ${h.types.join(' | ')} が見つかりません`, h.loc, 'cannot find symbol');
          if (!types.some(t => isSubclassOf(exc.cls, t))) continue;
          pending = null;
          const cenv = new JScope(env, 'block');
          // 捕まえた時点（catch の行）を CatchBinding として記録する（「人」のステップが止まる。ADR-003）
          rec.record({ type: 'CatchBinding', loc: h.head.loc, end: h.head.end }, cenv, d, callDepth, () => {
            declare(cenv, h.param.name, h.types.join(' | '), exc);
            return exc;
          });
          try {
            const r = ev(h.body, cenv);
            if (isSignal(r)) result = r;
          } catch (err2) {
            pending = err2;
          }
          break;
        }
      }
      if (node.finalizer) {
        const rf = ev(node.finalizer);
        if (isSignal(rf)) return rf;   // finally の return・break は、例外や前の return より優先する
      }
      if (pending) throw pending;
      return result;
    }

    // ── 式 ────────────────────────────────────────────────────────────────────
    case 'Literal':
      switch (node.jtype) {
        case 'int': {
          const b = BigInt(node.value);
          // 10 進の int のリテラルは 2147483648 まで（-2147483648 のときだけ）。16 進などは 32 ビットの範囲で負の数になる
          if (node.decimal ? b > 2147483647n || b < -2147483648n : b > 0xffffffffn) {
            throw compileError(`整数 ${node.raw} は int の範囲を超えています（long にするなら末尾に L を付けます）`, node.loc, 'integer number too large');
          }
          return Number(BigInt.asIntN(32, b));
        }
        case 'long': return BigInt.asIntN(64, BigInt(node.value));
        case 'double': case 'float': return makeDouble(node.value);
        case 'char': return makeChar(node.value);
        case 'String': return rt.intern(node.value);
        case 'boolean': return node.value;
        case 'null': return null;
      }
      throw new Error(`unknown literal ${node.jtype}`);

    case 'Identifier': return lookupName(node.name, env, rt, node.loc);
    case 'ThisExpression': {
      const ctx = ctxOf(env);
      if (!ctx.thisObj) throw compileError('static メソッドの中では this は使えません', node.loc, 'non-static variable this cannot be referenced from a static context');
      return ctx.thisObj;
    }

    case 'BinaryExpression': {
      const a = ev(node.left);
      const b = ev(node.right);
      // 両側がラッパー型の == は参照の比較。値の箱は持たないので、Integer.valueOf のキャッシュの規則で決める（ADR-007）
      if (node.boxedCompare) return boxedSame(a, b, node.boxedCompare) === (node.operator === '==');
      const r = binop(node.operator, a, b, node.loc, rt);
      // 定数式の文字列（"hel" + "lo"）は、コンパイル時に計算されてリテラルと同じく共有される（JLS 15.29）
      return isString(r) && isConstantExpression(node) ? rt.intern(r.s) : r;
    }
    case 'LogicalExpression': {
      const a = ev(node.left);
      if (node.operator === '&&') return a ? ev(node.right) : false;
      return a ? true : ev(node.right);
    }
    case 'UnaryExpression': return unop(node.operator, ev(node.argument), node.loc);
    case 'UpdateExpression': {
      const lv = lvalue(node.argument, env, rt, d, callDepth);
      const old = lv.get();
      const nv = assignConvert(binop(node.operator === '++' ? '+' : '-', old, 1, node.loc, rt), lv.type);
      lv.set(nv);
      return node.prefix ? nv : old;
    }
    case 'AssignmentExpression': {
      const lv = lvalue(node.left, env, rt, d, callDepth);
      let v;
      if (node.operator === '=') v = assignConvert(ev(node.right), lv.type);
      else {
        const old = lv.get();
        // 複合代入は暗黙のキャストを含む（int x; x += 1.5 は x = (int)(x + 1.5)）
        v = coerce(binop(node.operator.slice(0, -1), old, ev(node.right), node.loc, rt), lv.type);
      }
      lv.set(v);
      return v;
    }
    case 'ConditionalExpression': {
      const v = ev(node.test) ? ev(node.consequent) : ev(node.alternate);
      // 両側の型から決まる結果の型（静的な検査が付けた印）に変換する（true ? 1 : 2.0 は 1.0）
      return node.resultType ? coerce(v, node.resultType) : v;
    }
    case 'SequenceExpression': {
      let r;
      for (const e of node.expressions) r = ev(e);
      return r;
    }

    case 'MemberExpression': {
      if (node.computed) return lvalue(node, env, rt, d, callDepth).get();
      const name = node.property.name;
      if (node.object.type === 'Super') return lvalue(node, env, rt, d, callDepth).get();
      const obj = ev(node.object);
      if (obj === null) {
        const action = name === 'length' && node.objType?.endsWith('[]') ? 'Cannot read the array length' : `Cannot read field "${name}"`;
        throw npeAt(node.loc, action, node.object, env, rt);
      }
      if (isArray(obj)) {
        if (name === 'length') return obj.length;
        throw compileError(`配列に ${name} はありません（長さは length）`, node.loc, 'cannot find symbol');
      }
      if (isBuiltin(obj)) {
        if (!(name in obj.members)) throw compileError(`${obj.name}.${name} はありません`, node.loc, 'cannot find symbol');
        return obj.members[name];
      }
      if (isClass(obj)) return staticLvalue(findStaticField(obj, name) ?? (() => { throw compileError(`クラス ${obj.name} に static フィールド ${name} はありません`, node.loc, 'cannot find symbol'); })(), rt).get();
      if (isJObject(obj)) return fieldLvalue(obj, name, node.loc).get();
      throw compileError(`${typeName(obj)} にフィールド ${name} はありません`, node.loc, 'cannot find symbol');
    }

    case 'CallExpression': return evalCall(node, env, rt, d, callDepth);

    case 'NewExpression': {
      const name = node.callee.name;
      if ((name === 'ArrayList' || name === 'StringBuilder') && !rt.classes.has(name)) {
        const args = node.arguments.map(a => ev(a));
        if (name === 'StringBuilder') return makeStringBuilder(args, rt.bctx);
        // new ArrayList<>()・new ArrayList<>(容量)・new ArrayList<>(別のリスト)。要素の型は静的な検査が付けた印（ADR-007）
        if (args[0] === null) throw new JavaError('NullPointerException', null, node.loc);
        return makeList(Array.isArray(args[0]) ? args[0] : [], { elemType: node.elemType ?? null });
      }
      if (name === 'Scanner' && !rt.classes.has('Scanner')) {
        // new Scanner(System.in)：入力欄の内容を読む（ADR-005）
        node.arguments.forEach(a => ev(a));
        return createScanner(rt.input);
      }
      if (name === 'String' && !rt.classes.has('String')) {
        // new String(…) は、中身が同じでも別のオブジェクト（== が false になる）
        const args = node.arguments.map(a => ev(a));
        if (args.length > 1) throw compileError('new String(…) の引数は 0 個か 1 個です', node.loc, 'no suitable constructor found for String');
        return makeString(args.length ? stringOf(args[0], rt) : '');
      }
      const cls = rt.classes.get(name) ?? BUILTIN_CLASSES.get(name);
      if (!cls) throw compileError(`クラス ${name} が見つかりません`, node.callee.loc, 'cannot find symbol');
      const args = node.arguments.map(a => ev(a));
      return instantiate(cls, args, rt, d, callDepth, node.loc, node.signature);
    }

    case 'NewArrayExpression': {
      if (node.init) return ev(node.init);
      const sizes = node.dims.map(x => coerce(ev(x), 'int'));
      return newArray(node.elemType, sizes, 0);
    }
    case 'ArrayExpression':
      return makeArray(node.elemType, node.elements.map(e => assignConvert(ev(e), node.elemType)));

    case 'CastExpression': {
      const v = ev(node.argument);
      const t = node.targetType;
      if (isPrimitiveType(t)) return coerce(v, t);
      if (v !== null && !instanceOf(v, t)) {
        throw new JavaError('ClassCastException', `class ${typeName(v)} cannot be cast to class ${t}`, node.loc);
      }
      return v;
    }
    case 'InstanceofExpression': {
      const v = ev(node.expression);
      const ok = instanceOf(v, node.targetType);
      // o instanceof String s：当てはまれば s に入れる（今のブロックの変数にする。ADR-008）
      if (ok && node.binding) declare(env, node.binding.name, node.targetType, v);
      return ok;
    }
  }
  throw compileError(`${node.type} はまだ対応していません`, node.loc, `${node.type} is not supported yet`);
}

/** メソッドの呼び出し式 */
function evalCall(node, env, rt, d, callDepth) {
  const ev = (n) => evaluate(n, env, rt, d, callDepth);
  const evArgs = () => node.arguments.map(a => ev(a));
  const callee = node.callee;
  const ctx = ctxOf(env);

  // super(…)・this(…)（コンストラクタの最初の文）
  if (node.constructorCall) {
    const args = evArgs();
    if (callee.type === 'Super') {
      construct(ctx.cls.superClass, ctx.thisObj, args, rt, d, callDepth, node.loc);
      runFieldInits(ctx.cls, false, ctx.thisObj, env, rt, d, callDepth);
    } else {
      callMethod(chooseMethod(ctx.cls.ctors, args, node.loc, ctx.cls.name), ctx.thisObj, args, rt, d, callDepth, node.loc);
    }
    return undefined;
  }

  // 呼び出し先（f・obj.m）を、引数より先に 1 つのイベントとして記録する（ADR-003 追記）。値は、ユーザーのメソッドなら
  // methodValue()（画面がユーザー定義の関数の呼び出しと見なす形）、組み込みのメソッドなら JS の関数。
  // JS・Python と同じく「呼び出しの最初の子が呼び出し先」になるので、置換のビューなどがそのまま使える
  const recordCallee = (fn) => rt.recorder.record(callee, env, d, callDepth, fn);

  // f(…)：同じクラス（と上のクラス）のメソッド
  if (callee.type === 'Identifier') {
    const cands = ctx.cls ? findMethods(ctx.cls, callee.name) : [];
    if (!cands.length) throw compileError(`メソッド ${callee.name} が見つかりません`, callee.loc, 'cannot find symbol');
    recordCallee(() => methodValue(rt, cands));
    const args = evArgs();
    let m = chooseMethod(cands, args, node.loc, callee.name, node.signature);
    if (!m.static) {
      if (!ctx.thisObj) throw compileError(`static メソッドの中から、インスタンスのメソッド ${m.name} は呼べません`, node.loc, `non-static method ${m.name}(${m.paramTypes.join(',')}) cannot be referenced from a static context`);
      m = dispatch(ctx.thisObj, m);
    }
    return callMethod(m, m.static ? null : ctx.thisObj, args, rt, d, callDepth, node.loc);
  }

  const name = callee.property.name;
  // super.m(…)：上のクラスのメソッドを、オーバーライドを経由せずに呼ぶ
  if (callee.object.type === 'Super') {
    const sup = ctx.cls.superClass;
    const cands = sup.builtin ? [] : findMethods(sup, name);
    recordCallee(() => (cands.length ? methodValue(rt, cands) : nativeValue(rt, name)));
    const args = evArgs();
    if (sup.builtin) return objectMethod(ctx.thisObj, name, args, rt, node.loc);
    return callMethod(chooseMethod(cands, args, node.loc, name, node.signature), ctx.thisObj, args, rt, d, callDepth, node.loc);
  }

  let obj;
  recordCallee(() => {
    obj = evaluate(callee.object, env, rt, d + 1, callDepth);
    return calleeValue(obj, name, rt);
  });
  const args = evArgs();
  if (isBuiltin(obj)) {
    const f = obj.members[name];
    if (typeof f !== 'function') throw compileError(`${obj.name}.${name}(…) はありません（まだ対応していないメソッドかもしれません）`, callee.loc, 'cannot find symbol');
    try {
      return f(args, rt.bctx);
    } catch (e) {
      if (e instanceof JavaError && !e.loc) e.loc = node.loc;
      throw e;
    }
  }
  if (isClass(obj)) {
    ensureInit(obj, rt);
    // enum の values()・valueOf(String)（ADR-008）
    if (obj.kind === 'enum' && !findMethods(obj, name).some(x => x.static)) {
      if (name === 'values') return makeArray(obj.name, obj.constants);
      if (name === 'valueOf') {
        const c = isString(args[0]) && obj.constants.find(k => k.__enum.name === args[0].s);
        if (args[0] === null) throw new JavaError('NullPointerException', 'Name is null', node.loc);
        if (!c) throw new JavaError('IllegalArgumentException', `No enum constant ${obj.qualifiedName}.${args[0].s}`, node.loc);
        return c;
      }
    }
    const m = chooseMethod(findMethods(obj, name).filter(x => x.static), args, node.loc, name, node.signature);
    return callMethod(m, null, args, rt, d, callDepth, node.loc);
  }
  if (obj === null) {
    const sig = methodDescriptor(node);
    throw npeAt(node.loc, sig ? `Cannot invoke "${sig}"` : `Cannot invoke "${name}()"`, callee.object, env, rt);
  }
  if (isString(obj)) {
    let r;
    try {
      r = callStringMethod(obj, name, args, rt.bctx);
    } catch (e) {
      if (e instanceof JavaError && !e.loc) e.loc = node.loc;
      throw e;
    }
    if (r === undefined) throw compileError(`String に ${name}(…) はありません（まだ対応していないメソッドかもしれません）`, callee.loc, 'cannot find symbol');
    return r;
  }
  if (isStringBuilder(obj)) {
    let r;
    try { r = callStringBuilderMethod(obj, name, args, rt.bctx); } catch (e) { if (e instanceof JavaError && !e.loc) e.loc = node.loc; throw e; }
    if (r !== undefined || /^(setCharAt|setLength)$/.test(name)) return r;
    return objectMethod(obj, name, args, rt, node.loc);
  }
  if (isJObject(obj)) {
    const cands = findMethods(obj.cls, name).filter(x => !x.static && x.body);
    if (cands.length) return callMethod(dispatch(obj, chooseMethod(cands, args, node.loc, name, node.signature)), obj, args, rt, d, callDepth, node.loc);
    // enum の定数のメソッド（ADR-008）
    if (isEnumConstant(obj)) {
      switch (name) {
        case 'name': return rt.intern(obj.__enum.name);
        case 'ordinal': return obj.__enum.ordinal;
        case 'compareTo': return obj.__enum.ordinal - args[0].__enum.ordinal;
      }
    }
    if (name === 'compareTo' && isSubtypeName(obj.cls, 'Comparable')) return javaCompareTo(obj, args[0], rt);
    return objectMethod(obj, name, args, rt, node.loc);
  }
  if (isArray(obj) && name === 'clone') return makeArray(obj.__jelem, obj);
  // リスト・StringBuilder・ラッパー型（Integer など）のメソッド（ADR-007）
  let r;
  try {
    if (isList(obj)) r = callListMethod(obj, name, args, rt.bctx, node.argTypes);
    else if (isStringBuilder(obj)) r = callStringBuilderMethod(obj, name, args, rt.bctx);
    else if (isNumeric(obj) || isBool(obj)) r = callWrapperMethod(obj, name, args, rt.bctx);
  } catch (e) {
    if (e instanceof JavaError && !e.loc) e.loc = node.loc;
    throw e;
  }
  if (r !== undefined || (isList(obj) && /^(add|clear|sort)$/.test(name)) || (isStringBuilder(obj) && /^(setCharAt|setLength)$/.test(name))) return r;
  throw compileError(`${typeName(obj)} の値に ${name}(…) はありません`, callee.loc, 'cannot find symbol');
}

/**
 * ユーザーのメソッド（同じ名前のオーバーロードの組）を表す値。呼び出し先のイベントの値にする。
 * __type__: 'JSFunction' は、画面がユーザー定義の関数と見なす印（スナップショットでも複製されない）
 */
function methodValue(rt, cands) {
  const key = cands[0];
  if (!rt.methodValues.has(key)) {
    const v = { __type__: 'JSFunction', name: key.name, params: key.params.map(p => ({ type: 'Identifier', name: p })) };
    Object.defineProperty(v, 'javaMethods', { value: cands, enumerable: false });
    rt.methodValues.set(key, v);
  }
  return rt.methodValues.get(key);
}

/** 組み込みのメソッド（String・Object などのメソッド）を表す値（JS の関数。画面はネイティブの関数と見なす） */
function nativeValue(rt, name) {
  if (!rt.nativeValues.has(name)) {
    const f = function native() {};
    Object.defineProperty(f, 'name', { value: name });
    rt.nativeValues.set(name, f);
  }
  return rt.nativeValues.get(name);
}

/** obj.name(…) の呼び出し先の値 */
function calleeValue(obj, name, rt) {
  if (isBuiltin(obj)) return typeof obj.members[name] === 'function' ? obj.members[name] : nativeValue(rt, name);
  if (isClass(obj)) {
    const cands = findMethods(obj, name).filter(x => x.static);
    return cands.length ? methodValue(rt, cands) : nativeValue(rt, name);
  }
  if (isJObject(obj)) {
    const cands = findMethods(obj.cls, name).filter(x => !x.static);
    return cands.length ? methodValue(rt, cands) : nativeValue(rt, name);
  }
  return nativeValue(rt, name);
}

/** Object・Throwable から受け継ぐメソッド */
function objectMethod(obj, name, args, rt, loc) {
  switch (name) {
    case 'toString': return makeString(stringOf(obj, rt));
    case 'equals': return obj === args[0];
    case 'hashCode': return identityHash(obj, rt);
    case 'getMessage': if (isThrowable(obj)) return obj.fields.message; break;
  }
  throw compileError(`クラス ${obj.cls.name} にメソッド ${name} はありません`, loc, 'cannot find symbol');
}
