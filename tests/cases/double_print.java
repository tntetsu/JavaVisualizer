public class Main {
    public static void main(String[] args) {
        double[] ds = {0.0, -0.0, 1.0, 0.1, 0.2, 0.1 + 0.2, 1.0 / 3, 2.0 / 3, 100.0, 1234567.0, 9999999.0, 10000000.0,
            12345678.9, 0.001, 0.0001, 0.00012345, 1e-10, 1e21, 1e22, 1e23, 123456789012.0, 3.141592653589793,
            Double.MAX_VALUE, Double.MIN_VALUE, 1.0 / 0, -1.0 / 0, 0.0 / 0, 5e-324, 4.35, 2.675, 1e7, 9.999999999999999e6,
            0.30000000000000004, 1.7976931348623157e308, 123.456, -98.765, 1.0E-3, 0.0010000001};
        for (double d : ds) {
            System.out.println(d);
        }
        double x = 7 / 2;
        System.out.println(x);
        System.out.println(7 / 2.0 + " " + 7.0 % 2.5 + " " + -7.5 % 2 + " " + (int) 3.99 + " " + (int) -3.99 + " " + (int) 1e20 + " " + (long) -1e30 + " " + (int) (0.0 / 0));
        System.out.println(Math.sqrt(2) + " " + Math.pow(2, 10) + " " + Math.abs(-3) + " " + Math.abs(-3.5) + " " + Math.max(3, 7) + " " + Math.max(3, 7.0) + " " + Math.round(2.5) + " " + Math.round(-2.5) + " " + Math.floor(-1.5) + " " + Math.ceil(1.2));
    }
}
