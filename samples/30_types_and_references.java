public class Main {
    public static void main(String[] args) {
        // 整数の割り算と、int のあふれ
        int a = 7 / 2;
        double b = 7 / 2.0;
        int max = Integer.MAX_VALUE;
        int over = max + 1;
        long big = (long) max + 1;
        System.out.println(a + " " + b + " " + over + " " + big);

        // 型の変換
        double d = 3.99;
        int i = (int) d;
        char c = 'A';
        int code = c + 1;
        char next = (char) code;
        System.out.println(i + " " + code + " " + next);

        // == と equals
        String s1 = "hello";
        String s2 = "hello";
        String s3 = new String("hello");
        System.out.println((s1 == s2) + " " + (s1 == s3) + " " + s1.equals(s3));

        // 配列は参照
        int[] x = {1, 2, 3};
        int[] y = x;
        y[0] = 100;
        System.out.println(x[0]);
    }
}
