# ADR-002: Java の値の表現

- ステータス: 採用（Phase 0）。ビューでの見せ方（型の表示・String の置き場所・static フィールドの見せ方）は Phase 1〜3 で決め、この ADR に追記する
- 日付: 2026-11-25

## 背景

評価器は Java 用に新しく書く（JS・Python の評価器には変換しない）。Java の値を JS の何で表すかで、意味論の正しさ（`int` のあふれ・整数の割り算・`==` と `equals`）と、画面のビューがそのまま使えるかが決まる（[development-plan.md](../development-plan.md) 3.1 節）。

## 利用者に見える例

テストは `tests/adr-examples.test.js`（ADR-002 例 1〜4）。

```java
int a = 7 / 2;                     // 3（小数点以下は切り捨て）
double b = 7 / 2.0;                // 3.5
int over = Integer.MAX_VALUE + 1;  // -2147483648（あふれる）
```

- 変数のビューで、`int i = 3;` は `3`、`double d = 3;` は `3.0` と表示される（Java の `println` と同じ書き方）
- `String s1 = "hello"; String s2 = "hel" + "lo";` は `s1 == s2` が `true`（どちらもリテラルとして共有される）。`String s3 = part + "lo";`（変数との連結）は `s1 == s3` が `false`、`s1.equals(s3)` は `true`
- `int[] y = x; y[0] = 100;` のあと、`x[0]` も `100` になり、メモリのビューで `x` と `y` の矢印が同じ配列を指す

## 決定

| Java | 表現 | 理由・注意 |
|---|---|---|
| `int`（`short`・`byte`） | JS の number。演算のたびに 32 ビットに切り詰める（`\| 0`・`Math.imul`）。`short`・`byte` は代入のときに切り詰める | 配列の添字・棒グラフ・ヒートマップがそのまま使える（Python 版と同じ判断） |
| `long` | BigInt（`BigInt.asIntN(64, …)`） | `typeof` で `int` と区別できる |
| `double` | `JDouble`（`{ v }`。不変の印付きの数） | `int` の 3 と `double` の 3.0 を区別するため（Python の `PyFloat` と同じ考え方）。表示は Java の `Double.toString` |
| `char` | `JChar`（`{ code }`。不変） | 表示は `'a'`、演算では整数（`'a' + 1` は `98`） |
| `boolean` | JS の boolean | |
| `String` | `JString`（`{ s }`。不変。**同一性を持つ**） | `==` と `equals` の違いを本物と同じにするため。リテラルと定数式（`"hel" + "lo"`）は実行ごとの表で共有する（intern）。`new String(…)` と、変数を含む連結は新しいオブジェクト |
| 配列 | JS の配列＋列挙されない印 `__jelem`（要素の型の文字列） | 配列のビューがそのまま使える。既定値（`0`・`0.0`・`false`・`'\u0000'`・`null`）は要素の型から作る。スナップショットのクローンでも印を保つ（共通コアの `createCloner` の hook） |
| クラスのインスタンス | `{ __type__: 'JObject', cls, fields }` | `fields` がその時点の値としてスナップショットに残る（Python の `PyInstance` と同じ作り） |
| クラス | `JClass`（スナップショットでは参照を保持） | |
| `null` | JS の null | |
| 例外 | 例外のクラスのインスタンス（`fields.message`） | `getMessage()`・`toString()` は本物と同じ文面（`java.lang.ArithmeticException: / by zero`） |

- **`float` は対応しない**（MVP の範囲外。「まだ対応していません」と出す）
- 不変の値（`JDouble`・`JChar`・`JString`）は、共通コアのクローンが参照を保持するので、スナップショットの費用が増えない。`JString` を参照のまま保つので、スナップショットの中でも `==` の関係（同じオブジェクトか）が保たれる
- **`double` の表示**：JS の最短の桁（`toExponential()`）は Java（JDK 19 以降）の `Double.toString` の桁と同じ。違うのは書き方（`1.0E7`・`1.0E-4`）と、最短が 1 桁のときに 2 桁の候補からも選ぶ規則（`Double.MIN_VALUE` は `4.9E-324`）だけ。`printf` の `%f`・`%e` は、最短の桁を HALF_UP で丸める（`%.2f` の 2.675 は `2.68`）。どちらも本物と約 1 万件の組み合わせで一致（`tests/format.test.js`）
- **オーバーロードの選択**は、実行時の引数の値の型で「いちばん近い」ものを選ぶ（Phase 0 の簡略版）。本物の Java は静的な型で選ぶので、`Object o = "s"; f(o);` のような場合に違いうる。授業の範囲で問題が出たら、静的な検査（ADR-004）の型を使う形に直す

## Phase 0 で決めなかったこと（Phase 1〜3）

| 論点 | Phase 0 での仮の形 | 分かったこと |
|---|---|---|
| 型の表示 | 表示しない（値だけ） | ビューは変数の型を知らない。スコープに型の表（`JScope.types`）はあるので、トレースに型を載せれば表示できる |
| `String` をメモリのビューでどう見せるか | 値として、その場に `"hello"` と書く（`kind: 'string'`） | このままでは `s1 == s3` が `false` になる理由が画面で見えない。ヒープに置いて矢印で指す見せ方を選べるようにするか、Phase 1 で決める |
| `static` フィールドの置き場所 | グローバルのスコープに「クラス名.フィールド名」（`Main.count`）で置く | 変数・メモリのビューの「Global」に出る。クラスごとにまとめる見せ方は Phase 1 で検討 |
| `long` の書き方 | `10000000000`（`L` を付けない） | Java の `println` と同じ |
| `void` のメソッドの戻り値 | `undefined`（式評価のビューでは `void`） | |
