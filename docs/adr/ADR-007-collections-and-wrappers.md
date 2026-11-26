# ADR-007: ArrayList・StringBuilder・ラッパー型とジェネリクスの型

- ステータス: 採用（Phase 5）
- 日付: 2026-11-26

## 背景

入門の授業では、配列のあとに `ArrayList` を使う。`ArrayList<Integer>` には、ジェネリクスの型引数と、`int` と `Integer` の行き来（ボクシング・アンボクシング）が伴う。Phase 4 までは、型引数を読み飛ばし、`ArrayList` は「まだ対応していません」だった。

## 利用者に見える例

テストは `tests/cases/collections_basic.java`（本物の Java と出力・変数の状態の変化を比べる）と `tests/adr-examples.test.js`（ADR-007 例）。

```java
ArrayList<Integer> scores = new ArrayList<>();
scores.add(70);
scores.add(85);
scores.add(1, 90);
System.out.println(scores);   // [70, 90, 85]
scores.remove(0);             // 位置 0 を消す（remove(int)）
scores.remove(Integer.valueOf(85));   // 値 85 を消す（remove(Object)）
```

- メモリのビューで、`scores` はヒープの `ArrayList<Integer>(3)` を指し、中身はマス目（`0: 70`・`1: 90`・`2: 85`）で表示される。配列（`int[3]`、`{1, 2, 3}`）と書き分けるため、リストは `[70, 90, 85]` と書く
- 範囲の外は `IndexOutOfBoundsException: Index 5 out of bounds for length 2`（本物と同じ）
- `ArrayList<Double>` に `add(3)` は、コンパイルエラー（`no suitable method found for add(int)`）。`ArrayList<int>` も（`unexpected type`）
- `Integer a = 1000, b = 1000;` の `a == b` は `false`、`a.equals(b)` は `true`（本物と同じ）

## 決定

| Java | 表現 |
|---|---|
| `ArrayList`・`List.of` | JS の配列＋列挙されない印 `__jlist`（`'ArrayList'`、変更できない `List.of` は `'List'`）と要素の型 `__jlistElem`。配列のビューがそのまま使える（`valueModel` の `kind` は `sequence`、見出しは `ArrayList<Integer>(3)`、かっこは `[ ]`） |
| `StringBuilder` | 組み込みのクラスのインスタンス（`fields.value` に今の文字列の `String`） |
| `Integer`・`Double` などのラッパー型 | 中のプリミティブの値そのもの（`Integer` は JS の number）。箱のオブジェクトは作らない |

- **ジェネリクスの型**：パーサーが型引数を残し（`'ArrayList<Integer>'`）、静的な検査が要素の型を使う（`get` の戻り値、`add` の引数、拡張 `for` の変数）。`new ArrayList<>()` の `<>` は代入先の型から決める。型引数はどれとも同じでないと代入できない（`List<Integer>` に `ArrayList<Double>` は入らない）。ワイルドカード（`?`）は「まだ対応していません」
- **ボクシング・アンボクシング**：`int` → `Integer` に入れられ、`Integer` → `int`（と拡大変換）に取り出せる。`null` を取り出すと `NullPointerException`
- **`remove(int)` と `remove(Object)`**：本物と同じく、引数の静的な型で決める（静的な検査が引数の型の印を付ける）
- **`contains`・`indexOf`・`remove(Object)`**：`equals` で比べる。自作のクラスの `equals(Object)` があれば呼ぶ
- **ラッパー型の `==`**：両側の静的な型がラッパー型なら参照の比較。箱を持たないので、`Integer.valueOf` のキャッシュの規則で決める（`Integer`・`Long` は -128〜127 なら値で、その外は `false`、`Double` はいつも `false`）。**同じ箱を 2 つの変数で指す場合（`Integer y = x; x == y`）は、本物は `true` だが、ここでは値が -128〜127 の外だと `false` になる**（本物と違う唯一の点）
- **入れ子の型引数**：`@lezer/java` は `Map<String, List<Integer>> m` の `>>` をシフト演算子として読むので、型の文脈で `>>` のあとに空白が続くときだけ、同じ長さの `> >` に置き換えてから読む（文字の位置がずれない）
- 足したメソッド：`ArrayList`（`add`・`get`・`set`・`remove`・`size`・`isEmpty`・`contains`・`indexOf`・`lastIndexOf`・`clear`・`addAll`・`sort(null)`・`equals`）、`List.of`、`Collections`（`sort`・`reverse`・`swap`・`max`・`min`・`frequency`）、`StringBuilder`（`append`・`insert`・`reverse`・`toString`・`length`・`charAt`・`setCharAt`・`deleteCharAt`・`delete`・`indexOf`・`setLength`）、ラッパー型（`equals`・`compareTo`・`intValue`・`doubleValue` など）
- `ArrayList`・`List`・`Collections` は `java.util` なので、`import` が要る（ADR-005 と同じ検査）

## 確かめたこと

- 本物の Java と、出力・例外（`tests/cases/collections_basic.java`・`uncaught_list_index.java`）と、変数の状態の変化の列（JDI。`TraceStates.java` が `ArrayList`・`List.of`・ラッパー型・`StringBuilder` の中身を読んで同じ書き方にする）が一致
- コンパイルエラー 5 種（`tests/compile-errors/list_*.java`）の行と `javac` の文面が一致
