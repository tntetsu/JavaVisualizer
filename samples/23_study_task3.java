// [Task 3] 外側のループの 2 回目（i = 1）が完了した直後、
// 配列 arr の中身はどうなっていますか？
// （最終結果ではなく、途中の状態を答えてください）

public class Main {
    static void bubbleSort(int[] arr) {
        int n = arr.length;
        for (int i = 0; i < n - 1; i++) {
            for (int j = 0; j < n - 1 - i; j++) {
                if (arr[j] > arr[j + 1]) {
                    int temp = arr[j];
                    arr[j] = arr[j + 1];
                    arr[j + 1] = temp;
                }
            }
        }
    }

    public static void main(String[] args) {
        int[] arr = {5, 3, 8, 1, 9};
        bubbleSort(arr);
    }
}
