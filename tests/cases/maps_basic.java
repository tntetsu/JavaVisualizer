import java.util.*;

public class Main {
    static class Point {
        int x, y;
        Point(int x, int y) { this.x = x; this.y = y; }
        @Override
        public boolean equals(Object o) {
            if (!(o instanceof Point)) return false;
            Point p = (Point) o;
            return x == p.x && y == p.y;
        }
        @Override
        public int hashCode() { return 31 * x + y; }
        @Override
        public String toString() { return "(" + x + "," + y + ")"; }
    }

    static Map<String, Integer> countWords(String text) {
        Map<String, Integer> count = new HashMap<>();
        for (String w : text.split(" ")) {
            count.put(w, count.getOrDefault(w, 0) + 1);
        }
        return count;
    }

    public static void main(String[] args) {
        Map<String, Integer> count = countWords("the quick brown fox jumps over the lazy dog the end");
        System.out.println(count);
        for (Map.Entry<String, Integer> e : count.entrySet()) {
            System.out.println(e.getKey() + " -> " + e.getValue());
        }
        for (String k : count.keySet()) {
            System.out.print(k + " ");
        }
        System.out.println();
        int total = 0;
        for (int v : count.values()) {
            total += v;
        }
        System.out.println(count.values() + " total=" + total);
        System.out.println(count.containsKey("fox") + " " + count.containsValue(3) + " " + count.get("cat") + " " + count.size());
        System.out.println(count.remove("the") + " " + count.remove("cat") + " " + count);
        System.out.println(count.putIfAbsent("fox", 9) + " " + count.putIfAbsent("cat", 9) + " " + count.replace("dog", 5) + " " + count);

        // setValue は表の中の値を変える
        for (Map.Entry<String, Integer> e : count.entrySet()) {
            e.setValue(e.getValue() * 10);
        }
        System.out.println(count);

        // 表が広がる（16 → 32 → 64）と順序が変わる
        Map<Integer, String> nums = new HashMap<>();
        for (int i = 0; i < 30; i++) {
            nums.put(i * 7, "n" + i);
            if (i == 11 || i == 12 || i == 24 || i == 25) {
                System.out.println(nums.keySet());
            }
        }
        // 1 つの位置に 9 個目が入ると広がる（容量が 64 より小さいとき）
        Map<Integer, Integer> same = new HashMap<>();
        for (int i = 0; i < 10; i++) {
            same.put(i * 64, i);
            System.out.println(same.keySet());
        }
        // 負の数・大きな数・文字・小数・真偽値・long のキー
        Map<Integer, Integer> neg = new HashMap<>();
        neg.put(-1, 1); neg.put(-100, 2); neg.put(Integer.MAX_VALUE, 3); neg.put(65536, 4); neg.put(65537, 5);
        System.out.println(neg);
        Map<Character, Integer> chars = new HashMap<>();
        for (char c : "mississippi river".toCharArray()) {
            chars.put(c, chars.getOrDefault(c, 0) + 1);
        }
        System.out.println(chars);
        Map<Double, Boolean> dm = new HashMap<>();
        dm.put(1.5, true); dm.put(-0.25, false); dm.put(100.0, true); dm.put(0.1, false);
        System.out.println(dm);
        Map<Boolean, String> bm = new HashMap<>();
        bm.put(true, "yes"); bm.put(false, "no");
        System.out.println(bm);
        Map<Long, Integer> lm = new HashMap<>();
        lm.put(10000000000L, 1); lm.put(-3L, 2); lm.put(7L, 3);
        System.out.println(lm);

        // 自作のクラスのキー（hashCode・equals を書いたもの）
        Map<Point, String> pts = new HashMap<>();
        pts.put(new Point(1, 2), "a");
        pts.put(new Point(0, 0), "b");
        pts.put(new Point(1, 2), "c");
        System.out.println(pts + " " + pts.get(new Point(0, 0)) + " " + pts.size());

        // 値がリストのマップ
        Map<String, List<Integer>> groups = new HashMap<>();
        int[] data = {5, 12, 7, 30, 18, 3};
        for (int d : data) {
            String key = d < 10 ? "small" : "big";
            if (!groups.containsKey(key)) {
                groups.put(key, new ArrayList<>());
            }
            groups.get(key).add(d);
        }
        System.out.println(groups);

        // 容量を指定する・別のマップから作る・clear しても容量は変わらない
        Map<String, Integer> small = new HashMap<>(2);
        small.put("one", 1); small.put("two", 2); small.put("three", 3); small.put("four", 4);
        System.out.println(small);
        Map<String, Integer> copy = new HashMap<>(small);
        System.out.println(copy + " " + copy.equals(small) + " " + (copy.hashCode() == small.hashCode()));
        copy.clear();
        System.out.println(copy + " " + copy.isEmpty());
        copy.putAll(count);
        System.out.println(copy);

        // TreeMap（キーの順）・LinkedHashMap（入れた順）
        TreeMap<String, Integer> tm = new TreeMap<>(count);
        System.out.println(tm + " " + tm.firstKey() + " " + tm.lastKey());
        Map<String, Integer> lhm = new LinkedHashMap<>();
        lhm.put("zebra", 1); lhm.put("apple", 2); lhm.put("mango", 3); lhm.put("zebra", 4);
        lhm.remove("apple");
        lhm.put("apple", 5);
        System.out.println(lhm);
        Map<Integer, String> tnum = new TreeMap<>();
        tnum.put(10, "ten"); tnum.put(-5, "minus"); tnum.put(3, "three");
        System.out.println(tnum);

        // Map.of・Map.entry（順序を見ないもの）
        Map<String, Integer> fixed = Map.of("a", 1, "b", 2);
        System.out.println(fixed.get("b") + " " + fixed.size() + " " + fixed.containsKey("c"));
        Map.Entry<String, Integer> en = Map.entry("x", 1);
        System.out.println(en + " " + en.getKey() + " " + en.getValue());
        try {
            fixed.put("c", 3);
        } catch (UnsupportedOperationException ex) {
            System.out.println("UnsupportedOperationException");
        }

        // 繰り返しの途中で変える
        Map<String, Integer> m2 = new HashMap<>(Map.of("k1", 1));
        m2.put("k2", 2);
        m2.put("k3", 3);
        try {
            for (String k : m2.keySet()) {
                if (k.equals("k1")) {
                    m2.remove(k);
                }
            }
        } catch (ConcurrentModificationException ex) {
            System.out.println("ConcurrentModificationException " + m2);
        }
    }
}
