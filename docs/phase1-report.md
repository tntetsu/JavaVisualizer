# Phase 1（土台の調整）報告書（2026-11-26）

[開発計画書](development-plan.md) 4 節 Phase 1 の結果。Phase 0 の報告書 8 節で挙げた、画面（JSVisualizer の作業ブランチ `feature/multilang`）と共通コア（JSInterpreter の作業ブランチ `feature/interp-core`）に Java のために要るものを足した。

## 1. 結論

- Phase 0 で Java に合わなかった 3 つのビュー（制御フロー・置換・式評価）が、Java で動くようになった
- 変数の型、`String` の置き場所、`static` フィールドの見せ方を決めて実装した（[ADR-002](adr/ADR-002-java-value-representation.md) 追記）
- 共通コアの不具合（イベントの値が複製されない）を直し、JS 版・Python 版の公開版にも反映した（JSInterpreter の ADR-017）
- 画面に足したものは、どれも言語プロファイルの**省略できる項目**で、JS・Python のプロファイルは持たない。JS 版の画面が変わらないことは 3 節で確かめた。PyVisualizer のテスト（387 件）もすべて通る
- Java 版のサンプル 17 本 × 全 12 タブ × 2 時点で、ブラウザのエラーは 0 件

## 2. やったこと

| 項目 | 直した側 | 内容 | 記録 |
|---|---|---|---|
| 制御フロー | 画面 | 言語プロファイルの `controlFlow: { classMethods, switchCases }`。クラスの中のメソッド・コンストラクタをスコープとして描き、空のグローバルは出さない。`switch` を `case` ごとの `if … else` の連なりとして描く（フォールスルーは描かない） | JSVisualizer ADR-055 追記 |
| 置換 | エンジン | 呼び出し先（`f`・`obj.m`）を呼び出しの最初の子として記録し、値をユーザー定義の関数の印（`__type__: 'JSFunction'`）にした。JS・Python と同じ形なので、画面は変えていない | ADR-003 追記 |
| 式評価 | 画面・エンジン | 宣言の行を `let`・`const`・`var` の正規表現で探していたので、当てはまらないときは初期化子の位置から「名前 =」を読む。型の名前（`System`・`Math`・クラス名）と `System.out` は記録しない（`class System` と置き換わっていた） | ADR-055・ADR-003 追記 |
| 型の表示 | 画面・エンジン | 言語プロファイルの `varType(name, frame, callStack)`。エンジンがフレームに「変数名 → 宣言の型」の表を持たせ、Call Stack とメモリのビューが `int a = 3` と書く | ADR-055・ADR-002 追記 |
| `static` フィールド | 画面 | 言語プロファイルの `globalScope: { label: 'static', hideEmpty: true }`。グローバルの見出しを `static` にし、static フィールドがなければ出さない | 同上 |
| `String` の置き場所 | 画面 | `valueModel.onHeap(v)`。メモリのビューで `String` をヒープの箱として置き、矢印で指す。`s1 == s2`（同じ箱）と `s1 == s3`（別の箱）の違いが見える | 同上 |
| イベントの値の複製 | 共通コア | exit のイベントの値を、変数のスナップショットと同じ対応表で複製する。JS 版にもあった不具合で、公開版にも反映した（11-25 18:40・18:43） | JSInterpreter ADR-017 |
| 最後の時点 | （変えない） | `main` が終わると変数が空になるのは、「実行が終わったら解放される」見せ方としてそのままにする | ADR-003 |

## 3. JS 版・Python 版が変わらないことの確認

- **JS 版の画面**：作業ブランチの変更の前後で、組み込みサンプル 21 本・記事の題材 29 本 × 5 時点 × 12 タブ（3,050 件）の HTML を比べた（PyVisualizer の `scripts/capture-js-dom.mjs`。遅延描画の揺れを避けるため、タブを切り替えてから 600 ms 待って記録）。結果は 4 節
- **JSVisualizer のテスト**：218 件＋足した 5 件がすべて通る。足したテストは、変更を外すと失敗することを確かめた
- **Python 版**：PyVisualizer のテスト 387 件がすべて通る
- **Java 版**：テスト 149 件がすべて通る

## 4. JS 版の画面の比較の結果

（記録が終わったら書く）

## 5. 残ったこと → Phase 2 以降

- 制御フローの `switch` の `case` の回数（×N）は、その `case` に**当てはまった**回数（Java のエンジンは当てはまった `case` だけを記録する）。試した回数ではない
- メモリのビューで、オブジェクトの `String` のフィールドも矢印になり、オブジェクトの多い題材では矢印が増える。授業で見にくければ、フィールドの `String` だけはその場に書く選択肢を考える
- 呼び出しツリーの `main({})`（引数 `args` が毎回出る）は、そのままにした
- タグ：作業ブランチに新しいタグを付け、JavaVisualizer の参照（CI は Phase 4 で作る）に使う

## 6. 再現方法

```bash
npm test                                              # Java 版（java が必要）
node scripts/build.mjs --serve                        # http://127.0.0.1:8124/
node scripts/capture-spike.mjs <出力先>                # Java 版の全サンプル × 全タブ
# JS 版の画面の比較（PyVisualizer で）
TAB_WAIT=600 node scripts/capture-js-dom.mjs <変更前の JSVisualizer> before.json
TAB_WAIT=600 node scripts/capture-js-dom.mjs <変更後の JSVisualizer> after.json
node scripts/capture-js-dom.mjs --compare before.json after.json
```
