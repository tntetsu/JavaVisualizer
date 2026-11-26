public class Main {
    static int counter;
    static final int LIMIT = 3;

    static int square(int x) {
        return x * x;
    }

    static double average(int[] a) {
        int sum = 0;
        for (int v : a) {
            sum += v;
        }
        return (double) sum / a.length;
    }

    static void swap(int[] a, int i, int j) {
        int t = a[i];
        a[i] = a[j];
        a[j] = t;
    }

    static String repeat(char c, int n) {
        String s = "";
        for (int i = 0; i < n; i++) {
            s = s + c;
        }
        return s;
    }

    static int countDown(int n) {
        if (n == 0) {
            return 0;
        }
        counter++;
        return countDown(n - 1);
    }

    public static void main(String[] args) {
        System.out.println(true ? 1 : 2.0);
        System.out.println(false ? 'a' : 98);
        int k = 5;
        System.out.println(k > 3 ? k : 0.5);
        System.out.println(square(7) + " " + average(new int[]{1, 2, 4}));
        int[] a = {1, 2, 3};
        swap(a, 0, 2);
        System.out.println(a[0] + "," + a[1] + "," + a[2]);
        System.out.println(repeat('*', LIMIT) + "|" + repeat('-', 0) + "|");
        System.out.println(countDown(4) + " " + counter);
        int x = 10;
        x -= 3;
        x *= 2;
        x /= 3;
        x %= 3;
        x <<= 4;
        x >>= 1;
        x |= 1;
        x &= 0xF;
        x ^= 5;
        System.out.println(x);
        char c = 'A';
        c += 2;
        c++;
        System.out.println(c);
        short sh = 10;
        sh += 70000;
        System.out.println(sh);
        double d = 10;
        d /= 4;
        System.out.println(d);
        int i = 0;
        int[] arr = new int[3];
        arr[i++] = i;
        arr[i] = i++;
        System.out.println(arr[0] + " " + arr[1] + " " + i);
        String s = null;
        System.out.println(s == null ? "null!" : s);
        long big = Integer.MAX_VALUE;
        big++;
        System.out.println(big);
        int neg = -7;
        System.out.println(neg / 2 + " " + neg % 2 + " " + (neg >> 1) + " " + (neg >>> 28) + " " + Math.abs(neg) + " " + Math.floorMod(neg, 2));
        System.out.println(1.0 / 3 * 3 == 1.0);
        System.out.println(0.1 + 0.2 == 0.3);
        System.out.println((int) 'z' + (char) 65 + "" + (char) 66);
        System.out.println(10 == 10.0);
        System.out.println('a' < 'b');
        String t = "abc";
        t += 1 + 2;
        t += 'd';
        System.out.println(t);
        int[][] grid = new int[2][3];
        for (int r = 0; r < grid.length; r++) {
            for (int col = 0; col < grid[r].length; col++) {
                grid[r][col] = r * 10 + col;
            }
        }
        System.out.println(java.util.Arrays.toString(grid[1]) + " " + grid[1][2]);
        System.out.println(Integer.MIN_VALUE - 1);
        System.out.println(Long.MAX_VALUE + 1);
        System.out.println((byte) (127 + 1));
    }
}
