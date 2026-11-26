/**
 * streams.js — ストリーム（java.util.stream）と Optional（ADR-011）
 *
 * | Java | 表現 |
 * |---|---|
 * | Stream・IntStream・DoubleStream | { __type__: 'JStream', kind }。要素を順に出す関数（列挙されない __src。JS のジェネレーター）を持つ |
 * | Optional・OptionalInt・OptionalDouble | { __type__: 'JOptional', kind, present, value } |
 * | Collectors.toList() など | { __type__: 'JCollector', kind, args } |
 *
 * 本物と同じく遅延評価：中間の操作（filter・map など）は、ジェネレーターをつなぐだけで、何も計算しない。
 * 終端の操作（forEach・collect など）が要素を 1 つずつ引き出すので、要素ごとに filter → map → forEach と縦に進む。
 * sorted は、上流の要素をすべて集めてから並べる（本物と同じ）。limit・findFirst・anyMatch は、要るだけ引き出して止まる。
 * ラムダ式は ctx.call で呼ぶ（呼んだ所は終端の操作。画面では、ラムダ式の呼び出しが要素ごとに並ぶ）。
 */
import { JavaError, makeString, makeDouble, makeList, isLong, num } from './values.js';
import { JBuiltin } from './builtins.js';
import { cmpWith } from './collections.js';
import { newMap, mapPut, newSet, setAdd } from './maps.js';

const S = (s) => makeString(s);
const nn = (f) => { if (f === null || f === undefined) throw new JavaError('NullPointerException', null); };

// ── ストリームの値 ──────────────────────────────────────────────────────────

/**
 * ストリームを作る
 * @param {'Stream'|'IntStream'|'DoubleStream'} kind
 * @param {() => Iterator} src 要素を順に出すイテレーターを作る関数（終端の操作のときに 1 回だけ呼ぶ）
 */
export function makeStream(kind, src) {
  const s = { __type__: 'JStream', kind };
  Object.defineProperty(s, '__src', { value: src, enumerable: false });
  Object.defineProperty(s, '__used', { value: false, enumerable: false, writable: true });
  return s;
}
export const isStream = (v) => v !== null && typeof v === 'object' && v.__type__ === 'JStream';

/** 一度使ったストリームを、もう一度使った（本物と同じ IllegalStateException） */
function take(s) {
  if (s.__used) throw new JavaError('IllegalStateException', 'stream has already been operated upon or closed');
  s.__used = true;
  return s.__src;
}

/** 配列（リスト・集合）のストリーム。要素は終端の操作のときに読む（本物の ArrayList のストリームと同じ） */
export const streamOf = (arr, kind = 'Stream') => makeStream(kind, () => arr[Symbol.iterator]());

export function makeOptional(kind, present, value) {
  return { __type__: 'JOptional', kind, present, value: present ? value : null };
}
export const isOptional = (v) => v !== null && typeof v === 'object' && v.__type__ === 'JOptional';
export const isCollector = (v) => v !== null && typeof v === 'object' && v.__type__ === 'JCollector';
const collector = (kind, args = []) => ({ __type__: 'JCollector', kind, args });

/** Optional[3]・Optional.empty・OptionalInt[3]・OptionalDouble[2.5] */
export const optionalString = (o, ctx) => (o.present ? `${o.kind}[${ctx.str(o.value)}]` : `${o.kind}.empty`);

// ── DoubleStream の合計（本物と同じく、誤差を補正しながら足す。Collectors.sumWithCompensation） ──

function doubleSum(values) {
  let sum = 0, comp = 0, simple = 0;
  for (const v of values) {
    const tmp = v - comp;
    const velvel = sum + tmp;
    comp = (velvel - sum) - tmp;
    sum = velvel;
    simple += v;
  }
  const tmp = sum - comp;
  return Number.isNaN(tmp) && !Number.isFinite(simple) && !Number.isNaN(simple) ? simple : tmp;
}

/** 数の要素の型をそろえる（IntStream は int、DoubleStream は double） */
const asKind = (kind, v) => (kind === 'IntStream' ? (isLong(v) ? Number(BigInt.asIntN(32, v)) : num(v) | 0) : kind === 'DoubleStream' ? makeDouble(num(v)) : v);

// ── 中間の操作 ──────────────────────────────────────────────────────────────

/** 本物の HashSet と同じ「等しい」で、最初に出たものだけを残す（distinct） */
function* distinctGen(it, ctx) {
  const seen = [];
  for (const x of it) {
    if (seen.some(y => ctx.equals(x, y))) continue;
    seen.push(x);
    yield x;
  }
}

/**
 * ストリームのメソッド。見つからなければ undefined
 * @param {object} s ストリーム
 */
export function callStreamMethod(s, name, args, ctx) {
  const [a0, a1] = args;
  const K = s.kind;
  const next = (kind, gen) => { const src = take(s); return makeStream(kind, () => gen(src())); };
  const iter = () => take(s)();
  switch (name) {
    // 中間の操作（ジェネレーターをつなぐだけ）
    case 'filter': nn(a0); return next(K, function* (it) { for (const x of it) if (ctx.call(a0, [x], 'test')) yield x; });
    case 'map': nn(a0); return next(K, function* (it) { for (const x of it) yield asKind(K, ctx.call(a0, [x], K === 'Stream' ? 'apply' : 'applyAsInt')); });
    case 'mapToInt': nn(a0); return next('IntStream', function* (it) { for (const x of it) yield asKind('IntStream', ctx.call(a0, [x], 'applyAsInt')); });
    case 'mapToDouble': nn(a0); return next('DoubleStream', function* (it) { for (const x of it) yield asKind('DoubleStream', ctx.call(a0, [x], 'applyAsDouble')); });
    case 'mapToObj': nn(a0); return next('Stream', function* (it) { for (const x of it) yield ctx.call(a0, [x], 'apply'); });
    case 'boxed': return next('Stream', function* (it) { yield* it; });
    case 'asDoubleStream': return next('DoubleStream', function* (it) { for (const x of it) yield makeDouble(num(x)); });
    case 'peek': nn(a0); return next(K, function* (it) { for (const x of it) { ctx.call(a0, [x], 'accept'); yield x; } });
    case 'distinct': return next(K, (it) => distinctGen(it, ctx));
    case 'sorted': return next(K, function* (it) {
      // 上流の要素をすべて集めてから、安定に並べる（本物と同じく、ここで上流が最後まで進む）
      const xs = [...it].map((x, i) => [x, i]);
      xs.sort((p, q) => cmpWith(a0 ?? null, p[0], q[0], ctx) || p[1] - q[1]);
      for (const [x] of xs) yield x;
    });
    case 'limit': {
      const n = Number(a0);
      if (n < 0) throw new JavaError('IllegalArgumentException', String(a0));
      return next(K, function* (it) { if (n === 0) return; let i = 0; for (const x of it) { yield x; if (++i >= n) return; } });
    }
    case 'skip': {
      const n = Number(a0);
      if (n < 0) throw new JavaError('IllegalArgumentException', String(a0));
      return next(K, function* (it) { let i = 0; for (const x of it) { if (i++ >= n) yield x; } });
    }
    // 終端の操作（要素を 1 つずつ引き出す）
    case 'forEach': case 'forEachOrdered': nn(a0); for (const x of iter()) ctx.call(a0, [x], 'accept'); return VOID;
    case 'count': { let c = 0n; for (const x of iter()) c++; return c; }   // eslint-disable-line no-unused-vars
    case 'sum': {
      const xs = [...iter()];
      return K === 'DoubleStream' ? makeDouble(doubleSum(xs.map(num))) : xs.reduce((a, x) => (a + x) | 0, 0);
    }
    case 'average': {
      const xs = [...iter()];
      if (!xs.length) return makeOptional('OptionalDouble', false);
      if (K === 'DoubleStream') return makeOptional('OptionalDouble', true, makeDouble(doubleSum(xs.map(num)) / xs.length));
      return makeOptional('OptionalDouble', true, makeDouble(Number(xs.reduce((a, x) => a + BigInt(x), 0n)) / xs.length));
    }
    case 'max': case 'min': {
      const okind = K === 'IntStream' ? 'OptionalInt' : K === 'DoubleStream' ? 'OptionalDouble' : 'Optional';
      let best, has = false;
      for (const x of iter()) {
        if (!has) { best = x; has = true; continue; }
        // 本物の BinaryOperator.maxBy・minBy：compare(これまでの値, 次の要素)。等しければ、これまでの値を残す
        const c = K === 'Stream' ? cmpWith(a0, best, x, ctx) : num(best) - num(x);
        if (name === 'max' ? c < 0 : c > 0) best = x;
      }
      if (has && best === null) throw new JavaError('NullPointerException', null);
      return makeOptional(okind, has, best);
    }
    case 'reduce': {
      if (args.length === 2) { let acc = a0; for (const x of iter()) acc = asKind(K, ctx.call(a1, [acc, x], K === 'Stream' ? 'apply' : 'applyAsInt')); return acc; }
      let acc, has = false;
      for (const x of iter()) { if (!has) { acc = x; has = true; } else acc = asKind(K, ctx.call(a0, [acc, x], K === 'Stream' ? 'apply' : 'applyAsInt')); }
      return makeOptional(K === 'IntStream' ? 'OptionalInt' : K === 'DoubleStream' ? 'OptionalDouble' : 'Optional', has, acc);
    }
    case 'anyMatch': nn(a0); for (const x of iter()) if (ctx.call(a0, [x], 'test')) return true; return false;
    case 'allMatch': nn(a0); for (const x of iter()) if (!ctx.call(a0, [x], 'test')) return false; return true;
    case 'noneMatch': nn(a0); for (const x of iter()) if (ctx.call(a0, [x], 'test')) return false; return true;
    case 'findFirst': case 'findAny': {
      const r = iter().next();
      const okind = K === 'IntStream' ? 'OptionalInt' : K === 'DoubleStream' ? 'OptionalDouble' : 'Optional';
      if (!r.done && r.value === null) throw new JavaError('NullPointerException', null);
      return makeOptional(okind, !r.done, r.value);
    }
    case 'toList': return makeList([...iter()], { kind: 'List' });
    case 'toArray': { const xs = [...iter()]; return ctx.makeArray(K === 'IntStream' ? 'int' : K === 'DoubleStream' ? 'double' : 'Object', xs); }
    case 'collect': nn(a0); return collect(iter(), a0, ctx);
  }
  return undefined;
}

/** Collectors の結果を作る */
function collect(it, c, ctx) {
  const [a0, a1, a2] = c.args;
  switch (c.kind) {
    case 'toList': return makeList([...it]);
    case 'toSet': { const s = newSet('HashSet'); for (const x of it) setAdd(s, x, ctx); return s; }
    case 'joining': {
      const parts = [...it].map(x => (x === null ? 'null' : x.s));
      return S(`${a1?.s ?? ''}${parts.join(a0?.s ?? '')}${a2?.s ?? ''}`);
    }
    case 'counting': { let n = 0n; for (const x of it) n++; return n; }   // eslint-disable-line no-unused-vars
    case 'summingInt': { let n = 0; for (const x of it) n = (n + num(ctx.call(a0, [x], 'applyAsInt'))) | 0; return n; }
    case 'averagingInt': {
      const xs = [...it];
      return makeDouble(xs.length ? Number(xs.reduce((a, x) => a + BigInt(num(ctx.call(a0, [x], 'applyAsInt'))), 0n)) / xs.length : 0);
    }
    case 'groupingBy': {
      // HashMap に、キーごとのリストを作り、最後に下流の Collector（counting など）でまとめる
      const groups = newMap('HashMap');
      const order = [];
      for (const x of it) {
        const k = ctx.call(a0, [x], 'apply');
        if (k === null) throw new JavaError('NullPointerException', 'element cannot be mapped to a null key');
        let g = order.find(p => ctx.equals(p[0], k));
        if (!g) { g = [k, []]; order.push(g); mapPut(groups, k, null, ctx); }
        g[1].push(x);
      }
      const down = a1 ?? collector('toList');
      for (const e of groups.entries) e.value = collect(order.find(p => ctx.equals(p[0], e.key))[1][Symbol.iterator](), down, ctx);
      return groups;
    }
    case 'partitioningBy': {
      const no = [], yes = [];
      for (const x of it) (ctx.call(a0, [x], 'test') ? yes : no).push(x);
      const down = a1 ?? collector('toList');
      const m = newMap('LinkedHashMap');
      mapPut(m, false, collect(no[Symbol.iterator](), down, ctx), ctx);
      mapPut(m, true, collect(yes[Symbol.iterator](), down, ctx), ctx);
      return m;
    }
    case 'toMap': {
      const m = newMap('HashMap');
      for (const x of it) {
        const k = ctx.call(a0, [x], 'apply');
        const v = ctx.call(a1, [x], 'apply');
        nn(v);
        const old = m.entries.find(e => ctx.equals(k, e.key));
        if (old) {
          if (!a2) throw new JavaError('IllegalStateException', `Duplicate key ${ctx.str(k)} (attempted merging values ${ctx.str(old.value)} and ${ctx.str(v)})`);
          old.value = ctx.call(a2, [old.value, v], 'apply');
        } else mapPut(m, k, v, ctx);
      }
      return m;
    }
  }
  throw new JavaError('UnsupportedOperationException', null);
}

/** Optional のメソッド */
export function callOptionalMethod(o, name, args, ctx) {
  const empty = () => new JavaError('NoSuchElementException', 'No value present');
  switch (name) {
    case 'isPresent': return o.present;
    case 'isEmpty': return !o.present;
    case 'get': case 'getAsInt': case 'getAsDouble': case 'orElseThrow': if (!o.present) throw empty(); return o.value;
    case 'orElse': return o.present ? o.value : args[0];
    case 'orElseGet': return o.present ? o.value : ctx.call(args[0], [], 'get');
    case 'ifPresent': if (o.present) ctx.call(args[0], [o.value], 'accept'); return VOID;
    case 'toString': return S(optionalString(o, ctx));
    case 'equals': return isOptional(args[0]) && args[0].kind === o.kind && args[0].present === o.present && ctx.equals(o.value, args[0].value);
  }
  return undefined;
}

const VOID = Symbol.for('java.void');

/** Arrays.stream(配列)：int[] は IntStream、double[] は DoubleStream */
export const arraysStream = ([a]) => streamOf(a, a.__jelem === 'int' ? 'IntStream' : a.__jelem === 'double' ? 'DoubleStream' : 'Stream');

/** Stream.of・IntStream.range・Collectors など */
export function createStreamBuiltins() {
  const ints = (xs) => makeStream('IntStream', () => xs[Symbol.iterator]());
  return new Map([
    ['Stream', new JBuiltin('Stream', {
      of: (args) => streamOf(args),
      iterate: ([seed, f], ctx) => makeStream('Stream', function* () { let x = seed; for (;;) { yield x; x = ctx.call(f, [x], 'apply'); } }),
      empty: () => streamOf([]),
    }, 'java.util.stream')],
    ['IntStream', new JBuiltin('IntStream', {
      range: ([a, b]) => makeStream('IntStream', function* () { for (let i = a; i < b; i++) yield i; }),
      rangeClosed: ([a, b]) => makeStream('IntStream', function* () { for (let i = a; i <= b; i++) yield i; }),
      of: (args) => ints(args.length === 1 && Array.isArray(args[0]) ? args[0] : args),
      iterate: ([seed, f], ctx) => makeStream('IntStream', function* () { let x = seed; for (;;) { yield x; x = asKind('IntStream', ctx.call(f, [x], 'applyAsInt')); } }),
    }, 'java.util.stream')],
    // Optional.of(値)・Optional.ofNullable(値)・Optional.empty()
    ['Optional', new JBuiltin('Optional', {
      of: ([v]) => { nn(v); return makeOptional('Optional', true, v); },
      ofNullable: ([v]) => makeOptional('Optional', v !== null, v),
      empty: () => makeOptional('Optional', false, null),
    }, 'java.util')],
    ['Collectors', new JBuiltin('Collectors', {
      toList: () => collector('toList'),
      toSet: () => collector('toSet'),
      joining: (args) => collector('joining', args),
      counting: () => collector('counting'),
      summingInt: (args) => collector('summingInt', args),
      averagingInt: (args) => collector('averagingInt', args),
      groupingBy: (args) => collector('groupingBy', args),
      partitioningBy: (args) => collector('partitioningBy', args),
      toMap: (args) => collector('toMap', args),
    }, 'java.util.stream')],
  ]);
}
