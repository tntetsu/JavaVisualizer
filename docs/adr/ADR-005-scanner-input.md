# ADR-005: Scanner で入力欄から読む

- ステータス: 採用（Phase 2）
- 日付: 2026-11-26

## 背景

入門の Java では、`Scanner` でキーボードから数や文字列を読むプログラムをよく書く（開発計画書 5 節の MVP）。JavaVisualizer はプログラムを最後まで実行してからステップ実行で見せるので、実行の途中で入力を待てない。PyVisualizer の `input()` と同じく、実行の前に入力欄に書いておいた内容を読む（PyVisualizer の ADR-007）。

## 利用者に見える例

テストは `tests/adr-examples.test.js`（ADR-005 例 1・2）。

```java
import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        int n = sc.nextInt();
        String rest = sc.nextLine();
        String line = sc.nextLine();
        System.out.println(n + "[" + rest + "][" + line + "]");
    }
}
```

入力欄に `12` と `hello` を 2 行で書くと、`12[][hello]` と表示される。`nextInt()` は数だけを読み、行の残り（ここでは空）は次の `nextLine()` が返す（本物の Java と同じ。初学者がつまずきやすい所なので、そのまま見せる）。

- 入力欄に `five` と書いて `nextInt()` を呼ぶと、実行時エラー「入力欄の値を、読もうとした型（int など）として読めませんでした。java.util.InputMismatchException」
- 入力がもうないのに `nextLine()` を呼ぶと「入力欄に、読む値（行）がもうありません。java.util.NoSuchElementException: No line found」
- `import java.util.Scanner;`（または `import java.util.*;`）を書かないと、コンパイルエラー（`cannot find symbol`）。`Arrays` も同じ

## 決定

- 言語プロファイルを `supportsInput: true` にし、画面のソースペインに入力欄を出す。実行時に入力欄の内容を `JavaDebugger(source, { stdin })` に渡す（JSVisualizer の ADR-055 の入力欄）
- `new Scanner(System.in)` は、実行ごとに 1 つの入力（文字列と読んだ位置）を読み進める組み込みのオブジェクト。区切りは空白（`java.util.Scanner` の既定）
- メソッド：`nextInt`・`nextLong`・`nextDouble`・`nextBoolean`・`next`・`nextLine`・`hasNext`・`hasNextInt`・`hasNextDouble`・`hasNextLine`・`close`
- 例外は本物と同じクラス・同じメッセージ：数でない → `InputMismatchException`（メッセージなし）、`int` の範囲外 → `InputMismatchException: For input string: "99999999999"`、入力の終わり → `NoSuchElementException`（`nextLine` は `No line found`）
- 静的な検査：`Scanner`・`Arrays` は `java.util` のクラスなので、`import` がないとコンパイルエラーにする。`Scanner` のメソッドの戻り値の型も検査に使う（`int s = sc.nextLine();` はコンパイルエラー）
- 変数のビューでは、`Scanner` の値は `Scanner` と書く（中身は見せない）

## 確かめたこと

- 本物の Java と、入力つきの 5 本（`tests/cases/scanner_*.java`・`uncaught_*` と同じ名前の `.stdin`）の出力・例外が一致
- 変数の状態の変化の列も JDI と一致（`tests/tools/TraceStates.java` に入力を渡せるようにした。JDK のクラスのオブジェクトは型名だけで比べる）
- `import` の忘れ・`Scanner` の戻り値の型の誤りのコンパイルエラー 3 種が、`javac` と同じ行・同じ文面
