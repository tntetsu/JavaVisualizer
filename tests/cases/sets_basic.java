import java.util.*;

public class Main {
    static Set<Character> letters(String s) {
        Set<Character> out = new TreeSet<>();
        for (char c : s.toCharArray()) {
            if (Character.isLetter(c)) {
                out.add(c);
            }
        }
        return out;
    }

    public static void main(String[] args) {
        Set<String> seen = new HashSet<>();
        String[] words = {"apple", "banana", "apple", "cherry", "date", "banana", "elderberry", "fig"};
        for (String w : words) {
            if (!seen.add(w)) {
                System.out.println("dup: " + w);
            }
        }
        System.out.println(seen + " " + seen.size());
        System.out.println(seen.contains("fig") + " " + seen.contains("grape") + " " + seen.remove("date") + " " + seen.remove("date"));
        for (String w : seen) {
            System.out.print(w.length() + " ");
        }
        System.out.println();

        Set<Integer> nums = new HashSet<>(List.of(100, 3, 17, 33, 1, 64, -2));
        System.out.println(nums);
        List<Integer> withDup = new ArrayList<>(List.of(5, 3, 5, 1, 3, 20, 16));
        Set<Integer> dedup = new HashSet<>(withDup);
        System.out.println(dedup + " " + new ArrayList<>(dedup));
        for (int i = 0; i < 20; i++) {
            nums.add(i * 5);
        }
        System.out.println(nums);

        Set<Integer> a = new TreeSet<>(List.of(1, 2, 3, 4, 5));
        Set<Integer> b = new TreeSet<>(List.of(4, 5, 6, 7));
        Set<Integer> union = new TreeSet<>(a);
        union.addAll(b);
        Set<Integer> inter = new TreeSet<>(a);
        inter.retainAll(b);
        Set<Integer> diff = new TreeSet<>(a);
        diff.removeAll(b);
        System.out.println(union + " " + inter + " " + diff + " " + a.containsAll(inter));
        TreeSet<String> ts = new TreeSet<>(seen);
        System.out.println(ts + " " + ts.first() + " " + ts.last());

        Set<String> lhs = new LinkedHashSet<>();
        lhs.add("z"); lhs.add("a"); lhs.add("m"); lhs.add("a");
        System.out.println(lhs);
        System.out.println(letters("Hello, World!"));

        Set<Integer> s1 = new HashSet<>(List.of(1, 2, 3));
        Set<Integer> s2 = new TreeSet<>(List.of(3, 2, 1));
        System.out.println(s1.equals(s2) + " " + (s1.hashCode() == s2.hashCode()) + " " + Set.of(7).contains(7));
        s1.clear();
        System.out.println(s1 + " " + s1.isEmpty());
    }
}
