import java.util.*;
import java.util.function.*;

public class Main {
    public static void main(String[] args) {
        List<String> xs = new ArrayList<>(List.of("10", "x", "30"));
        try {
            xs.forEach(s -> System.out.println(Integer.parseInt(s) * 2));
        } catch (NumberFormatException e) {
            System.out.println("caught: " + e.getMessage());
        }
        Function<Integer, Integer> inv = n -> {
            if (n == 0) {
                throw new IllegalArgumentException("zero");
            }
            return 100 / n;
        };
        System.out.println(inv.apply(4));
        Map<String, Integer> m = new HashMap<>();
        m.put("a", 1);
        m.computeIfAbsent("b", k -> k.length());
        System.out.println(m);
        List<Integer> ys = new ArrayList<>(List.of(4, 0, 2));
        ys.sort((a, b) -> 10 / a - 10 / b);
    }
}
