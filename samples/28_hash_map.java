import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

public class Main {
    public static void main(String[] args) {
        String[] words = {"the", "cat", "sat", "on", "the", "mat", "the", "end"};
        Map<String, Integer> count = new HashMap<>();
        for (String w : words) {
            count.put(w, count.getOrDefault(w, 0) + 1);
        }
        System.out.println(count);
        for (Map.Entry<String, Integer> e : count.entrySet()) {
            if (e.getValue() > 1) {
                System.out.println(e.getKey() + " x " + e.getValue());
            }
        }
        Set<Character> letters = new HashSet<>();
        for (String w : count.keySet()) {
            letters.add(w.charAt(0));
        }
        System.out.println(letters + " " + letters.contains('c'));
    }
}
