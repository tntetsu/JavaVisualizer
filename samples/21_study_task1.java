// [Task 1] このコードにはバグがあります。
// 実行すると結果が [1, 2, 3, 5, 8, 9] になりません。
// ツールを使ってバグの原因を見つけ、どの行を修正すべきか答えてください。

import java.util.Arrays;

public class Main {
    static void selectionSort(int[] arr) {
        int n = arr.length;
        for (int i = 0; i < n - 1; i++) {
            int minIdx = i + 1;
            for (int j = i + 1; j < n; j++) {
                if (arr[j] < arr[minIdx]) {
                    minIdx = j;
                }
            }
            int temp = arr[i];
            arr[i] = arr[minIdx];
            arr[minIdx] = temp;
        }
    }

    public static void main(String[] args) {
        int[] arr = {5, 3, 8, 1, 9, 2};
        selectionSort(arr);
        System.out.println(Arrays.toString(arr));
    }
}
