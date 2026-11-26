# ADR-004: 静的な検査（コンパイルエラー）の範囲

- ステータス: 採用（Phase 0）
- 日付: 2026-11-25

## 背景

Java は実行の前にコンパイルし、型の誤りなどを見つける。入門では「コンパイルエラーを読んで直す」ことも学ぶので、JavaVisualizer も実行の前に誤りを見つけたい。一方、`javac` と同じ検査をすべて作るのは大きすぎる（[development-plan.md](../development-plan.md) 3.2 節）。

## 利用者に見える例

テストは `tests/adr-examples.test.js`（ADR-004 例 1〜3）。

```java
System.out.println("start");
int x = 3.5;
```

実行する前にコンパイルエラーになり、`start` は表示されない。日本語の表示は「コンパイルエラー（4行目）: double の値を int の変数に入れると、値が失われるおそれがあります（入れるなら (int) でキャストします）」。英語の表示では、本物の `javac` と同じ「incompatible types: possible lossy conversion from double to int」を使う。

- `if (x > 5) { System.out.println(y); }`（`y` を宣言していない）は、`if` の中が実行されなくてもコンパイルエラーになる
- `if (x = 1)` は「条件には boolean（true か false）になる式を書きます（等しいかを調べるときは「=」ではなく「==」を使います）」

## 決定

実行の前に、すべてのメソッドの本体を、式の型を推論しながらたどる（`src/engine/check.js`）。見つけるもの：

| 誤り | javac の文面 |
|---|---|
| 構文エラー（`;` の忘れ・括弧・文字列の閉じ忘れ・`else` だけ など 10 種） | `';' expected` など（`parse.js`） |
| 宣言していない変数・メソッド・型、スコープの外の変数 | `cannot find symbol` |
| 型の合わない初期化・代入・`return`・配列の要素（`int x = 3.5;`・`String s = 1;`・`int n = "12";`） | `incompatible types: …` |
| 条件が `boolean` でない（`if (x = 1)`・`while (n)`） | `incompatible types: int cannot be converted to boolean` |
| `return` の忘れ（値を返すメソッドの最後まで進める） | `missing return statement` |
| `void` のメソッドから値を返す | `incompatible types: unexpected return value` |
| 引数の数・型が合わない | `method f in class Main cannot be applied to given types;` |
| static の文脈からインスタンスのフィールド・メソッドを使う | `non-static variable … cannot be referenced from a static context` |
| 同じ名前の変数の再宣言 | `variable x is already defined in method main(String[])` |
| `int` に収まらない整数のリテラル、文字列の `<`、`int` のメソッドの呼び出し、`String` の `length`（括弧なし）、`String` から `int` へのキャスト | 本物と同じ文面 |

- 日本語の説明と `javac` の英語の文面を、エラーを作る場所で対にして持つ（`JavaCompileError.javac`）。英語表示（Phase 3）では `javac` の文面を使う（PyVisualizer の ADR-010 と同じ方針）。対になっていることは `tests/messages-en.test.js` で確かめる
- **本物との一致**：典型的な誤り 32 種で、最初のエラーの行と `javac` の文面が本物と一致（`tests/oracle.test.js`、`tests/compile-errors/`）
- 型が分からない式（表を作っていない組み込みのメソッドなど）は「分からない」とし、検査を見送る（**誤ってエラーにしない**ことを優先する）

見送るもの（必要になったら足す）：

- ジェネリクスの型検査、`catch` した検査例外が `try` の中で投げられない（`exception … is never thrown`）、初期化子のない `final` のフィールドの扱い

## Phase 2 の追記（2026-11-26）

- **検査例外**：`Exception` の下で `RuntimeException` の下でない例外（自作の `class MyException extends Exception` を含む）を `throw` するか、`throws` を書いたメソッド・コンストラクタを呼ぶとき、外側の `try` の `catch` か、そのメソッドの `throws` で扱っていなければコンパイルエラーにする。日本語は「例外 Exception は、try … catch で捕まえるか、メソッドに throws Exception と書く必要があります」、英語は `javac` と同じ `unreported exception Exception; must be caught or declared to be thrown`（`tests/compile-errors/unreported_*.java`）
- **オーバーロード**：引数の宣言の型からいちばん特定的なメソッドを選び、呼び出しの式に印を付ける（評価器はそのメソッドを呼ぶ。ADR-002 追記）
- **確実な代入**（JLS 16 章の簡略版）：初期化子なしで宣言したローカル変数（`int y;`）を、どの道筋でも値を入れる前に使っていればコンパイルエラーにする。`if` の片方だけで代入した・ループの中だけで代入した変数を、そのあとで使う形（`variable y might not have been initialized`）。`if`/`else` のすべての枝、`switch` の `default` を含むすべての `case`、`while (true)` と `break`、`try` と `catch` の両方、`&&` の右側での代入などは、誤ってエラーにしない（`tests/cases/definite_assignment_ok.java`）。わからない所はゆるめ（入っているもの）に扱う
- **到達できない文**：`return`・`break`・`continue`・`throw` のあとの文（`unreachable statement`）
- **`final` への再代入**：`final` のローカル変数と、初期化子のある `final` のフィールド（定数 `static final int LIMIT = 3;`）に値を入れ直す・`++` すると、コンパイルエラー（`cannot assign a value to final variable x`・`… static final variable LIMIT`）
- **`import`**：`Scanner`・`Arrays` は `import` が要る（ADR-005）。`java.util.Arrays.toString(…)` のように完全な名前で書けば要らない

## 理由

- Phase 0 の実装は約 450 行で、入門の典型的な誤りの大半を `javac` と同じ行・同じ文面で見つけられた。作り込みすぎずに済む範囲で、学びの効果が大きい
- 実行される場所だけで誤りを見つける（JS・Python と同じ）方式だと、Java の「コンパイルできない」が伝わらない
