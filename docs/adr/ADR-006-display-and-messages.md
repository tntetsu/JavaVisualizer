# ADR-006: Java の値の書き方とエラーメッセージ（日本語・英語）

- ステータス: 採用（Phase 3）
- 日付: 2026-11-26

## 背景

画面のビューは、値の書き方とエラーの表示を言語プロファイルから受け取る（JSVisualizer の ADR-055）。Phase 0〜2 では仮の書き方で進めていた。Phase 3 で、Java を学ぶ人に分かりやすく、本物の Java と食い違わない書き方を決める。エラーメッセージは、日本語では初学者向けの説明、英語では本物の Java（`javac`・JVM）と同じ文面にする（PyVisualizer の ADR-010 と同じ方針）。

## 利用者に見える例

テストは `tests/adr-examples.test.js`（ADR-006 例 1〜4）。

**値の書き方**（変数・式評価・実行トレース・メモリなどのビュー）

| Java の値 | 書き方 |
|---|---|
| `int x = 3;`・`long big = 10000000000L;` | `3`・`10000000000`（`println` と同じ。`L` は付けない） |
| `double d = 3;`・`1e10`・`0.1 + 0.2` | `3.0`・`1.0E10`・`0.30000000000000004`（`Double.toString` と同じ） |
| `char c = 'a';` | `'a'` |
| `String s = "hi\n";` | `"hi\n"`（Java のリテラルの書き方） |
| `boolean`・`null` | `true`・`null` |
| `int[] a = {1, 2, 3};` | `{1, 2, 3}`、見出しは `int[3]`（配列の初期化子の書き方） |
| `new Dog("Rex")` | `Dog{name: "Rex", tricks: {…}}`（上のクラスのフィールドから順に） |
| 値を返さないメソッドの呼び出し | `void` |

**エラー**

| 種類 | 見出し | 日本語 | 英語 |
|---|---|---|---|
| 構文エラー | Syntax Error | 構文エラー（3行目）: 文の終わりに「;」がありません | Syntax error (line 3): ';' expected |
| コンパイルエラー | **Compile Error** | コンパイルエラー（4行目）: double の値を int の変数に入れると、値が失われるおそれがあります（入れるなら (int) でキャストします） | Compile error (line 4): incompatible types: possible lossy conversion from double to int |
| 実行時の例外 | Runtime Error | 実行時エラー（5行目）: 整数を 0 で割りました。java.lang.ArithmeticException: / by zero | Exception in thread "main" java.lang.ArithmeticException: / by zero (line 5) |
| `NullPointerException` | Runtime Error | 実行時エラー（6行目）: 「n.next」が null（何も指していない）なので、フィールド value を読めません。java.lang.NullPointerException: Cannot read field "value" because "n.next" is null | Exception in thread "main" java.lang.NullPointerException: Cannot read field "value" because "n.next" is null (line 6) |

入力欄の見出しは「入力（Scanner で読みます。空白や改行で区切ります）」（英語は「Input (read with Scanner; separate values with spaces or new lines)」）。

## 決定

### 値の書き方（`src/lang/java.js` の `javaValueModel`）

上の表のとおり。`char` と `String` は値の種類（`kind`）を `string` にし、ほかのビューと同じく文字として扱う。メモリのビューでは `String` をヒープの箱に置く（ADR-002 追記）。配列のかっこは、`Arrays.toString` の `[1, 2, 3]` ではなく、ソースに書くときの `{1, 2, 3}` にした（ソースのコードと見比べやすいため）。

### コード表示の色分け

文字列（`"…"`・`'a'`・テキストブロック）、コメント、数（`10L`・`0x1F`・`1.5e3`・`1_000`）、キーワード、注釈（`@Override`）。画面は先頭の 2 つの規則を順に当てるので、文字列を先にした（`"https://…"` の `//` をコメントにしない。代わりに、コメントの中の `"…"` は文字列の色になる）。

### エラーメッセージ

- エンジンは、エラーを作る場所で日本語の説明と、本物の `javac`・JVM の文面を対にして持つ（ADR-004）。エラーを作るときに、表示する日本語のメッセージと英語のメッセージを `src/engine/messages-en.js` に登録し、言語プロファイルの `localizeError` が英語表示のときに引く。登録のないメッセージ（共通コアの「最大ステップ数を超えた」など）は、JS 用の英語化に任せる
- 「まだ対応していません」の構文の名前にも英語を付けた（`interfaces are not supported yet` など）
- 画面の見出しに「Compile Error」を足した（エラーの `name` が `CompileError` のとき。JSVisualizer の ADR-055 追記）。構文エラーは今までどおり「Syntax Error」

### `NullPointerException` の詳しいメッセージ（JEP 358）

Java 21 は、何が `null` だったかをメッセージで教える。本物は `-g`（変数名の情報）付きでコンパイルしたとき変数名を書く（`java Main.java` の単一ファイルの実行では `"<local1>"` になる）。JavaVisualizer は、IDE で実行したときと同じく、変数名の入った文面を出す。

- 何をしようとしたか：`Cannot read field "f"`・`Cannot assign field "f"`・`Cannot invoke "Node.move(int, String)"`・`Cannot load from int array`・`Cannot store to object array`・`Cannot read the array length`・`Cannot throw exception`
- 何が null だったか：`"s"`・`"this.next"`・`"Main.head"`・`"n.next"`・`"nodes[i]"`・`the return value of "Node.getNext()"`
- メソッドの書き方と配列の種類には静的な型が要るので、静的な検査（`check.js`）が式に型の印を付け、評価器が文面を組み立てる
- 27 通りの書き方で、本物（`tests/tools/RunWithDebugInfo.java` で `-g` 付きでコンパイル）と同じ文面になることを確かめた（`tests/npe.test.js`）
- `switch`（文字列）と拡張 `for` では、本物はコンパイラが作った変数の名前（`"<local7>"`）を書くので再現できない。JavaVisualizer は実際の式の名前（`"s"`・`"a"`）を書く
- 日本語の表示では、同じ情報から「「n.next」が null（何も指していない）なので、フィールド value を読めません」と書く
- 比較テスト（`tests/oracle.test.js`）は `java Main.java` で実行するので、`NullPointerException` はクラスだけを比べる（Phase 0 のまま）

## 確かめたこと

- すべてのコンパイルエラーの題材（44 種）と例外で終わる題材で、英語表示に日本語が残らない（`tests/messages-en.test.js`）
- JS 版の画面は変わらない（JS のプロファイルは `CompileError` を作らず、入力欄も持たない。JSVisualizer の ADR-055 追記）
