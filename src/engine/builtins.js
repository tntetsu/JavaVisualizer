/**
 * builtins.js — 組み込みのクラスとメソッド（Phase 0 スパイク）
 *
 * System.out（println・print・printf）、Math、Integer、Double、Character、String の static メソッドと
 * インスタンスのメソッド、Arrays.toString、String.format。
 *
 * 組み込みのクラスは JBuiltin（スナップショットでは参照を保持する）。メンバーは定数か関数
 * (args, ctx) => value。ctx.str(v) は String.valueOf（ユーザーの toString を呼ぶ）。
 */
import {
  JavaError, makeDouble, makeChar, makeString, makeArray,
  isInt, isLong, isDouble, isChar, isBool, isString, isArray, num, doubleToString, shortestDecimal,
} from './values.js';

export class JBuiltin {
  constructor(name, members, pkg = 'java.lang') {
    this.name = name;
    this.members = members;
    this.pkg = pkg;
  }
  toString() { return `class ${this.name}`; }
}
export const isBuiltin = (v) => v instanceof JBuiltin;

const S = (s) => makeString(s);
const argErr = (name) => new JavaError('IllegalArgumentException', name);

// ── 書式（printf・String.format） ────────────────────────────────────────────

const shortestDigits = shortestDecimal;

/**
 * 小数点以下 prec 桁に HALF_UP で丸めた 10 進の文字列（Java の Formatter と同じく、最短の桁をもとに丸める）
 * @returns {string} 例 '3.14'
 */
export function fixedHalfUp(a, prec) {
  if (a === 0) return prec > 0 ? `0.${'0'.repeat(prec)}` : '0';
  const { digits, exp } = shortestDigits(a);
  // 小数点の位置：digits の先頭の桁は 10^exp の位
  let intDigits, fracDigits;
  if (exp >= 0) {
    intDigits = digits.slice(0, exp + 1).padEnd(exp + 1, '0');
    fracDigits = digits.slice(exp + 1);
  } else {
    intDigits = '0';
    fracDigits = '0'.repeat(-exp - 1) + digits;
  }
  if (fracDigits.length <= prec) {
    const f = fracDigits.padEnd(prec, '0');
    return prec > 0 ? `${intDigits}.${f}` : intDigits;
  }
  const keep = intDigits + fracDigits.slice(0, prec);
  const roundUp = fracDigits[prec] >= '5';
  let n = BigInt(keep) + (roundUp ? 1n : 0n);
  let s = n.toString().padStart(keep.length, '0');
  const ip = s.slice(0, s.length - prec) || '0';
  const fp = s.slice(s.length - prec);
  return prec > 0 ? `${ip}.${fp}` : ip;
}

/** %e の形（1.234560e+01） */
function expHalfUp(a, prec) {
  if (a === 0) return `${prec > 0 ? `0.${'0'.repeat(prec)}` : '0'}e+00`;
  const { digits, exp } = shortestDigits(a);
  let e = exp;
  let d = digits;
  if (d.length > prec + 1) {
    const keep = d.slice(0, prec + 1);
    let n = BigInt(keep) + (d[prec + 1] >= '5' ? 1n : 0n);
    let s = n.toString();
    if (s.length > keep.length) { e += 1; s = s.slice(0, -1); }
    d = s;
  } else d = d.padEnd(prec + 1, '0');
  const mant = prec > 0 ? `${d[0]}.${d.slice(1)}` : d[0];
  return `${mant}e${e < 0 ? '-' : '+'}${String(Math.abs(e)).padStart(2, '0')}`;
}

const group = (intStr) => intStr.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

function boxedName(v) {
  if (isInt(v)) return 'java.lang.Integer';
  if (isLong(v)) return 'java.lang.Long';
  if (isDouble(v)) return 'java.lang.Double';
  if (isChar(v)) return 'java.lang.Character';
  if (isBool(v)) return 'java.lang.Boolean';
  if (isString(v)) return 'java.lang.String';
  return 'java.lang.Object';
}

/**
 * Java の Formatter（printf・String.format）の主な書式：%d %s %S %f %e %c %b %x %X %o %n %%、
 * フラグ - 0 + 空白 , (、幅、精度、引数の番号（%1$d）
 */
export function javaFormat(fmt, args, ctx) {
  let ai = 0;
  return fmt.replace(/%(\d+\$)?([-#+ 0,(]*)(\d+)?(\.\d+)?([a-zA-Z%])/g, (spec, idx, flags, width, precS, conv) => {
    if (conv === 'n') return '\n';
    if (conv === '%') return pad('%', flags, width);
    let arg;
    if (idx) arg = args[Number(idx.slice(0, -1)) - 1];
    else {
      if (ai >= args.length) throw new JavaError('MissingFormatArgumentException', `Format specifier '${spec}'`);
      arg = args[ai++];
    }
    const prec = precS ? Number(precS.slice(1)) : null;
    const badConv = () => new JavaError('IllegalFormatConversionException', `${conv} != ${boxedName(arg)}`);
    switch (conv) {
      case 'd': {
        if (arg === null) return pad('null', flags, width);
        if (!isInt(arg) && !isLong(arg)) throw badConv();
        let s = (arg < 0 ? -BigInt(arg) : BigInt(arg)).toString();
        if (flags.includes(',')) s = group(s);
        return signPad(s, arg < 0, flags, width);
      }
      case 'x': case 'X': case 'o': {
        if (!isInt(arg) && !isLong(arg)) throw badConv();
        const bits = isLong(arg) ? 64 : 32;
        const u = BigInt.asUintN(bits, BigInt(arg));
        let s = u.toString(conv === 'o' ? 8 : 16);
        if (conv === 'X') s = s.toUpperCase();
        return pad(s, flags, width);
      }
      case 'f': case 'e': case 'E': {
        if (arg === null) return pad('null', flags, width);
        if (!isDouble(arg)) throw badConv();
        const v = arg.v;
        if (Number.isNaN(v)) return pad('NaN', flags, width);
        if (!Number.isFinite(v)) return signPad('Infinity', v < 0, flags, width);
        const p = prec ?? 6;
        let s = conv === 'f' ? fixedHalfUp(Math.abs(v), p) : expHalfUp(Math.abs(v), p);
        if (conv === 'E') s = s.toUpperCase();
        if (flags.includes(',') && conv === 'f') { const [i, f] = s.split('.'); s = group(i) + (f !== undefined ? `.${f}` : ''); }
        return signPad(s, v < 0 || Object.is(v, -0), flags, width);
      }
      case 's': case 'S': {
        let s = ctx.str(arg);
        if (prec !== null) s = s.slice(0, prec);
        if (conv === 'S') s = s.toUpperCase();
        return pad(s, flags, width);
      }
      case 'c': {
        if (arg === null) return pad('null', flags, width);
        if (isChar(arg)) return pad(String.fromCharCode(arg.code), flags, width);
        if (isInt(arg)) return pad(String.fromCodePoint(arg), flags, width);
        throw badConv();
      }
      case 'b': case 'B': {
        const s = String(arg === null ? false : isBool(arg) ? arg : true);
        return pad(conv === 'B' ? s.toUpperCase() : s, flags, width);
      }
    }
    throw new JavaError('UnknownFormatConversionException', `Conversion = '${conv}'`);
  });
}

function pad(s, flags, width) {
  const w = width ? Number(width) : 0;
  if (s.length >= w) return s;
  return flags.includes('-') ? s.padEnd(w) : s.padStart(w);
}

function signPad(body, negative, flags, width) {
  let sign = negative ? '-' : flags.includes('+') ? '+' : flags.includes(' ') ? ' ' : '';
  let s = body;
  if (negative && flags.includes('(')) { sign = ''; s = `(${body})`; }
  const w = width ? Number(width) : 0;
  if (flags.includes('0') && !flags.includes('-')) return sign + s.padStart(Math.max(0, w - sign.length), '0');
  return pad(sign + s, flags, width);
}

// ── 数の解析 ──────────────────────────────────────────────────────────────────

export function parseIntJava(s, radix = 10) {
  const str = s === null ? null : s.s;
  const fail = () => new JavaError('NumberFormatException', str === null ? 'Cannot parse null string: null' : `For input string: "${str}"${radix !== 10 ? ` under radix ${radix}` : ''}`);
  if (str === null || str === '') throw fail();
  const digits = radix === 10 ? /^[+-]?\d+$/ : radix === 16 ? /^[+-]?[0-9a-fA-F]+$/ : radix === 2 ? /^[+-]?[01]+$/ : /^[+-]?[0-7]+$/;
  if (!digits.test(str)) throw fail();
  const neg = str[0] === '-';
  const body = str.replace(/^[+-]/, '');
  const prefix = radix === 16 ? '0x' : radix === 2 ? '0b' : radix === 8 ? '0o' : '';
  let v = BigInt(prefix + body);
  if (neg) v = -v;
  if (v > 2147483647n || v < -2147483648n) throw fail();
  return Number(v);
}

export function parseDoubleJava(s) {
  if (s === null) throw new JavaError('NullPointerException', null);
  const t = s.s.trim();
  if (/^[+-]?(NaN|Infinity)$/.test(t)) return makeDouble(Number(t));
  if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?[fFdD]?$/.test(t)) {
    throw new JavaError('NumberFormatException', t === '' ? 'empty String' : `For input string: "${s.s}"`);
  }
  return makeDouble(Number(t.replace(/[fFdD]$/, '')));
}

// ── String のメソッド ─────────────────────────────────────────────────────────

const sioobe = (msg) => new JavaError('StringIndexOutOfBoundsException', msg);

function needInt(v, what) {
  if (!isInt(v)) throw argErr(`${what}: int が必要です`);
  return v;
}

/** String のインスタンスのメソッド。見つからなければ undefined を返す */
export function callStringMethod(str, name, args, ctx) {
  const s = str.s;
  const a0 = args[0];
  switch (name) {
    case 'length': return s.length;
    case 'charAt': {
      const i = needInt(a0, 'charAt');
      if (i < 0 || i >= s.length) throw sioobe(`Index ${i} out of bounds for length ${s.length}`);
      return makeChar(s.charCodeAt(i));
    }
    case 'substring': {
      const b = needInt(a0, 'substring');
      const e = args.length > 1 ? needInt(args[1], 'substring') : s.length;
      if (b < 0 || e > s.length || b > e) throw sioobe(`begin ${b}, end ${e}, length ${s.length}`);
      return S(s.slice(b, e));
    }
    case 'indexOf': case 'lastIndexOf': {
      const t = isChar(a0) ? String.fromCharCode(a0.code) : isInt(a0) ? String.fromCodePoint(a0) : ctx.str(a0);
      if (name === 'indexOf') return args.length > 1 ? s.indexOf(t, Math.max(0, args[1])) : s.indexOf(t);
      return args.length > 1 ? s.lastIndexOf(t, args[1]) : s.lastIndexOf(t);
    }
    case 'equals': return isString(a0) && a0.s === s;
    case 'equalsIgnoreCase': return isString(a0) && a0.s.toLowerCase() === s.toLowerCase();
    case 'compareTo': {
      if (a0 === null) throw new JavaError('NullPointerException', null);
      const t = a0.s;
      const n = Math.min(s.length, t.length);
      for (let i = 0; i < n; i++) if (s.charCodeAt(i) !== t.charCodeAt(i)) return s.charCodeAt(i) - t.charCodeAt(i);
      return s.length - t.length;
    }
    case 'isEmpty': return s.length === 0;
    case 'isBlank': return s.trim() === '';
    case 'contains': return s.includes(ctx.str(a0));
    case 'startsWith': return s.startsWith(a0.s);
    case 'endsWith': return s.endsWith(a0.s);
    case 'toUpperCase': return S(s.toUpperCase());
    case 'toLowerCase': return S(s.toLowerCase());
    case 'trim': return S(s.replace(/^[\x00-\x20]+|[\x00-\x20]+$/g, ''));
    case 'strip': return S(s.trim());
    case 'concat': return S(s + a0.s);
    case 'repeat': {
      if (a0 < 0) throw argErr(`count is negative: ${a0}`);
      return S(s.repeat(a0));
    }
    case 'replace': {
      const f = isChar(a0) ? String.fromCharCode(a0.code) : a0.s;
      const t = isChar(args[1]) ? String.fromCharCode(args[1].code) : args[1].s;
      return S(s.split(f).join(t));
    }
    case 'toCharArray': return makeArray('char', [...s].map(c => makeChar(c.charCodeAt(0))));
    case 'split': {
      // 正規表現の split（Java は末尾の空の要素を取り除く）
      const parts = s.split(new RegExp(a0.s));
      while (parts.length > 1 && parts[parts.length - 1] === '') parts.pop();
      if (s === '') return makeArray('String', [S('')]);
      return makeArray('String', parts.map(S));
    }
    case 'hashCode': {
      let h = 0;
      for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
      return h;
    }
    case 'toString': case 'intern': return name === 'intern' ? ctx.intern(s) : str;
  }
  return undefined;
}

// ── 組み込みのクラス ──────────────────────────────────────────────────────────

const ddd = (f) => (args) => makeDouble(f(...args.map(num)));

/** Math.round(double)：floor(x + 0.5)（long を返す） */
function mathRound(v) {
  if (isDouble(v)) {
    const x = v.v;
    if (Number.isNaN(x)) return 0n;
    return BigInt(Math.floor(x + 0.5));
  }
  return BigInt(num(v));
}

function absOrMinMax(name, args) {
  const [a, b] = args;
  const pick = (f) => {
    if (isDouble(a) || isDouble(b)) return makeDouble(f(num(a), num(b ?? 0)));
    if (isLong(a) || isLong(b)) { const x = BigInt(num(a)), y = b === undefined ? 0n : BigInt(isLong(b) ? b : num(b)); return f === Math.max ? (x > y ? x : y) : (x < y ? x : y); }
    return f(num(a), num(b ?? 0));
  };
  if (name === 'abs') {
    if (isDouble(a)) return makeDouble(Math.abs(a.v));
    if (isLong(a)) return BigInt.asIntN(64, a < 0n ? -a : a);
    return Math.abs(num(a)) | 0;
  }
  return pick(name === 'max' ? Math.max : Math.min);
}

/**
 * Math.random() の乱数。実行ごとに同じ列にすると、本物の Java と結果は違っても何度でも同じ動きを見られる。
 * Phase 0 では 48 ビットの線形合同法（java.util.Random と同じ式）を種 42 で使う
 */
let seed = 0n;
export function resetRandom(s = 42n) { seed = (BigInt(s) ^ 0x5DEECE66Dn) & ((1n << 48n) - 1n); }
function nextBits(bits) {
  seed = (seed * 0x5DEECE66Dn + 0xBn) & ((1n << 48n) - 1n);
  return Number(seed >> BigInt(48 - bits));
}
resetRandom();

/** println(char[]) は文字を並べて出す（ほかの配列は [I@… の形） */
function printArg(v) {
  if (isArray(v) && v.__jelem === 'char') return makeString(v.map(c => String.fromCharCode(c.code)).join(''));
  return v;
}

export function createBuiltins() {
  const out = new JBuiltin('PrintStream', {
    println: (args, ctx) => { ctx.write((args.length ? ctx.str(printArg(args[0])) : '') + '\n'); },
    print: (args, ctx) => { ctx.write(ctx.str(printArg(args[0]))); },
    printf: (args, ctx) => { ctx.write(javaFormat(args[0].s, args.slice(1), ctx)); return null; },
  }, 'java.io');
  return new Map([
    ['System', new JBuiltin('System', { out, in: new JBuiltin('InputStream', {}, 'java.io') })],
    ['Math', new JBuiltin('Math', {
      PI: makeDouble(Math.PI), E: makeDouble(Math.E),
      abs: (a) => absOrMinMax('abs', a), max: (a) => absOrMinMax('max', a), min: (a) => absOrMinMax('min', a),
      pow: ddd(Math.pow), sqrt: ddd(Math.sqrt), cbrt: ddd(Math.cbrt), floor: ddd(Math.floor), ceil: ddd(Math.ceil),
      sin: ddd(Math.sin), cos: ddd(Math.cos), tan: ddd(Math.tan), log: ddd(Math.log), log10: ddd(Math.log10), exp: ddd(Math.exp),
      hypot: ddd(Math.hypot), atan2: ddd(Math.atan2),
      round: ([v]) => mathRound(v),
      random: () => makeDouble((nextBits(26) * 2 ** 27 + nextBits(27)) * 2 ** -53),
    })],
    ['Integer', new JBuiltin('Integer', {
      MAX_VALUE: 2147483647, MIN_VALUE: -2147483648,
      parseInt: ([s, r]) => parseIntJava(s, r ?? 10),
      valueOf: ([s]) => (isString(s) ? parseIntJava(s) : s),
      toString: ([v, r]) => S(r ? (v < 0 ? '-' : '') + Math.abs(v).toString(r) : String(v)),
      toBinaryString: ([v]) => S((v >>> 0).toString(2)),
      toHexString: ([v]) => S((v >>> 0).toString(16)),
      compare: ([a, b]) => (a < b ? -1 : a > b ? 1 : 0),
      sum: ([a, b]) => (a + b) | 0,
    })],
    ['Long', new JBuiltin('Long', { MAX_VALUE: 9223372036854775807n, MIN_VALUE: -9223372036854775808n })],
    ['Double', new JBuiltin('Double', {
      MAX_VALUE: makeDouble(Number.MAX_VALUE), MIN_VALUE: makeDouble(Number.MIN_VALUE),
      POSITIVE_INFINITY: makeDouble(Infinity), NEGATIVE_INFINITY: makeDouble(-Infinity), NaN: makeDouble(NaN),
      parseDouble: ([s]) => parseDoubleJava(s),
      toString: ([v]) => S(doubleToString(num(v))),
      isNaN: ([v]) => Number.isNaN(num(v)),
      compare: ([a, b]) => (num(a) < num(b) ? -1 : num(a) > num(b) ? 1 : 0),
    })],
    ['Character', new JBuiltin('Character', {
      isDigit: ([c]) => /\p{Nd}/u.test(String.fromCharCode(c.code)),
      isLetter: ([c]) => /\p{L}/u.test(String.fromCharCode(c.code)),
      isLetterOrDigit: ([c]) => /[\p{L}\p{Nd}]/u.test(String.fromCharCode(c.code)),
      isUpperCase: ([c]) => /\p{Lu}/u.test(String.fromCharCode(c.code)),
      isLowerCase: ([c]) => /\p{Ll}/u.test(String.fromCharCode(c.code)),
      isWhitespace: ([c]) => /[\t\n\x0b\f\r\x1c-\x1f ]/.test(String.fromCharCode(c.code)),
      toUpperCase: ([c]) => makeChar(String.fromCharCode(c.code).toUpperCase().charCodeAt(0)),
      toLowerCase: ([c]) => makeChar(String.fromCharCode(c.code).toLowerCase().charCodeAt(0)),
      getNumericValue: ([c]) => { const d = parseInt(String.fromCharCode(c.code), 36); return Number.isNaN(d) ? -1 : d; },
    })],
    ['String', new JBuiltin('String', {
      valueOf: ([v], ctx) => S(ctx.str(printArg(v))),
      format: (args, ctx) => S(javaFormat(args[0].s, args.slice(1), ctx)),
      join: ([sep, ...rest], ctx) => {
        const items = rest.length === 1 && isArray(rest[0]) ? rest[0] : rest;
        return S(items.map(x => ctx.str(x)).join(sep.s));
      },
    })],
    ['Arrays', new JBuiltin('Arrays', {
      toString: ([a], ctx) => S(a === null ? 'null' : `[${a.map(x => ctx.str(x)).join(', ')}]`),
      sort: ([a]) => {
        const cmp = (x, y) => (isString(x) ? (x.s < y.s ? -1 : x.s > y.s ? 1 : 0) : num(x) - num(y));
        const sorted = [...a].sort(cmp);
        sorted.forEach((x, i) => { a[i] = x; });
        return undefined;
      },
      fill: ([a, v]) => { a.fill(v); return undefined; },
    }, 'java.util')],
  ]);
}


// ── Scanner（入力欄から読む。ADR-005） ─────────────────────────────────────────

const INT_RE = /^[+-]?\d+$/;
const DOUBLE_RE = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$|^[+-]?(NaN|Infinity)$/;

/**
 * new Scanner(System.in)。input は入力欄の内容（文字列）。区切りは空白（java.util.Scanner の既定）。
 * nextInt などはトークンを読み、行の残りは nextLine が返す（nextInt のあとの nextLine が "" になるのも本物と同じ）
 * @param {{ text: string, pos: number }} input 実行ごとに 1 つ（複数の Scanner は同じ入力を読み進める）
 */
export function createScanner(input) {
  const noSuch = (msg = null) => new JavaError('NoSuchElementException', msg);
  const mismatch = (msg = null) => new JavaError('InputMismatchException', msg);
  const skipSpace = () => { while (input.pos < input.text.length && /\s/.test(input.text[input.pos])) input.pos++; };
  /** 次のトークン（読み進めない）。なければ null */
  const peek = () => {
    let i = input.pos;
    while (i < input.text.length && /\s/.test(input.text[i])) i++;
    if (i >= input.text.length) return null;
    let j = i;
    while (j < input.text.length && !/\s/.test(input.text[j])) j++;
    return { tok: input.text.slice(i, j), end: j };
  };
  const take = () => { const p = peek(); if (!p) throw noSuch(); input.pos = p.end; return p.tok; };
  const intTok = (bits) => {
    const p = peek();
    if (!p) throw noSuch();
    if (!INT_RE.test(p.tok)) throw mismatch();
    const v = BigInt(p.tok);
    const lim = 1n << BigInt(bits - 1);
    if (v >= lim || v < -lim) throw mismatch(`For input string: "${p.tok}"`);
    input.pos = p.end;
    return v;
  };
  return new JBuiltin('Scanner', {
    nextInt: () => Number(intTok(32)),
    nextLong: () => intTok(64),
    nextDouble: () => {
      const p = peek();
      if (!p) throw noSuch();
      if (!DOUBLE_RE.test(p.tok)) throw mismatch();
      input.pos = p.end;
      return makeDouble(Number(p.tok));
    },
    nextBoolean: () => {
      const p = peek();
      if (!p) throw noSuch();
      if (!/^(true|false)$/i.test(p.tok)) throw mismatch();
      input.pos = p.end;
      return p.tok.toLowerCase() === 'true';
    },
    next: () => S(take()),
    nextLine: () => {
      if (input.pos >= input.text.length) throw noSuch('No line found');
      let j = input.text.indexOf('\n', input.pos);
      if (j < 0) j = input.text.length;
      const line = input.text.slice(input.pos, j).replace(/\r$/, '');
      input.pos = Math.min(j + 1, input.text.length + 1);
      return S(line);
    },
    hasNext: () => peek() !== null,
    hasNextInt: () => { const p = peek(); return !!p && INT_RE.test(p.tok) && BigInt(p.tok) < 2147483648n && BigInt(p.tok) >= -2147483648n; },
    hasNextDouble: () => { const p = peek(); return !!p && DOUBLE_RE.test(p.tok); },
    hasNextLine: () => input.pos < input.text.length,
    close: () => undefined,
  }, 'java.util');
}
