# Phase 2（エンジンの MVP）報告書（2026-11-26）

[開発計画書](development-plan.md) 4 節 Phase 2 の結果。5 節の MVP の範囲を、本物の Java（OpenJDK 21）との比較テストで確かめながら仕上げた。

## 1. 結論

**完了条件（比較テストがすべて通る）を満たした。** Phase 0 のスパイクで MVP の大半ができていたので、Phase 2 は残りの機能（`Scanner`）と、比較の題材を増やして見つけた食い違いの修正、初学者がよく出会うコンパイルエラーの検査に取り組んだ。

| 比べるもの | Phase 0 | Phase 2 |
|---|---|---|
| 出力と例外（`tests/cases` ＋ サンプル） | 32 本 | **44 本**（入力つき 5 本を含む） |
| コンパイルエラーの行と `javac` の文面（`tests/compile-errors`） | 32 種 | **44 種** |
| 変数の状態の変化の列（JDI） | 28 本 | **37 本** |
| 小数の表示と書式 | 10,910 件 | 10,910 件 |

`npm test` は 183 件すべて通る。Java 版のサンプル 17 本 × 全 12 タブ × 2 時点で、ブラウザのエラーは 0 件。

## 2. 足した機能

| 機能 | 内容 | 記録 |
|---|---|---|
| `Scanner` | 入力欄の内容を読む（`nextInt`・`nextLine`・`next`・`nextDouble`・`hasNext…` など）。`nextInt` のあとの `nextLine` が行の残り（空）を返すのも本物と同じ。`InputMismatchException`・`NoSuchElementException` も本物と同じクラス・メッセージ | [ADR-005](adr/ADR-005-scanner-input.md) |
| `StackOverflowError` の `catch` | 止まらない再帰を `catch (StackOverflowError e)` で捕まえられる（深さは本物より浅い） | ADR-002 追記 |
| 完全な名前 | `java.util.Arrays.toString(…)` のように書ける（`import` が要らない） | ADR-004 追記 |
| そのほか | `String.formatted`・`Math.floorDiv`・`Math.floorMod` | |

## 3. 比較で見つけて直した食い違い

| 食い違い | 本物 | 直す前 | 直し方 |
|---|---|---|---|
| オーバーロードの選び方 | `Object o = "s"; kind(o)` は `kind(Object)` | `kind(String)`（中身の型で選んでいた） | 静的な検査が引数の宣言の型でメソッドを選び、呼び出しの式に印を付ける（ADR-002 追記） |
| メソッドの引数の定数 | `ch(97)` は `ch(int)` | `ch(char)` | 定数の縮小は代入だけの規則なので、引数には当てはめない |
| 条件演算子の型 | `true ? 1 : 2.0` は `1.0`、`false ? 'a' : 98` は `b` | `1`・`98` | 静的な検査が結果の型を求め、評価器が変換する |
| 条件演算子の参照の型 | `c ? dog : animal` は `Animal` 型 | 型が分からない | 広い方の型 |

## 4. 実行前に見つけるコンパイルエラー（ADR-004 追記）

初学者がよく出会うのに、Phase 0 では実行して初めて見つかった（または見つからなかった）ものを、`javac` と同じ行・同じ文面で見つけるようにした。

| 誤り | 例 | `javac` |
|---|---|---|
| 値を入れる前に使う | `int y; if (c) { y = 1; } System.out.println(y);`（`c` が真でも） | `variable y might not have been initialized` |
| 到達できない文 | `return n; n++;` | `unreachable statement` |
| 検査例外を扱わない | `throw new Exception("x");`（`throws` も `catch` もない） | `unreported exception Exception; must be caught or declared to be thrown` |
| `final` への再代入 | `final int x = 1; x = 2;`、`LIMIT++;` | `cannot assign a value to final variable x` |
| `import` の忘れ | `Scanner sc = …`（`import java.util.Scanner;` がない） | `cannot find symbol` |

「値を入れる前に使う」の解析は、誤ってエラーにしないことを優先した（`if`/`else` の全部の枝・`switch` の `default`・`while (true)` と `break`・`try` と `catch` の両方・`&&` の右側での代入は通す。`tests/cases/definite_assignment_ok.java`）。

## 5. 残ったこと → Phase 3 以降

- 英語表示（`javac`・JVM の文面）は、エラーを作る場所で対にしてある（`tests/messages-en.test.js` が漏れを調べる）。画面で切り替えるのは Phase 3
- `NullPointerException` の詳しいメッセージ（`Cannot read field "value" because "n.next" is null`）を出すかは Phase 3 で決める
- `float`・`interface`・`enum`・`ArrayList`・`HashMap`・ラムダ式などは Phase 5（「まだ対応していません」と出す）
- 見送った検査：ジェネリクス、`catch` した検査例外が `try` の中で投げられない、初期化子のない `final` のフィールド

## 6. 再現方法

```bash
npm test                                    # 183 件（java が必要。約 1 分）
node scripts/run.mjs tests/cases/scanner_basic.java < /dev/null   # エンジンだけで実行（入力は runOurs で渡す）
java tests/tools/TraceStates.java tests/cases/scanner_basic.java tests/cases/scanner_basic.stdin
```
