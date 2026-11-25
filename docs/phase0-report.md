# Phase 0（スパイク）報告書（2026-11-25）

[開発計画書](development-plan.md) 4 節 Phase 0 の結果。目的は「共通の契約（TraceEvent・ESTree 名の AST・言語プロファイル）で Java を進めてよいか」の判断と、`@lezer/java` の評価、値の表現と静的な検査の範囲の決定。

## 1. 結論

**計画どおり進めてよい（Go）。`@lezer/java` も採用してよい。**

- **JSInterpreter と JSVisualizer を 1 行も変えずに**、Java のエンジンを載せた画面が動いた。Python 版で作った言語プロファイルの仕組み（`setLanguage`）がそのまま使えた
- Java 版のサンプル 17 本 × 全 12 タブ × 2 時点（途中・最後）で、ブラウザのエラーは 0 件
- **本物の Java との比較がすべて一致**：出力と例外 32 本、コンパイルエラーの行と `javac` の文面 32 種、変数の状態の変化の列 28 本（JDI）、小数の表示と書式 10,910 件
- 値の表現（[ADR-002](adr/ADR-002-java-value-representation.md)）と、静的な検査の範囲（[ADR-004](adr/ADR-004-static-checks.md)）を決めた
- 12 タブのうち、**構造が壊れたビューはない**。Java で合わない所は 3 つのビュー（制御フロー・置換・式評価）で、どれも画面が AST の形や JS の書き方に頼っている箇所。Phase 1 で画面の側を直す（3.3 節）
- 予想していなかった課題：トレースのイベントの値（`value`）が複製されずに記録されている（JS 版にもある既存の問題。Java では目立つ。3.2 節）、プログラムの最後の時点では `main` のフレームが終わっていて変数がすべて消える（3.3 節）

## 2. 作ったもの

| ファイル | 行数 | 内容 |
|---|---|---|
| [src/engine/parse.js](../src/engine/parse.js) | 556 | Lezer の木 → ESTree 名の AST、構文エラーの日本語の説明と `javac` の文面 |
| [src/engine/check.js](../src/engine/check.js) | 495 | 静的な検査（型の推論、ADR-004） |
| [src/engine/interpreter.js](../src/engine/interpreter.js) | 1004 | 評価器（型の変換・整数の演算・参照・クラスと継承・オーバーロード・例外・初期化の順序） |
| [src/engine/values.js](../src/engine/values.js) | 261 | 値の表現（ADR-002）、`Double.toString` |
| [src/engine/objects.js](../src/engine/objects.js) | 154 | クラス・インスタンス・組み込みの例外 |
| [src/engine/builtins.js](../src/engine/builtins.js) | 389 | `System.out`・`printf`・`String.format`・`Math`・`Integer`・`Double`・`Character`・`String` のメソッド・`Arrays` |
| [src/engine/java-debugger.js](../src/engine/java-debugger.js) | 102 | 共通コアの `TraceDebugger` の派生 `JavaDebugger`、ノードの分類 |
| [src/lang/java.js](../src/lang/java.js) | 93 | 言語プロファイル（値の見せ方は仮） |
| [scripts/build.mjs](../scripts/build.mjs) | 113 | ビルド（PyVisualizer のものを Java 用にした） |
| [samples/](../samples/) | — | JS 版のサンプルに対応する 15 本と、Java 向けの 2 本（型と参照・例外） |
| [tests/](../tests/) | — | 143 件（7 節） |

対象範囲は計画書 5 節の MVP のうち、`Scanner` を除くほぼ全部（`switch` の新しい形の文 `case 1 ->` も読める）。スパイクのコードは捨てずに Phase 2 の土台にする。

## 3. 共通化の検証

### 3.1 無改造で使えたもの

| 部品 | 結果 |
|---|---|
| 共通コア（`Recorder`・`Scope`・`createCloner`・制御シグナル・`TraceDebugger`・`finalizePartialTrace`） | そのまま使えた。ブロックのスコープ（`for` の変数など）も `Scope` の入れ子で表せた |
| ステップ操作・humanStep | ノードの分類（`JAVA_NODE_CATEGORIES`）を渡すだけで動いた。`NewExpression` を `call` に入れると、コンストラクタにも入って止まる |
| 言語プロファイル（`valueModel`・`traceRowTypes`・`syntaxTokens`・`editorExtension`） | Python 版で作った仕組みがそのまま使えた。`@codemirror/lang-java` で編集の色分けも Java になる |
| ビルド（PyVisualizer の `build.mjs`） | 名前を置き換えるだけで使えた |
| エラー表示 | 実行時エラーはエラーの直前までステップ操作できる（[画像](phase0/runtime-error.png)）。コンパイルエラーは実行前に止まる（[画像](phase0/compile-error.png)） |

### 3.2 共通コアで分かったこと → Phase 1 で検討

| # | 問題 | 影響 | 対処の案 |
|---|---|---|---|
| a | **トレースのイベントの値（`value`）が複製されずに記録される**（`Recorder.record` は `env` などの変数は複製するが、`value` は参照のまま） | 配列・オブジェクトを返す式の値が、後の状態で表示される。式評価のビューで `arr[j + 1] = tmp` の `arr` が最後の並び（`{1, 2, 3, 5, 8}`）になる（[画像](phase0/exprtrace-live-value.png)）。**JS 版にも同じ問題がある**（バブルソートの `bubbleSort([1, 2, 3, 5, 8])` が途中から整列後の値で表示される）。Java は配列を必ず変数を通して使うので目立つ | 共通コアで `value` も `clone` する。JS 版の表示も変わる（直る）ので、学期中に作業ブランチに入れるかは確認が要る |
| b | 再帰の上限：Node の既定のスタックで約 200 段（JS 版 187 段・Python 版 291 段と同程度） | 授業で使う程度の再帰には足りる。`StackOverflowError` は `catch` で捕まえられない（ホストのスタックのあふれとして扱う） | 当面はこのまま |
| c | 記録の上限（10 万イベント）に、ループ 5,000 回ほどで達する | JS 版と同じ上限。Java は `for` の 1 回あたりのイベントが多め | 当面はこのまま。大きめの入力で計測する（計画書 8 節） |

### 3.3 画面（JSVisualizer）の問題 → Phase 1（作業ブランチ）で直す

| ビュー | 結果 | Java 版での問題 |
|---|---|---|
| コールスタック | ○ | `main({})`（引数 `args` が毎回出る）、中身のない「Global」が出る |
| 変数 | ○ | 型が表示されない（`int x` の `int`） |
| 実行トレース | ○ | なし |
| **置換** | **×（タブが無効）** | 「ユーザー定義の関数の呼び出しか」を、呼び出し先の式の値（関数のオブジェクト）で判定している。Java ではメソッド名は値ではない（式として評価しない）ので、呼び出しと判定されない → フレームの深さの変化で判定するように直す |
| **式評価** | △ | 宣言の行を `let`・`const`・`var` の正規表現で探すので、`int x = …` の行が出ない → 宣言の初期化子の位置を AST・トレースから取るように直す。値の問題（3.2 節 a） |
| 配列 | ○ | `args`（いつも空）が既定で選ばれる |
| ヒートマップ | ○ | なし |
| 呼び出しツリー | ○（[画像](phase0/fib-calltree.png)） | `main({})` |
| ライフタイム | ○ | なし |
| **制御フロー** | **×（空）** | 関数を、プログラムの直下と関数の中からしか集めていない。Java のメソッドはクラスの中にあるので 1 つも出ない（[画像](phase0/controlflow-empty.png)）→ `ClassDeclaration` の中の `MethodDefinition` も集める。`switch` を分岐として描く |
| メモリ | ○（[画像](phase0/references-memory.png)） | 配列はヒープに置かれ、`x` と `y` の矢印が同じ配列を指す（参照の共有が見える）。**文字列はその場に書かれるので、`s1 == s3` が `false` になる理由が見えない**。型が出ない |
| オブジェクト | ○（[画像](phase0/binary-tree-objects.png)） | `Node` の二分木がグラフになる。なし |

すべてのビューに共通すること：

- **プログラムの最後の時点で、変数がすべて消える**：JS・Python では最後にグローバル変数が残るが、Java の変数は `main` のフレームの中にあり、最後の時点では `main` が終わっている。最後の時点を「`main` の最後の文のあと」にするか、`main` のフレームを残すかを Phase 1 で決める
- エラーの見出しが、コンパイルエラーでも「Runtime Error」になる（画面は構文エラーとそれ以外しか区別しない）→ Phase 3
- 値の見せ方（配列を `{1, 2, 3}`、オブジェクトを `Dog{name: "Rex", …}` と書く、`char` を `'a'`、`void`）は仮のもの → Phase 3

## 4. `@lezer/java`（1.2.0）の評価

**採用を推奨する。**

- 正しいコードの解析：入門の構文（宣言・配列・2 次元配列の初期化子・`for`・拡張 `for`・`do`／`while`・従来の `switch`・`try`／`catch`（`|` で複数）／`finally`・キャスト・`instanceof`・コンストラクタの `super(…)`・`this(…)`）と、新しい構文（`var`・テキストブロック・`switch` の `->` と `yield`・`record`・`enum`・`interface`・ラムダ式・ジェネリクス・`instanceof` の型パターン）をすべて読めた。読めなかったのは Java 21 のレコードパターン（`o instanceof P(int a, int b)`）だけで、入門の範囲外
- 木の形は素直で、ESTree の形への変換は約 550 行で済んだ（Python 版と同じくらい）
- `if (x = 1)`・宣言していない変数は構文としては正しいので、静的な検査（ADR-004）で見つける
- エラーノードは位置しか教えてくれない。Python 版と同じく、エラーの位置と親のノードから説明を選ぶ方式にした。典型的な 10 種の誤りに日本語の説明を付け、**`javac` と同じ行・同じ文面**にできた

| 誤り | 日本語の説明 | `javac` |
|---|---|---|
| `int x = 3`（`;` の忘れ） | 文の終わりに「;」がありません | `';' expected` |
| `println("abc);` | 文字列の「"」が閉じていません | `unclosed string literal` |
| `println((1 + 2);` | 「)」が足りません | `')' or ',' expected` |
| `}` の不足・過剰 | 「}」が足りません／多すぎます | `reached end of file while parsing` など |
| `if x > 1 {` | if の条件は「(」と「)」で囲みます | `'(' expected` |
| if のない `else` | 対応する if のない else があります | `'else' without 'if'` |
| `char c = 'ab';` | 文字（char）は ' ' の中に 1 文字だけ書きます | `unclosed character literal` |
| `int x == 3;` | 「==」ではなく「=」を使います | `';' expected` |
| Python の書き方の `for` | for の書き方が正しくありません | `'(' expected` |

`javac` は 1 つの誤りから複数のエラーを出すことがある。比べるのは最初の 1 つだけにした。

## 5. 本物の Java との比較

計画書 7 節の方法がすべて実現できた。

| 比べるもの | 方法 | 結果 |
|---|---|---|
| 出力と例外 | `java ファイル.java`（OpenJDK 21）で実行し、標準出力と捕まえられなかった例外の 1 行を比べる（[tests/oracle.test.js](../tests/oracle.test.js)） | テストケース 15 本＋サンプル 17 本がすべて一致 |
| コンパイルエラー | 最初のエラーの行と `javac` の文面を比べる | 32 種すべて一致 |
| 変数の状態の変化 | **JDI**（[tests/tools/TraceStates.java](../tests/tools/TraceStates.java)）。`javax.tools` で `-g` を付けてコンパイルし、別の JVM で 1 行ずつステップ実行して、メソッドに入ったとき・各行の前・抜けるときのローカル変数を読む（[tests/line-state.test.js](../tests/line-state.test.js)） | 28 本すべて一致 |
| 小数の表示と書式 | `Double.toString`・`%f`・`%.2f`・`%e`・`%,.2f` などを、乱数のビット列・桁の少ない 10 進数・丸めの境目の値で比べる（[tests/format.test.js](../tests/format.test.js)） | 10,910 件すべて一致 |

比べて見つかり、直したもの：

- `"hel" + "lo"` は定数式なのでリテラルと共有される（`== "hello"` が `true`）
- `Double.MIN_VALUE` は `4.9E-324`（最短の桁が 1 桁のときの規則）
- メソッドの本体のブロックを、引数と別のスコープにしていたため、メソッドを抜ける直前に本体の変数が見えなくなっていた（JDI では見える）

比べ方で決めたこと：

- `NullPointerException` は、例外のクラスだけを比べる。Java 21 の詳しいメッセージ（`Cannot read field "value" because "<local1>.next" is null`）は、変数名の情報の有無で文面が変わるため。画面での見せ方は Phase 3 で決める
- `Math.random()` は本物と同じ値にはしない（実行のたびに同じ列にする。`java.util.Random` と同じ式で種 42）

## 6. 値の表現と静的な検査

- 値の表現は [ADR-002](adr/ADR-002-java-value-representation.md)。`int` は JS の number（切り詰め）、`long` は BigInt、`double`・`char`・`String` は印付きの不変の値。**`String` に同一性を持たせた**ことで、`==` と `equals` の違いが本物と同じになった。ビューでの見せ方（型の表示・`String` をヒープに置くか・`static` フィールド）は Phase 1〜3
- 静的な検査は [ADR-004](adr/ADR-004-static-checks.md)。型を推論しながらすべてのメソッドをたどり、典型的な誤りを実行前に `javac` と同じ文面で見つける。変数の確実な初期化・到達できない文などは見送る
- AST とトレースに足したものは [ADR-003](adr/ADR-003-ast-and-trace.md)（`LoopBinding`・`CatchBinding`・`CaseMatch`・`FieldDeclaration`、`main` をフレームに）

## 7. テスト

`npm test` で 143 件（約 50 秒。`java` が必要）。

| ファイル | 件数 | 内容 |
|---|---|---|
| `oracle.test.js` | 64 | 出力・例外・コンパイルエラーを本物と比べる |
| `line-state.test.js` | 28 | 変数の状態の変化の列を JDI と比べる |
| `format.test.js` | 1（10,910 組） | 小数の表示と書式 |
| `debugger.test.js` | 24 | humanStep の停止点、画面の `TraceBuilder` がトレースを読めるか |
| `parse.test.js` | 16 | AST の形、構文エラーの説明、まだ対応していない構文 |
| `adr-examples.test.js` | 9 | ADR-002〜004 の利用者に見える例 |
| `messages-en.test.js` | 1 | エラーを作る呼び出しに `javac` の英語の文面があるか |

## 8. 計画への反映

- **Phase 1（土台の調整）**の作業項目：
  - 画面：制御フローのビューがクラスの中のメソッドを集める、置換のビューの呼び出しの判定をフレームで行う、式評価のビューが宣言の位置を AST から取る、変数の型を表示する（トレースに型を載せる）、最後の時点の変数の見せ方、`String` をヒープに置く見せ方の選択、`static` フィールドの見せ方
  - 共通コア：イベントの値（`value`）の複製（3.2 節 a。JS 版の表示も直るので、作業ブランチに入れる前に確認する）
- **Phase 2（エンジンの MVP）**：スパイクのコードを土台にする。残りは `Scanner`（入力欄）、`String` のメソッドの残り、`StackOverflowError` を `catch` できるようにするか、比較テストの追加
- **Phase 3**：値の見せ方、英語表示（`javac`・JVM の文面）、エラーの見出し（コンパイルエラー）、`NullPointerException` の詳しいメッセージの見せ方

## 9. 再現方法

```bash
npm install                         # 兄弟ディレクトリに ../JSInterpreter-core・../JSVisualizer-multilang が必要
npm test                            # 143 件（java が必要）
node scripts/build.mjs --serve      # http://127.0.0.1:8124/
node scripts/run.mjs samples/01_fibonacci.java      # エンジンだけで実行
node scripts/capture-spike.mjs <出力先>             # 全サンプル × 全タブのスクリーンショットとブラウザのエラー
java tests/tools/TraceStates.java samples/03_euclid_loop.java   # 本物の Java の変数の状態の変化
```
