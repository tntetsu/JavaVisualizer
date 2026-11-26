import java.util.*;

public class Main {
    static class Plain {
        int v;
        Plain(int v) { this.v = v; }
    }

    static int sign(int n) {
        // do-while の中の continue（return の忘れの判定に continue の有無を使う）
        int i = 0;
        do {
            i++;
            if (i < 3) {
                continue;
            }
            return n > 0 ? 1 : -1;
        } while (true);
    }

    public static void main(String[] args) {
        // 単項の + と ~
        int a = 5;
        long b = 6L;
        char c = 'A';
        System.out.println(+a + " " + (+c) + " " + ~a + " " + ~b + " " + ~c + " " + -c + " " + (-b));

        // StringBuilder の残りのメソッド
        StringBuilder sb = new StringBuilder("hello world");
        sb.delete(0, 6);
        System.out.println(sb + " " + sb.indexOf("r") + " " + sb.isEmpty());
        sb.setLength(3);
        System.out.println("[" + sb + "] " + sb.length());
        sb.setLength(5);
        System.out.println(sb.length() + " " + (int) sb.charAt(4));
        sb.delete(1, 100);
        System.out.println(sb);
        try {
            sb.delete(3, 1);
        } catch (StringIndexOutOfBoundsException e) {
            System.out.println("SIOOBE " + e.getMessage());
        }
        sb.setLength(0);
        System.out.println(sb.isEmpty());

        // Collections.swap と範囲の外
        List<Integer> xs = new ArrayList<>(List.of(1, 2, 3));
        Collections.swap(xs, 0, 2);
        System.out.println(xs);
        try {
            Collections.swap(xs, 0, 5);
        } catch (IndexOutOfBoundsException e) {
            System.out.println("IOOBE " + e.getMessage());
        }

        // Comparable でないオブジェクトを並べる
        List<Plain> ps = new ArrayList<>(List.of(new Plain(2), new Plain(1)));
        try {
            ps.sort(null);
        } catch (ClassCastException e) {
            System.out.println("ClassCastException");
        }

        // ラッパー型の equals（Boolean・Character）
        Boolean t1 = true, t2 = true;
        Character c1 = 'x';
        System.out.println(t1.equals(t2) + " " + t1.equals(1) + " " + c1.equals('x') + " " + c1.equals("x"));

        // Math.round（double → long）・floorDiv・floorMod（long）
        long big = Math.round(1e12 + 0.5);
        System.out.println(big + " " + Math.round(-2.5) + " " + Math.floorDiv(-7L, 2L) + " " + Math.floorMod(-7L, 3L) + " " + Math.floorDiv(7L, -2));

        // Double.parseDouble の誤り
        for (String s : new String[]{"", "1.5x", " 2.5 "}) {
            try {
                System.out.println(Double.parseDouble(s));
            } catch (NumberFormatException e) {
                System.out.println("NFE " + e.getMessage());
            }
        }

        // printf の不明な変換
        try {
            System.out.printf("%q%n", 1);
        } catch (UnknownFormatConversionException e) {
            System.out.println("UFCE " + e.getMessage());
        }

        // printf の型の合わない値：本物は、例外の前までの文字（"x "）を書き出してから投げる
        try {
            System.out.printf("%d%n", "a");
        } catch (IllegalFormatConversionException e) {
            System.out.println("IFCE " + e.getMessage());
        }
        try {
            System.out.printf("%s %d%n", "x", 2.5);
        } catch (IllegalFormatException e) {
            System.out.println("IFE " + e.getMessage());
        }

                // テキストブロック
        String tb = """
            Hello,
              Java!
            """;
        System.out.print(tb);

        // switch 式の数の型（int と double → double）
        int k = 2;
        var r = switch (k) {
            case 1 -> 1;
            default -> 2.5;
        };
        System.out.println(r);

        // instanceof でコレクションの型を調べる
        Object o1 = new HashMap<String, Integer>();
        Object o2 = new TreeSet<Integer>();
        Object o3 = new ArrayList<Integer>();
        System.out.println((o1 instanceof Map) + " " + (o2 instanceof Set) + " " + (o3 instanceof Collection) + " " + (o1 instanceof Collection) + " " + (o2 instanceof List));

        // 容量を指定した HashSet・負の容量
        Set<Integer> hs = new HashSet<>(64);
        for (int i = 0; i < 5; i++) {
            hs.add(i * 17);
        }
        System.out.println(hs);
        try {
            new HashSet<Integer>(-1);
        } catch (IllegalArgumentException e) {
            System.out.println("IAE " + e.getMessage());
        }

        // keySet・entrySet を通して調べる・除く
        Map<String, Integer> m = new HashMap<>(Map.of("a", 1, "b", 2));
        Set<String> keys = m.keySet();
        System.out.println(keys.contains("a") + " " + keys.remove("a") + " " + keys.remove("z") + " " + m);
        System.out.println(m.entrySet().contains(Map.entry("b", 2)));

        // for (int x : list) の null の要素
        List<Integer> withNull = new ArrayList<>();
        withNull.add(1);
        withNull.add(null);
        try {
            for (int x : withNull) {
                System.out.println(x);
            }
        } catch (NullPointerException e) {
            System.out.println("NPE " + e.getMessage());
        }

        System.out.println(sign(5) + " " + sign(-5));

        // Function の compose・andThen、Consumer の andThen
        java.util.function.Function<Integer, Integer> inc = x -> x + 1;
        java.util.function.Function<Integer, Integer> dbl = x -> x * 2;
        System.out.println(inc.compose(dbl).apply(5) + " " + inc.andThen(dbl).apply(5));
        java.util.function.Consumer<String> ca = s -> System.out.print("a:" + s + " ");
        java.util.function.Consumer<String> cb = s -> System.out.println("b:" + s);
        ca.andThen(cb).accept("z");

                // Optional を作る
        Optional<Integer> o4 = Optional.of(3);
        Optional<String> o5 = Optional.ofNullable(null);
        System.out.println(o4 + " " + Optional.empty() + " " + o5.isPresent() + " " + o5.orElse("none") + " " + o4.get());
    }
}
