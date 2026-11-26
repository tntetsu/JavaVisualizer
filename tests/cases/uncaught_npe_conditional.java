public class Main {
    static class Point { int x; }
    public static void main(String[] args) {
        Point p = null;
        int v = (args.length > 5 ? p : p).x;
    }
}
