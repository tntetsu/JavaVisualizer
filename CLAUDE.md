# CLAUDE.md

このファイルは、Claude Code がこのリポジトリで作業する際のガイドです。

## プロジェクト概要

**JavaVisualizer** は、Java プログラムの実行過程をステップごとに可視化する、プログラミング教育用の Web アプリです。[JSVisualizer](../JSVisualizer)（JavaScript 版。授業で本番稼働中）と [PyVisualizer](../PyVisualizer)（Python 版。2026-11-25 公開）に続く 3 つ目の言語で、同じ画面・同じ 12 種類のビューを使います。

多言語化の全体の計画は [PyVisualizer の docs/multilang-plan.md](../PyVisualizer/docs/multilang-plan.md)（このリポジトリの計画の出発点。4.2 節が Java）。このリポジトリの計画は [docs/development-plan.md](docs/development-plan.md)。

方針の要点：

- **評価器は Java 用に新しく書く**。JS や Python の評価器には変換しない（`int` のあふれ・整数の割り算・`==` と `equals` など、意味が違う）
- **共通化はトレース（実行状態の配列）より上の層で行う**。JSInterpreter の共通コア（`Recorder`・`TraceDebugger`・ステップ操作・TraceEvent の形）と、JSVisualizer の画面（12 種類のビュー・言語プロファイル）を使う
- **実行時の状態はすべて配列に記録する**（オムニシェント・デバッグ。プログラムを最後まで実行してから、ステップ実行で見せる）
- **AST のノード型名は、意味が同じ構文には JS（ESTree）の名前を使い**、Java 固有の構文には新しい型を足す（画面のビューがそのまま使えるようにするため）
- 言語ごとの差（ノードの分類・値の見せ方・エディタ・サンプル・エラーメッセージの英語化）は**言語プロファイル**でフロントエンドに渡す
- パーサーは `@lezer/java` ＋ 自前の AST 変換（構文エラーの説明は自前）

**現在のステータス**: Phase 0〜4 が終わり、2026-11-26 に公開した（https://tntetsu.github.io/JavaVisualizer/ 、リポジトリ `tntetsu/JavaVisualizer` も公開）。**Phase 5（対象の拡大）も済んだ**（2026-11-26、`docs/phase5-report.md`）：`ArrayList` など（ADR-007）、インターフェース・`enum`・`switch` 式など（ADR-008）、`HashMap`・`HashSet` など（ADR-009）、サンプル 28 本、マニュアル・README の更新。残りは公開とラムダ式（必要なら）。公開版はまだ Phase 4 の時点のまま（Phase 5 の機能は未公開）。**公開（デプロイ）はワークフローの手動の実行（workflow_dispatch）で行い、main への push ではテストとビルドだけ**。公開版を変える操作（手動の実行）は、実行する前に確認を取る。

## 関連リポジトリ

| リポジトリ | 役割 | JavaVisualizer との関係 |
|---|---|---|
| [../JSInterpreter](../JSInterpreter) | JS のインタプリタ | 共通コア `js-interpreter/core` を使う（作業ブランチ `feature/interp-core`、worktree `../JSInterpreter-core`） |
| [../JSVisualizer](../JSVisualizer) | JS 版のサイト（画面とビュー） | 画面を言語プロファイルで共有する（作業ブランチ `feature/multilang`、worktree `../JSVisualizer-multilang`） |
| [../PyVisualizer](../PyVisualizer) | Python 版（同じ構成の先行例） | **手本**。構成・テストの作り方・ADR・文書の書き方をそろえる（下の「PyVisualizer の手本」） |
| [../BhvVisualizer](../BhvVisualizer) | 学習ログの収集・分析（Firebase） | 授業で本番稼働中。学期中は触らない |

## 作業上の注意

### 授業で本番稼働中のリポジトリ

JSVisualizer と BhvVisualizer は「ソフトウェア基礎論」（2026-09-30〜2027 年 1 月）で本番稼働中。BhvVisualizer は JSVisualizer の公開版を `<iframe>` で埋め込んでいるため、JSVisualizer の main への push はその日のうちに学生の画面を変える。

- JSInterpreter・JSVisualizer・BhvVisualizer の **main には触らない**。マージは学期後（2027 年 2 月以降）で、その前に必ず確認を取る
- 画面（JSVisualizer）・共通コア（JSInterpreter）に Java のために足すものは、**作業ブランチ**（worktree の `../JSVisualizer-multilang`・`../JSInterpreter-core`）に足す。JS 版の画面が変わらないことを、PyVisualizer の `scripts/capture-js-dom.mjs`（変更前後のビルドの画面の HTML を比べる）で確かめる。Python 版が壊れないことも PyVisualizer のテストで確かめる
- 作業ブランチに push しても、JSVisualizer のデプロイは動かない（デプロイは main への push だけ）
- **土台の参照はタグで固定する**（[multilang-plan.md](../PyVisualizer/docs/multilang-plan.md) 3.1 節）。CI は兄弟リポジトリをタグ（いまの最新は JSInterpreter の `multilang-core-2026.11.25.2`・`multilang-master-2026.11.25.2`（ADR-017 を含む）、JSVisualizer の `multilang-2026.11.26.2`（Java のための言語プロファイルの項目を含む）。同じ日に 2 つ目を付けるときは `.2` を付ける）で取得する。作業ブランチに Java のための変更を足したら、新しいタグを付けて参照を上げる（PyVisualizer の参照は、PyVisualizer の都合で上げる）
- 手元の開発は、兄弟ディレクトリの worktree を `file:` で参照する（PyVisualizer の `package.json` と同じ）

### 確認を取ること

- push、GitHub のリポジトリの作成・公開設定の変更、タグの push、デプロイにつながる操作は、実行する前に確認を取る
- 計画・方針を変えたら [docs/development-plan.md](docs/development-plan.md) とこのファイルのステータスを更新する

### ドキュメント

- ドキュメントは日本語で書く（初学者にも分かる平易な日本語。英語のマニュアル・README は別に用意する）
- 設計上の決定は `docs/adr/ADR-NNN-*.md` に記録する（JSVisualizer・PyVisualizer と同じ流儀）
- Phase ごとに報告書（`docs/phaseN-report.md`）を書く（PyVisualizer の `docs/phase0-report.md`〜`phase5-report.md` と同じ形）

### テスト

- テストは Node 標準の `node:test` を使う（ES modules のまま追加の設定なしで動く。PyVisualizer と同じ）
- **Java の意味論の正しさは、本物の Java と比べるテストで確認する**：同じプログラムを `java Main.java`（JDK 11 以降の単一ファイルの実行。この環境の OpenJDK 21 で `javac` なしに動く）でも実行し、(1) 出力と例外の種類（とメッセージ）、(2) 変数の状態の変化の列を比べる。(2) は JDI（`jdk.jdi` モジュール。この環境にある）を使う小さな Java のプログラムで取り出す（Phase 0 で作る）
- **利用者に見える ADR には例とテストを付ける**：画面やステップ実行で何が表示される／されないかを決める・直す ADR には、利用者に見える例（入力のプログラムと「表示される／されない」）を実装用語なしで書き、同じ例をテストにする（テスト名に ADR 番号。`tests/adr-examples.test.js`）。テストは、直す前のコードで失敗することを確かめてから足す
- **エラーメッセージ**：日本語は初学者向けの説明、英語表示では本物の Java（`javac`・JVM）と同じ文面（PyVisualizer の ADR-010）。訳し漏れを、エンジンのソースからメッセージを集めて検出するテストを最初から作る（PyVisualizer の `tests/messages-en.test.js`）

## PyVisualizer の手本

同じ役割のものは、PyVisualizer の作りに合わせる。

| 役割 | PyVisualizer のファイル |
|---|---|
| ソース → AST（Lezer の木の変換・構文エラーの説明） | `src/engine/parse.js` |
| 評価器（トレースの記録・スコープ・演算） | `src/engine/interpreter.js` |
| 値の表現・表示（repr）・比較 | `src/engine/values.js` |
| クラス・インスタンス・例外 | `src/engine/objects.js` |
| 組み込み関数・メソッド | `src/engine/builtins.js` |
| デバッガー（共通コアの `TraceDebugger` の派生、ノードの分類 `NODE_CATEGORIES`） | `src/engine/py-debugger.js` |
| エラーメッセージの英語化 | `src/engine/messages-en.js` |
| 言語プロファイル（エンジン・エディタ・色分け・実行トレースの行・`valueModel`・`localizeError`） | `src/lang/python.js`、`src/register-python.js`、`src/app.js` |
| ビルド（JSVisualizer の画面＋言語プロファイル → `web/`） | `scripts/build.mjs` |
| 本物の処理系との比較テスト | `tests/oracle.test.js`、`tests/line-state.test.js`（`tests/tools/trace_states.py`） |
| ADR の例のテスト | `tests/adr-examples.test.js` |
| 画面の確認（全サンプル × 全タブ） | `scripts/capture-spike.mjs` |
| マニュアルのスクリーンショット | `scripts/capture-manual-screenshots.mjs` |
| デプロイ | `.github/workflows/deploy.yml`（ビルドとデプロイを別のジョブにする。1 つのジョブだと成果物が見えずに失敗することがあった） |
| 計画・報告書・ADR | `docs/development-plan.md`、`docs/phase0-report.md`〜、`docs/adr/` |

PyVisualizer で分かったこと（同じ失敗を避ける）：

- コード表示のオレンジ（評価中の式）は、トレースのイベントの `end` で決まる。**`end` は式にだけ付け、文には付けない**（付けると実行直後にソース全体がオレンジになる。PyVisualizer の ADR-008）
- 「人」のステップで止まってほしい所（ループ変数への代入・例外を捕まえた所など）は、専用のノード（`LoopBinding` など）として記録し、ノードの分類（`stopOnExit`）と言語プロファイルの `traceRowTypes` に入れる
- 書式（`printf`・`String.format`）や小数の表示は、本物の処理系と大量の組み合わせで比べるテストを作る（PyVisualizer の `tests/format.test.js`）
- 新しいノード型を足したら、変数の状態の比較のチェックポイント（文の一覧）にも入れる

## コマンド

```bash
npm install                     # 兄弟ディレクトリに ../JSInterpreter-core・../JSVisualizer-multilang が必要（file: 依存）
npm test                        # 全テスト（本物の Java との比較に java が必要。約 50 秒）
node scripts/build.mjs --serve  # ビルドして http://127.0.0.1:8124/ で確認（PyVisualizer は 8123）
node scripts/run.mjs Main.java  # エンジンだけで実行（出力と例外を表示）
java Main.java                  # 本物の Java で実行（比較の正解）
java tests/tools/TraceStates.java Main.java   # 本物の Java の変数の状態の変化（JDI）
node scripts/capture-spike.mjs <出力先>        # 全サンプル × 全タブのスクリーンショットとブラウザのエラー
```

## 構成（Phase 0 時点）

| 役割 | ファイル |
|---|---|
| ソース → AST・構文エラーの説明 | `src/engine/parse.js` |
| 静的な検査（コンパイルエラー。ADR-004） | `src/engine/check.js` |
| 評価器 | `src/engine/interpreter.js` |
| 値の表現・表示（ADR-002） | `src/engine/values.js` |
| クラス・インスタンス・例外 | `src/engine/objects.js` |
| 組み込みのクラス・メソッド・書式 | `src/engine/builtins.js` |
| デバッガー（ノードの分類。ADR-003） | `src/engine/java-debugger.js` |
| 言語プロファイル | `src/lang/java.js`、`src/register-java.js`、`src/app.js` |
| 本物の Java との比較 | `tests/oracle.test.js`（出力・例外・コンパイルエラー）、`tests/line-state.test.js`（`tests/tools/TraceStates.java`、JDI）、`tests/format.test.js`（`tests/tools/FormatEcho.java`） |

Java で分かったこと（Phase 5 で足したもの）：

- JDK のクラス（`ArrayList`・`StringBuilder`・ラッパー型・`enum`）を変数の状態の比較で書くときは、`tests/tools/TraceStates.java`（JDI 側）と `tests/tools/state-changes.js`（こちら側）を同じ書き方にそろえる（`[1, 2]`・`StringBuilder("ab")`・`Color.GREEN`）。新しい組み込みのクラスを足したら、両方に足す
- `@lezer/java` は入れ子の型引数の `>>` をシフト演算子として読むので、`parse.js` の `splitGenericClosers` で直してから読む
- `HashMap`・`HashSet` の繰り返しの順序は、本物の表（容量・`hash ^ (hash >>> 16)`・同じ位置は入れた順・9 個で広げる）を `src/engine/maps.js` で再現している（ADR-009）。JDI 側は `HashMap` の `table`・`LinkedHashMap` の `head`/`after`・`TreeMap` の木を読む。`Map.of`・`Set.of` は本物の順序が実行ごとに変わるので、比較では文字列の順に並べる
- 入れ子のクラス（`static class Point`）の値は、変数の状態の比較では JDI と同じく `Main$Point{…}` と書く
- テスト：`npm test` は約 1 分半（340 件ほど）。`tests/cases/*.java`（同じ名前の `.stdin` は入力）・`tests/compile-errors/*.java` に足すと、本物の Java との比較に自動で入る

Java で分かったこと：

- エラーを作る場所で、日本語の説明と `javac` の英語の文面を対にする（`compileError(日本語, loc, javac)`）。対になっていることは `tests/messages-en.test.js` が調べる
- 変数の状態の比較は、JDI の行単位のステップに合わせ、「同じフレームで行が変わった最初の enter のイベント」をチェックポイントにする（文の一覧を持たない）。新しいノード型を足しても、チェックポイントの一覧を直す必要はない
