public class Main {
    static int depth = 0;

    public static void main(String[] args) {
        try {
            int[] a = new int[3];
            a[3] = 1;
        } catch (ArrayIndexOutOfBoundsException e) {
            System.out.println("1 " + e.getMessage());
        }
        try {
            String s = null;
            s.length();
        } catch (NullPointerException e) {
            System.out.println("2 caught NPE");
        }
        try {
            "abc".charAt(5);
        } catch (StringIndexOutOfBoundsException e) {
            System.out.println("3 " + e);
        }
        try {
            Integer.parseInt("");
        } catch (NumberFormatException e) {
            System.out.println("4 " + e.getMessage());
        }
        try {
            int[] neg = new int[-2];
        } catch (NegativeArraySizeException e) {
            System.out.println("5 " + e.getMessage());
        }
        try {
            throw new IllegalArgumentException("bad value");
        } catch (RuntimeException e) {
            System.out.println("6 " + e);
        }
        try {
            check(-1);
        } catch (MyException e) {
            System.out.println("7 " + e.getMessage() + " " + e.code);
        }
        System.out.println("8 " + tryFinally());
        try {
            try {
                throw new IllegalStateException("inner");
            } finally {
                System.out.println("9 finally");
            }
        } catch (IllegalStateException e) {
            System.out.println("10 " + e.getMessage());
        }
        try {
            System.out.println(10 % 0);
        } catch (ArithmeticException | NullPointerException e) {
            System.out.println("11 " + e);
        }
        try {
            recurse();
        } catch (ArithmeticException e) {
            System.out.println("12 " + depth);
        }
        Object o = "str";
        try {
            Integer bad = (Integer) o;
        } catch (ClassCastException e) {
            System.out.println("13 CCE");
        }
        int[] arr = {1, 2, 3};
        int i = 0;
        while (true) {
            try {
                System.out.print(arr[i] + " ");
                i++;
            } catch (ArrayIndexOutOfBoundsException e) {
                System.out.println("end");
                break;
            }
        }
    }

    static void recurse() {
        depth++;
        if (depth == 50) {
            int z = depth / 0;
        }
        recurse();
    }

    static void check(int v) {
        if (v < 0) {
            throw new MyException("negative: " + v, 42);
        }
    }

    static int tryFinally() {
        try {
            return 1;
        } finally {
            System.out.println("finally runs");
        }
    }
}

class MyException extends RuntimeException {
    int code;

    MyException(String msg, int code) {
        super(msg);
        this.code = code;
    }
}
