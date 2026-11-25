import java.util.Arrays;

public class Main {
    public static void main(String[] args) {
        int[] a = new int[3];
        double[] d = new double[2];
        boolean[] b = new boolean[2];
        String[] s = new String[2];
        char[] c = new char[2];
        long[] l = new long[2];
        System.out.println(Arrays.toString(a) + Arrays.toString(d) + Arrays.toString(b) + Arrays.toString(s) + Arrays.toString(l));
        System.out.println((int) c[0]);
        int[][] g = new int[3][4];
        g[1][2] = 5;
        System.out.println(g.length + " " + g[0].length + " " + g[1][2] + " " + Arrays.toString(g[1]));
        int[][] jag = new int[2][];
        System.out.println(jag[0]);
        jag[0] = new int[]{1, 2, 3};
        jag[1] = new int[1];
        System.out.println(jag[0].length + " " + jag[1].length);
        int[][] m = {{1, 2}, {3, 4}, {5}};
        int sum = 0;
        for (int[] row : m) {
            for (int v : row) {
                sum += v;
            }
        }
        System.out.println(sum);
        int[] x = {3, 1, 2};
        int[] y = x;
        y[0] = 9;
        System.out.println(x[0] + " " + (x == y));
        int[] z = x.clone();
        z[0] = 7;
        System.out.println(x[0] + " " + z[0] + " " + (x == z));
        Arrays.sort(x);
        System.out.println(Arrays.toString(x));
        String[] words = {"pear", "apple", "fig"};
        Arrays.sort(words);
        System.out.println(Arrays.toString(words));
        modify(x);
        System.out.println(x[0]);
        reassign(x);
        System.out.println(x[0]);
    }

    static void modify(int[] arr) {
        arr[0] = 100;
    }

    static void reassign(int[] arr) {
        arr = new int[]{-1};
        arr[0] = 200;
    }
}
