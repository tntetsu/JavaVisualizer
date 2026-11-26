public class Main {
    enum Color { RED, GREEN, BLUE }

    enum Planet {
        MERCURY(3.303e+23, 2.4397e6),
        EARTH(5.976e+24, 6.37814e6);

        private final double mass;
        private final double radius;

        Planet(double mass, double radius) {
            this.mass = mass;
            this.radius = radius;
        }

        double surfaceGravity() {
            return 6.67300E-11 * mass / (radius * radius);
        }
    }

    static String kind(int day) {
        return switch (day) {
            case 1, 7 -> "weekend";
            case 2, 3, 4, 5, 6 -> {
                String w = "week";
                yield w + "day";
            }
            default -> "?";
        };
    }

    public static void main(String[] args) {
        Color c = Color.GREEN;
        System.out.println(c + " " + c.ordinal() + " " + c.name() + " " + Color.values().length + " " + (c == Color.GREEN) + " " + Color.valueOf("BLUE") + " " + c.compareTo(Color.BLUE));
        switch (c) {
            case RED:
                System.out.println("r");
                break;
            case GREEN:
                System.out.println("g");
                break;
            default:
                System.out.println("?");
        }
        String s = switch (c) {
            case RED -> "赤";
            case GREEN -> "緑";
            case BLUE -> "青";
        };
        System.out.println(s);
        for (Color x : Color.values()) {
            System.out.print(x + ":" + x.ordinal() + " ");
        }
        System.out.println();
        for (int d = 1; d <= 7; d += 3) {
            System.out.print(kind(d) + " ");
        }
        System.out.println();
        for (Planet p : Planet.values()) {
            System.out.printf("%s %.2f%n", p, p.surfaceGravity());
        }
        Object o = "text";
        if (o instanceof String str && str.length() > 2) {
            System.out.println(str.toUpperCase());
        }
        int n = 5;
        int sq = switch (n % 3) {
            case 0 -> 0;
            case 1 -> n;
            default -> n * n;
        };
        System.out.println(sq);
    }
}
