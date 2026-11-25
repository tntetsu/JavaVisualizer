# ADR-001: リポジトリ構成 — PyVisualizer と同じ形（エンジンと言語プロファイルをここに置き、土台は兄弟リポジトリを参照）

- ステータス: 採用
- 日付: 2026-11-25

## 背景

JavaVisualizer は、JSVisualizer（JS 版）・PyVisualizer（Python 版）に続く 3 つ目の言語。Python 版で、トレース（実行状態の配列）より上の層を共通にする形が確立した（PyVisualizer の ADR-001、[multilang-plan.md](../../../PyVisualizer/docs/multilang-plan.md)）。Java 版のリポジトリに何を置き、土台をどう参照するかを決める。

## 決定

PyVisualizer と同じ形にする。

| 置き場所 | 中身 |
|---|---|
| このリポジトリ | Java のエンジン（`src/engine/`：パーサー・静的な検査・評価器・値・組み込み）、言語プロファイル（`src/lang/java.js`）、入口（`src/app.js`・`src/register-java.js`）、サンプル（`samples/*.java`）、ビルド（`scripts/build.mjs` → `web/`）、テスト |
| JSInterpreter（作業ブランチ `feature/interp-core`） | 共通コア `js-interpreter/core`（`Recorder`・`TraceDebugger`・`Scope`・クローン・制御シグナル） |
| JSVisualizer（作業ブランチ `feature/multilang`） | 画面（12 種類のビュー）と言語プロファイルの仕組み |

- 手元の開発は、兄弟ディレクトリの worktree（`../JSInterpreter-core`・`../JSVisualizer-multilang`）を `file:` で参照する（`package.json`）
- ビルドの出力は `web/`（git に入れない）。確認用のサーバーのポートは 8124（PyVisualizer は 8123）

## 理由

- Phase 0 で、共通コアと画面を **1 行も変えずに** Java のエンジンを載せられた（[phase0-report.md](../phase0-report.md)）。Python 版で作った言語プロファイルの仕組みがそのまま使えた
- ファイルの役割を PyVisualizer とそろえておくと、同じ問題を同じ場所で直せる（CLAUDE.md「PyVisualizer の手本」）

## 影響

- 画面・共通コアに Java のために足すもの（[development-plan.md](../development-plan.md) 6 節）は、作業ブランチに入れてタグを付け、参照を上げる（Phase 1）
- CI（Phase 4）は、兄弟リポジトリをタグで取得する（PyVisualizer と同じ）
