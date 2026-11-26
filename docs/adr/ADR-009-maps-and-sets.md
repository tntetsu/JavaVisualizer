# ADR-009: HashMap・HashSet（TreeMap・LinkedHashMap などを含む）と繰り返しの順序

- ステータス: 採用（Phase 5）
- 日付: 2026-11-26

## 背景

授業では、`ArrayList` のあとに `HashMap`（単語の数え上げなど）と `HashSet`（重複を除く）を使う。`HashMap` を `println` したり拡張 `for` で回したりしたときの**並び順は、入れた順ではない**。本物と違う順で表示すると、学生が手元の Java と見比べたときに混乱するので、本物と同じ順にしたい（開発計画書 3.1 節・8 節）。

## 利用者に見える例

テストは `tests/cases/maps_basic.java`・`sets_basic.java`・`uncaught_cme.java`・`uncaught_map_unbox.java`（本物の Java と出力・例外・変数の状態の変化を比べる）、`tests/compile-errors/map_*.java`・`set_*.java`（9 種）、`tests/adr-examples.test.js`（ADR-009 例）。サンプルは `samples/28_hash_map.java`。

```java
Map<String, Integer> count = new HashMap<>();
for (String w : "the cat sat on the mat".split(" ")) {
    count.put(w, count.getOrDefault(w, 0) + 1);
}
System.out.println(count);   // {the=2, mat=1, cat=1, sat=1, on=1}（本物と同じ順。入れた順ではない）
Set<String> seen = new HashSet<>(count.keySet());
System.out.println(seen);    // [the, mat, cat, sat, on]
int n = count.get("dog");    // NullPointerException
```

- メモリのビューで、`count` はヒープの `HashMap<String, Integer>(5)` を指し、中身は `"the": 2`・`"mat": 1` … の組で表示される（コールスタックのビューでは `{"the": 2, "mat": 1, …}`）。集合は `HashSet<String>(5)` で、リストと同じく `[ ]` で書く
- 最後の行は、本物と同じ `NullPointerException: Cannot invoke "java.lang.Integer.intValue()" because the return value of "java.util.Map.get(Object)" is null`。日本語では「メソッド java.util.Map.get(Object) の戻り値が null（何も指していない）なので、int の値を取り出せません」
- 拡張 `for` で集合を回している途中で、その集合から除くと（最後の要素でなければ）`ConcurrentModificationException`（本物と同じ）
- `for (String k : count)`（マップをそのまま回す）は、コンパイルエラー「マップはそのままでは拡張 for 文で繰り返せません（keySet()・values()・entrySet() を使います）」（`for-each not applicable to expression type`）

## 決定

| Java | 表現 |
|---|---|
| `HashMap`・`LinkedHashMap`・`TreeMap`・`Map.of` | `{ __type__: 'JMap', kind, keyType, valType, entries }`。`entries` はいつも繰り返しの順に並べた組（`Map.Entry`）の配列。表の容量・変更回数・入れた順の番号は、列挙されない印に持つ（スナップショットには写らない）。画面では `mapping`（辞書） |
| `Map.Entry` | `{ __type__: 'JEntry', key, value }`。マップの中の組そのもの（`entrySet()` の要素の `setValue` がマップに効く）。画面では `key`・`value` を持つオブジェクト |
| `HashSet`・`LinkedHashSet`・`TreeSet`・`Set.of` | JS の配列＋列挙されない印 `__jset`（`'HashSet'` など）と要素の型。中身は繰り返しの順。裏にマップと同じ表を持ち、変えるたびに並べ直す（配列のビューがそのまま使える。Python 版の `set` と同じ考え方） |

**繰り返しの順序**（本物の `java.util.HashMap` の作りを再現する）：

- 表の容量は 16 から（`new HashMap<>(n)` は n 以上の 2 の累乗）。組の数が容量の 0.75 倍を超えたら 2 倍にする。`clear()` しても小さくしない
- 位置は `(容量 - 1) & (h ^ (h >>> 16))`（`h` は `hashCode()`。`String`・`Integer`・`Long`・`Double`・`Character`・`Boolean` は本物と同じ値、自作のクラスは書いた `hashCode()` を呼ぶ）。同じ位置の組は入れた順（2 倍にしても順は保たれる）
- 1 つの位置に 9 個目の組が入ると、容量が 64 未満なら 2 倍にする（本物の `treeifyBin`）
- `new HashMap<>(別のマップ)` は `ceil(組の数 / 0.75)` 以上の 2 の累乗、`new HashSet<>(コレクション)` は `ceil(max(要素の数, 12) / 0.75)` 以上の 2 の累乗の容量から始める（JDK 21 と同じ）
- `LinkedHashMap`・`LinkedHashSet` は入れた順、`TreeMap`・`TreeSet` は自然な順序（`compareTo`）

**本物と違う点**（授業の範囲ではまず出ない、または本物でも決まらない）：

- 容量 64 以上で 1 つの位置に 9 個以上が集まると、本物はその位置を木にし、順序が少し変わる。ここでは再現しない
- `Map.of`・`Set.of` の順序は、本物では実行のたびに変わる（乱数で決まる）。ここでは書いた順にする（比較テストでは順序を見ない）
- `hashCode()` を書いていない自作のクラス・`enum` をキーにすると、本物は実行ごとに違うハッシュ値（識別のハッシュ値）になり、順序が決まらない。ここでは別の値になる
- `keySet()`・`values()`・`entrySet()` は、呼んだときの中身の写し（元のマップが変わったことは `ConcurrentModificationException` の判定にだけ使う）。`keySet().remove(k)` は元のマップから除く。それ以外の、写しを通して元のマップを変える操作には対応しない

**そのほか**：

- **静的な検査**：型引数を使い、`put` のキー・値、`add` の要素の型を確かめる（`method put in interface Map<K,V> cannot be applied to given types;`）。`get` の戻り値は値の型、`keySet()` は `Set<K>`、`entrySet()` は `Set<Entry<K,V>>`、`values()` は `Collection<V>`。`new HashMap<>()` の `<>` は代入先（変数の宣言・代入・フィールド）の型から決める。`new Map<>()` はコンパイルエラー
- **null の取り出し**：静的な検査が、`Integer` などの式を `int` などとして使う所（初期化・代入・`return`・引数・演算・条件）に印を付け、評価器はその式の値が `null` なら、本物と同じ文面の `NullPointerException`（`Cannot invoke "java.lang.Integer.intValue()" because …`）にする。`ArrayList` の `get` にも効く（ADR-007 では `Cannot unbox null value to int` という本物と違う文面だった）
- **ConcurrentModificationException**：集合・`keySet()` などの拡張 `for` は、はじめの中身を順にたどり、元のマップ（集合の裏の表）が変わっていたら、次の要素へ進むときに投げる（本物の `HashIterator` と同じく、最後の要素のあとでは何も起きない）。`ArrayList` の拡張 `for` では、まだ検出しない
- 足したメソッド：マップ（`put`・`get`・`getOrDefault`・`containsKey`・`containsValue`・`remove`・`putIfAbsent`・`replace`・`putAll`・`size`・`isEmpty`・`clear`・`keySet`・`values`・`entrySet`・`equals`・`hashCode`、`TreeMap` の `firstKey`・`lastKey`）、`Map.Entry`（`getKey`・`getValue`・`setValue`）、集合（`add`・`remove`・`contains`・`size`・`isEmpty`・`clear`・`addAll`・`removeAll`・`retainAll`・`containsAll`・`equals`・`hashCode`、`TreeSet` の `first`・`last`）、`Map.of`・`Map.entry`・`Set.of`。ラムダ式を受け取るもの（`merge`・`forEach`・`computeIfAbsent`）は、ラムダ式に対応するまで「まだ対応していません」
- マップ・集合は `java.util` なので、`import` が要る（`Map.Entry` は `Map` の `import` で使える）

**画面での見せ方**：マップの組は、画面の共通の書き方で `"the": 2` と書く（Java の `toString` の `the=2` とは違う）。画面（JSVisualizer）の辞書の書き方は言語プロファイルで変えられないので、JS 版・Python 版の画面を変えずに済むこの形にした。`toString` の形にしたくなったら、言語プロファイルに区切りの項目を足す（ADR-055 の追記）。

## 確かめたこと

- 本物の Java と、出力・例外（`tests/cases/maps_basic.java`・`sets_basic.java`・`uncaught_cme.java`・`uncaught_map_unbox.java`、`samples/28_hash_map.java`）と、変数の状態の変化の列（JDI。`TraceStates.java` が `HashMap` の表・`LinkedHashMap` のつながり・`TreeMap` の木を読み、本物の繰り返しの順に書く）が一致。表が 16 → 32 → 64 と広がるとき、1 つの位置に 9 個が集まるとき、負の数・`long`・`double`・`char`・`boolean`・自作のクラスのキーでも一致
- コンパイルエラー 9 種（`tests/compile-errors/map_*.java`・`set_*.java`）の行と `javac` の文面が一致
- 全サンプル × 全タブで、ブラウザのエラー 0 件（`scripts/capture-spike.mjs`）
