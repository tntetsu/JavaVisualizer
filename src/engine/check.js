/**
 * check.js — 静的な検査（コンパイルエラー。Phase 0 スパイク、ADR-004）
 *
 * 実行の前に、すべてのメソッドの本体を型を推論しながらたどり、入門でよく出るコンパイルエラーを見つける：
 * - 宣言していない変数・メソッド・クラス（cannot find symbol）
 * - 型の合わない代入・初期化・return・引数（incompatible types：int x = 3.5; String s = 1; int n = "1";）
 * - 条件が boolean でない（if (x = 1)）
 * - return の忘れ（missing return statement）
 * - static の文脈からインスタンスのメンバーを使う
 *
 * 型が分からない式（まだ表を作っていない組み込みのメソッドなど）は null とし、検査を見送る（誤ってエラーにしない）。
 * 見送るもの（ADR-004）：ジェネリクス、オーバーロードの細かな解決、到達できない文、変数の確実な初期化（実行時に検出）。
 */
import { JavaCompileError, isPrimitiveType, isArrayType, elemTypeOf } from './values.js';
import { BUILTIN_CLASSES, findMethods, instanceFields, findStaticField } from './objects.js';

const err = (ja, loc, javac) => new JavaCompileError(ja, loc, javac);

// ── 型の関係 ──────────────────────────────────────────────────────────────────

const NUMERIC_RANK = { byte: 1, short: 2, char: 2, int: 3, long: 4, float: 5, double: 6 };
const isNumericType = (t) => t in NUMERIC_RANK;

/** プリミティブの拡大変換（JLS 5.1.2） */
function widens(from, to) {
  if (from === to) return true;
  if (!isNumericType(from) || !isNumericType(to)) return false;
  if (to === 'char') return false;
  if (from === 'char') return NUMERIC_RANK[to] >= 3;
  if (to === 'short') return from === 'byte';
  return NUMERIC_RANK[from] < NUMERIC_RANK[to];
}

/** 2 項の数値の演算の結果の型 */
function promote(a, b) {
  if (a === 'double' || b === 'double') return 'double';
  if (a === 'float' || b === 'float') return 'float';
  if (a === 'long' || b === 'long') return 'long';
  return 'int';
}

/** 定数の int の値（定数式の縮小変換のため。分からなければ null） */
function constIntValue(n) {
  if (n.type === 'Literal' && (n.jtype === 'int' || n.jtype === 'char')) return Number(n.value);
  return null;
}

/**
 * 型 from の値を、型 to の変数に入れられるか（代入の変換。JLS 5.2）
 * @param {object} [node] 値の式（定数の縮小変換の判定に使う）
 */
function assignable(from, to, classes, node) {
  if (from === null || to === null || to === 'var') return true;
  if (from === to) return true;
  if (isPrimitiveType(to)) {
    if (widens(from, to)) return true;
    // 定数式の縮小（byte b = 10; char c = 65;）
    const c = node ? constIntValue(node) : null;
    if (c !== null && (from === 'int' || from === 'char')) {
      const range = { byte: [-128, 127], short: [-32768, 32767], char: [0, 65535], int: [-2147483648, 2147483647] }[to];
      if (range && c >= range[0] && c <= range[1]) return true;
    }
    // ボクシング型からの取り出し（Integer → int）は Phase 5
    return false;
  }
  if (from === 'null') return true;
  if (to === 'Object') return true;
  if (isPrimitiveType(from)) {
    const box = { int: 'Integer', long: 'Long', double: 'Double', char: 'Character', boolean: 'Boolean' }[from];
    return box === to;
  }
  if (isArrayType(from) || isArrayType(to)) return from === to;
  // クラスの継承
  for (let k = classes.get(from) ?? BUILTIN_CLASSES.get(from); k; k = k.superClass) if (k.name === to) return true;
  return false;
}

function incompatible(from, to, loc) {
  if (isNumericType(from) && isNumericType(to)) {
    return err(`${from} の値を ${to} の変数に入れると、値が失われるおそれがあります（入れるなら (${to}) でキャストします）`, loc,
      `incompatible types: possible lossy conversion from ${from} to ${to}`);
  }
  return err(`${from} の値は ${to} の変数に入れられません`, loc, `incompatible types: ${from} cannot be converted to ${to}`);
}

// ── 組み込みのメソッドの戻り値の型（分からないものは null） ─────────────────

const STRING_METHODS = {
  length: 'int', charAt: 'char', substring: 'String', indexOf: 'int', lastIndexOf: 'int', equals: 'boolean',
  equalsIgnoreCase: 'boolean', compareTo: 'int', isEmpty: 'boolean', isBlank: 'boolean', contains: 'boolean',
  startsWith: 'boolean', endsWith: 'boolean', toUpperCase: 'String', toLowerCase: 'String', trim: 'String', strip: 'String',
  concat: 'String', repeat: 'String', replace: 'String', toCharArray: 'char[]', split: 'String[]', hashCode: 'int',
  toString: 'String', intern: 'String', formatted: 'String',
};

const STATIC_RETURNS = {
  Math: {
    sqrt: 'double', pow: 'double', cbrt: 'double', floor: 'double', ceil: 'double', sin: 'double', cos: 'double',
    tan: 'double', log: 'double', log10: 'double', exp: 'double', hypot: 'double', atan2: 'double', random: 'double',
    round: (args) => (args[0] === 'float' ? 'int' : 'long'),
    floorDiv: (args) => (args.includes('long') ? 'long' : args.includes(null) ? null : 'int'),
    floorMod: (args) => (args.includes('long') ? 'long' : args.includes(null) ? null : 'int'),
    abs: (args) => (args[0] === null ? null : promote(args[0], 'int')),
    max: (args) => (args.includes(null) ? null : promote(args[0], args[1])),
    min: (args) => (args.includes(null) ? null : promote(args[0], args[1])),
  },
  Integer: { parseInt: 'int', valueOf: 'Integer', toString: 'String', toBinaryString: 'String', toHexString: 'String', compare: 'int', sum: 'int' },
  Double: { parseDouble: 'double', toString: 'String', isNaN: 'boolean', compare: 'int' },
  Character: {
    isDigit: 'boolean', isLetter: 'boolean', isLetterOrDigit: 'boolean', isUpperCase: 'boolean', isLowerCase: 'boolean',
    isWhitespace: 'boolean', toUpperCase: 'char', toLowerCase: 'char', getNumericValue: 'int',
  },
  String: { valueOf: 'String', format: 'String', join: 'String' },
  Arrays: { toString: 'String', sort: 'void', fill: 'void' },
};
const STATIC_FIELDS = {
  Integer: { MAX_VALUE: 'int', MIN_VALUE: 'int' },
  Long: { MAX_VALUE: 'long', MIN_VALUE: 'long' },
  Double: { MAX_VALUE: 'double', MIN_VALUE: 'double', POSITIVE_INFINITY: 'double', NEGATIVE_INFINITY: 'double', NaN: 'double' },
  Math: { PI: 'double', E: 'double' },
  System: { out: 'PrintStream', in: 'InputStream' },
};
const BUILTIN_NAMES = new Set(Object.keys({ ...STATIC_RETURNS, ...STATIC_FIELDS }));

/** Scanner のメソッドの戻り値の型（ADR-005） */
const SCANNER_METHODS = {
  nextInt: 'int', nextLong: 'long', nextDouble: 'double', nextBoolean: 'boolean', next: 'String', nextLine: 'String',
  hasNext: 'boolean', hasNextInt: 'boolean', hasNextDouble: 'boolean', hasNextLine: 'boolean', close: 'void',
};

/** java.util のクラス（import が要る） */
const JAVA_UTIL = new Set(['Scanner', 'Arrays']);

/** import した java.util のクラスの名前（import java.util.*; はすべて） */
function importedUtil(imports) {
  const out = new Set();
  for (const line of imports ?? []) {
    const m = line.match(/^import\s+java\.util\.(\*|\w+)\s*;/);
    if (!m) continue;
    if (m[1] === '*') JAVA_UTIL.forEach(n => out.add(n)); else out.add(m[1]);
  }
  return out;
}

// ── return の忘れ（文が「最後まで進めるか」。JLS 14.22 の簡略版） ───────────

const isTrueLiteral = (n) => n && n.type === 'Literal' && n.jtype === 'boolean' && n.value === true;

/** 文の中に、その文自身を抜ける break があるか（入れ子のループ・switch の break は数えない） */
function hasBreak(n, top = true) {
  if (!n || typeof n !== 'object') return false;
  if (Array.isArray(n)) return n.some(x => hasBreak(x, top));
  if (n.type === 'BreakStatement') return true;
  if (!top && /^(WhileStatement|DoWhileStatement|ForStatement|ForOfStatement|SwitchStatement)$/.test(n.type)) return false;
  for (const k of Object.keys(n)) {
    if (k === 'loc' || k === 'end' || k === 'range') continue;
    if (hasBreak(n[k], false)) return true;
  }
  return false;
}

function canComplete(s) {
  if (!s) return true;
  switch (s.type) {
    case 'ReturnStatement': case 'ThrowStatement': return false;
    case 'BlockStatement': return s.body.every(canComplete);
    case 'IfStatement': return !s.alternate || canComplete(s.consequent) || canComplete(s.alternate);
    case 'WhileStatement': return !isTrueLiteral(s.test) || hasBreak(s.body);
    case 'DoWhileStatement': return (canComplete(s.body) && !isTrueLiteral(s.test)) || hasBreak(s.body);
    case 'ForStatement': return (s.test !== null && !isTrueLiteral(s.test)) || hasBreak(s.body);
    case 'SwitchStatement': {
      if (!s.cases.some(c => c.default)) return true;
      if (s.cases.some(c => hasBreak(c.consequent))) return true;
      if (s.arrow) return s.cases.some(c => c.consequent.every(canComplete));
      const last = s.cases[s.cases.length - 1];
      return last.consequent.every(canComplete);
    }
    case 'TryStatement':
      if (s.finalizer && !canComplete(s.finalizer)) return false;
      return canComplete(s.block) || s.handlers.some(h => canComplete(h.body));
  }
  return true;
}

// ── 型の推論 ──────────────────────────────────────────────────────────────────

class Locals {
  constructor(parent = null) { this.parent = parent; this.vars = new Map(); }
  get(name) { for (let s = this; s; s = s.parent) if (s.vars.has(name)) return s.vars.get(name); return undefined; }
}

/**
 * プログラム全体を検査する。誤りがあれば最初の 1 つを JavaCompileError として投げる。
 * @param {object} ast
 * @param {Map<string, import('./objects.js').JClass>} classes
 */
export function check(ast, classes) {
  const imported = importedUtil(ast.imports);
  const needImport = (name, loc) => {
    if (JAVA_UTIL.has(name) && !classes.has(name) && !imported.has(name)) {
      throw err(`${name} を使うには、ファイルの先頭に import java.util.${name}; を書きます`, loc, 'cannot find symbol');
    }
  };
  for (const cls of classes.values()) {
    const fieldCtx = { cls, isStatic: false, method: null };
    for (const f of cls.fields) {
      if (!f.init) continue;
      const t = expr(f.init, new Locals(), { ...fieldCtx, isStatic: f.static });
      if (!assignable(t, f.type, classes, f.init)) throw incompatible(t, f.type, f.init.loc);
    }
    for (const m of [...cls.ctors, ...[...cls.methods.values()].flat()]) {
      const locals = new Locals();
      m.params.forEach((p, i) => locals.vars.set(p, m.paramTypes[i]));
      const ctx = { cls, isStatic: m.static, method: m };
      stmt(m.body, locals, ctx);
      if (m.returnType && m.returnType !== 'void' && canComplete(m.body)) {
        throw err(`メソッド ${m.name} の最後まで進むと、値を返さずに終わってしまいます（return で ${m.returnType} の値を返します）`,
          m.node.bodyEnd, 'missing return statement');
      }
    }
  }

  function knownType(t, loc) {
    const base = t.replace(/(\[\])+$/, '');
    if (base === 'float') throw err('float はまだ対応していません（小数は double を使います）', loc, 'float is not supported yet');
    if (isPrimitiveType(base) || base === 'var' || base === 'void' || base === 'String' || base === 'Object') return;
    if (base === 'Scanner') { needImport(base, loc); return; }
    if (classes.has(base) || BUILTIN_CLASSES.has(base) || ['Integer', 'Long', 'Double', 'Character', 'Boolean'].includes(base)) return;
    throw err(`型 ${base} が見つかりません（クラス名のつづりを確かめてください）`, loc, 'cannot find symbol');
  }

  function cond(n, locals, ctx) {
    const t = expr(n, locals, ctx);
    if (t !== null && t !== 'boolean') {
      const hint = n.type === 'AssignmentExpression' && n.operator === '=' ? '（等しいかを調べるときは「=」ではなく「==」を使います）' : '';
      throw err(`条件には boolean（true か false）になる式を書きます${hint}`, n.loc, `incompatible types: ${t} cannot be converted to boolean`);
    }
  }

  function stmt(s, locals, ctx) {
    if (!s) return;
    switch (s.type) {
      case 'BlockStatement': {
        const inner = new Locals(locals);
        for (const x of s.body) stmt(x, inner, ctx);
        return;
      }
      case 'VariableDeclaration':
        for (const d of s.declarations) {
          knownType(d.varType, d.loc);
          if (locals.get(d.id.name) !== undefined) throw redeclared(d.id.name, d.loc, ctx);
          let t = d.varType;
          if (d.init) {
            const vt = expr(d.init, locals, ctx);
            if (t === 'var') t = vt;
            else if (!assignable(vt, t, classes, d.init)) throw incompatible(vt, t, d.init.loc);
          }
          locals.vars.set(d.id.name, t);
        }
        return;
      case 'ExpressionStatement': expr(s.expression, locals, ctx); return;
      case 'IfStatement': cond(s.test, locals, ctx); stmt(s.consequent, new Locals(locals), ctx); stmt(s.alternate, new Locals(locals), ctx); return;
      case 'WhileStatement': cond(s.test, locals, ctx); stmt(s.body, new Locals(locals), ctx); return;
      case 'DoWhileStatement': stmt(s.body, new Locals(locals), ctx); cond(s.test, locals, ctx); return;
      case 'ForStatement': {
        const inner = new Locals(locals);
        if (s.init) (s.init.type === 'VariableDeclaration' ? stmt(s.init, inner, ctx) : expr(s.init, inner, ctx));
        if (s.test) cond(s.test, inner, ctx);
        if (s.update) expr(s.update, inner, ctx);
        stmt(s.body, new Locals(inner), ctx);
        return;
      }
      case 'ForOfStatement': {
        const ct = expr(s.right, locals, ctx);
        if (ct !== null && !isArrayType(ct)) throw err('拡張 for 文（for (型 変数 : …)）で繰り返せるのは配列だけです', s.right.loc, 'for-each not applicable to expression type');
        const inner = new Locals(locals);
        const et = ct === null ? null : elemTypeOf(ct);
        const vt = s.varType === 'var' ? et : s.varType;
        if (s.varType !== 'var' && !assignable(et, vt, classes)) throw incompatible(et, vt, s.left.loc);
        if (locals.get(s.left.name) !== undefined) throw redeclared(s.left.name, s.left.loc, ctx);
        inner.vars.set(s.left.name, vt);
        stmt(s.body, inner, ctx);
        return;
      }
      case 'SwitchStatement': {
        expr(s.discriminant, locals, ctx);
        const inner = new Locals(locals);
        for (const c of s.cases) for (const x of c.consequent) stmt(x, s.arrow ? new Locals(inner) : inner, ctx);
        return;
      }
      case 'ReturnStatement': {
        const rt = ctx.method?.returnType ?? null;
        if (!s.argument) {
          if (rt && rt !== 'void') throw err(`このメソッドは ${rt} の値を返します（return の後ろに値を書きます）`, s.loc, 'missing return value');
          return;
        }
        const t = expr(s.argument, locals, ctx);
        if (rt === 'void' || (ctx.method && ctx.method.kind === 'constructor')) {
          throw err('void のメソッドからは値を返せません（return; だけを書きます）', s.argument.loc, 'incompatible types: unexpected return value');
        }
        if (!assignable(t, rt, classes, s.argument)) throw incompatible(t, rt, s.argument.loc);
        return;
      }
      case 'ThrowStatement': expr(s.argument, locals, ctx); return;
      case 'TryStatement':
        stmt(s.block, locals, ctx);
        for (const h of s.handlers) {
          h.types.forEach(t => knownType(t, h.loc));
          const inner = new Locals(locals);
          inner.vars.set(h.param.name, h.types.length === 1 ? h.types[0] : 'Exception');
          stmt(h.body, inner, ctx);
        }
        stmt(s.finalizer, locals, ctx);
        return;
    }
  }

  /** 同じメソッドの中で、同じ名前の変数を 2 回宣言した（Locals はメソッドごとに作るので、たどれる範囲がメソッドの中） */
  function redeclared(name, loc, ctx) {
    const m = ctx.method;
    const where = m ? `${m.kind === 'constructor' ? 'constructor' : 'method'} ${m.name}(${m.paramTypes.join(',')})` : `class ${ctx.cls.name}`;
    return err(`変数 ${name} はすでに宣言されています（同じメソッドの中では、別の名前にします）`, loc, `variable ${name} is already defined in ${where}`);
  }

  /** 名前の型（ローカル → フィールド → クラス） */
  function nameType(name, locals, ctx, loc) {
    const lt = locals.get(name);
    if (lt !== undefined) return lt;
    const inst = instanceFields(ctx.cls).find(f => f.name === name);
    if (inst) {
      if (ctx.isStatic) throw err(`static メソッドの中では、インスタンスのフィールド ${name} は使えません`, loc, `non-static variable ${name} cannot be referenced from a static context`);
      return inst.type;
    }
    const sf = findStaticField(ctx.cls, name);
    if (sf) return sf.field.type;
    if (classes.has(name) || BUILTIN_CLASSES.has(name)) return `class:${name}`;
    if (BUILTIN_NAMES.has(name)) { needImport(name, loc); return `builtin:${name}`; }
    throw err(`「${name}」という変数は宣言されていません（つづりと、宣言した場所（{ } の範囲）を確かめてください）`, loc, 'cannot find symbol');
  }

  /** メソッドの呼び出しの戻り値の型 */
  function callType(n, locals, ctx) {
    const argTypes = n.arguments.map(a => expr(a, locals, ctx));
    const c = n.callee;
    if (n.constructorCall) return 'void';
    const userCall = (cls, name, { staticOnly = false, fromStatic = false } = {}) => {
      const cands = findMethods(cls, name).filter(m => !staticOnly || m.static);
      if (!cands.length) {
        throw err(`メソッド ${name} が見つかりません（つづりと、どのクラスのメソッドかを確かめてください）`, c.loc, 'cannot find symbol');
      }
      const ok = cands.filter(m => m.paramTypes.length === argTypes.length
        && m.paramTypes.every((p, i) => assignable(argTypes[i], p, classes, n.arguments[i])));
      if (!ok.length) {
        const m = cands[0];
        throw err(`メソッド ${name} に渡す引数の数か型が合いません（${name}(${m.paramTypes.join(', ')}) に ${argTypes.length} 個の引数（${argTypes.map(t => t ?? '?').join(', ')}）を渡しています）`,
          n.loc, `method ${name} in class ${cls.name} cannot be applied to given types;`);
      }
      if (fromStatic && ok.every(m => !m.static)) {
        throw err(`static メソッドの中から、インスタンスのメソッド ${name} は呼べません`, n.loc,
          `non-static method ${name}(${ok[0].paramTypes.join(',')}) cannot be referenced from a static context`);
      }
      return ok[0].returnType;
    };
    if (c.type === 'Identifier') return userCall(ctx.cls, c.name, { fromStatic: ctx.isStatic });
    const name = c.property.name;
    if (c.object.type === 'Super') return ctx.cls.superClass?.builtin ? null : userCall(ctx.cls.superClass, name);
    const ot = expr(c.object, locals, ctx);
    if (ot === null) return null;
    if (ot.startsWith('builtin:')) {
      const r = STATIC_RETURNS[ot.slice(8)]?.[name];
      return typeof r === 'function' ? r(argTypes) : r ?? null;
    }
    if (ot.startsWith('class:')) {
      const cls = classes.get(ot.slice(6));
      return cls ? userCall(cls, name, { staticOnly: true }) : null;
    }
    if (ot === 'PrintStream') return 'void';
    if (ot === 'Scanner') {
      if (!(name in SCANNER_METHODS)) throw err(`Scanner に ${name}(…) はありません（まだ対応していないメソッドかもしれません）`, c.loc, 'cannot find symbol');
      return SCANNER_METHODS[name];
    }
    if (ot === 'String') return STRING_METHODS[name] ?? null;
    if (isPrimitiveType(ot)) throw err(`${ot} の値にはメソッドがありません（${name}(…) は呼べません）`, c.loc, `${ot} cannot be dereferenced`);
    const cls = classes.get(ot);
    if (cls && findMethods(cls, name).length) return userCall(cls, name);
    return null;
  }

  function expr(n, locals, ctx) {
    if (!n) return null;
    switch (n.type) {
      case 'Literal':
        if (n.jtype === 'float') throw err('float はまだ対応していません（小数は double を使います）', n.loc, 'float is not supported yet');
        return n.jtype;
      case 'Identifier': return nameType(n.name, locals, ctx, n.loc);
      case 'ThisExpression':
        if (ctx.isStatic) throw err('static メソッドの中では this は使えません', n.loc, 'non-static variable this cannot be referenced from a static context');
        return ctx.cls.name;
      case 'BinaryExpression': {
        const a = expr(n.left, locals, ctx), b = expr(n.right, locals, ctx);
        const op = n.operator;
        if (op === '+' && (a === 'String' || b === 'String')) return 'String';
        if (['==', '!=', '<', '>', '<=', '>='].includes(op)) {
          if (op !== '==' && op !== '!=' && a !== null && b !== null && (!isNumericType(a) || !isNumericType(b))) {
            throw err(`「${op}」で比べられるのは数どうしだけです（${a} と ${b}）`, n.loc, `bad operand types for binary operator '${op}'`);
          }
          return 'boolean';
        }
        if (a === null || b === null) return null;
        if ((op === '&' || op === '|' || op === '^') && a === 'boolean' && b === 'boolean') return 'boolean';
        if (!isNumericType(a) || !isNumericType(b)) {
          throw err(`演算子「${op}」は ${a} と ${b} の組み合わせには使えません`, n.loc, `bad operand types for binary operator '${op}'`);
        }
        if (op === '<<' || op === '>>' || op === '>>>') return promote(a, 'int');
        return promote(a, b);
      }
      case 'LogicalExpression': cond(n.left, locals, ctx); cond(n.right, locals, ctx); return 'boolean';
      case 'UnaryExpression': {
        const t = expr(n.argument, locals, ctx);
        if (n.operator === '!') { if (t !== null && t !== 'boolean') throw err('「!」は boolean の値に使います', n.loc, `bad operand type ${t} for unary operator '!'`); return 'boolean'; }
        return t === null ? null : promote(t, 'int');
      }
      case 'UpdateExpression': {
        const t = expr(n.argument, locals, ctx);
        if (t !== null && !isNumericType(t)) throw err(`「${n.operator}」は数の変数に使います`, n.loc, `bad operand type ${t} for unary operator '${n.operator}'`);
        return t;
      }
      case 'AssignmentExpression': {
        const lt = expr(n.left, locals, ctx);
        const rt = expr(n.right, locals, ctx);
        if (n.operator === '=' && !assignable(rt, lt, classes, n.right)) throw incompatible(rt, lt, n.right.loc);
        return lt;
      }
      case 'ConditionalExpression': {
        cond(n.test, locals, ctx);
        const a = expr(n.consequent, locals, ctx), b = expr(n.alternate, locals, ctx);
        // 結果の型（JLS 15.25 の簡略版）。評価器が、選ばれた側の値をこの型に変換する（true ? 1 : 2.0 は 1.0）
        const mark = (t) => { Object.defineProperty(n, 'resultType', { value: t, enumerable: false, configurable: true }); return t; };
        if (a === b) return a;
        if (a && b && isNumericType(a) && isNumericType(b)) {
          // char と、char に収まる int の定数 → char（false ? 'a' : 98 は 'b'）
          for (const [narrow, other, node] of [[a, b, n.alternate], [b, a, n.consequent]]) {
            const c = constIntValue(node);
            const range = { byte: [-128, 127], short: [-32768, 32767], char: [0, 65535] }[narrow];
            if (range && other === 'int' && c !== null && c >= range[0] && c <= range[1]) return mark(narrow);
          }
          return mark(promote(a, b));
        }
        if (a === 'null') return b;
        if (b === 'null') return a;
        return null;
      }
      case 'SequenceExpression': { let t = null; for (const e of n.expressions) t = expr(e, locals, ctx); return t; }
      case 'CallExpression': return callType(n, locals, ctx);
      case 'MemberExpression': {
        if (n.computed) {
          const at = expr(n.object, locals, ctx);
          const it = expr(n.property, locals, ctx);
          if (it !== null && !widens(it, 'int')) throw err('配列の添字には int の値を使います', n.property.loc, `incompatible types: ${it} cannot be converted to int`);
          if (at === null) return null;
          if (!isArrayType(at)) throw err(`${at} は配列ではないので [ ] は使えません`, n.loc, `array required, but ${at} found`);
          return elemTypeOf(at);
        }
        const name = n.property.name;
        if (n.object.type === 'Super') return instanceFields(ctx.cls.superClass).find(f => f.name === name)?.type ?? null;
        const ot = expr(n.object, locals, ctx);
        if (ot === null) return null;
        if (isArrayType(ot)) {
          if (name === 'length') return 'int';
          throw err(`配列に ${name} はありません（長さは length）`, n.loc, 'cannot find symbol');
        }
        if (ot.startsWith('builtin:')) return STATIC_FIELDS[ot.slice(8)]?.[name] ?? null;
        if (ot.startsWith('class:')) {
          const cls = classes.get(ot.slice(6));
          if (!cls) return null;
          const sf = findStaticField(cls, name);
          if (!sf) throw err(`クラス ${cls.name} に static フィールド ${name} はありません`, n.loc, 'cannot find symbol');
          return sf.field.type;
        }
        if (ot === 'String') {
          if (name === 'length') throw err('文字列の長さは length() で調べます（( ) が必要です）', n.loc, 'cannot find symbol');
          return null;
        }
        if (isPrimitiveType(ot)) throw err(`${ot} の値にはフィールドがありません`, n.loc, `${ot} cannot be dereferenced`);
        const cls = classes.get(ot);
        if (!cls) return null;
        const f = instanceFields(cls).find(x => x.name === name) ?? findStaticField(cls, name)?.field;
        if (!f) throw err(`クラス ${cls.name} にフィールド ${name} はありません`, n.loc, 'cannot find symbol');
        return f.type;
      }
      case 'NewExpression': {
        const name = n.callee.name;
        knownType(name, n.callee.loc);
        const argTypes = n.arguments.map(a => expr(a, locals, ctx));
        const cls = classes.get(name);
        if (cls) {
          if (cls.ctors.length === 0 && argTypes.length) {
            throw err(`クラス ${name} のコンストラクタは引数を受け取りません`, n.loc, `constructor ${name} in class ${name} cannot be applied to given types;`);
          }
          if (cls.ctors.length && !cls.ctors.some(m => m.paramTypes.length === argTypes.length
            && m.paramTypes.every((p, i) => assignable(argTypes[i], p, classes, n.arguments[i])))) {
            throw err(`クラス ${name} のコンストラクタに渡す引数の数か型が合いません`, n.loc, `constructor ${name} in class ${name} cannot be applied to given types;`);
          }
        }
        return name;
      }
      case 'NewArrayExpression':
        knownType(n.elemType, n.loc);
        for (const dd of n.dims) {
          const t = expr(dd, locals, ctx);
          if (t !== null && !widens(t, 'int')) throw err('配列の長さには int の値を使います', dd.loc, `incompatible types: possible lossy conversion from ${t} to int`);
        }
        if (n.init) expr(n.init, locals, ctx);
        return `${n.elemType}[]`;
      case 'ArrayExpression':
        for (const e of n.elements) {
          const t = expr(e, locals, ctx);
          if (!assignable(t, n.elemType, classes, e)) throw incompatible(t, n.elemType, e.loc);
        }
        return `${n.elemType}[]`;
      case 'CastExpression': {
        const t = expr(n.argument, locals, ctx);
        knownType(n.targetType, n.loc);
        if (t !== null && isPrimitiveType(n.targetType) !== isPrimitiveType(t) && t !== 'null') {
          if (!(t === 'Object' || n.targetType === 'Object')) {
            throw err(`${t} は ${n.targetType} にキャストできません（文字列と数の変換は Integer.parseInt・String.valueOf を使います）`, n.loc, `incompatible types: ${t} cannot be converted to ${n.targetType}`);
          }
        }
        if (t === 'boolean' && n.targetType !== 'boolean' && isPrimitiveType(n.targetType)) {
          throw err(`boolean は ${n.targetType} にキャストできません`, n.loc, `incompatible types: boolean cannot be converted to ${n.targetType}`);
        }
        return n.targetType;
      }
      case 'InstanceofExpression': expr(n.expression, locals, ctx); knownType(n.targetType, n.loc); return 'boolean';
    }
    return null;
  }
}
