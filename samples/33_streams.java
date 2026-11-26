import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

public class Main {
    public static void main(String[] args) {
        List<String> words = List.of("banana", "kiwi", "apple", "fig", "cherry");
        // 要素ごとに filter → map → forEach と進む（全部を filter してから map するのではない）
        words.stream()
            .filter(w -> w.length() > 3)
            .map(w -> w.toUpperCase())
            .forEach(w -> System.out.println(w));

        List<Integer> lengths = words.stream().map(String::length).collect(Collectors.toList());
        int total = lengths.stream().mapToInt(n -> n).sum();
        System.out.println(lengths + " total=" + total);

        Map<Integer, List<String>> byLen = words.stream().collect(Collectors.groupingBy(w -> w.length()));
        System.out.println(byLen);
    }
}
