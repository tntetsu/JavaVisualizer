public class Main {
    static void check(int x) throws MyException {
        if (x < 0) {
            throw new MyException("negative");
        }
    }

    public static void main(String[] args) {
        check(-1);
    }
}

class MyException extends Exception {
    MyException(String m) {
        super(m);
    }
}
