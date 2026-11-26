public class Main {
    static int depth = 0;

    static void down() {
        depth++;
        down();
    }

    public static void main(String[] args) {
        try {
            down();
        } catch (StackOverflowError e) {
            System.out.println("caught " + e);
        }
        System.out.println(depth > 100);
        try {
            down();
        } catch (Error e) {
            System.out.println("caught again");
        }
    }
}
