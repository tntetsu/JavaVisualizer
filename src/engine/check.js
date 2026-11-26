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
import { JavaCompileError, isPrimitiveType, isArrayType, elemTypeOf, BOXES, unboxType, boxType, baseType, typeArgs } from './values.js';
import { BUILTIN_CLASSES, findMethods, instanceFields, findStaticField, isSubtypeName, lookupOrder } from './objects.js';

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
/** コレクションの型どうしの継承（ArrayList は List・Collection の下。ADR-007・ADR-009） */
const COLL_SUPER = {
  ArrayList: ['List', 'Collection'], List: ['Collection'], Collection: [],
  HashSet: ['Set', 'Collection'], LinkedHashSet: ['HashSet', 'Set', 'Collection'], TreeSet: ['Set', 'Collection'], Set: ['Collection'],
  HashMap: ['Map'], LinkedHashMap: ['HashMap', 'Map'], TreeMap: ['Map'], Map: [], Entry: [],
};
const LIST_TYPES = new Set(['ArrayList', 'List']);
const SET_TYPES = new Set(['HashSet', 'LinkedHashSet', 'TreeSet', 'Set', 'Collection']);
const MAP_TYPES = new Set(['HashMap', 'LinkedHashMap', 'TreeMap', 'Map']);
/** 拡張 for で繰り返せるコレクション（リスト・集合・values() の Collection） */
/**
 * 関数型インターフェース（ラムダ式・メソッド参照を入れられる型。ADR-010）：型引数 → 抽象メソッドの名前・引数の型・戻り値の型。
 * 型引数が分からないものは null（検査を見送る）
 */
const FUNCTIONAL = {
  Function: (a) => ({ name: 'apply', params: [a[0]], ret: a[1] }),
  BiFunction: (a) => ({ name: 'apply', params: [a[0], a[1]], ret: a[2] }),
  UnaryOperator: (a) => ({ name: 'apply', params: [a[0]], ret: a[0] }),
  BinaryOperator: (a) => ({ name: 'apply', params: [a[0], a[0]], ret: a[0] }),
  Predicate: (a) => ({ name: 'test', params: [a[0]], ret: 'boolean' }),
  BiPredicate: (a) => ({ name: 'test', params: [a[0], a[1]], ret: 'boolean' }),
  Consumer: (a) => ({ name: 'accept', params: [a[0]], ret: 'void' }),
  BiConsumer: (a) => ({ name: 'accept', params: [a[0], a[1]], ret: 'void' }),
  Supplier: (a) => ({ name: 'get', params: [], ret: a[0] }),
  IntBinaryOperator: () => ({ name: 'applyAsInt', params: ['int', 'int'], ret: 'int' }),
  IntUnaryOperator: () => ({ name: 'applyAsInt', params: ['int'], ret: 'int' }),
  IntPredicate: () => ({ name: 'test', params: ['int'], ret: 'boolean' }),
  IntFunction: (a) => ({ name: 'apply', params: ['int'], ret: a[0] }),
  IntConsumer: () => ({ name: 'accept', params: ['int'], ret: 'void' }),
  ToIntFunction: (a) => ({ name: 'applyAsInt', params: [a[0]], ret: 'int' }),
  ToDoubleFunction: (a) => ({ name: 'applyAsDouble', params: [a[0]], ret: 'double' }),
  DoubleUnaryOperator: () => ({ name: 'applyAsDouble', params: ['double'], ret: 'double' }),
  DoublePredicate: () => ({ name: 'test', params: ['double'], ret: 'boolean' }),
  DoubleConsumer: () => ({ name: 'accept', params: ['double'], ret: 'void' }),
  DoubleBinaryOperator: () => ({ name: 'applyAsDouble', params: ['double', 'double'], ret: 'double' }),
  Runnable: () => ({ name: 'run', params: [], ret: 'void' }),
  Comparator: (a) => ({ name: 'compare', params: [a[0], a[0]], ret: 'int' }),
};
/** java.util.function のインターフェース（import が要る） */
const FUNCTION_PKG = new Set(Object.keys(FUNCTIONAL).filter(k => k !== 'Runnable' && k !== 'Comparator'));
/** 関数型インターフェースの、抽象メソッドでないメソッド（Comparator の reversed など）の戻り値の型 */
const FUNCTIONAL_DEFAULTS = {
  Comparator: { reversed: 'self', thenComparing: 'self', thenComparingInt: 'self', thenComparingDouble: 'self' },
  Predicate: { negate: 'self', and: 'self', or: 'self' },
  BiPredicate: { negate: 'self', and: 'self', or: 'self' },
  Function: { andThen: null, compose: null },
  BiFunction: { andThen: null },
  Consumer: { andThen: 'self' },
};

/**
 * 型 t が関数型インターフェースなら、その抽象メソッドの { name, params, ret }。そうでなければ null。
 * 自作のインターフェースは、抽象メソッドがちょうど 1 つのもの
 */
function fiDescriptor(t, classes) {
  if (!t || typeof t !== 'string') return null;
  const base = baseType(t);
  // 型引数の _ は「分からない」（Stream の map(x -> …) の戻り値の型など。ADR-011）
  if (FUNCTIONAL[base] && !classes.has(base)) return FUNCTIONAL[base](typeArgs(t).map(x => (x === '_' ? null : x ?? null)));
  const cls = classes.get(base);
  if (!cls || cls.kind !== 'interface') return null;
  const abs = lookupOrder(cls).flatMap(k => [...k.methods.values()].flat()).filter(m => !m.body && !m.static);
  if (abs.length !== 1) return null;
  return { name: abs[0].name, params: abs[0].paramTypes, ret: abs[0].returnType };
}

/** ストリーム・Optional の型（ADR-011） */
const STREAM_TYPES = new Set(['Stream', 'IntStream', 'DoubleStream', 'Optional', 'OptionalInt', 'OptionalDouble']);

/** ラムダ式・メソッド参照のノードか */
const isFn = (n) => n && (n.type === 'LambdaExpression' || n.type === 'MethodReference');

/** javac のメッセージの、メソッドの持ち主の書き方（interface Map<K,V>・class HashSet<E>） */
const ownerText = (base) => `${/^(Map|Set|Collection|List)$/.test(base) ? 'interface' : 'class'} ${base}<${MAP_TYPES.has(base) ? 'K,V' : 'E'}>`;
const isIterableType = (t) => t !== null && (LIST_TYPES.has(baseType(t)) || SET_TYPES.has(baseType(t)));

function assignable(from, to, classes, node) {
  if (from === '<lambda>') return to === null || fiDescriptor(to, classes) !== null;   // ラムダ式は関数型インターフェースに入る
  if (from === null || to === null || to === 'var') return true;
  if (from === to) return true;
  if (isPrimitiveType(to)) {
    // ラッパー型からの取り出し（Integer → int・long。アンボクシングのあと拡大変換。ADR-007）
    if (BOXES[from]) return widens(BOXES[from], to);
    if (widens(from, to)) return true;
    // 定数式の縮小（byte b = 10; char c = 65;）
    const c = node ? constIntValue(node) : null;
    if (c !== null && (from === 'int' || from === 'char')) {
      const range = { byte: [-128, 127], short: [-32768, 32767], char: [0, 65535], int: [-2147483648, 2147483647] }[to];
      if (range && c >= range[0] && c <= range[1]) return true;
    }
    return false;
  }
  if (from === 'null') return true;
  if (to === 'Object') return true;
  if (isPrimitiveType(from)) return boxType(from) === to;   // ボクシング（int → Integer）
  if (isArrayType(from) || isArrayType(to)) return from === to;
  // ジェネリクス：型の名前が継承の関係にあり、型引数が同じ（<> や型引数なしはどれとも合う）
  const fb = baseType(from), tb = baseType(to);
  if (fb !== from || tb !== to || COLL_SUPER[fb]) {
    if (!(fb === tb || (COLL_SUPER[fb] ?? []).includes(tb))) return false;
    const fa = typeArgs(from), ta = typeArgs(to);
    return fa.length === 0 || ta.length === 0 || fa.join(',') === ta.join(',');
  }
  // クラスの継承・インターフェースの実装（Comparable<Student> は Comparable として見る）
  const fc = classes.get(baseType(from)) ?? BUILTIN_CLASSES.get(baseType(from));
  return !!fc && isSubtypeName(fc, baseType(to));
}

/** Integer などの式 node を、プリミティブの型 to の値として取り出す所に印を付ける（null なら評価器が NullPointerException にする） */
function markUnbox(node, from, to) {
  if (node && BOXES[from] && isPrimitiveType(to)) {
    Object.defineProperty(node, 'unboxFrom', { value: from, enumerable: false, configurable: true });
  }
}

/**
 * 型の合わない初期化・代入。ジェネリクスのメソッドの結果（stream().map(…)・collect(…)）は、javac が型変数の推論の文面で書く（ADR-011）
 */
function incompatibleValue(from, to, node) {
  const name = node?.type === 'CallExpression' && node.callee.type === 'MemberExpression' ? node.callee.property.name : null;
  if ((name === 'map' || name === 'mapToObj') && from?.startsWith('Stream')) {
    return err(`ストリーム（${from}）は ${to} の変数に入れられません（リストにするには collect(Collectors.toList()) か toList() を使います）`, node.loc,
      `incompatible types: no instance(s) of type variable(s) R exist so that Stream<R> conforms to ${to}`);
  }
  if (name === 'collect' && from && baseType(from) === baseType(to)) {
    return err(`集めた結果（${from}）は ${to} の変数に入れられません（要素の型が違います）`, node.loc, 'incompatible types: inference variable T has incompatible bounds');
  }
  return incompatible(from, to, node.loc);
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
  Integer: { parseInt: 'int', valueOf: 'Integer', toString: 'String', toBinaryString: 'String', toHexString: 'String', compare: 'int', sum: 'int', max: 'int', min: 'int' },
  Double: { parseDouble: 'double', toString: 'String', isNaN: 'boolean', compare: 'int' },
  Character: {
    isDigit: 'boolean', isLetter: 'boolean', isLetterOrDigit: 'boolean', isUpperCase: 'boolean', isLowerCase: 'boolean',
    isWhitespace: 'boolean', toUpperCase: 'char', toLowerCase: 'char', getNumericValue: 'int',
  },
  String: { valueOf: 'String', format: 'String', join: 'String' },
  Arrays: {
    toString: 'String', sort: 'void', fill: 'void',
    stream: (args) => (args[0] === 'int[]' ? 'IntStream' : args[0] === 'double[]' ? 'DoubleStream' : args[0] && isArrayType(args[0]) ? `Stream<${elemTypeOf(args[0])}>` : 'Stream'),
  },
  List: { of: (args) => `List<${args.length && args.every(a => a === args[0]) && args[0] ? boxType(args[0]) : 'Object'}>` },
  Set: { of: (args) => `Set<${args.length && args.every(a => a === args[0]) && args[0] ? boxType(args[0]) : 'Object'}>` },
  Map: {
    of: (args) => {
      const same = (k) => { const ts = args.filter((_, i) => i % 2 === k); return ts.length && ts.every(a => a === ts[0]) && ts[0] ? boxType(ts[0]) : 'Object'; };
      return `Map<${same(0)},${same(1)}>`;
    },
    entry: (args) => `Entry<${args[0] ? boxType(args[0]) : 'Object'},${args[1] ? boxType(args[1]) : 'Object'}>`,
  },
  Stream: {
    of: (args) => `Stream<${args.length && args.every(a => a === args[0]) && args[0] ? boxType(args[0]) : 'Object'}>`,
    iterate: (args) => (args[0] ? `Stream<${boxType(args[0])}>` : 'Stream'), empty: 'Stream',
  },
  IntStream: { range: 'IntStream', rangeClosed: 'IntStream', of: 'IntStream', iterate: 'IntStream' },
  Collectors: {
    toList: 'Collector:toList', toSet: 'Collector:toSet', joining: 'Collector:joining', counting: 'Collector:counting',
    summingInt: 'Collector:summingInt', averagingInt: 'Collector:averagingInt', groupingBy: 'Collector:groupingBy',
    partitioningBy: 'Collector:partitioningBy', toMap: 'Collector:toMap',
  },
  Comparator: {
    comparing: 'Comparator', comparingInt: 'Comparator', comparingDouble: 'Comparator', naturalOrder: 'Comparator', reverseOrder: 'Comparator',
  },
  Collections: {
    reverseOrder: 'Comparator',
    sort: 'void', reverse: 'void', swap: 'void', frequency: 'int',
    max: (args) => (args[0] ? typeArgs(args[0])[0] ?? null : null),
    min: (args) => (args[0] ? typeArgs(args[0])[0] ?? null : null),
  },
};
const STATIC_FIELDS = {
  Integer: { MAX_VALUE: 'int', MIN_VALUE: 'int' },
  Long: { MAX_VALUE: 'long', MIN_VALUE: 'long' },
  Double: { MAX_VALUE: 'double', MIN_VALUE: 'double', POSITIVE_INFINITY: 'double', NEGATIVE_INFINITY: 'double', NaN: 'double' },
  Math: { PI: 'double', E: 'double' },
  System: { out: 'PrintStream', in: 'InputStream' },
};
const BUILTIN_NAMES = new Set(Object.keys({ ...STATIC_RETURNS, ...STATIC_FIELDS }));

/** StringBuilder のメソッドの戻り値の型（ADR-007） */
const SB_METHODS = {
  append: 'StringBuilder', insert: 'StringBuilder', reverse: 'StringBuilder', deleteCharAt: 'StringBuilder', delete: 'StringBuilder',
  toString: 'String', length: 'int', charAt: 'char', setCharAt: 'void', indexOf: 'int', isEmpty: 'boolean', setLength: 'void',
  equals: 'boolean', hashCode: 'int',
};

/** ラッパー型（Integer など）のインスタンスのメソッドの戻り値の型（ADR-007） */
const WRAPPER_METHODS = {
  equals: 'boolean', compareTo: 'int', intValue: 'int', longValue: 'long', doubleValue: 'double', charValue: 'char',
  booleanValue: 'boolean', toString: 'String', hashCode: 'int',
};

/** enum の定数のメソッドの戻り値の型（ADR-008） */
const ENUM_METHODS = { name: 'String', ordinal: 'int', compareTo: 'int', equals: 'boolean', toString: 'String', hashCode: 'int' };

/** Scanner のメソッドの戻り値の型（ADR-005） */
const SCANNER_METHODS = {
  nextInt: 'int', nextLong: 'long', nextDouble: 'double', nextBoolean: 'boolean', next: 'String', nextLine: 'String',
  hasNext: 'boolean', hasNextInt: 'boolean', hasNextDouble: 'boolean', hasNextLine: 'boolean', close: 'void',
};

/** java.util のクラス（import が要る） */
const JAVA_UTIL = new Set(['Scanner', 'Arrays', 'ArrayList', 'List', 'Collections', 'Collection', 'Comparator', 'Optional', 'OptionalInt', 'OptionalDouble',
  'Map', 'HashMap', 'TreeMap', 'LinkedHashMap', 'Set', 'HashSet', 'TreeSet', 'LinkedHashSet']);

/** java.util.stream のクラス（import が要る。ADR-011） */
const STREAM_PKG = new Set(['Stream', 'IntStream', 'DoubleStream', 'Collectors']);

/** import した java.util・java.util.function・java.util.stream のクラスの名前（import java.util.*; はすべて） */
function importedUtil(imports) {
  const out = new Set();
  for (const line of imports ?? []) {
    const m = line.match(/^import\s+java\.util\.(?:(function|stream)\.)?(\*|\w+)\s*;/);
    if (!m) continue;
    const all = m[1] === 'function' ? FUNCTION_PKG : m[1] === 'stream' ? STREAM_PKG : JAVA_UTIL;
    if (m[2] === '*') all.forEach(n => out.add(n)); else out.add(m[2]);
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

/** 文の中に、その文自身に対する continue があるか（入れ子のループの continue は数えない） */
function hasJump(n, type, top = true) {
  if (!n || typeof n !== 'object') return false;
  if (Array.isArray(n)) return n.some(x => hasJump(x, type, top));
  if (n.type === type) return true;
  if (!top && /^(WhileStatement|DoWhileStatement|ForStatement|ForOfStatement)$/.test(n.type)) return false;
  for (const k of Object.keys(n)) {
    if (k === 'loc' || k === 'end' || k === 'range') continue;
    if (hasJump(n[k], type, false)) return true;
  }
  return false;
}

function canComplete(s) {
  if (!s) return true;
  switch (s.type) {
    case 'ReturnStatement': case 'ThrowStatement': case 'BreakStatement': case 'ContinueStatement': case 'YieldStatement': return false;
    case 'BlockStatement': return s.body.every(canComplete);
    case 'IfStatement': return !s.alternate || canComplete(s.consequent) || canComplete(s.alternate);
    case 'WhileStatement': return !isTrueLiteral(s.test) || hasBreak(s.body);
    case 'DoWhileStatement': return ((canComplete(s.body) || hasJump(s.body, 'ContinueStatement')) && !isTrueLiteral(s.test)) || hasBreak(s.body);
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

// ── 確実な代入（JLS 16 章の簡略版）と到達できない文（JLS 14.22） ─────────────────
//
// 初期化子なしで宣言したローカル変数（int y;）を、どの道筋でも値を入れる前に使っていないかを調べる。
// 状態は「確実に値が入っている変数の集合」。ALL は「ここには来ない」（return・break のあと）で、どの集合とも交わりが相手になる。
// 誤ってエラーにしないことを優先し、switch・ループの break・finally は、値が入りうる変数を入っているものとして扱う（ゆるめ）。

const ALL = Symbol('unreachable');
const inter = (a, b) => (a === ALL ? b : b === ALL ? a : new Set([...a].filter(x => b.has(x))));
const union = (a, b) => (a === ALL || b === ALL ? ALL : new Set([...a, ...b]));
const plus = (a, name) => (a === ALL ? ALL : new Set([...a, name]));

/** 文・式の中で、= で値を入れているローカル変数の名前 */
function assignedNames(n, out = new Set()) {
  if (!n || typeof n !== 'object') return out;
  if (Array.isArray(n)) { n.forEach(x => assignedNames(x, out)); return out; }
  if (n.type === 'AssignmentExpression' && n.left.type === 'Identifier') out.add(n.left.name);
  if (n.type === 'VariableDeclarator' && n.init) out.add(n.id.name);
  for (const k of Object.keys(n)) if (k !== 'loc' && k !== 'end' && k !== 'range') assignedNames(n[k], out);
  return out;
}

/**
 * メソッドの本体の確実な代入と到達できない文を調べる。誤りがあれば JavaCompileError を投げる
 * @param {object} body BlockStatement
 * @param {string[]} params 引数の名前（はじめから値が入っている）
 */
function checkFlow(body, params) {
  const tracked = new Set();   // 初期化子なしで宣言した変数

  const use = (name, loc, da) => {
    if (tracked.has(name) && da !== ALL && !da.has(name)) {
      throw err(`変数 ${name} に値を入れる前に使っています（どの道筋を通っても、使う前に値が入るようにします）`, loc,
        `variable ${name} might not have been initialized`);
    }
  };

  /** 条件式：真のときと偽のときの状態 */
  function cond(e, da) {
    if (e.type === 'Literal' && e.jtype === 'boolean') return e.value ? { t: da, f: ALL } : { t: ALL, f: da };
    if (e.type === 'LogicalExpression') {
      const l = cond(e.left, da);
      if (e.operator === '&&') { const r = cond(e.right, l.t); return { t: r.t, f: inter(l.f, r.f) }; }
      const r = cond(e.right, l.f);
      return { t: inter(l.t, r.t), f: r.f };
    }
    if (e.type === 'UnaryExpression' && e.operator === '!') { const c = cond(e.argument, da); return { t: c.f, f: c.t }; }
    const d = expr(e, da);
    return { t: d, f: d };
  }

  function expr(e, da) {
    if (!e) return da;
    switch (e.type) {
      case 'Identifier': use(e.name, e.loc, da); return da;
      case 'Literal': case 'ThisExpression': case 'Super': return da;
      case 'AssignmentExpression':
        if (e.left.type === 'Identifier') {
          if (e.operator !== '=') use(e.left.name, e.left.loc, da);
          return plus(expr(e.right, da), e.left.name);
        }
        return expr(e.right, expr(e.left, da));
      case 'UpdateExpression': return expr(e.argument, da);
      case 'LogicalExpression': { const c = cond(e, da); return inter(c.t, c.f); }
      case 'ConditionalExpression': { const c = cond(e.test, da); return inter(expr(e.consequent, c.t), expr(e.alternate, c.f)); }
      case 'CallExpression': {
        let d = e.callee.type === 'MemberExpression' ? expr(e.callee.object, da) : da;
        for (const a of e.arguments) d = expr(a, d);
        return d;
      }
      case 'MemberExpression': { const d = expr(e.object, da); return e.computed ? expr(e.property, d) : d; }
      case 'NewExpression': return e.arguments.reduce((d, a) => expr(a, d), da);
      case 'NewArrayExpression': return expr(e.init, e.dims.reduce((d, a) => expr(a, d), da));
      case 'ArrayExpression': return e.elements.reduce((d, a) => expr(a, d), da);
      case 'BinaryExpression': return expr(e.right, expr(e.left, da));
      case 'UnaryExpression': return expr(e.argument, da);
      case 'CastExpression': return expr(e.argument, da);
      case 'InstanceofExpression': return expr(e.expression, da);
      case 'SequenceExpression': return e.expressions.reduce((d, a) => expr(a, d), da);
      case 'SwitchExpression': {
        // switch 式：各 case の中も調べる（そこで入る変数は数えない＝ゆるめではなく、きびしめにはしない）
        const d = expr(e.discriminant, da);
        for (const c of e.cases) block(c.consequent, d);
        return d;
      }
    }
    return da;
  }

  function block(list, da) {
    let d = da;
    list.forEach((st, i) => {
      if (i > 0 && !canComplete(list[i - 1])) {
        throw err('この文には実行が届きません（前の return・break・continue・throw のあとに書かれています）', st.loc, 'unreachable statement');
      }
      d = stmt(st, d);
    });
    return d;
  }

  function stmt(s, da) {
    if (!s) return da;
    switch (s.type) {
      case 'BlockStatement': return block(s.body, da);
      case 'VariableDeclaration': {
        let d = da;
        for (const decl of s.declarations) {
          if (decl.init) d = plus(expr(decl.init, d), decl.id.name);
          else {
            tracked.add(decl.id.name);
            if (d !== ALL) { d = new Set(d); d.delete(decl.id.name); }
          }
        }
        return d;
      }
      case 'ExpressionStatement': return expr(s.expression, da);
      case 'IfStatement': {
        const c = cond(s.test, da);
        return inter(stmt(s.consequent, c.t), s.alternate ? stmt(s.alternate, c.f) : c.f);
      }
      case 'WhileStatement': {
        const c = cond(s.test, da);
        stmt(s.body, c.t);
        if (isTrueLiteral(s.test)) return hasBreak(s.body) ? union(da, assignedNames(s.body)) : ALL;
        return c.f;
      }
      case 'DoWhileStatement': {
        const b = stmt(s.body, da);
        const c = cond(s.test, b === ALL ? union(da, assignedNames(s.body)) : b);
        if (hasBreak(s.body)) return union(inter(c.f, da), assignedNames(s.body));
        return c.f;
      }
      case 'ForStatement': {
        let d = s.init ? (s.init.type === 'VariableDeclaration' ? stmt(s.init, da) : expr(s.init, da)) : da;
        const c = s.test ? cond(s.test, d) : { t: d, f: ALL };
        const b = stmt(s.body, c.t);
        expr(s.update, b === ALL ? c.t : b);
        if (hasBreak(s.body)) return union(inter(c.f, d), assignedNames(s.body));
        return c.f;
      }
      case 'ForOfStatement': { const d = expr(s.right, da); stmt(s.body, plus(d, s.left.name)); return d; }
      case 'SwitchStatement': {
        const d = expr(s.discriminant, da);
        for (const c of s.cases) block(c.consequent, d === ALL ? d : union(d, assignedNames(s.cases)));
        if (!s.cases.some(c => c.default)) return d;
        // default があれば、各 case から（break のない case は次の case へ続けて）入る変数の共通部分が入っている
        let common = null;
        s.cases.forEach((c, i) => {
          const names = new Set();
          for (let j = i; j < s.cases.length; j++) {
            assignedNames(s.cases[j].consequent, names);
            if (s.arrow || !s.cases[j].consequent.every(canComplete)) break;
          }
          common = common === null ? names : new Set([...common].filter(x => names.has(x)));
        });
        return union(d, common ?? new Set());
      }
      case 'TryStatement': {
        let out = stmt(s.block, da);
        for (const h of s.handlers) out = inter(out, stmt(h.body, union(da, new Set([h.param.name]))));
        if (s.finalizer) {
          // finally はいつも実行されるので、そこで入る変数も入っている。finally が最後まで進めなければ、その先には来ない
          const f = stmt(s.finalizer, da);
          out = f === ALL ? ALL : union(out, assignedNames(s.finalizer));
        }
        return out;
      }
      case 'ReturnStatement': case 'ThrowStatement': case 'YieldStatement': expr(s.argument, da); return ALL;
      case 'BreakStatement': case 'ContinueStatement': return ALL;
    }
    return da;
  }

  stmt(body, new Set(params));
}

// ── 検査例外（JLS 11.2） ─────────────────────────────────────────────────────

/** 型が検査例外か（Exception の下で、RuntimeException の下でないもの。Throwable そのものも含む） */
function isCheckedException(t, classes) {
  const chain = [];
  for (let k = classes.get(t) ?? BUILTIN_CLASSES.get(t); k; k = k.superClass) chain.push(k.name);
  if (!chain.includes('Throwable')) return false;
  return !chain.includes('RuntimeException') && !chain.includes('Error');
}

// ── オーバーロードの選択（JLS 15.12.2 の簡略版） ───────────────────────────────

/**
 * 当てはまるメソッドの中から、いちばん特定的なもの（ほかのどれの引数にも渡せる引数の型を持つもの）を選ぶ。
 * 引数の型が分からないとき（null）は、候補の順の最初のものにする（評価器は実行時の値の型で選ぶ）
 */
function mostSpecific(ok, argTypes) {
  if (ok.length === 1 || argTypes.includes(null)) return ok[0];
  const moreSpecific = (m1, m2) => m1.paramTypes.every((p, i) => assignableType(p, m2.paramTypes[i]));
  return ok.find(m => ok.every(o => o === m || moreSpecific(m, o))) ?? ok[0];
}

/** 型 from を型 to に渡せるか（mostSpecific 用。値の式なしの代入の変換） */
let assignableType = () => true;

/** 式に静的な型の印を付ける（NullPointerException の詳しいメッセージで使う。ADR-006） */
function markType(n, key, t) {
  if (t) Object.defineProperty(n, key, { value: t, enumerable: false, configurable: true });
}

/** 呼び出しの式に、選んだメソッドの引数の型の並び（シグネチャ）を印として付ける。評価器はこれで同じメソッドを呼ぶ */
function markSignature(n, m) {
  Object.defineProperty(n, 'signature', { value: m.paramTypes.join(','), enumerable: false, configurable: true });
}

// ── 型の推論 ──────────────────────────────────────────────────────────────────

class Locals {
  /** @param {object} [lambda] このスコープがラムダ式の本体なら、そのノード（外側の変数を使うと「とらえる」） */
  constructor(parent = null, lambda = null) { this.parent = parent; this.vars = new Map(); this.info = new Map(); this.lambda = lambda; }
  get(name) { for (let s = this; s; s = s.parent) if (s.vars.has(name)) return s.vars.get(name); return undefined; }
  /** 宣言したスコープと、間にあるラムダ式（内側から順） */
  find(name) {
    const lambdas = [];
    for (let s = this; s; s = s.parent) {
      if (s.vars.has(name)) return { scope: s, type: s.vars.get(name), lambdas };
      if (s.lambda) lambdas.push(s.lambda);
    }
    return null;
  }
  /** 変数の代入の数え（実質的に final か。ADR-010）。初期化子なしの宣言は noInit */
  infoOf(name) {
    if (!this.info.has(name)) this.info.set(name, { noInit: false, compound: 0, assigns: 0 });
    return this.info.get(name);
  }
}

/**
 * プログラム全体を検査する。誤りがあれば最初の 1 つを JavaCompileError として投げる。
 * @param {object} ast
 * @param {Map<string, import('./objects.js').JClass>} classes
 */
export function check(ast, classes) {
  assignableType = (from, to) => assignable(from, to, classes);
  /**
   * 抽象クラスでないクラス・enum が、上のクラス・インターフェースの抽象メソッドをすべて実装しているか（ADR-008）。
   * Comparable<T> の compareTo は、引数 1 つの compareTo があればよい
   */
  function checkOverrides(cls) {
    if (cls.abstract || cls.kind === 'interface') return;
    const concrete = (name, params) => lookupOrder(cls).some(k => (k.methods.get(name) ?? []).some(m => m.body && !m.static
      && (params === null ? m.paramTypes.length === 1 : m.paramTypes.join(',') === params)));
    for (const k of lookupOrder(cls)) {
      if (k.builtin && k.name === 'Comparable' && !concrete('compareTo', null)) {
        throw err(`クラス ${cls.name} は Comparable を実装すると書いていますが、compareTo メソッドがありません`, cls.node.loc,
          `${cls.name} is not abstract and does not override abstract method compareTo(${cls.name}) in Comparable`);
      }
      // Comparator<T> の compare(a, b)・Runnable の run()（ADR-010）
      const builtinAbs = k.builtin && { Comparator: ['compare', 2], Runnable: ['run', 0] }[k.name];
      if (builtinAbs && !lookupOrder(cls).some(c => (c.methods.get(builtinAbs[0]) ?? []).some(m => m.body && !m.static && m.paramTypes.length === builtinAbs[1]))) {
        const T = typeArgs((cls.node.interfaces ?? []).find(t => baseType(t) === k.name) ?? '')[0] ?? 'Object';
        throw err(`クラス ${cls.name} は ${k.name} を実装すると書いていますが、${builtinAbs[0]} メソッドがありません`, cls.node.loc,
          `${cls.name} is not abstract and does not override abstract method ${builtinAbs[0]}(${builtinAbs[1] ? `${T},${T}` : ''}) in ${k.name}`);
      }
      for (const m of [...k.methods.values()].flat()) {
        if (m.body || m.static || concrete(m.name, m.paramTypes.join(','))) continue;
        throw err(`クラス ${cls.name} は、${k.kind === 'interface' ? 'インターフェース' : 'クラス'} ${k.name} の抽象メソッド ${m.name}(${m.paramTypes.join(', ')}) を実装していません（abstract のクラスにするか、メソッドを書きます）`,
          cls.node.loc, `${cls.name} is not abstract and does not override abstract method ${m.name}(${m.paramTypes.join(',')}) in ${k.name}`);
      }
    }
  }

  /** new ArrayList<>() の <> を、代入先の型（List<Integer>・Map<String,Integer>）から決める（要素の型の印に使う） */
  function inferDiamond(init, target) {
    if (init?.type === 'NewExpression' && init.genericType?.endsWith('<>') && target && typeArgs(target).length) {
      markType(init, 'elemType', typeArgs(target)[0]);
      markType(init, 'typeArgs', typeArgs(target));
    }
  }

  /** final のローカル変数の名前（メソッドごとに作り直す） */
  let finals = new Set();
  /** ラムダ式がとらえた外側の変数（{ scope, name, loc }）。メソッドの最後に、実質的に final かを調べる（ADR-010） */
  let captured = [];
  function checkCaptured() {
    for (const c of captured) {
      const i = c.scope.infoOf(c.name);
      // 初期化子つきの宣言は一度も入れ直さないこと。初期化子なしは += や ++ を使わないこと（何度かの = はゆるめに通す）
      if ((i.noInit ? i.compound > 0 : i.assigns + i.compound > 0)) {
        throw err(`ラムダ式の中で使う外側の変数 ${c.name} は、値を入れ直してはいけません（final か、入れ直さない変数だけを使えます）`, c.loc, 'local variables referenced from a lambda expression must be final or effectively final');
      }
    }
  }
  const imported = importedUtil(ast.imports);
  const needImport = (name, loc) => {
    const pkg = JAVA_UTIL.has(name) ? 'java.util' : FUNCTION_PKG.has(name) ? 'java.util.function' : STREAM_PKG.has(name) ? 'java.util.stream' : null;
    if (pkg && !classes.has(name) && !imported.has(name)) {
      throw err(`${name} を使うには、ファイルの先頭に import ${pkg}.${name}; を書きます`, loc, 'cannot find symbol');
    }
  };
  for (const cls of classes.values()) {
    const fieldCtx = { cls, isStatic: false, method: null };
    for (const f of cls.fields) {
      if (!f.init) continue;
      inferDiamond(f.init, f.type);
      const t = exprT(f.init, f.type, new Locals(), { ...fieldCtx, isStatic: f.static });
      if (!assignable(t, f.type, classes, f.init)) throw incompatible(t, f.type, f.init.loc);
      markUnbox(f.init, t, f.type);
    }
    checkOverrides(cls);
    for (const m of [...cls.ctors, ...[...cls.methods.values()].flat()]) {
      if (!m.body) continue;   // 抽象メソッド（本体なし）
      const locals = new Locals();
      m.params.forEach((p, i) => locals.vars.set(p, m.paramTypes[i]));
      // handled：いま捕まえられる例外の型（外側の try の catch と、メソッドの throws）。内側の try で積む
      const ctx = { cls, isStatic: m.static, method: m, handled: [...(m.throws ?? [])] };
      finals = new Set();
      captured = [];
      stmt(m.body, locals, ctx);
      checkCaptured();
      checkFlow(m.body, m.params);
      if (m.returnType && m.returnType !== 'void' && canComplete(m.body)) {
        throw err(`メソッド ${m.name} の最後まで進むと、値を返さずに終わってしまいます（return で ${m.returnType} の値を返します）`,
          m.node.bodyEnd, 'missing return statement');
      }
    }
  }

  function knownType(t, loc) {
    const base = baseType(t.replace(/(\[\])+$/, ''));
    for (const a of typeArgs(t.replace(/(\[\])+$/, ''))) {
      if (isPrimitiveType(a)) throw err(`型引数にはプリミティブ型（${a}）は使えません（${boxType(a)} を使います）`, loc, 'unexpected type');
      knownType(a, loc);
    }
    if (base === 'float') throw err('float はまだ対応していません（小数は double を使います）', loc, 'float is not supported yet');
    if (isPrimitiveType(base) || base === 'var' || base === 'void' || base === 'String' || base === 'Object') return;
    if (base === 'Scanner' || COLL_SUPER[base]) { needImport(base === 'Entry' ? 'Map' : base, loc); return; }
    if (base === 'StringBuilder') return;
    if (FUNCTIONAL[base] && !classes.has(base)) { needImport(base, loc); return; }
    if (STREAM_TYPES.has(base) && !classes.has(base)) { needImport(base, loc); return; }
    if (classes.has(base) || BUILTIN_CLASSES.has(base) || BOXES[base]) return;
    throw err(`型 ${base} が見つかりません（クラス名のつづりを確かめてください）`, loc, 'cannot find symbol');
  }

  /** final の変数への代入をコンパイルエラーにする（ローカル変数と、初期化子のある final のフィールド） */
  function requireAssignable(target, locals, ctx, compound = false) {
    if (target.type !== 'Identifier' && !(target.type === 'MemberExpression' && !target.computed)) return;
    const name = target.type === 'Identifier' ? target.name : target.property.name;
    if (target.type === 'Identifier' && locals.get(name) !== undefined) {
      const f = locals.find(name);
      // ラムダ式の中から、外側の変数に値を入れる（sum += x の形。ADR-010）
      if (f.lambdas.length) {
        throw err(`ラムダ式の中から、外側の変数 ${name} に値を入れることはできません`, target.loc, 'local variables referenced from a lambda expression must be final or effectively final');
      }
      if (finals.has(name)) throw err(`final の変数 ${name} には、値を入れ直せません`, target.loc, `cannot assign a value to final variable ${name}`);
      const info = f.scope.infoOf(name);
      if (compound) info.compound++; else info.assigns++;
      return;
    }
    let cls = ctx.cls;
    if (target.type === 'MemberExpression') {
      const ot = target.object.type === 'ThisExpression' ? ctx.cls.name : target.object.type === 'Identifier' && classes.has(target.object.name) ? target.object.name : null;
      cls = ot && classes.get(ot);
      if (!cls) return;
    }
    const f = cls.fields.find(x => x.name === name) ?? findStaticField(cls, name)?.field;
    if (f && f.final && f.init) {
      throw err(`final の${f.static ? ' static ' : ''}フィールド ${name} には、値を入れ直せません（定数です）`, target.loc,
        `cannot assign a value to ${f.static ? 'static final' : 'final'} variable ${name}`);
    }
  }

  /** 検査例外 t が、catch か throws で扱われているか。扱われていなければコンパイルエラー */
  function requireHandled(t, loc, ctx) {
    if (!t || !isCheckedException(t, classes)) return;
    if ((ctx.handled ?? []).some(h => assignable(t, h, classes))) return;
    throw err(`例外 ${t} は、try … catch で捕まえるか、メソッドに throws ${t} と書く必要があります`, loc,
      `unreported exception ${t}; must be caught or declared to be thrown`);
  }

  /** 式を、入れる先の型 target で調べる（ラムダ式・メソッド参照は target が要る。ADR-010） */
  function exprT(n, target, locals, ctx) {
    return isFn(n) ? checkFn(n, target, locals, ctx) : expr(n, locals, ctx);
  }

  /**
   * ラムダ式・メソッド参照を、入れる先の型 target（関数型インターフェース。分からなければ null）で調べる。
   * ラムダ式の引数の型・戻り値の型・とらえた変数の名前を、評価器のための印としてノードに付ける
   */
  function checkFn(n, target, locals, ctx) {
    const fd = target ? fiDescriptor(target, classes) : null;
    if (target && target !== 'var' && !fd) {
      throw err(`${target} は関数型インターフェースではないので、${n.type === 'MethodReference' ? 'メソッド参照' : 'ラムダ式'}は入れられません`, n.loc,
        `incompatible types: ${target} is not a functional interface`);
    }
    if (n.type === 'MethodReference') { checkMethodRef(n, fd, locals, ctx); return target ?? '<lambda>'; }
    if (fd && fd.params.length !== n.params.length) {
      throw err(`ラムダ式の引数の数（${n.params.length} 個）が、${baseType(target)} の ${fd.name} の引数の数（${fd.params.length} 個）と合いません`, n.loc,
        'incompatible types: incompatible parameter types in lambda expression');
    }
    Object.defineProperty(n, 'captures', { value: new Set(), enumerable: false, configurable: true });
    const inner = new Locals(locals, n);
    const types = n.params.map((p, i) => {
      if (p.varType) knownType(p.varType, p.loc);
      if (locals.get(p.name) !== undefined) throw redeclared(p.name, p.loc, ctx);
      const t = p.varType ?? fd?.params[i] ?? null;
      inner.vars.set(p.name, t);
      return t;
    });
    const ret = fd ? fd.ret : null;
    markType(n, 'paramTypes', types);
    markType(n, 'returnType', ret);
    const lctx = { ...ctx, lambda: { ret, returns: [] }, yields: undefined, collectorElem: undefined };
    if (n.expression) {
      const t = exprT(n.body, ret === 'void' ? null : ret, inner, lctx);
      markType(n, 'bodyType', t);
      if (ret === 'void') {
        // void の関数型インターフェース（Consumer・Runnable）の本体は、文として書ける式（呼び出し・代入・++ など）だけ
        if (!/^(CallExpression|AssignmentExpression|UpdateExpression|NewExpression)$/.test(n.body.type)) {
          throw err(`${baseType(target)} のラムダ式は値を返しません（${baseType(target)} の ${fd.name} は void です）`, n.body.loc,
            'incompatible types: lambda body is not compatible with a void functional interface');
        }
      } else if (ret && !assignable(t, ret, classes, n.body)) {
        throw err(`ラムダ式は ${ret} の値を返します（${t} の値は返せません）`, n.body.loc, 'incompatible types: bad return type in lambda expression');
      } else markUnbox(n.body, t, ret);
    } else {
      stmt(n.body, inner, lctx);
      markType(n, 'bodyType', lctx.lambda.returns.find(t => t !== null) ?? (canComplete(n.body) ? 'void' : null));
      if (ret && ret !== 'void' && canComplete(n.body)) {
        throw err(`ラムダ式の最後まで進むと、値を返さずに終わってしまいます（return で ${ret} の値を返します）`, n.loc,
          'incompatible types: bad return type in lambda expression');
      }
    }
    return target ?? '<lambda>';
  }

  /** メソッド参照（Integer::sum・String::length・System.out::println・Main::isEven・Point::new）の、メソッドがあるか */
  function checkMethodRef(n, fd, locals, ctx) {
    const o = n.object;
    const invalid = () => err(`メソッド参照 ${n.text} のメソッドが見つかりません`, n.loc, 'invalid method reference');
    // 本体の型（呼ぶメソッドの戻り値の型）を、map(String::length) などの結果の型に使う（ADR-011）
    const body = (t) => markType(n, 'bodyType', typeof t === 'string' ? t : null);
    const isTypeName = o.type === 'Identifier' && locals.get(o.name) === undefined && !instanceFields(ctx.cls).some(f => f.name === o.name);
    if (!isTypeName) {
      const ot = expr(o, locals, ctx);
      if (ot === 'PrintStream') body('void');
      else if (ot && classes.get(baseType(ot))) body(findMethods(classes.get(baseType(ot)), n.name)[0]?.returnType);
      return;
    }
    knownType(o.name, o.loc);
    const cls = classes.get(o.name);
    if (cls) {
      if (n.name === 'new') { body(o.name); return; }
      if (!findMethods(cls, n.name).length) throw invalid();
      body(findMethods(cls, n.name)[0].returnType);
      return;
    }
    if (o.name === 'String') {
      if (n.name !== 'valueOf' && !(n.name in STRING_METHODS)) throw invalid();
      body(n.name === 'valueOf' ? 'String' : STRING_METHODS[n.name]);
      return;
    }
    if (STATIC_RETURNS[o.name] || BOXES[o.name]) {
      if (!(STATIC_RETURNS[o.name]?.[n.name]) && !(n.name in WRAPPER_METHODS)) throw invalid();
      body(STATIC_RETURNS[o.name]?.[n.name] ?? WRAPPER_METHODS[n.name]);
    }
  }

  function cond(n, locals, ctx) {
    const t = expr(n, locals, ctx);
    markUnbox(n, t, 'boolean');
    if (t !== null && t !== 'boolean' && t !== 'Boolean') {
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
            inferDiamond(d.init, t);
            if (t === 'var' && isFn(d.init)) {
              throw err(`var の変数 ${d.id.name} にはラムダ式を入れられません（Function<Integer, Integer> などの型を書きます）`, d.loc, `cannot infer type for local variable ${d.id.name}`);
            }
            const vt = exprT(d.init, t, locals, ctx);
            if (t === 'var') t = vt;
            else if (!assignable(vt, t, classes, d.init)) throw incompatibleValue(vt, t, d.init);
            markUnbox(d.init, vt, t);
          }
          locals.vars.set(d.id.name, t);
          if (!d.init) locals.infoOf(d.id.name).noInit = true;
          if (s.kind === 'const') finals.add(d.id.name);
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
        const isListType = isIterableType(ct);
        if (ct !== null && MAP_TYPES.has(baseType(ct))) {
          throw err('マップはそのままでは拡張 for 文で繰り返せません（keySet()・values()・entrySet() を使います）', s.right.loc, 'for-each not applicable to expression type');
        }
        if (ct !== null && !isArrayType(ct) && !isListType) throw err('拡張 for 文（for (型 変数 : …)）で繰り返せるのは配列とリストだけです', s.right.loc, 'for-each not applicable to expression type');
        const inner = new Locals(locals);
        const et = ct === null ? null : isListType ? (typeArgs(ct)[0] ?? 'Object') : elemTypeOf(ct);
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
        // ラムダ式の本体の return は、ラムダ式の戻り値の型（ADR-010）
        const rt = ctx.lambda ? ctx.lambda.ret : ctx.method?.returnType ?? null;
        if (!s.argument) {
          if (rt && rt !== 'void') throw err(`このメソッドは ${rt} の値を返します（return の後ろに値を書きます）`, s.loc, 'missing return value');
          return;
        }
        const t = exprT(s.argument, rt, locals, ctx);
        if (ctx.lambda) ctx.lambda.returns.push(t);
        if (ctx.lambda && rt !== 'void' && !assignable(t, rt, classes, s.argument)) {
          throw err(`ラムダ式は ${rt} の値を返します（${t} の値は返せません）`, s.argument.loc, 'incompatible types: bad return type in lambda expression');
        }
        if (rt === 'void' || (!ctx.lambda && ctx.method && ctx.method.kind === 'constructor')) {
          throw err('void のメソッドからは値を返せません（return; だけを書きます）', s.argument.loc, 'incompatible types: unexpected return value');
        }
        if (!assignable(t, rt, classes, s.argument)) throw incompatible(t, rt, s.argument.loc);
        markUnbox(s.argument, t, rt);
        return;
      }
      case 'ThrowStatement': requireHandled(expr(s.argument, locals, ctx), s.loc, ctx); return;
      case 'YieldStatement': {
        const t = expr(s.argument, locals, ctx);
        if (!ctx.yields) throw err('yield は switch 式の中で使います', s.loc, 'yield outside of switch expression');
        ctx.yields.push(t);
        return;
      }
      case 'TryStatement':
        stmt(s.block, locals, { ...ctx, handled: [...(ctx.handled ?? []), ...s.handlers.flatMap(h => h.types)] });
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
    const found = locals.find(name);
    if (found) {
      // ラムダ式の外側の変数：間にあるラムダ式すべてがとらえる（評価器が、作るときに値を写す。ADR-010）
      if (found.lambdas.length) {
        captured.push({ scope: found.scope, name, loc });
        for (const lam of found.lambdas) lam.captures.add(name);
      }
      return found.type;
    }
    const inst = instanceFields(ctx.cls).find(f => f.name === name);
    if (inst) {
      if (ctx.isStatic) throw err(`static メソッドの中では、インスタンスのフィールド ${name} は使えません`, loc, `non-static variable ${name} cannot be referenced from a static context`);
      return inst.type;
    }
    const sf = findStaticField(ctx.cls, name);
    if (sf) return sf.field.type;
    // Comparator は、implements で使う組み込みのインターフェースだが、Comparator.comparing(…) では static メソッドの持ち主
    if (classes.has(name) || (BUILTIN_CLASSES.has(name) && !BUILTIN_NAMES.has(name))) return `class:${name}`;
    if (BUILTIN_NAMES.has(name)) { needImport(name, loc); return `builtin:${name}`; }
    throw err(`「${name}」という変数は宣言されていません（つづりと、宣言した場所（{ } の範囲）を確かめてください）`, loc, 'cannot find symbol');
  }

  /**
   * switch 式の型（ADR-008）。各 case の値（-> の右の式・yield）の型をまとめる。
   * default がなければ、enum のすべての定数を case に書いたときだけ通す（本物と同じ）
   */
  function switchExprType(n, locals, ctx) {
    const dt = expr(n.discriminant, locals, ctx);
    const enumCls = dt && classes.get(dt)?.kind === 'enum' ? classes.get(dt) : null;
    if (!n.cases.some(c => c.default)) {
      const covered = new Set(n.cases.flatMap(c => c.tests.map(t => t.name)));
      if (!enumCls || !enumCls.fields.filter(f => f.enumConstant).every(f => covered.has(f.name))) {
        throw err('switch 式には、どの値にも当てはまる default が必要です（enum なら、すべての定数の case を書きます）', n.loc,
          'the switch expression does not cover all possible input values');
      }
    }
    const yields = [];
    const inner = { ...ctx, yields };
    for (const c of n.cases) {
      const l = new Locals(locals);
      for (const st of c.consequent) stmt(st, l, inner);
    }
    const known = yields.filter(t => t !== null);
    if (!known.length) return null;
    if (known.every(t => t === known[0])) return known[0];
    if (known.every(t => isNumericType(unboxType(t)))) return known.map(unboxType).reduce(promote);
    return null;
  }

  /** ラムダ式・メソッド参照の本体の型（調べたあと。分からなければ null） */
  function bodyTypeOf(a) { return a && a.bodyType && a.bodyType !== '<lambda>' ? a.bodyType : null; }

  /**
   * ストリーム・Optional のメソッドの戻り値の型（ADR-011）。fnTargets にラムダ式の入れる先の型を置く。
   * map(x -> …) のように、ラムダ式の本体の型で決まるものは、関数（あとで求める）を返す
   */
  function streamCallType(n, name, ot, argTypes, fnTargets, loc) {
    const b = baseType(ot);
    const notFound = () => err(`${b} に ${name}(…) はありません（まだ対応していないメソッドかもしれません）`, loc, 'cannot find symbol');
    if (b.startsWith('Optional')) {
      const T = b === 'OptionalInt' ? 'int' : b === 'OptionalDouble' ? 'double' : typeArgs(ot)[0] ?? null;
      const getter = b === 'OptionalInt' ? 'getAsInt' : b === 'OptionalDouble' ? 'getAsDouble' : 'get';
      switch (name) {
        case getter: case 'orElseThrow': case 'orElse': return T;
        case 'orElseGet': fnTargets[0] = T ? `Supplier<${boxType(T)}>` : null; return T;
        case 'isPresent': case 'isEmpty': case 'equals': return 'boolean';
        case 'ifPresent': fnTargets[0] = b === 'OptionalInt' ? 'IntConsumer' : b === 'OptionalDouble' ? 'DoubleConsumer' : `Consumer<${T ?? '_'}>`; return 'void';
        case 'toString': return 'String';
        case 'hashCode': return 'int';
      }
      throw notFound();
    }
    const prim = b !== 'Stream';
    const T = b === 'IntStream' ? 'int' : b === 'DoubleStream' ? 'double' : typeArgs(ot)[0] ?? null;
    const TB = T ? boxType(T) : '_';
    const P = b === 'IntStream' ? 'Int' : 'Double';
    const opt = b === 'Stream' ? (T ? `Optional<${T}>` : 'Optional') : `Optional${P}`;
    const pred = prim ? `${P}Predicate` : `Predicate<${TB}>`;
    const fromBody = (wrap) => () => { const r = bodyTypeOf(n.arguments[0]); return r && r !== 'void' ? wrap(boxType(r)) : baseType(wrap('X')); };
    switch (name) {
      case 'filter': fnTargets[0] = pred; return ot;
      case 'map':
        if (prim) { fnTargets[0] = `${P}UnaryOperator`; return ot; }
        fnTargets[0] = `Function<${TB},_>`;
        return fromBody(r => `Stream<${r}>`);
      case 'mapToInt': if (prim) break; fnTargets[0] = `ToIntFunction<${TB}>`; return 'IntStream';
      case 'mapToDouble': if (prim) break; fnTargets[0] = `ToDoubleFunction<${TB}>`; return 'DoubleStream';
      case 'mapToObj': if (b !== 'IntStream') break; fnTargets[0] = 'IntFunction<_>'; return fromBody(r => `Stream<${r}>`);
      case 'boxed': if (!prim) break; return `Stream<${TB}>`;
      case 'asDoubleStream': if (b !== 'IntStream') break; return 'DoubleStream';
      case 'peek': case 'forEach': case 'forEachOrdered':
        fnTargets[0] = prim ? `${P}Consumer` : `Consumer<${TB}>`;
        return name === 'peek' ? ot : 'void';
      case 'distinct': case 'limit': case 'skip': return ot;
      case 'sorted': if (argTypes.length) { if (prim) break; fnTargets[0] = `Comparator<${TB}>`; } return ot;
      case 'count': return 'long';
      case 'sum': if (!prim) break; return T;
      case 'average': if (!prim) break; return 'OptionalDouble';
      case 'max': case 'min': if (!prim) fnTargets[0] = `Comparator<${TB}>`; return opt;
      case 'reduce':
        if (argTypes.length === 2) { fnTargets[1] = prim ? `${P}BinaryOperator` : `BinaryOperator<${TB}>`; return prim ? T : (T ?? argTypes[0]); }
        fnTargets[0] = prim ? `${P}BinaryOperator` : `BinaryOperator<${TB}>`;
        return opt;
      case 'anyMatch': case 'allMatch': case 'noneMatch': fnTargets[0] = pred; return 'boolean';
      case 'findFirst': case 'findAny': return opt;
      case 'toList': if (prim) break; return T ? `List<${T}>` : 'List';
      case 'toArray': return prim ? `${T}[]` : 'Object[]';
      case 'collect': {
        if (prim) break;
        const ct = argTypes[0];
        return ct && ct.startsWith('Collector:') ? ct.slice(10) || null : null;
      }
    }
    throw notFound();
  }

  /**
   * Collectors.toList() などの型（'Collector:結果の型'。collect の戻り値になる）。E はストリームの要素の型（collect の引数の中だけ分かる）
   */
  function collectorType(n, name, argTypes, fnTargets, E) {
    const EB = E ? boxType(E) : null;
    const res = (t) => `Collector:${t}`;
    const down = (i) => {   // 下流の Collector の結果の型（省略は toList）
      const d = argTypes[i];
      return d === undefined ? (EB ? `List<${EB}>` : 'List') : d && d.startsWith('Collector:') ? d.slice(10) : null;
    };
    const keyOf = (i) => { const r = bodyTypeOf(n.arguments[i]); return r && r !== 'void' ? boxType(r) : null; };
    switch (name) {
      case 'toList': return res(EB ? `List<${EB}>` : 'List');
      case 'toSet': return res(EB ? `Set<${EB}>` : 'Set');
      case 'joining': return res('String');
      case 'counting': return res('Long');
      case 'summingInt': fnTargets[0] = `ToIntFunction<${EB ?? '_'}>`; return res('Integer');
      case 'averagingInt': fnTargets[0] = `ToIntFunction<${EB ?? '_'}>`; return res('Double');
      case 'partitioningBy': {
        fnTargets[0] = `Predicate<${EB ?? '_'}>`;
        const v = down(1);
        return res(v ? `Map<Boolean,${v}>` : 'Map');
      }
      case 'groupingBy':
        fnTargets[0] = `Function<${EB ?? '_'},_>`;
        return () => { const k = keyOf(0), v = down(1); return res(k && v ? `Map<${k},${v}>` : 'Map'); };
      case 'toMap':
        fnTargets[0] = `Function<${EB ?? '_'},_>`;
        fnTargets[1] = `Function<${EB ?? '_'},_>`;
        if (argTypes.length > 2) fnTargets[2] = 'BinaryOperator<_>';
        return () => { const k = keyOf(0), v = keyOf(1); return res(k && v ? `Map<${k},${v}>` : 'Map'); };
    }
    throw err(`Collectors に ${name}(…) はありません（まだ対応していないメソッドかもしれません）`, n.callee.loc, 'cannot find symbol');
  }

  /**
   * コレクションの、ラムダ式を受け取るメソッドの戻り値の型（ADR-010）。fnTargets に引数の関数型インターフェースの型を置く。
   * 当てはまらなければ undefined
   */
  function lambdaMethodType(n, ot, name, argTypes, fnTargets) {
    const b = baseType(ot);
    const [A = null, B = null] = typeArgs(ot);
    const one = (t) => { fnTargets[argTypes.length - 1] = t; };
    if (LIST_TYPES.has(b) || SET_TYPES.has(b)) {
      switch (name) {
        case 'stream': return A ? `Stream<${A}>` : 'Stream';   // ADR-011
        case 'forEach': one(A ? `Consumer<${A}>` : 'Consumer'); return 'void';
        case 'removeIf': one(A ? `Predicate<${A}>` : 'Predicate'); return 'boolean';
      }
      if (LIST_TYPES.has(b) && name === 'replaceAll') { one(A ? `UnaryOperator<${A}>` : 'UnaryOperator'); return 'void'; }
      if (LIST_TYPES.has(b) && name === 'sort' && argTypes[0] === '<lambda>') { one(A ? `Comparator<${A}>` : 'Comparator'); return 'void'; }
    }
    if (MAP_TYPES.has(b)) {
      const K = A ?? 'Object', V = B ?? 'Object';
      const keyVal = (i, T) => { if (!assignable(argTypes[i], T, classes)) throw err(`マップ ${ot} の${T === K ? 'キー' : '値'}に ${argTypes[i]} の値は使えません`, n.loc, `method ${name} in ${ownerText(b)} cannot be applied to given types;`); };
      switch (name) {
        case 'forEach': one(`BiConsumer<${K},${V}>`); return 'void';
        case 'replaceAll': one(`BiFunction<${K},${V},${V}>`); return 'void';
        case 'merge': keyVal(0, K); keyVal(1, V); one(`BiFunction<${V},${V},${V}>`); return V;
        case 'computeIfAbsent': keyVal(0, K); one(`Function<${K},${V}>`); return V;
        case 'computeIfPresent': case 'compute': keyVal(0, K); one(`BiFunction<${K},${V},${V}>`); return V;
      }
    }
    return undefined;
  }

  /** new HashMap<>(…)・new HashSet<>(…) の引数（なし・容量の int・同じ種類のコレクション。ADR-009） */
  function checkCollectionCtor(n, name, argTypes) {
    if (argTypes.length === 0) return;
    const a = argTypes[0];
    const isMapCls = MAP_TYPES.has(name);
    const ok = argTypes.length === 1 && (a === null
      || (name.startsWith('Tree') && (a === '<lambda>' || baseType(a) === 'Comparator'))
      || (name !== 'TreeMap' && name !== 'TreeSet' && widens(unboxType(a), 'int'))
      || (isMapCls ? MAP_TYPES.has(baseType(a)) : isIterableType(a)));
    if (!ok) throw err(`${name} を作るときに渡せるのは、${isMapCls ? 'マップ' : 'コレクション'}${name.startsWith('Tree') ? '' : 'か容量（int）'}だけです`, n.loc, `no suitable constructor found for ${name}(${argTypes.join(',')})`);
  }

  /** Map のメソッドの戻り値の型（キー・値の型も確かめる。ADR-009） */
  function mapCallType(n, name, ot, argTypes, loc) {
    const [K = 'Object', V = 'Object'] = typeArgs(ot);
    const need = (i, T) => {
      if (!assignable(argTypes[i], T, classes)) {
        throw err(`マップ ${ot} の${i === 0 && name !== 'getOrDefault' ? 'キー' : '値'}に ${argTypes[i]} の値は使えません（キーは ${K}、値は ${V} です）`, n.loc,
          `method ${name} in ${ownerText(baseType(ot))} cannot be applied to given types;`);
      }
    };
    switch (name) {
      case 'size': case 'hashCode': return 'int';
      case 'isEmpty': case 'containsKey': case 'containsValue': case 'equals': return 'boolean';
      case 'get': case 'remove': return V;
      case 'getOrDefault': need(1, V); return V;
      case 'put': case 'putIfAbsent': case 'replace': need(0, K); need(1, V); return V;
      case 'clear': case 'putAll': return 'void';
      case 'keySet': return `Set<${K}>`;
      case 'values': return `Collection<${V}>`;
      case 'entrySet': return `Set<Entry<${K},${V}>>`;
      case 'toString': return 'String';
      case 'firstKey': case 'lastKey': if (baseType(ot) === 'TreeMap') return K; break;
    }
    throw err(`マップ（${baseType(ot)}）に ${name}(…) はありません（まだ対応していないメソッドかもしれません）`, loc, 'cannot find symbol');
  }

  /** Set・Collection のメソッドの戻り値の型（ADR-009） */
  function setCallType(n, name, ot, argTypes, loc) {
    const E = typeArgs(ot)[0] ?? 'Object';
    switch (name) {
      case 'size': case 'hashCode': return 'int';
      case 'isEmpty': case 'contains': case 'remove': case 'equals': case 'containsAll': case 'addAll': case 'removeAll': case 'retainAll': return 'boolean';
      case 'add':
        if (!assignable(argTypes[0], E, classes)) {
          throw err(`${E} の集合に ${argTypes[0]} の値は入れられません`, n.loc, `method add in ${ownerText(baseType(ot))} cannot be applied to given types;`);
        }
        return 'boolean';
      case 'clear': return 'void';
      case 'toString': return 'String';
      case 'first': case 'last': if (baseType(ot) === 'TreeSet') return E; break;
    }
    throw err(`${baseType(ot)} に ${name}(…) はありません（まだ対応していないメソッドかもしれません）`, loc, 'cannot find symbol');
  }

  /** Map.Entry のメソッドの戻り値の型（ADR-009） */
  function entryCallType(name, ot, argTypes, loc) {
    const [K = 'Object', V = 'Object'] = typeArgs(ot);
    switch (name) {
      case 'getKey': return K;
      case 'getValue': case 'setValue': return V;
      case 'toString': return 'String';
      case 'equals': return 'boolean';
      case 'hashCode': return 'int';
    }
    throw err(`Map.Entry に ${name}(…) はありません`, loc, 'cannot find symbol');
  }

  /** ArrayList・List のメソッドの戻り値の型（引数の型も確かめる。ADR-007） */
  function listCallType(n, name, ot, argTypes, loc) {
    markType(n, 'argTypes', argTypes);   // remove(int) と remove(Object) の区別に使う
    const E = typeArgs(ot)[0] ?? 'Object';
    const elemArg = (i) => {
      if (!assignable(argTypes[i], E, classes)) {
        // add は add(E) と add(int, E) の 2 つの形があるので、javac は「当てはまるメソッドがない」と書く
        const javac = name === 'add' ? `no suitable method found for add(${argTypes.join(',')})` : `incompatible types: ${argTypes[i]} cannot be converted to ${E}`;
        throw err(`${E} のリストに ${argTypes[i]} の値は入れられません`, n.loc, javac);
      }
    };
    const indexArg = (i) => {
      if (argTypes[i] !== null && !widens(unboxType(argTypes[i]), 'int')) {
        throw err('リストの位置（添字）には int の値を使います', n.arguments[i].loc, `incompatible types: ${argTypes[i]} cannot be converted to int`);
      }
    };
    switch (name) {
      case 'size': case 'indexOf': case 'lastIndexOf': case 'hashCode': return 'int';
      case 'isEmpty': case 'contains': case 'equals': case 'addAll': return 'boolean';
      case 'clear': case 'sort': return 'void';
      case 'toString': return 'String';
      case 'get': indexArg(0); return E;
      case 'set': indexArg(0); elemArg(1); return E;
      case 'add':
        if (argTypes.length === 2) { indexArg(0); elemArg(1); return 'void'; }
        elemArg(0);
        return 'boolean';
      case 'remove': return argTypes[0] && ['int', 'short', 'byte', 'char'].includes(argTypes[0]) ? E : 'boolean';
    }
    throw err(`リスト（${baseType(ot)}）に ${name}(…) はありません（まだ対応していないメソッドかもしれません）`, loc, 'cannot find symbol');
  }

  /**
   * メソッドの呼び出しの戻り値の型。引数のラムダ式・メソッド参照は、呼ぶメソッドが決まってから、その引数の型で調べる
   * （fnTargets[i] に入れる先の型を置く。分からなければ null で調べる。ADR-010）
   */
  function callType(n, locals, ctx) {
    const c = n.callee;
    // 受け手の型を引数より先に求める（stream().collect(Collectors.groupingBy(s -> …)) の s の型を、引数の中で使う。ADR-011）
    const pre = c.type === 'MemberExpression' && c.object.type !== 'Super' && !n.constructorCall ? { ot: expr(c.object, locals, ctx) } : null;
    let actx = ctx;
    if (pre?.ot && c.property.name === 'collect' && baseType(pre.ot) === 'Stream') actx = { ...ctx, collectorElem: typeArgs(pre.ot)[0] ?? null };
    const argTypes = n.arguments.map(a => (isFn(a) ? '<lambda>' : expr(a, locals, actx)));
    const fnTargets = [];
    const r = callTypeInner(n, locals, ctx, argTypes, fnTargets, pre);
    n.arguments.forEach((a, i) => { if (isFn(a)) checkFn(a, fnTargets[i] ?? null, locals, ctx); });
    // 戻り値の型が、ラムダ式の本体の型で決まるもの（map(x -> …)）は、ラムダ式を調べてから求める
    return typeof r === 'function' ? r() : r;
  }

  function callTypeInner(n, locals, ctx, argTypes, fnTargets, pre) {
    const c = n.callee;
    if (n.constructorCall) return 'void';
    const userCall = (cls, name, { staticOnly = false, fromStatic = false } = {}) => {
      const cands = findMethods(cls, name).filter(m => !staticOnly || m.static);
      if (!cands.length) {
        throw err(`メソッド ${name} が見つかりません（つづりと、どのクラスのメソッドかを確かめてください）`, c.loc, 'cannot find symbol');
      }
      // メソッドの引数には、定数の縮小（char c = 97; の形）は当てはまらない（JLS 5.3）ので、式を渡さない
      const ok = cands.filter(m => m.paramTypes.length === argTypes.length
        && m.paramTypes.every((p, i) => assignable(argTypes[i], p, classes)));
      if (!ok.length) {
        const m = cands[0];
        throw err(`メソッド ${name} に渡す引数の数か型が合いません（${name}(${m.paramTypes.join(', ')}) に ${argTypes.length} 個の引数（${argTypes.map(t => t ?? '?').join(', ')}）を渡しています）`,
          n.loc, `method ${name} in class ${cls.name} cannot be applied to given types;`);
      }
      if (fromStatic && ok.every(m => !m.static)) {
        throw err(`static メソッドの中から、インスタンスのメソッド ${name} は呼べません`, n.loc,
          `non-static method ${name}(${ok[0].paramTypes.join(',')}) cannot be referenced from a static context`);
      }
      const m = mostSpecific(ok, argTypes);
      markSignature(n, m);
      m.paramTypes.forEach((p, i) => { markUnbox(n.arguments[i], argTypes[i], p); fnTargets[i] = p; });
      for (const t of m.throws ?? []) requireHandled(t, n.loc, ctx);
      return m.returnType;
    };
    if (c.type === 'Identifier') { markType(n, 'recvType', ctx.cls.name); return userCall(ctx.cls, c.name, { fromStatic: ctx.isStatic }); }
    const name = c.property.name;
    if (c.object.type === 'Super') return ctx.cls.superClass?.builtin ? null : userCall(ctx.cls.superClass, name);
    const ot = pre ? pre.ot : expr(c.object, locals, ctx);
    markType(n, 'recvType', ot?.startsWith('class:') ? ot.slice(6) : ot);
    if (ot === null) return null;
    if (ot.startsWith('builtin:')) {
      const b = ot.slice(8);
      // Collections.sort(list, (a, b) -> …)・Collections.max(list, 比べ方)・Arrays.sort(配列, 比べ方)（ADR-010）
      if ((b === 'Collections' && /^(sort|max|min)$/.test(name)) || (b === 'Arrays' && name === 'sort')) {
        const a0 = argTypes[0];
        const E = !a0 ? null : b === 'Arrays' ? (isArrayType(a0) ? elemTypeOf(a0) : null) : typeArgs(a0)[0] ?? null;
        if (argTypes.length === 2) fnTargets[1] = E ? `Comparator<${E}>` : 'Comparator';
      }
      if (b === 'Comparator') fnTargets.fill(null, 0, argTypes.length);
      if (b === 'Collectors') return collectorType(n, name, argTypes, fnTargets, ctx.collectorElem ?? null);
      const r = STATIC_RETURNS[b]?.[name];
      return typeof r === 'function' ? r(argTypes) : r ?? null;
    }
    if (ot.startsWith('class:')) {
      const cls = classes.get(ot.slice(6));
      // enum の values()・valueOf(String)（ADR-008）
      if (cls?.kind === 'enum' && !findMethods(cls, name).some(m => m.static)) {
        if (name === 'values') return `${cls.name}[]`;
        if (name === 'valueOf') return cls.name;
      }
      return cls ? userCall(cls, name, { staticOnly: true }) : null;
    }
    if (ot === 'PrintStream') return 'void';
    if (ot === 'Scanner') {
      if (!(name in SCANNER_METHODS)) throw err(`Scanner に ${name}(…) はありません（まだ対応していないメソッドかもしれません）`, c.loc, 'cannot find symbol');
      return SCANNER_METHODS[name];
    }
    if (ot === 'String') return STRING_METHODS[name] ?? null;
    if (STREAM_TYPES.has(baseType(ot)) && !classes.has(baseType(ot))) return streamCallType(n, name, ot, argTypes, fnTargets, c.loc);
    // コレクションの、ラムダ式を受け取るメソッド（ADR-010）
    const lam = lambdaMethodType(n, ot, name, argTypes, fnTargets);
    if (lam !== undefined) return lam;
    if (LIST_TYPES.has(baseType(ot))) return listCallType(n, name, ot, argTypes, c.loc);
    if (SET_TYPES.has(baseType(ot))) return setCallType(n, name, ot, argTypes, c.loc);
    if (MAP_TYPES.has(baseType(ot))) return mapCallType(n, name, ot, argTypes, c.loc);
    // java.util.function のインターフェース・Comparator の値のメソッド（f.apply(3)・cmp.reversed()）
    const fb = baseType(ot);
    if (FUNCTIONAL[fb] && !classes.has(fb)) {
      const fd = fiDescriptor(ot, classes);
      if (name === fd.name) {
        if (argTypes.length !== fd.params.length) {
          throw err(`${fb} の ${name} に渡す引数の数が合いません（${fd.params.length} 個）`, n.loc, `method ${name} in interface ${fb}${typeArgs(ot).length ? `<${typeArgs(ot).map((_, i) => 'TUR'[i]).join(',')}>` : ''} cannot be applied to given types;`);
        }
        fd.params.forEach((p, i) => { if (p && !assignable(argTypes[i], p, classes)) throw incompatible(argTypes[i], p, n.arguments[i].loc); markUnbox(n.arguments[i], argTypes[i], p); });
        return fd.ret;
      }
      const dflt = FUNCTIONAL_DEFAULTS[fb];
      if (dflt && name in dflt) {
        if (dflt[name] === 'self' && /^(and|or)$/.test(name)) fnTargets[0] = ot;
        return dflt[name] === 'self' ? ot : null;
      }
      throw err(`${fb} に ${name}(…) はありません（${fb} の値で呼べるのは ${fd.name}(…) です）`, c.loc, 'cannot find symbol');
    }
    if (baseType(ot) === 'Entry') return entryCallType(name, ot, argTypes, c.loc);
    if (ot === 'StringBuilder') {
      if (!(name in SB_METHODS)) throw err(`StringBuilder に ${name}(…) はありません（まだ対応していないメソッドかもしれません）`, c.loc, 'cannot find symbol');
      return SB_METHODS[name];
    }
    if (BOXES[ot]) {
      if (!(name in WRAPPER_METHODS)) throw err(`${ot} に ${name}(…) はありません（まだ対応していないメソッドかもしれません）`, c.loc, 'cannot find symbol');
      return WRAPPER_METHODS[name];
    }
    if (isPrimitiveType(ot)) throw err(`${ot} の値にはメソッドがありません（${name}(…) は呼べません）`, c.loc, `${ot} cannot be dereferenced`);
    const cls = classes.get(baseType(ot));
    if (cls && findMethods(cls, name).length) return userCall(cls, name);
    if (cls?.kind === 'enum' && ENUM_METHODS[name]) return ENUM_METHODS[name];
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
        const a0 = expr(n.left, locals, ctx), b0 = expr(n.right, locals, ctx);
        const op = n.operator;
        if (op === '+' && (a0 === 'String' || b0 === 'String')) return 'String';
        // == と != は、両方がラッパー型なら参照の比較、片方だけならアンボクシングして値の比較（ADR-007）
        const both = BOXES[a0] && BOXES[b0];
        const a = (op === '==' || op === '!=') && both ? a0 : unboxType(a0), b = (op === '==' || op === '!=') && both ? b0 : unboxType(b0);
        if ((op === '==' || op === '!=') && both) markType(n, 'boxedCompare', a0);
        // 片方が文字列の + は toString なので取り出さない。それ以外のラッパー型は取り出して計算する
        // == と != は、もう片方がプリミティブ型のときだけ取り出す（x == null は参照の比較）
        const eq = op === '==' || op === '!=';
        if (!both && !(op === '+' && (a0 === 'String' || b0 === 'String'))) {
          if (!eq || isPrimitiveType(b0)) markUnbox(n.left, a0, a);
          if (!eq || isPrimitiveType(a0)) markUnbox(n.right, b0, b);
        }
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
        const t0 = expr(n.argument, locals, ctx);
        const t = unboxType(t0);
        markUnbox(n.argument, t0, t);
        if (n.operator === '!') { if (t !== null && t !== 'boolean') throw err('「!」は boolean の値に使います', n.loc, `bad operand type ${t} for unary operator '!'`); return 'boolean'; }
        return t === null ? null : promote(t, 'int');
      }
      case 'UpdateExpression': {
        const t = expr(n.argument, locals, ctx);
        requireAssignable(n.argument, locals, ctx, true);
        if (t !== null && !isNumericType(unboxType(t))) throw err(`「${n.operator}」は数の変数に使います`, n.loc, `bad operand type ${t} for unary operator '${n.operator}'`);
        return t;
      }
      case 'AssignmentExpression': {
        const lt = expr(n.left, locals, ctx);
        requireAssignable(n.left, locals, ctx, n.operator !== '=');
        if (n.operator === '=') inferDiamond(n.right, lt);
        const rt = exprT(n.right, lt, locals, ctx);
        if (n.operator === '=' && !assignable(rt, lt, classes, n.right)) throw incompatibleValue(rt, lt, n.right);
        if (n.operator === '=') markUnbox(n.right, rt, lt);
        else if (lt !== 'String') markUnbox(n.right, rt, 'int');
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
        // 参照の型どうし：片方がもう片方に渡せるなら、広い方の型（d : a は Animal）
        if (a && b && !isPrimitiveType(a) && !isPrimitiveType(b)) {
          if (assignable(a, b, classes)) return b;
          if (assignable(b, a, classes)) return a;
        }
        return null;
      }
      case 'SequenceExpression': { let t = null; for (const e of n.expressions) t = expr(e, locals, ctx); return t; }
      case 'CallExpression': return callType(n, locals, ctx);
      case 'MemberExpression': {
        if (n.computed) {
          const at = expr(n.object, locals, ctx);
          markType(n, 'objType', at);
          const it = expr(n.property, locals, ctx);
          if (it !== null && !widens(unboxType(it), 'int')) throw err('配列の添字には int の値を使います', n.property.loc, `incompatible types: ${it} cannot be converted to int`);
          if (at === null) return null;
          if (!isArrayType(at)) throw err(`${at} は配列ではないので [ ] は使えません`, n.loc, `array required, but ${at} found`);
          return elemTypeOf(at);
        }
        const name = n.property.name;
        if (n.object.type === 'Super') return instanceFields(ctx.cls.superClass).find(f => f.name === name)?.type ?? null;
        const ot = expr(n.object, locals, ctx);
        markType(n, 'objType', ot);
        if (ot === null) return null;
        if (isArrayType(ot)) {
          if (name === 'length') return 'int';
          throw err(`配列に ${name} はありません（長さは length）`, n.loc, 'cannot find symbol');
        }
        if (COLL_SUPER[baseType(ot)] !== undefined) {
          if (!LIST_TYPES.has(baseType(ot))) throw err(`${baseType(ot)} に ${name} はありません${name === 'length' ? '（要素の数は size() で調べます）' : ''}`, n.loc, 'cannot find symbol');
          throw err(`リストに ${name} はありません${name === 'length' ? '（リストの長さは size() で調べます）' : ''}`, n.loc, 'cannot find symbol');
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
        knownType(n.genericType ?? name, n.callee.loc);
        const argTypes = n.arguments.map(a => (isFn(a) ? '<lambda>' : expr(a, locals, ctx)));
        const checkFnArgs = (ps = []) => n.arguments.forEach((a, i) => { if (isFn(a)) checkFn(a, ps[i] ?? null, locals, ctx); });
        // ArrayList（型引数つき）・StringBuilder（ADR-007）。要素の型の印は、評価器が表示（ArrayList<Integer>）に使う
        if (name === 'ArrayList' && !classes.has(name)) {
          const e = typeArgs(n.genericType ?? '')[0];
          if (e) markType(n, 'elemType', e);
          return n.genericType ?? 'ArrayList';
        }
        if (name === 'StringBuilder' && !classes.has(name)) return 'StringBuilder';
        // HashMap・HashSet など（ADR-009）。型引数（<> は代入先から決めた印）を、評価器が表示（HashMap<String, Integer>）に使う
        if ((MAP_TYPES.has(name) || SET_TYPES.has(name)) && !classes.has(name)) {
          if (name === 'Map' || name === 'Set' || name === 'Collection') {
            throw err(`インターフェース ${name} は new で作れません（Hash${name === 'Collection' ? 'Set' : name} などを new します）`, n.loc, `${name} is abstract; cannot be instantiated`);
          }
          const ta = typeArgs(n.genericType ?? '');
          if (ta.length) markType(n, 'typeArgs', ta);
          checkCollectionCtor(n, name, argTypes);
          // new TreeMap<>(比べ方)・new TreeSet<>((a, b) -> b - a)（ADR-010）
          const K = ta[0] ?? n.typeArgs?.[0] ?? null;
          checkFnArgs([K ? `Comparator<${K}>` : 'Comparator']);
          return n.genericType ?? name;
        }
        const cls = classes.get(name);
        if (cls?.kind === 'enum') throw err(`enum の ${name} は new で作れません（定数を使います）`, n.loc, 'enum classes may not be instantiated');
        if (cls?.abstract) {
          throw err(`${cls.kind === 'interface' ? 'インターフェース' : '抽象クラス'} ${name} は new で作れません（実装したクラスを new します）`, n.loc, `${name} is abstract; cannot be instantiated`);
        }
        if (cls) {
          if (cls.ctors.length === 0 && argTypes.length) {
            throw err(`クラス ${name} のコンストラクタは引数を受け取りません`, n.loc, `constructor ${name} in class ${name} cannot be applied to given types;`);
          }
          const okCtors = cls.ctors.filter(m => m.paramTypes.length === argTypes.length
            && m.paramTypes.every((p, i) => assignable(argTypes[i], p, classes)));
          if (cls.ctors.length && !okCtors.length) {
            throw err(`クラス ${name} のコンストラクタに渡す引数の数か型が合いません`, n.loc, `constructor ${name} in class ${name} cannot be applied to given types;`);
          }
          if (okCtors.length) {
            const c = mostSpecific(okCtors, argTypes);
            markSignature(n, c);
            checkFnArgs(c.paramTypes);
            for (const t of c.throws ?? []) requireHandled(t, n.loc, ctx);
          }
        }
        checkFnArgs();
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
          markUnbox(e, t, n.elemType);
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
      case 'InstanceofExpression':
        expr(n.expression, locals, ctx);
        knownType(n.targetType, n.loc);
        // o instanceof String s：s を宣言する（本物は当てはまる所だけで使える。ここでは、そのあとのブロックで使えるとゆるめに扱う）
        if (n.binding) {
          if (locals.get(n.binding.name) !== undefined) throw redeclared(n.binding.name, n.binding.loc, ctx);
          locals.vars.set(n.binding.name, n.targetType);
        }
        return 'boolean';
      case 'SwitchExpression': return switchExprType(n, locals, ctx);
      case 'LambdaExpression': case 'MethodReference': return checkFn(n, null, locals, ctx);
    }
    return null;
  }
}
