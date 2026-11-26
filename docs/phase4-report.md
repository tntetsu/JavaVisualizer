# Phase 4（アプリ）報告書（2026-11-26）

[開発計画書](development-plan.md) 4 節 Phase 4 の結果。サンプル・マニュアル・README・デプロイの準備をそろえた。

## 1. 結論

**完了条件（全サンプル × 全タブでブラウザのエラー 0 件）を満たした。** 公開（GitHub Pages）は、リポジトリを公開するかを決めてから手動で行う（4 節）。

| 項目 | 結果 |
|---|---|
| サンプル | JS 版の組み込みサンプル 21 本に対応する Java 版と、Java 向けの 3 本、計 24 本（2 節） |
| マニュアル | 日本語・英語（`manual/manual.html`・`manual.en.html`）、スクリーンショット 18 枚 × 2 言語（3 節） |
| README | 日本語・英語（`README.md`・`README.en.md`） |
| デプロイの準備 | GitHub Actions のワークフロー（push ではテストとビルドだけ、公開は手動）（4 節） |
| 画面の確認 | 24 本 × 全 12 タブ × 2 時点でブラウザのエラー 0 件 |
| テスト | 291 件がすべて通る（サンプルも本物の Java と出力・変数の状態の変化を比べる） |

## 2. サンプル

JS 版の 21 本との対応：

| JS 版 | Java 版 | 備考 |
|---|---|---|
| 探索・ソート・数学・データ構造の 15 本 | 同じ名前の 15 本 | Phase 0 で作った |
| Sort objects (string key) | `18_sort_by_string_key` | `compareTo` で並べ替える（挿入ソート） |
| Closure | `12_static_and_instance` | Java にはクロージャがないので、同じく「変数のスコープ」を学ぶ題材として、`static` とインスタンスのフィールドにした |
| 学習課題 4 本（Warm-up・Task 1〜3） | `20_study_warmup`〜`23_study_task3` | JS 版・Python 版と同じ問い（Task 1 のバグも同じ） |

Java 向け：型と参照（`30_types_and_references`）、例外（`25_exceptions`）、入力（`26_scanner_input`。入力欄が空のときは、入力を促す文を出す）。

## 3. マニュアル

PyVisualizer のマニュアル（2026-11-26 時点）をもとに、Java 版として書き換えた。画面の使い方（ステップ実行・ハイライト・ビュー）の節は共通で、次を Java 用にした。

- 使える Java の範囲、本物の Java と違うところ（ハッシュ値・`Math.random()`・再帰の深さ）
- `Scanner` を使うとき
- エラー：Syntax Error・**Compile Error**（実行しない場所の誤りも見つかる）・Runtime Error
- コールスタック（型の表示・static）、メモリ（`String` をヒープに置く）、制御フロー（メソッドごと・`switch`）の説明
- 困ったとき：`NoSuchElementException`、`main` がない、実行していない場所のエラー

スクリーンショットは `node scripts/capture-manual-screenshots.mjs` で撮り直せる（日本語・英語）。

## 4. デプロイの準備

`.github/workflows/deploy.yml`（PyVisualizer と同じ形）。兄弟リポジトリはタグで固定して取得する（JSInterpreter `multilang-core-2026.11.25.2`・`multilang-master-2026.11.25.2`、JSVisualizer `multilang-2026.11.26.2`）。

- push・プルリクエスト：テスト（本物の Java との比較を含む。OpenJDK 21）とビルドだけ
- 手動で実行したとき（workflow_dispatch）：GitHub Pages に公開する

公開の前に決めること（開発計画書「決めること」6）：リポジトリを公開するか（非公開のままでは、GitHub Pages を使うのに有料のプランが要る）。公開するなら、GitHub の設定で Pages の公開元を GitHub Actions にしてから、手動で実行する。

## 5. JS 版の画面の比較（Phase 3 の画面の変更）

Phase 3 で画面に足したもの（コンパイルエラーの見出し・入力欄の文言）の前後で、JS 版の画面 3,050 件がすべて一致した。JSVisualizer の作業ブランチにタグ `multilang-2026.11.26.2` を付け、ワークフローはこれを参照する。Phase 4 では画面（JSVisualizer）を変えていない。

## 6. 残ったこと → Phase 5

- （済み）2026-11-26 にリポジトリを公開し、ワークフローを手動で実行して https://tntetsu.github.io/JavaVisualizer/ に公開した。以後も、公開は手動の実行で行う（main への push では公開しない）
- Phase 5（対象の拡大）：`ArrayList`・`HashMap`・インターフェース・`enum`・`switch` 式など、授業で使う範囲まで
