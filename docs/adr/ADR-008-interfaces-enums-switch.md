# ADR-008: 抽象クラス・インターフェース・enum・switch 式・instanceof のパターン・入れ子の型

- ステータス: 採用（Phase 5）
- 日付: 2026-11-26

## 背景

授業では、継承のあとに抽象クラスとインターフェース（ポリモーフィズム）、定数の組として `enum` を扱う。Java 14 以降の `switch` 式（`case 1 -> …`・`yield`）と、Java 16 以降の `instanceof` のパターン（`o instanceof String s`）も、最近の教科書には出てくる。Phase 4 までは、どれも「まだ対応していません」だった。

## 利用者に見える例

テストは `tests/cases/oop_interfaces.java`・`tests/cases/enums_switch.java`（本物の Java と出力・変数の状態の変化を比べる）、`tests/compile-errors/`（5 種）、`tests/adr-examples.test.js`（ADR-008 例）。

```java
interface Shape {
    double area();
    default String describe() { return "area " + area(); }
}
class Circle implements Shape { … public double area() { return 3.0 * r * r; } }

List<Shape> shapes = …;
for (Shape s : shapes) System.out.println(s.describe());   // 実際のクラスの area() が呼ばれる
```

- `new Shape()`（インターフェース・抽象クラス）は、コンパイルエラー「インターフェース Shape は new で作れません」（`Shape is abstract; cannot be instantiated`）
- 抽象メソッドを書き忘れたクラスは、コンパイルエラー（`Sq is not abstract and does not override abstract method area() in Shape`）
- `class Student implements Comparable<Student>` の `compareTo` で、`Collections.sort(students)` が並べ替える

```java
enum Color { RED, GREEN, BLUE }
Color c = Color.GREEN;
System.out.println(c + " " + c.ordinal());   // GREEN 1
String s = switch (c) { case RED -> "赤"; case GREEN -> "緑"; case BLUE -> "青"; };
```

- 変数のビューでは、`c` は `Color.GREEN` と書く
- `default` のない `switch` 式は、`enum` のすべての定数の `case` を書いたときだけ通る（ほかはコンパイルエラー `the switch expression does not cover all possible input values`）
- `Color.valueOf("PINK")` は `IllegalArgumentException: No enum constant Main.Color.PINK`（本物と同じ）

## 決定

- **インターフェース・抽象クラス**：クラスの表現（`JClass`）に、種類（`kind`：`class`・`interface`・`enum`）、`abstract`、実装しているインターフェース（`interfaces`）を足した。メソッドを探す順は、クラスの階層が先、インターフェース（`default` メソッド）があと。オーバーライドは、オブジェクトの実際のクラスから、本体のあるメソッドを探す。`instanceof`・キャスト・引数の型・代入は、継承と実装の両方をたどる。インターフェースのフィールドは `static final` の定数
- **静的な検査**：インターフェース・抽象クラスの `new`、抽象メソッドの実装し忘れ（`Comparable` の `compareTo` を含む）、`enum` の `new` をコンパイルエラーにする
- **`Comparable`**：組み込みのインターフェース。`Collections.sort`・`max`・`min`・`list.sort(null)` は、自作のクラスの `compareTo` を呼ぶ
- **`enum`**：定数は、その `enum` のクラスのインスタンス（`JObject`）で、名前と序数を列挙されない印 `__enum` に持つ（スナップショットのクローンでも保つ）。クラスを初めて使うときに、書いた順に定数を作り（コンストラクタの引数があれば呼ぶ）、定数ごとにフィールドの初期化として記録する。`name()`・`ordinal()`・`compareTo()`・`values()`・`valueOf()`・`toString()`（名前）。`switch` の `case RED:` は定数の名前で比べる。値の見せ方は `Color.GREEN`（1 語）。本体のある定数（`RED { … }`）は「まだ対応していません」
- **`switch` 式**：`case … -> 式`・`case … -> { … yield 値; }`。値の型は各 `case` の型をまとめる（数は昇格）。当てはまった `case` で「人」のステップが止まる（`CaseMatch`。ADR-003）
- **`instanceof` のパターン**：当てはまれば変数に入れる。本物は、当てはまる所（`&&` の右・`if` の中）だけで使えるが、ここでは、そのあとのブロックで使えるとゆるめに扱う（誤ってエラーにしない）
- **入れ子の型**：クラスの中のクラス・インターフェース・`enum` は、`static` の入れ子として扱う（プログラムの直下の型と同じ並びに置き、例外のメッセージなどでは `Main.Color` と書く）。`static` でない内部クラスの、外側のインスタンスのフィールドを使う書き方には対応していない（コンパイルエラーになる）

## 確かめたこと

- 本物の Java と、出力と変数の状態の変化の列（JDI）が一致（`TraceStates.java` は、`enum` の定数を `Color.GREEN` と書き、コンパイラが作る `values`・`valueOf` は比べない）
- コンパイルエラー 5 種（`abstract_new`・`interface_not_implemented`・`switch_expr_no_default`・`enum_new`・`comparable_missing`）の行と `javac` の文面が一致
