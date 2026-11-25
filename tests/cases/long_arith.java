public class Main {
    public static void main(String[] args) {
        long a = Long.MAX_VALUE;
        System.out.println(a + 1);
        System.out.println(a * 3);
        long f = 1;
        for (int i = 1; i <= 25; i++) {
            f *= i;
            System.out.print(f + " ");
        }
        System.out.println();
        int big = 100000;
        System.out.println(big * big);
        System.out.println((long) big * big);
        System.out.println(1L << 40);
        System.out.println(-7L / 2 + " " + -7L % 2 + " " + (1L << 63) + " " + (-1L >>> 60));
        long m = 5;
        m += 2.9;
        System.out.println(m);
        System.out.println(10000000000L / 3 + " " + (int) 10000000000L);
        long x = 3;
        int y = 2;
        System.out.println(x / y + " " + (x > y) + " " + (x == 3));
    }
}
