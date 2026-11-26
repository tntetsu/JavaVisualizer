# Phase 3（言語プロファイル）報告書（2026-11-26）

[開発計画書](development-plan.md) 4 節 Phase 3 の結果。値の見せ方・色分け・実行トレースの行・エラーメッセージの英語化を仕上げた。

## 1. 結論

**完了条件（Java の値が Java の書き方で表示される。ADR の例のテスト）を満たした。** 決定は [ADR-006](adr/ADR-006-display-and-messages.md) にまとめ、利用者に見える例を `tests/adr-examples.test.js`（ADR-006 例 1〜4）にした。

- 値は Java の書き方で表示される（`3.0`・`1.0E10`・`'a'`・`"hi\n"`・`null`・`{1, 2, 3}`・`int[3]`・`Dog{name: "Rex"}`）。Phase 0〜1 で仮に作った書き方を点検し、そのまま採用した
- エラーの見出しに「Compile Error」を足した（今までは「Runtime Error」と出ていた）
- 英語表示では、エラーメッセージが本物の `javac`・JVM と同じ文面になる。すべての誤りの題材で日本語が残らないことを確かめた
- `NullPointerException` は、Java 21 と同じく何が `null` だったかを書く（`Cannot read field "value" because "n.next" is null`）。日本語でも「「n.next」が null（何も指していない）なので、フィールド value を読めません」と具体的に書く
- 入力欄の見出しを Scanner の文言にした（今までは Python の `input()` の文言だった）
- コード表示の色分けで、文字列の中の `//` がコメントになる・`0x1F`・`1.5e3` を拾えない、を直した

## 2. やったこと

| 項目 | 直した側 | 内容 |
|---|---|---|
| エラーの英語表示 | Java 版 | エラーを作るときに、日本語のメッセージに英語のメッセージ（`javac`・JVM の文面）を対応させて登録し（`src/engine/messages-en.js`）、言語プロファイルの `localizeError` が引く。「まだ対応していません」の構文の名前にも英語を付けた |
| 「Compile Error」の見出し | 画面 | エラーの `name` が `CompileError` のとき（JSVisualizer の ADR-055 追記） |
| `NullPointerException` の文面 | Java 版 | 静的な検査が式に型の印を付け、評価器が「何をしようとしたか」と「何が null だったか」を組み立てる。本物（`-g` 付きでコンパイル、`tests/tools/RunWithDebugInfo.java`）と 27 通りで一致（`tests/npe.test.js`） |
| 入力欄の文言 | 画面・Java 版 | 言語プロファイルの省略できる `inputText`（JSVisualizer の ADR-055 追記） |
| 色分け | Java 版 | 文字列の規則を先にする、数の規則（16 進・2 進・指数・`_`・`L`・`f`）、注釈（`@Override`） |

実行トレースの行（`traceRowTypes`）は Phase 0 の形（拡張 `for` の各回・`catch`・`switch` の `case`・フィールドの初期化でも行を作る）のまま、変える所はなかった。

## 3. 確かめたこと

- Java 版：テスト 270 件がすべて通る。サンプル 17 本 × 全 12 タブ × 2 時点でブラウザのエラー 0 件
- 英語表示：コンパイルエラーの題材 44 種と、例外で終わる題材 8 本で、日本語が残らない（`tests/messages-en.test.js`）
- Python 版：PyVisualizer のテスト 387 件がすべて通る
- JS 版の画面：4 節

## 4. JS 版の画面の比較の結果

（記録が終わったら書く）

## 5. 残ったこと → Phase 4 以降

- `switch`（文字列）と拡張 `for` の `NullPointerException` は、本物ではコンパイラが作った変数の名前（`"<local7>"`）になるので、実際の式の名前を書いている（本物と違う）
- プログラムの中で `catch` した `NullPointerException` の `getMessage()` も詳しい文面を返す。`java Main.java`（`-g` なし）で実行した本物とは、変数名の部分が違う（`"<local1>"`）。比較テストは、`NullPointerException` のクラスだけを比べている
- マニュアル（日本語・英語）、サンプル（JS 版の 21 本に対応）、デプロイの準備は Phase 4
