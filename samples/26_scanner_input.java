// 入力欄に数をいくつか書いてから Run してください（例：3 8 5）。
// Scanner で 1 つずつ読み、合計と最大値を求めます。

import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        int count = 0;
        int sum = 0;
        int max = Integer.MIN_VALUE;
        while (sc.hasNextInt()) {
            int x = sc.nextInt();
            count++;
            sum += x;
            if (x > max) {
                max = x;
            }
        }
        if (count == 0) {
            System.out.println("入力欄に数を書いてください");
        } else {
            System.out.println("count = " + count + ", sum = " + sum + ", max = " + max);
        }
    }
}
