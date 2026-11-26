public class Main {
    static int sign(int n) {
        int s;
        if (n > 0) {
            s = 1;
        } else if (n < 0) {
            s = -1;
        } else {
            s = 0;
        }
        return s;
    }

    static String grade(int score) {
        String g;
        switch (score / 10) {
            case 10:
            case 9:
                g = "A";
                break;
            case 8:
                g = "B";
                break;
            default:
                g = "C";
        }
        return g;
    }

    public static void main(String[] args) {
        int first;
        while (true) {
            first = 7;
            break;
        }
        int t;
        try {
            t = Integer.parseInt("12");
        } catch (NumberFormatException e) {
            t = -1;
        }
        int u;
        boolean ok = (u = 3) > 2;
        int w;
        do {
            w = 4;
        } while (w < 0);
        int v;
        if (ok && (v = 5) > 0) {
            System.out.println(v);
        }
        System.out.println(sign(-4) + " " + sign(9) + " " + grade(95) + grade(81) + grade(5) + " " + first + " " + t + " " + u + " " + w);
    }
}
