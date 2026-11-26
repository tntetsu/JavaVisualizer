// [Warm-up] 階乗（繰り返し版）
// Run してからステップを進め、result の値がどう変化するか確認してください。
// いくつかのビューを切り替えて、使い方に慣れましょう。

public class Main {
    static int factorial(int n) {
        int result = 1;
        for (int i = 1; i <= n; i++) {
            result = result * i;
        }
        return result;
    }

    public static void main(String[] args) {
        System.out.println(factorial(5));
    }
}
