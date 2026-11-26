# ADR-010: ラムダ式・メソッド参照と関数型インターフェース

- ステータス: 採用（Phase 5）
- 日付: 2026-11-26

## 背景

授業では、インターフェースのあとにラムダ式を扱い、`list.sort((a, b) -> …)`・`list.forEach(x -> …)`・`map.merge(w, 1, Integer::sum)` のように、コレクションと組み合わせて使う。Phase 5 の前半（ADR-007〜009）までは、ラムダ式もメソッド参照も「まだ対応していません」だった。

ラムダ式は「あとで呼ばれる処理」なので、どこで作られ、いつ・何度呼ばれ、外側のどの変数を使うのかを、ステップ実行で見せたい。

## 利用者に見える例

テストは `tests/cases/lambdas_basic.java`・`uncaught_lambda.java`（本物の Java と出力・例外・変数の状態の変化を比べる）、`tests/compile-errors/lambda_*.java` など 14 種、`tests/adr-examples.test.js`（ADR-010 例）。サンプルは `samples/32_lambdas.java`。

```java
List<Integer> xs = new ArrayList<>(List.of(3, 1, 2));
xs.sort((a, b) -> a - b);
xs.forEach(x -> System.out.println(x * 10));   // 10・20・30
Function<Integer, Integer> square = x -> x * x;
int s = square.apply(5);                       // 25
```

- 「人」のステップで `forEach` の行を進むと、要素ごとに「ラムダ式の呼び出し → 本体 → 戻り」に止まる（3 要素なら 3 回）。呼び出しツリーのビューでは、`lambda(3)` などがその行の呼び出しの子として並ぶ
- コールスタックのビューで、`square` の値は `ƒ x -> x * x` と表示される（ラムダ式のソースそのもの）。ラムダ式の本体を実行している間は、`lambda` という名前のフレームが積まれ、引数と、使っている外側の変数が、そのフレームの変数として見える（本物の Java と同じく、作ったときに値を写している）
- `int sum = 0; xs.forEach(x -> sum += x);` は、コンパイルエラー「ラムダ式の中から、外側の変数 sum に値を入れることはできません」（`local variables referenced from a lambda expression must be final or effectively final`）
- `var f = (Integer x) -> x;` は、コンパイルエラー（`cannot infer type for local variable f`）

## 決定

**値**：ラムダ式・メソッド参照の値は `{ __type__: 'JLambda', name }`（`name` はソースの文字列 `x -> x * x`・`Integer::sum`）。中身（本体のノード・写した外側の変数・作った所の `this`）は列挙されない印に持ち、スナップショットでは複製しない（不変）。画面では関数（`kind: 'function'`）として `ƒ x -> x * x` と見せる。`println` すると `Main$$Lambda@…`（本物は `Main$$Lambda/0x…@…`）。

**AST**：ラムダ式は `LambdaExpression`（`params`・`body`・`expression` は ESTree の `ArrowFunctionExpression` と同じ）、メソッド参照は `MethodReference`（`object`・`name`）。ESTree の名前にしないのは、画面の制御フローのビューが、変数に入れたアロー関数だけを別の関数として描くため（引数に渡したラムダ式は描かれず、ちぐはぐになる）。Java のラムダ式は、制御フローのビューでは文の一部として描く。

**呼び出し**：本体は `lambda` という名前の新しいフレームで実行する。本物と同じく、とらえた外側の変数は、作ったときの値をそのフレームのローカル変数として写す（静的な検査が、本体が使う外側の変数の名前を集めておく）。`forEach`・`sort`・`merge` などの組み込みのメソッドが呼ぶときは、呼んだ所に `LambdaCall` のイベント（ノードの分類は呼び出し）を記録し、その中で本体を実行する。式だけの本体は `LambdaBody` で包む。共通コアの「人」のステップは、呼び出しの直後のノードを本体の始まりとみなすので、本体がそれ自身呼び出しの式（`x -> System.out.println(x)`）だと止まらない。この 2 つのイベントで、各回の呼び出し・本体・戻りに止まるようにした（共通コアは変えていない）。

**メソッド参照**：`Integer::sum`・`Math::max`・`Main::isEven`（static）、`String::length`・`Student::getName`（1 つ目の引数のメソッド）、`System.out::println`・`obj::m`（作ったときの値のメソッド）、`Point::new`・`ArrayList::new`（コンストラクタ）。static のメソッドが同じ数の引数で呼べればそれを、なければ 1 つ目の引数のメソッドを呼ぶ。

**型**（静的な検査）：

- 関数型インターフェース：`java.util.function` の `Function`・`BiFunction`・`UnaryOperator`・`BinaryOperator`・`Predicate`・`BiPredicate`・`Consumer`・`BiConsumer`・`Supplier`・`IntBinaryOperator`・`IntUnaryOperator`・`IntPredicate`、`Runnable`、`Comparator`、自作の「抽象メソッドが 1 つのインターフェース」
- ラムダ式は、入れる先の型（変数の宣言・代入・`return`・メソッドの引数）から引数の型と戻り値の型を決め、その型で本体を調べる。分からないとき（`Comparator.comparing(s -> s.name)` の `s`）は、本体の型の検査を見送る（誤ってエラーにしない。ADR-004 と同じ方針）
- メソッドの引数のラムダ式は、呼ぶメソッドを選んでから、その引数の型で調べる（オーバーロードの選択では「関数型インターフェースならどれにでも入る」とみなす）
- 外側の変数は「実質的に final」でなければ使えない。初期化子つきの宣言は一度も入れ直さないこと、初期化子なしの宣言は `+=`・`++` を使わないこと（何度かの `=` は、分岐で 1 回ずつ入れる形かもしれないので、ゆるめに通す）
- コンパイルエラー 14 種（`javac` と同じ行・文面）：実質的に final でない、ラムダ式の中から外側の変数に入れる、引数の数、戻り値の型、値を返さない（`void` の関数型インターフェースに値の式、`return` を忘れたブロック）、関数型インターフェースでない型、`var`、外側と同じ名前の引数、メソッドの名前の誤り（`f.call(3)`）、メソッド参照のメソッドがない、`import java.util.function` の忘れ、`implements Comparator` で `compare` がない

**足したメソッド**：

- リスト：`forEach`・`removeIf`・`replaceAll`・`sort(比べ方)`（`sort(null)` は自然な順序）。集合：`forEach`・`removeIf`
- マップ：`forEach`・`merge`・`computeIfAbsent`・`computeIfPresent`・`compute`・`replaceAll`（値が `null` になったら組を除く、など本物の手順どおり）
- `Collections.sort(list, 比べ方)`・`max`・`min`・`reverseOrder()`、`Arrays.sort(配列, 比べ方)`、`new TreeMap<>(比べ方)`・`new TreeSet<>(比べ方)`
- `Comparator.comparing`・`comparingInt`・`comparingDouble`・`naturalOrder`・`reverseOrder`、比べ方の `reversed`・`thenComparing`・`thenComparingInt`、`Predicate` の `negate`・`and`・`or`、`Function` の `andThen`・`compose`
- 自作のクラスの `implements Comparator<T>`（`compare`）・`implements Runnable`

**本物と違う点**：

- 並べ替えでラムダ式（比べ方）が呼ばれる回数と順は、本物（TimSort）と違う（結果は同じ。安定なソート）
- ストリーム（`list.stream().filter(…).map(…)`）は「まだ対応していません」
- ジェネリクスのメソッドの型の推論はしないので、`Comparator.comparing(s -> s.name)` の `s` の型は分からない（検査を見送る。実行はできる）

## 確かめたこと

- 本物の Java と、出力・例外（`tests/cases/lambdas_basic.java` の 40 行・`uncaught_lambda.java`、`samples/32_lambdas.java`）と、変数の状態の変化の列が一致。変数の状態の比較では、ラムダ式の本体のフレーム（本物の `lambda$main$0`）は比べない。本物は JDK の中から呼ばれるため、同じ状態が 2 回記録されるなどのぶれがある。代わりに、ラムダ式から戻った所（行の途中。`computeIfAbsent` が空のリストを入れたあと）を、両側で同じく記録する。JDI 側は、JDK のクラスとラムダ式の裏のクラス（`Main$$Lambda`）のフレームを記録しないようにした（そこから JDK の中で止まることがあった）
- コンパイルエラー 14 種の行と `javac` の文面が一致
- サンプルの全タブで、ブラウザのエラー 0 件
