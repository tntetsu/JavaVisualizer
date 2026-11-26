public class Main {
    static void check(int x) {
        if (x < 0) {
            throw new Exception("negative");
        }
    }

    public static void main(String[] args) {
        check(-1);
    }
}
