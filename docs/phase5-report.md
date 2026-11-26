# Phase 5（対象の拡大）報告書（2026-11-26）

[開発計画書](development-plan.md) 4 節 Phase 5 の結果。授業で使う範囲（コレクション・インターフェース・`enum`・新しい形の `switch`）まで、使える Java を広げた。

## 1. 結論

**完了条件（比較テストがすべて通る）を満たした。** 足した書き方は、すべて本物の Java と出力・例外・変数の状態の変化を比べて一致している。ラムダ式は、授業で要るかを見て決める（5 節）。**公開版はまだ Phase 4 の時点のまま**で、Phase 5 の機能を公開するには、ワークフローを手動で実行する。

| 項目 | 結果 |
|---|---|
| `ArrayList`・`StringBuilder`・ラッパー型・ジェネリクスの型 | [ADR-007](adr/ADR-007-collections-and-wrappers.md) |
| 抽象クラス・インターフェース・`Comparable`・`enum`・`switch` 式・`instanceof` のパターン・入れ子の型 | [ADR-008](adr/ADR-008-interfaces-enums-switch.md) |
| `HashMap`・`HashSet`（`TreeMap`・`LinkedHashMap`・`TreeSet`・`LinkedHashSet`・`Map.of`・`Set.of`・`Map.Entry`）と本物と同じ繰り返しの順序 | [ADR-009](adr/ADR-009-maps-and-sets.md) |
| サンプル | 4 本を足して 28 本（`27_array_list`・`28_hash_map`・`29_interfaces`・`31_enum_switch`） |
| マニュアル・README | 「使える Java の範囲」と「本物と違うところ」を更新（日本語・英語） |
| 画面の確認 | 全サンプル × 全 12 タブ × 2 時点でブラウザのエラー 0 件 |
| テスト | 359 件がすべて通る（Phase 4 の 291 件から 68 件増） |

## 2. 足したもの

- **コレクション**：`ArrayList`・`List.of`・`Collections`（ADR-007）、`HashMap` 系・`HashSet` 系（ADR-009）。メモリのビューでは、リスト・集合はマス目（`[ ]`）、マップは組（`"the": 2`）で見せる
- **`HashMap` の順序**：本物の表の作り（容量 16 から 0.75 倍で 2 倍、`h ^ (h >>> 16)`、同じ位置は入れた順、1 か所に 9 個で広げる）を再現し、`println` や拡張 `for` の順序を本物と同じにした。単語の数え上げで、手元の Java と同じ順に出る
- **型**：ジェネリクスの型引数を静的な検査で使い（`put` のキー・値、`add` の要素、`get` の戻り値）、ボクシング・アンボクシングと `Integer` の `==` の規則を本物と同じにした
- **オブジェクト指向**：抽象クラス・インターフェース（`default` メソッド）・`Comparable`（`Collections.sort`）、`enum`（`values`・`ordinal`・`switch`）、クラスの中の `static` なクラス
- **新しい形の構文**：`switch` 式（`->`・`yield`）、`o instanceof String s`
- **本物と同じ文面の例外**：`IndexOutOfBoundsException`、`ConcurrentModificationException`、`Integer` の `null` を `int` に取り出したときの `NullPointerException`（`Cannot invoke "java.lang.Integer.intValue()" because the return value of "java.util.Map.get(Object)" is null`）
- **コンパイルエラー**：19 種を足した（`javac` と同じ行・文面。`no suitable method found for add(int)`・`method put in interface Map<K,V> cannot be applied to given types;`・`Shape is abstract; cannot be instantiated`・`for-each not applicable to expression type` など）

## 3. 本物の Java との比較

| 比較 | 本数 |
|---|---|
| 出力と例外（`tests/cases`・`samples`） | 35 本＋28 本（Phase 5 で 8 本＋4 本を足した） |
| コンパイルエラー（`tests/compile-errors`） | 63 種（Phase 5 で 19 種を足した） |
| 変数の状態の変化（JDI） | 例外で終わるもの以外の全サンプル・全ケース |

JDI 側（`tests/tools/TraceStates.java`）は、JDK のクラスの中身を読んで、こちら側（`tests/tools/state-changes.js`）と同じ書き方にする：`ArrayList` は `elementData`、`HashMap` は `table` とその鎖、`LinkedHashMap` は `head`／`after`、`TreeMap` は木を順にたどる。`Map.of`・`Set.of` は本物の順序が実行ごとに変わるので、両側とも文字列の順に並べて比べる。入れ子のクラスは両側とも `Main$Point` と書く。

## 4. 本物と違うところ（ADR に記録したもの）

- `Integer y = x; x == y`（同じ箱を 2 つの変数で指す）は、値が -128〜127 の外だと `false` になる（本物は `true`。ADR-007）
- `Map.of`・`Set.of` の順序は書いた順（本物は実行ごとに変わる）。`hashCode` を書いていない自作のクラス・`enum` をキーにしたときの順序は本物と違う。容量 64 以上で 1 か所に 9 個以上集まったときの順序は再現しない（ADR-009）
- 画面のビューでは、マップの組を `"the": 2` と書く（`println` の `the=2` とは違う。画面の共通の書き方。ADR-009）
- `ArrayList` の拡張 `for` の途中でリストを変えても、`ConcurrentModificationException` にならない（集合・マップではなる）

## 5. 残ったこと

- **公開**：Phase 5 の機能を公開するには、ワークフローを手動で実行する（公開版を変えるので、実行する前に確認を取る）
- **ラムダ式**（必要なら）：`list.forEach(x -> …)`・`map.merge(w, 1, Integer::sum)`・`Comparator.comparing(…)`・`list.sort((a, b) -> …)` に要る。授業で使うかを見て決める
- `ArrayList` の `ConcurrentModificationException`、`Iterator`、`getClass()`、`static` でない内部クラス、`record`
- マニュアルのスクリーンショットは Phase 4 のまま（画面の構成は変わっていない）
