public class Main {
    public static void main(String[] args) {
        int max = Integer.MAX_VALUE, min = Integer.MIN_VALUE;
        System.out.println(max + 1);
        System.out.println(min - 1);
        System.out.println(max * 2);
        System.out.println(46341 * 46341);
        System.out.println(min / -1);
        System.out.println(-min);
        int[] xs = {7, -7, 13, -13, 0, 1, -1};
        int[] ys = {2, -2, 3, -3, 5};
        for (int x : xs) {
            for (int y : ys) {
                System.out.print((x / y) + "," + (x % y) + " ");
            }
            System.out.println();
        }
        System.out.println((1 << 31) + " " + (1 << 32) + " " + (1 << 33) + " " + (-16 >> 2) + " " + (-16 >>> 28) + " " + (5 & 3) + " " + (5 | 3) + " " + (5 ^ 3) + " " + ~5);
        int a = 10;
        a += 3.7;
        System.out.println(a);
        a -= 0.5;
        System.out.println(a);
        a *= 2.5;
        System.out.println(a);
        a /= 4;
        System.out.println(a);
        byte b = 127;
        b++;
        System.out.println(b);
        short s = (short) 70000;
        System.out.println(s);
        System.out.println((byte) 200 + " " + (short) -40000 + " " + (int) 3000000000L);
        int i = 5;
        int j = i++ + ++i;
        System.out.println(i + " " + j);
        int k = 0;
        k = k++ + k++;
        System.out.println(k);
        System.out.println(0x7fffffff + " " + 0xffffffff + " " + 0b1010 + " " + 017 + " " + 1_000_000);
    }
}
