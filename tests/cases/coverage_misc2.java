import java.util.*;
import java.util.function.*;

// カバレッジの抜けから足したケース（Math.round(int) は round(float)・printf の型の誤りのメッセージ・Point::new など）
public class Main {
    static class Point {
        int x;
        Point(int x) { this.x = x; }
        public String toString() { return "P" + x; }
    }

    public static void main(String[] args) {
        int r1 = Math.round(5);
        int r2 = Math.round(-3);
        int r3 = Math.round(16777217);
        int r4 = Math.round(2147483647);
        int r5 = Math.round(10000000000L);
        long r6 = Math.round(2.5);
        System.out.println(r1 + " " + r2 + " " + r3 + " " + r4 + " " + r5 + " " + r6 + " " + Math.round('a'));
        for (Object o : new Object[]{new Point(1), new int[0], new ArrayList<Integer>(), "s", 1.5}) {
            try {
                System.out.printf("%d%n", o);
            } catch (IllegalFormatConversionException e) {
                System.out.println(e.getMessage());
            }
        }
        Function<Integer, Point> mk = Point::new;
        System.out.println(mk.apply(7));
        Double d1 = 1.0, d2 = 1.0;
        System.out.println(d1 == d2);
        Object s = "s";
        System.out.println(s instanceof Point);
        int k = 1;
        var mixed = switch (k) {
            case 1 -> "one";
            default -> 2;
        };
        System.out.println(mixed);
        List<Object> xs = new ArrayList<>(List.of(1, "a"));
        try {
            xs.sort(null);
        } catch (ClassCastException e) {
            System.out.println("CCE");
        }
        ;
    }
}
