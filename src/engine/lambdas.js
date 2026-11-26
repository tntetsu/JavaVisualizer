/**
 * lambdas.js — 組み込みの関数型インターフェースの部品（Comparator.comparing・reversed・Predicate.negate など。ADR-010）
 *
 * ラムダ式・メソッド参照の値は { __type__: 'JLambda', name }（列挙されない __fn に中身）。評価器が作るものは
 * ラムダ式の本体を新しいフレームで実行し、ここで作るもの（native）は JS の関数で計算する。
 * どちらも ctx.call(f, args, メソッド名) で呼ぶ（f が自作のクラスのオブジェクト（implements Comparator）なら、その名前のメソッド）。
 */
import { JavaError, isLambda, isLong, isDouble, num } from './values.js';
import { JBuiltin } from './builtins.js';
import { naturalCompare } from './collections.js';

/**
 * JS の関数で計算するラムダ式の値（Comparator.comparing(…) の結果など）
 * @param {string} name 画面の表示（ƒ comparing）
 * @param {(args: any[], ctx: object) => any} fn
 */
export function nativeLambda(name, fn) {
  const f = { __type__: 'JLambda', name };
  Object.defineProperty(f, '__fn', { value: { native: fn }, enumerable: false });
  return f;
}

/** 比べた結果（int）を -1・0・1 などの JS の数に */
const sign = (r) => (isLong(r) ? Number(r) : isDouble(r) ? r.v : num(r));

/** 比べ方 c で a と b を比べる（c が null なら自然な順序） */
export function compareWith(c, a, b, ctx) {
  if (c === null || c === undefined) return naturalCompare(a, b, ctx);
  return sign(ctx.call(c, [a, b], 'compare'));
}

/** キーを取り出す関数 key で比べる Comparator（Comparator.comparing） */
const comparing = (name, key, keyCmp = null) => {
  if (key === null) throw new JavaError('NullPointerException', null);
  return nativeLambda(name, ([a, b], ctx) => compareWith(keyCmp, ctx.call(key, [a], 'apply'), ctx.call(key, [b], 'apply'), ctx));
};

const NATURAL = nativeLambda('naturalOrder', ([a, b], ctx) => naturalCompare(a, b, ctx));
const REVERSE = nativeLambda('reverseOrder', ([a, b], ctx) => naturalCompare(b, a, ctx));

/** Comparator の static メソッド・Collections.reverseOrder */
export function createFunctionBuiltins() {
  return new Map([
    ['Comparator', new JBuiltin('Comparator', {
      comparing: ([key, keyCmp]) => comparing('comparing', key, keyCmp ?? null),
      comparingInt: ([key]) => comparing('comparingInt', key),
      comparingDouble: ([key]) => comparing('comparingDouble', key),
      naturalOrder: () => NATURAL,
      reverseOrder: () => REVERSE,
    }, 'java.util')],
  ]);
}
export const reverseOrder = () => REVERSE;

/**
 * 関数型インターフェースの、抽象メソッドでないメソッド（cmp.reversed()・p.negate() など）。
 * f はラムダ式の値か、implements Comparator の自作のオブジェクト。当てはまらなければ undefined
 */
export function functionalDefault(f, name, args, ctx) {
  const [g] = args;
  switch (name) {
    case 'reverseOrder': return REVERSE;
    case 'reversed': return nativeLambda('reversed', ([a, b], c) => compareWith(f, b, a, c));
    case 'thenComparing': case 'thenComparingInt': case 'thenComparingDouble': {
      // 引数は、比べ方（Comparator）か、キーを取り出す関数。ラムダ式の引数の数で見分ける
      // （arity は評価器が付ける引数の数。Comparator.comparing などで作った値・自作の Comparator は 2）
      const isCmp = name === 'thenComparing' && (!isLambda(g) || (g.__fn.arity ?? 2) === 2);
      const second = isCmp ? g : comparing(name, g);
      return nativeLambda(name, ([a, b], c) => compareWith(f, a, b, c) || compareWith(second, a, b, c));
    }
    case 'negate': return nativeLambda('negate', (xs, c) => !c.call(f, xs, 'test'));
    case 'and': return nativeLambda('and', (xs, c) => c.call(f, xs, 'test') && c.call(g, xs, 'test'));
    case 'or': return nativeLambda('or', (xs, c) => c.call(f, xs, 'test') || c.call(g, xs, 'test'));
    case 'andThen': return nativeLambda('andThen', (xs, c) => {
      const r = c.call(f, xs, 'apply');
      // Consumer.andThen は同じ引数で続けて呼ぶ。Function.andThen は結果を渡す
      return r === undefined ? (c.call(g, xs, 'accept'), undefined) : c.call(g, [r], 'apply');
    });
    case 'compose': return nativeLambda('compose', (xs, c) => c.call(f, [c.call(g, xs, 'apply')], 'apply'));
  }
  return undefined;
}
