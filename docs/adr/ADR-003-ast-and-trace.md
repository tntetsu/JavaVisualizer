# ADR-003: Java の AST とトレースに足したもの

- ステータス: 採用（Phase 0）
- 日付: 2026-11-25

## 背景

画面のビューは、トレースのイベントのノード型（`nodeType`）と AST の形を見て表示を作る。AST のノード型名は、意味が同じ構文には JS（ESTree）の名前を使い、Java 固有の構文には新しい型を足す方針（CLAUDE.md）。Phase 0 で、どの構文にどの名前を使い、トレースに何を足すかを決めた。

## 利用者に見える例

テストは `tests/adr-examples.test.js`（ADR-003 例 1・2）。

```java
int[] a = {5, 7};
int sum = 0;
for (int v : a) {
    sum += v;
}
```

「人」の単位で進めると、`for` の行で各回に止まり、その時点で `v` がその回の値（5、7）になっている：3 行目 → 4 行目 → 5 行目（v = 5）→ 6 行目（sum = 5）→ 5 行目（v = 7）→ 6 行目（sum = 12）。

`try { … } catch (ArithmeticException e) { … }` では、例外を捕まえた `catch` の行で止まる。`switch` では、当てはまった `case` の行で止まる。

## 決定

### AST（`src/engine/parse.js`）

| Java | ノード型 | Java のための追加のフィールド |
|---|---|---|
| クラス | `ClassDeclaration`（`body: ClassBody`） | `superClass`（名前） |
| フィールド | **`FieldDeclaration`**（新しい型。1 つの宣言に複数の変数） | `static`・`varType`・`declarations` |
| メソッド・コンストラクタ | `MethodDefinition`（`kind: 'method' \| 'constructor'`、`value: FunctionExpression`） | `static`・`returnType`、引数の `varType` |
| ローカル変数の宣言 | `VariableDeclaration`（`kind` は `let`、`final` なら `const`） | `varType`（`'int'`・`'int[]'`・`'var'`） |
| `if`・`while`・`do`／`while`・`for`・`switch`・`break`・`continue`・`return`・`throw`・`try` | ESTree と同じ（`DoWhileStatement`・`SwitchStatement` など） | `try` は `handlers`（複数の `catch`。Python 版と同じ） |
| 拡張 `for` | `ForOfStatement`（`left` は変数名） | `varType` |
| メソッドの呼び出し | `CallExpression`（`callee` は `Identifier` か `MemberExpression`） | `super(…)`・`this(…)` は `constructorCall: true` |
| フィールド・配列の要素 | `MemberExpression`（配列は `computed: true`） | |
| `new クラス(…)` | `NewExpression` | |
| `new int[3]`・`new int[]{…}` | **`NewArrayExpression`**（新しい型） | `elemType`・`dims` |
| 配列の初期化子 `{1, 2}` | `ArrayExpression` | `elemType`（宣言の型から決める） |
| `(int) x` | **`CastExpression`**（新しい型） | `targetType` |
| `x instanceof T` | **`InstanceofExpression`**（新しい型） | `targetType` |
| リテラル | `Literal` | `jtype`（`'int'`・`'long'`・`'double'`・`'char'`・`'String'`・`'boolean'`・`'null'`） |

- `end`（評価中の式のオレンジの範囲）は式にだけ付け、文には付けない（PyVisualizer の ADR-008）
- まだ対応していない構文（インターフェース・enum・record・ラムダ式・`switch` 式・内部クラス・ジェネリクスのクラス・ラベル付きの `break` など）は、「〇〇 はまだ対応していません」という構文エラーにする

### トレースに足したもの（`src/engine/interpreter.js`・`java-debugger.js`）

| 追加 | 内容 | 使う側 |
|---|---|---|
| `LoopBinding` | 拡張 `for` の各回のループ変数への代入（Python 版と同じ名前・同じ形） | `stopOnExit`・`traceRowTypes.exit` |
| `CatchBinding` | `catch` で例外を捕まえた所（`loc` は `catch (…)` の位置）。Python 版の `ExceptBinding` に当たる | 同上 |
| `CaseMatch` | `switch` の当てはまった `case`（`loc` はラベルの位置） | 同上 |
| `FieldDeclaration` の記録 | フィールドの初期化子（`static` はクラスを初めて使うとき、インスタンスは `new` のとき）を、宣言ごとに記録する | 同上 |
| `NewExpression` を呼び出しに | コンストラクタの呼び出しも、メソッドと同じく「入る・本体の最初の文・出る」で止まる | `call` |
| `main` をフレームに | `Program` の中で `main` をフレームとして積む（コールスタック・呼び出しツリーに `main` が出る）。プログラムの最後の時点（`Program` の exit）では `main` が終わっているので、変数・メモリのビューは空になる。**これは意図した見せ方**：実行が終わったら、すべて解放されることが見える（2026-11-25 決定） | |
| メソッドの本体のスコープ | 本体のブロックは引数と同じスコープを使う（Java では本体で引数と同じ名前を宣言できない） | 変数の状態の比較（メソッドを抜ける直前に本体の変数が見える。JDI と同じ） |
| フレームの `callId` | 呼び出しごとの番号（Python 版と同じ） | 変数の状態の比較 |

ノードの分類（`JAVA_NODE_CATEGORIES`）：

```js
stopOnExit: ['VariableDeclaration', 'AssignmentExpression', 'UpdateExpression', 'ReturnStatement', 'ThrowStatement',
             'LoopBinding', 'CatchBinding', 'CaseMatch', 'FieldDeclaration'],
call:       ['CallExpression', 'NewExpression'],
block:      ['BlockStatement'],
branch:     ['IfStatement', 'ConditionalExpression'],
condLoop:   ['WhileStatement', 'DoWhileStatement'],
forLoop:    ['ForStatement'],
forInit:    ['VariableDeclaration'],
exprStmt:   ['ExpressionStatement'],
```

## 影響

- いずれも JS 版・Python 版のトレースには影響しない（Java の評価器だけが記録する）
- 新しいノード型を足したら、変数の状態の比較（`tests/tools/state-changes.js`）のチェックポイントも確かめる。Java の比較は「行が変わった最初のイベント」をチェックポイントにしているので、文の一覧を持たない（JDI の行単位のステップに合わせた）
- 画面が AST の形に頼っている所のうち、Java で合わないもの（制御フローのビューがクラスの中のメソッドを拾わない、置換のビューが呼び出し先の式の値で判定する、式評価のビューが宣言を `let`・`const` の正規表現で探す）は Phase 1 で画面の側を直す（[phase0-report.md](../phase0-report.md) 3.3 節）
