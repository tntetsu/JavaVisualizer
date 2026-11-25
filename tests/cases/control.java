public class Main {
    public static void main(String[] args) {
        for (int i = 0; i < 10; i++) {
            if (i == 2) continue;
            if (i == 6) break;
            System.out.print(i + " ");
        }
        System.out.println();
        int n = 0;
        do {
            n++;
        } while (n < 0);
        System.out.println(n);
        int i = 10;
        while (i > 0) {
            i -= 3;
        }
        System.out.println(i);
        for (int k = 0; k < 7; k++) {
            switch (k % 4) {
                case 0:
                    System.out.print("zero ");
                case 1:
                    System.out.print("one ");
                    break;
                case 2:
                    System.out.print("two ");
                    break;
                default:
                    System.out.print("other ");
            }
        }
        System.out.println();
        String cmd = "stop";
        switch (cmd) {
            case "go" -> System.out.println("going");
            case "stop", "halt" -> {
                System.out.println("stopping");
            }
            default -> System.out.println("?");
        }
        char grade = 'B';
        switch (grade) {
            case 'A': System.out.println("great"); break;
            case 'B':
            case 'C': System.out.println("good"); break;
        }
        int x = 5;
        String r = x > 3 ? "big" : "small";
        System.out.println(r);
        boolean t = true, f = false;
        System.out.println((t && f) + " " + (t || f) + " " + (!t) + " " + (t & f) + " " + (t ^ f) + " " + (f | t));
        int calls = 0;
        if (f && (calls++ > 0)) { }
        if (t || (calls++ > 0)) { }
        System.out.println(calls);
        for (int a = 0, b = 10; a < b; a += 3, b -= 2) {
            System.out.print(a + ":" + b + " ");
        }
        System.out.println();
        outer();
    }

    static void outer() {
        int count = 0;
        for (int i = 0; i < 3; i++) {
            for (int j = 0; j < 3; j++) {
                if (j > i) break;
                count++;
            }
        }
        System.out.println(count);
    }
}
