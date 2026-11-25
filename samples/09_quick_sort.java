import java.util.Arrays;

public class Main {
    static void quickSort(int[] arr, int lo, int hi) {
        if (lo >= hi) {
            return;
        }
        int pivot = arr[hi];
        int i = lo;
        for (int j = lo; j < hi; j++) {
            if (arr[j] < pivot) {
                int tmp = arr[i];
                arr[i] = arr[j];
                arr[j] = tmp;
                i++;
            }
        }
        int tmp = arr[i];
        arr[i] = arr[hi];
        arr[hi] = tmp;
        quickSort(arr, lo, i - 1);
        quickSort(arr, i + 1, hi);
    }

    public static void main(String[] args) {
        int[] arr = {5, 3, 8, 1, 2, 7};
        quickSort(arr, 0, arr.length - 1);
        System.out.println(Arrays.toString(arr));
    }
}
