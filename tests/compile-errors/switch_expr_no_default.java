public class Main {
    public static void main(String[] args) {
        int n = 3;
        int k = switch (n) {
            case 1 -> 10;
            case 2 -> 20;
        };
    }
}
