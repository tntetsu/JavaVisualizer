# ADR-011: ストリーム（java.util.stream）と Optional

- ステータス: 採用（Phase 5）
- 日付: 2026-11-26

## 背景

ストリーム（`list.stream().filter(…).map(…).collect(…)`）は、Java 8 以降の標準の書き方で、ラムダ式（ADR-010）とともに使われることが多い。

ストリームは**遅延評価**で、「全要素を filter してから、全要素を map する」のではなく、要素ごとに filter → map → forEach と縦に進む。初学者には分かりにくいところなので、ステップ実行でこの順序をそのまま見せたい。

## 利用者に見える例

テストは `tests/cases/streams_basic.java`（本物の Java と出力・変数の状態の変化を比べる）、`tests/compile-errors/stream_*.java`（6 種）、`tests/adr-examples.test.js`（ADR-011 例）。サンプルは `samples/33_streams.java`。

```java
List<String> words = List.of("banana", "kiwi", "fig");
words.stream()
    .filter(w -> w.length() > 3)          // 8 行目
    .map(w -> w.toUpperCase())            // 9 行目
    .forEach(w -> System.out.println(w)); // 10 行目
Optional<String> first = words.stream().filter(w -> w.startsWith("k")).findFirst();
System.out.println(first + " " + words.stream().count());   // Optional[kiwi] 3
```

- 「人」のステップで進むと、ラムダ式に入る行は 8 → 9 → 10（banana）、8 → 9 → 10（kiwi）、8（fig は filter で落ちる）の順になる（本物の Java と同じ順序）
- 変数のビューで、`first` は `Optional[kiwi]` に近い形（`Optional[value: "kiwi"]`）で表示される
- `int c = xs.stream().count();` は、コンパイルエラー（`count()` は `long`。`possible lossy conversion from long to int`）
- `List<Integer> ys = xs.stream().map(x -> x * 2);` は、コンパイルエラー「ストリームは List<Integer> の変数に入れられません（リストにするには collect(Collectors.toList()) か toList() を使います）」（`no instance(s) of type variable(s) R exist so that Stream<R> conforms to List<Integer>`）

## 決定

| Java | 表現 |
|---|---|
| `Stream`・`IntStream`・`DoubleStream` | `{ __type__: 'JStream', kind }`＋要素を順に出す関数（列挙されない印。JS のジェネレーター）。画面では型の名前（`Stream`）だけを見せる |
| `Optional`・`OptionalInt`・`OptionalDouble` | `{ __type__: 'JOptional', kind, present, value }`。画面では `Optional[…]`・`Optional.empty` |
| `Collectors.toList()` など | `{ __type__: 'JCollector', kind, args }` |

- **遅延評価**：中間の操作（`filter`・`map`・`peek` など）はジェネレーターをつなぐだけで、終端の操作（`forEach`・`collect` など）が要素を 1 つずつ引き出す。`sorted` は上流の要素をすべて集めてから並べ、`limit`・`findFirst`・`anyMatch` は要るだけ引き出して止まる。どれも本物と同じ順序でラムダ式が呼ばれる（`peek` で確かめた）。ラムダ式の呼び出しは、終端の操作の呼び出しの中に、要素ごとに並ぶ（ADR-010 の `LambdaCall`）
- **一度だけ**：使ったストリームをもう一度使うと `IllegalStateException: stream has already been operated upon or closed`（本物と同じ）
- **型**：`list.stream()` は `Stream<E>`、`map(x -> …)` の結果は、ラムダ式の本体の型（メソッド参照なら呼ぶメソッドの戻り値の型）から `Stream<R>` にする。分からないときは型引数なしの `Stream`（検査を見送る）。`collect(Collectors.groupingBy(s -> …))` の `s` の型を決めるため、メソッドの呼び出しの検査では、受け手の型を引数より先に求めるようにした。`Collectors.xxx()` の型は「集めた結果の型」として持ち、`collect` の戻り値にする（`groupingBy(f)` は `Map<K, List<T>>`、`groupingBy(f, counting())` は `Map<K, Long>`）
- **数**：`count()` は `long`、`IntStream.sum()` は `int`（あふれる）、`average()` は `OptionalDouble`。`DoubleStream.sum()`・`average()` は、本物と同じく誤差を補正しながら足す（`0.1 + 0.2 + 0.3` は `0.6`。単純に足すと `0.6000000000000001`）
- **集め方**：`toList`・`toSet`（`HashSet`。順序は ADR-009）・`joining`・`counting`・`summingInt`・`averagingInt`・`groupingBy`（`HashMap`）・`partitioningBy`（`{false=…, true=…}`）・`toMap`（キーが重なると `IllegalStateException: Duplicate key …`）
- 足したもの：
  - 作る：`list.stream()`・`set.stream()`・`Arrays.stream(配列)`（`int[]` は `IntStream`）・`Stream.of`・`Stream.iterate`・`IntStream.range`・`rangeClosed`・`of`・`iterate`
  - 中間：`filter`・`map`・`mapToInt`・`mapToDouble`・`mapToObj`・`boxed`・`asDoubleStream`・`peek`・`distinct`・`sorted`・`limit`・`skip`
  - 終端：`forEach`・`collect`・`toList`・`toArray`・`count`・`sum`・`average`・`max`・`min`・`reduce`・`anyMatch`・`allMatch`・`noneMatch`・`findFirst`
  - `Optional`：`get`・`getAsInt`・`getAsDouble`・`orElse`・`orElseGet`・`orElseThrow`・`isPresent`・`isEmpty`・`ifPresent`
  - `Integer.max`・`Integer.min`（`reduce(Integer::max)` で使う）
- ストリームの型は `java.util.stream`、`Optional` は `java.util` なので、`import` が要る

**本物と違う点**：並列のストリーム（`parallelStream`）、`flatMap`、`Collectors` の残りのメソッド、`String.chars()` には対応していない（「まだ対応していないメソッドかもしれません」）。`println` したときのストリームの文字列（`java.util.stream.ReferencePipeline$Head@…`）の数は本物と違う。

## 確かめたこと

- 本物の Java と、出力（`tests/cases/streams_basic.java` の 39 行、`samples/33_streams.java`）と、変数の状態の変化の列が一致。遅延評価の順序（`peek`・`limit`・`sorted`）、`groupingBy` の `HashMap` の順序、`Optional` の表示、`DoubleStream` の合計の誤差も一致
- コンパイルエラー 6 種の行と `javac` の文面が一致
