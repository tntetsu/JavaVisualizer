# JavaVisualizer 開発計画（初版 2026-11-25、Phase 0 の結果を反映 2026-11-25）

出発点は [PyVisualizer の docs/multilang-plan.md](../../PyVisualizer/docs/multilang-plan.md)（4.2 節）。PyVisualizer の [開発計画書](../../PyVisualizer/docs/development-plan.md) と同じ構成・同じ進め方にする。

## 1. 目的

入門の Java（大学の最初のプログラミングの授業で扱う範囲）の実行過程を、JSVisualizer・PyVisualizer と同じ画面・同じ 12 種類のビューで可視化する。式・文・関数呼び出しの単位で前後に移動しながら、変数・コールスタック・配列・オブジェクト・呼び出しツリーなどを確かめられるようにする。

Java で特に見せたいもの（JS・Python にない学びどころ）：

- **型**：変数に型があること、`int` のあふれ（`Integer.MAX_VALUE + 1`）、整数の割り算（`7 / 2` は `3`）、暗黙の型の変換と明示的なキャスト
- **参照**：配列・オブジェクト・`String` は参照であること、`==` と `equals` の違い、`null` と `NullPointerException`
- **クラス**：フィールド・コンストラクタ・メソッド・`static` とインスタンスの違い・継承

## 2. 前提と制約

- 学期中（〜2027 年 1 月）は、授業で使っている JSInterpreter・JSVisualizer の main に触らない。画面・共通コアへの追加は作業ブランチ（`feature/multilang`・`feature/interp-core`）に入れ、タグを付けて参照する（[CLAUDE.md](../CLAUDE.md)）
- 学期中に Java を進め、続けて CppVisualizer（C、続いて C++）を進める（multilang-plan.md 5 節）。そのため、画面に足すものは、C/C++ でも使える形を意識する（例：型付きの変数の表示は C でも使う）
- 公開（GitHub Pages）は、PyVisualizer と同じく、仕上げてから決める

## 3. アーキテクチャ

```
Java のソース
  → @lezer/java の構文木
  → 自前の変換（src/engine/parse.js）で ESTree 名の AST（Java 固有の構文は新しい型）
  → Java の評価器（src/engine/interpreter.js）が共通コアの Recorder でトレースを記録
  → JSVisualizer の画面（言語プロファイル src/lang/java.js で Java の値の見せ方を渡す）
```

PyVisualizer と同じく、エンジン・言語プロファイル・サンプル・マニュアル・サイトをこのリポジトリに置き、共通コア（`js-interpreter/core`）と画面（`js-visualizer`）を参照する。

### 3.1 値の表現（Phase 0 で決め、ADR にする）

| Java | 候補 | 決めること |
|---|---|---|
| `int`・`short`・`byte` | JS の number（演算のたびに 32 ビットなどに切り詰める。`Math.imul`・`\| 0`） | 整数の割り算・剰余（0 への切り捨て）、`ArithmeticException: / by zero` |
| `long` | BigInt（64 ビットに切り詰める） | `L` の付いたリテラル、`int` との混在 |
| `double`・`float` | 印付きの数（Python の `PyFloat` と同じ考え方） | **表示は Java の規則**（`Double.toString`：`1.0E10`・`1.0E-5`・`0.30000000000000004`）。本物の Java と大量に比べるテストを作る |
| `char` | 印付きの値（表示は `'a'`、演算では整数） | `char + 1` は `int`、`(char)` のキャスト |
| `boolean` | JS の boolean | |
| `String` | **同一性を持つオブジェクトにするか**（`==` と `equals` の違いを見せるため） | リテラルの共有（intern）、`+` で新しいオブジェクトができること。メモリのビューでどう見せるか |
| 配列 | JS の配列＋要素の型・長さの印 | 既定値（`0`・`false`・`null`）、`ArrayIndexOutOfBoundsException`、2 次元配列 |
| クラスのインスタンス | Python の `PyInstance` と同じ作り（クラスと属性） | フィールドの既定値、`static` フィールドの置き場所と見せ方 |
| `null` | JS の null | 表示 `null`、`NullPointerException` |
| `ArrayList`・`HashMap`（Phase 5） | リスト・辞書の印付き | **`HashMap`・`HashSet` の繰り返しの順序**を本物と同じにするには、`hashCode` とバケットの並びを再現する必要がある |

### 3.2 静的な検査（コンパイルエラー）

Java は実行の前にコンパイルし、型の誤りなどを見つける。入門では、コンパイルエラーの理解も大事。どこまで検査するかを Phase 0 で決める（ADR）。

- 最低限：構文エラー、宣言していない変数、型の合わない代入（`int x = 3.5;`）、`return` の忘れ、`String` を `int` に代入
- 見送るもの：ジェネリクスの型検査、オーバーロードの細かな解決、到達できない文の検査など（必要になったら足す）
- 本物と比べるとき：本物の Java もコンパイルエラーになるプログラムでは、エラーになることだけを比べる（メッセージは英語表示のときに `javac` と同じ文面を目指す）

## 4. フェーズ計画

| Phase | 内容 | 完了条件 |
|---|---|---|
| **0. スパイク** | `@lezer/java` の評価（入門の構文が読めるか、`record`・`switch` 式・`var`・テキストブロックなど）、AST の変換と小さな評価器、共通コア・画面に載せて全ビューを確認。値の表現と静的な検査の範囲を決める。本物の Java から変数の状態を取り出す方法（JDI）を試す | 報告書 `docs/phase0-report.md`。共通の契約（TraceEvent・ESTree 名の AST・言語プロファイル）で進めてよいかの判断（Go / No-Go）。値の表現の ADR |
| **1. 土台の調整** | 画面・共通コアに Java のために要るもの（3.1 節・6 節）を作業ブランチに足す。JS 版・Python 版が変わらないことを確かめ、タグを付ける | JS 版の画面が変更前と一致（`capture-js-dom.mjs`）、PyVisualizer のテストが通る |

**Phase 0 の結果（2026-11-25、[phase0-report.md](phase0-report.md)）**：Go。共通コアと画面を変えずに動き、本物の Java との比較がすべて一致した。値の表現は [ADR-002](adr/ADR-002-java-value-representation.md)、AST とトレースは [ADR-003](adr/ADR-003-ast-and-trace.md)、静的な検査は [ADR-004](adr/ADR-004-static-checks.md)。スパイクで MVP（5 節）の大半（`Scanner` を除く）ができたので、Phase 2 はその残りと比較テストの追加になる。Phase 1 の作業項目は報告書 8 節（制御フロー・置換・式評価のビューを Java の AST に合わせる、型の表示、最後の時点の見せ方、`String` の見せ方、`static` フィールドの見せ方、イベントの値の複製）。
| **2. エンジンの MVP** | 5 節の範囲。本物の Java との比較テスト（出力・例外・変数の状態の変化） | 比較テストがすべて通る |
| **3. 言語プロファイル** | 値の見せ方（`valueModel`）・色分け・実行トレースの行・エラーメッセージの英語化 | Java の値が Java の書き方で表示される。ADR の例のテスト |
| **4. アプリ** | サンプル（JS 版の 21 本に対応）、マニュアル（日本語・英語）、デプロイの準備、README | 全サンプル × 全タブでブラウザのエラー 0 件 |
| **5. 対象の拡大** | `ArrayList`・`HashMap`・インターフェース・`switch` の新しい形など、授業で使う範囲まで | 比較テストがすべて通る |

## 5. MVP の対象範囲（Phase 2）

- **プログラムの形**：1 つのファイル。`public class Main { public static void main(String[] args) { … } }` と、同じファイルの中のほかのクラス。`import java.util.*;`（`Scanner` など）は読み飛ばす（使えるクラスは用意したものだけ）
- **型**：`int`・`long`・`double`・`boolean`・`char`・`String`、配列（1 次元・2 次元）
- **文**：変数の宣言と代入（`+=`・`++`・`--` を含む）、`if`／`else`、`while`、`do`／`while`、`for`、拡張 `for`、`switch`（従来の形）、`break`／`continue`、`return`
- **式**：算術（整数の割り算・あふれ）、比較、論理（短絡評価）、条件演算子、キャスト、文字列の連結
- **メソッド**：`static` メソッド、引数（値渡し。参照の値渡しも見せる）、再帰、オーバーロード（引数の数と型で選ぶ基本の形）
- **クラス**：フィールド・コンストラクタ・インスタンスメソッド・`this`・`static` フィールド、継承と `super`・オーバーライド
- **例外**：`try`／`catch`／`finally`、`throw`、よく出る実行時例外（`ArithmeticException`・`ArrayIndexOutOfBoundsException`・`NullPointerException`・`NumberFormatException`）
- **標準ライブラリ**：`System.out.println`・`print`・`printf`、`String` の主なメソッド、`Math`、`Integer.parseInt`・`Integer.MAX_VALUE`、`Scanner`（入力欄から読む。PyVisualizer の ADR-007 と同じ）
- **対象外（MVP）**：ジェネリクスの型検査（`ArrayList<Integer>` の型引数は読み飛ばす）、ラムダ式・ストリーム、スレッド、パッケージ、ファイルの読み書き、内部クラス

## 6. 画面（JSVisualizer の作業ブランチ）に要るもの（見込み）

- 型付きの変数の表示（変数のビュー・コールスタック・メモリのビューで `int x = 3` の型が分かる）。C/C++ でも使う
- `null` の表示（`valueModel` の `literal` で足りるか）
- 配列の既定値と固定の長さ、2 次元配列（配列の配列）の見せ方
- `String` を参照として見せるか（メモリのビューで、文字列もヒープに置いて矢印で指す）
- `static` フィールド（クラスの中の変数）の置き場所
- 制御フローのビュー：`do`／`while`（JS にあるので対応済み）、`switch`、拡張 `for`

## 7. 本物の Java との比較

- **出力と例外**：`java Main.java` で実行し、標準出力と、例外で終わったときの例外のクラスとメッセージを比べる（`Exception in thread "main" java.lang.ArithmeticException: / by zero`）
- **変数の状態の変化**：JDI（`com.sun.jdi`）を使う小さな Java のプログラム（`tests/tools/TraceStates.java` などの名前で）で、本物の Java をステップ実行し、行ごとのローカル変数の値の列を JSON で出す（PyVisualizer の `tests/tools/trace_states.py` に当たる）
  - `java Main.java` の実行はローカル変数の名前の情報（`-g`）を付けずにコンパイルするかもしれない。その場合は `javax.tools`（`jdk.compiler` モジュール。この環境にある）で `-g` を付けてコンパイルしてから JDI で起動する
- **コンパイルエラー**：本物の Java もコンパイルエラーになるプログラムは、エラーになることを比べる
- **書式と小数の表示**：`printf`・`String.format`・`Double.toString` を、値 × 書式の大量の組み合わせで本物と比べる（PyVisualizer の `tests/format.test.js`）

## 8. リスク

| リスク | 対策 |
|---|---|
| `@lezer/java` が入門の構文を読めない・木の形が扱いにくい | Phase 0 で評価する。読めない構文は「まだ対応していません」と分かるメッセージにする |
| `String` の同一性（`==`）や `HashMap` の順序を本物と同じにするのが難しい | Phase 0 で値の表現を決める。順序は Phase 5 で `hashCode` を再現する |
| 静的な検査を作り込みすぎる | 3.2 節の最低限から始め、授業で必要なものだけ足す |
| 画面への追加が JS 版・Python 版を変える | 作業ブランチで足し、変更前後の画面の比較と PyVisualizer のテストで確かめる。タグで参照を固定する |
| 実行が遅い（型の切り詰めなどで演算が増える） | 上限（ステップ数）は共通。大きめの入力で計測する |

## 9. 決めること

| # | 論点 | 時期 |
|---|---|---|
| 1 | 値の表現（3.1 節。特に `String` の同一性、`double` の表示） | Phase 0 → **決定**（ADR-002。`String` は同一性を持つ。`double` は `Double.toString` と一致） |
| 2 | 静的な検査の範囲（3.2 節） | Phase 0 → **決定**（ADR-004） |
| 3 | 型付きの変数を画面でどう見せるか（6 節） | Phase 0〜1 |
| 4 | `static` フィールドの置き場所と見せ方 | Phase 0〜1（Phase 0 は仮に、グローバルのスコープに `Main.count` の名前で置いた） |
| 7 | プログラムの最後の時点の見せ方（`main` が終わると変数がすべて消える） | Phase 1 |
| 8 | イベントの値（`value`）を共通コアで複製するか（JS 版の式評価・置換の表示も直る） | Phase 1（学期中に作業ブランチに入れるか確認する） |
| 5 | サンプルの範囲（JS 版の 21 本に対応させるか、Java 向けに入れ替えるか） | Phase 4 |
| 6 | 公開の方法（GitHub のリポジトリを公開するか） | Phase 4 |
