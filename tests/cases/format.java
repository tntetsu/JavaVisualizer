public class Main {
    public static void main(String[] args) {
        System.out.printf("%d|%5d|%-5d|%05d|%+d|%,d|%x|%X|%o%n", 42, 42, 42, 42, 42, 1234567, 255, -1, 8);
        System.out.printf("%f|%.2f|%8.3f|%-8.1f|%08.2f|%.0f|%e|%.3E%n", Math.PI, 2.675, -1.5, 2.25, 3.14159, 2.5, 12345.678, 0.000123);
        System.out.printf("%s|%10s|%-10s|%.3s|%S|%c|%b|%%%n", "abc", "right", "left", "truncate", "up", 'x', true);
        System.out.println(String.format("%3d%%", 7) + String.format("[%6.2f]", 3.14159) + String.format("%,.2f", 1234567.891));
        double[] vs = {0.125, 0.375, 1.005, 2.345, 2.355, 1.45, 0.5, 1.5, 2.5, 99.995, 1e-7, 123456789.125};
        for (double v : vs) {
            System.out.printf("%.2f %.1f %.0f %.4f%n", v, v, v, v);
        }
        System.out.printf("%d %s%n", 10L, 1.0);
        System.out.printf("%5.1f%%%n", 45.678);
    }
}
