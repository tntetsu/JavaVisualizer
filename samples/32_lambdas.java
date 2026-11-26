import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Function;

public class Main {
    interface Op {
        int apply(int a, int b);
    }

    static int calc(Op op, int x, int y) {
        return op.apply(x, y);
    }

    public static void main(String[] args) {
        System.out.println(calc((a, b) -> a + b, 3, 4) + " " + calc((a, b) -> a * b, 3, 4));
        Function<Integer, Integer> square = x -> x * x;
        System.out.println(square.apply(5));

        List<String> words = new ArrayList<>(List.of("pear", "fig", "apple", "kiwi"));
        words.sort((a, b) -> a.length() - b.length());
        words.forEach(w -> System.out.println(w));
        words.removeIf(w -> w.length() < 4);

        Map<Integer, Integer> byLen = new HashMap<>();
        for (String w : words) {
            byLen.merge(w.length(), 1, Integer::sum);
        }
        System.out.println(words + " " + byLen);
    }
}
