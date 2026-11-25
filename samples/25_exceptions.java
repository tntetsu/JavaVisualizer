public class Main {
    static int divide(int a, int b) {
        return a / b;
    }

    public static void main(String[] args) {
        int[] data = {10, 0, 5};
        for (int d : data) {
            try {
                System.out.println(divide(100, d));
            } catch (ArithmeticException e) {
                System.out.println("error: " + e.getMessage());
            } finally {
                System.out.println("done " + d);
            }
        }
        try {
            int n = Integer.parseInt("12a");
            System.out.println(n);
        } catch (NumberFormatException e) {
            System.out.println(e);
        }
    }
}
