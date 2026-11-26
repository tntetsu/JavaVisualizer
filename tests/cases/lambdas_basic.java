import java.util.*;
import java.util.function.*;

public class Main {
    interface Op {
        int apply(int a, int b);
    }

    interface Check {
        boolean ok(String s);
    }

    static class Student {
        String name;
        int score;

        Student(String name, int score) {
            this.name = name;
            this.score = score;
        }

        String getName() { return name; }
        int getScore() { return score; }

        public String toString() { return name + ":" + score; }
    }

    static class ByScore implements Comparator<Student> {
        public int compare(Student a, Student b) {
            return a.score - b.score;
        }
    }

    static int calc(Op op, int x, int y) {
        return op.apply(x, y);
    }

    static boolean isEven(int n) {
        return n % 2 == 0;
    }

    static List<String> pick(List<String> xs, Check c) {
        List<String> out = new ArrayList<>();
        for (String s : xs) {
            if (c.ok(s)) {
                out.add(s);
            }
        }
        return out;
    }

    public static void main(String[] args) {
        // 自作の関数型インターフェース
        Op add = (a, b) -> a + b;
        Op mul = (int a, int b) -> {
            int r = a * b;
            return r;
        };
        System.out.println(calc(add, 3, 4) + " " + calc(mul, 3, 4) + " " + calc((a, b) -> a - b, 3, 4));
        int base = 100;
        Op withBase = (a, b) -> a + b + base;
        System.out.println(withBase.apply(1, 2));
        System.out.println(pick(List.of("apple", "kiwi", "banana", "fig"), s -> s.length() > 3));

        // java.util.function
        Function<Integer, Integer> square = x -> x * x;
        Function<Integer, String> label = x -> "#" + x;
        BiFunction<Integer, Integer, Integer> pow = (b, e) -> {
            int r = 1;
            for (int i = 0; i < e; i++) {
                r *= b;
            }
            return r;
        };
        Predicate<String> empty = s -> s.isEmpty();
        Supplier<String> hello = () -> "hello";
        Consumer<String> shout = s -> System.out.println(s.toUpperCase() + "!");
        UnaryOperator<String> twice = s -> s + s;
        BinaryOperator<Integer> max = (a, b) -> a > b ? a : b;
        Runnable r = () -> System.out.println("run");
        System.out.println(square.apply(7) + " " + label.apply(3) + " " + pow.apply(2, 10) + " " + empty.test("") + " " + empty.negate().test(""));
        System.out.println(hello.get() + " " + twice.apply("ab") + " " + max.apply(3, 9) + " " + square.andThen(label).apply(5));
        shout.accept("hey");
        r.run();
        IntBinaryOperator gcd = (a, b) -> b == 0 ? a : a % b;
        System.out.println(gcd.applyAsInt(12, 5));

        // メソッド参照
        BinaryOperator<Integer> sum = Integer::sum;
        Function<String, Integer> len = String::length;
        Predicate<Integer> even = Main::isEven;
        Consumer<Object> print = System.out::println;
        Function<String, String> upper = String::toUpperCase;
        System.out.println(sum.apply(2, 3) + " " + len.apply("hello") + " " + even.test(4) + " " + upper.apply("abc"));
        print.accept("printed");

        // コレクション
        List<Integer> nums = new ArrayList<>(List.of(5, 3, 8, 1, 9, 2));
        nums.forEach(n -> System.out.print(n + " "));
        System.out.println();
        nums.removeIf(n -> n % 2 == 0);
        System.out.println(nums);
        nums.replaceAll(n -> n * 10);
        System.out.println(nums);
        nums.sort((a, b) -> b - a);
        System.out.println(nums);
        nums.sort(null);
        System.out.println(nums);
        nums.sort(Comparator.reverseOrder());
        System.out.println(nums);
        nums.forEach(System.out::println);

        List<Student> ss = new ArrayList<>();
        ss.add(new Student("Ken", 80));
        ss.add(new Student("Ann", 95));
        ss.add(new Student("Bob", 80));
        ss.add(new Student("Cid", 70));
        ss.sort(Comparator.comparing(Student::getName));
        System.out.println(ss);
        ss.sort(Comparator.comparingInt(Student::getScore).reversed().thenComparing(Student::getName));
        System.out.println(ss);
        Collections.sort(ss, new ByScore());
        System.out.println(ss);
        Collections.sort(ss, (a, b) -> a.name.compareTo(b.name));
        System.out.println(ss + " " + Collections.max(ss, new ByScore()) + " " + Collections.min(ss, (a, b) -> a.score - b.score));
        ss.sort(new ByScore().reversed());
        System.out.println(ss);
        ss.sort(Comparator.comparing(s -> s.name.length()));
        System.out.println(ss);

        Map<String, Integer> count = new HashMap<>();
        for (String w : "a b a c b a".split(" ")) {
            count.merge(w, 1, Integer::sum);
        }
        System.out.println(count);
        count.forEach((k, v) -> System.out.println(k + "=" + v));
        Map<Integer, List<String>> byLen = new TreeMap<>();
        for (String w : List.of("hi", "yes", "no", "cat", "a")) {
            byLen.computeIfAbsent(w.length(), k -> new ArrayList<>()).add(w);
        }
        System.out.println(byLen);
        count.computeIfPresent("a", (k, v) -> v + 100);
        count.compute("z", (k, v) -> v == null ? 1 : v + 1);
        count.compute("z", (k, v) -> v == null ? 1 : v + 1);
        count.replaceAll((k, v) -> v * 2);
        System.out.println(count);
        count.merge("c", 0, (a, b) -> null);
        System.out.println(count);

        Set<String> words = new TreeSet<>(Comparator.reverseOrder());
        words.addAll(List.of("pear", "apple", "fig"));
        System.out.println(words);
        words.removeIf(w -> w.startsWith("p"));
        words.forEach(w -> System.out.print(w + ";"));
        System.out.println();
        Map<String, Integer> tm = new TreeMap<>((a, b) -> b.length() - a.length());
        tm.put("aa", 1); tm.put("b", 2); tm.put("cccc", 3);
        System.out.println(tm);

        String[] arr = {"pear", "fig", "banana"};
        Arrays.sort(arr, (a, b) -> a.length() - b.length());
        System.out.println(Arrays.toString(arr));
        Supplier<List<Integer>> mk = ArrayList::new;
        List<Integer> fresh = mk.get();
        fresh.add(1);
        System.out.println(fresh);
        Function<String, Student> make = n -> new Student(n, 0);
        System.out.println(make.apply("Zed"));
        Predicate<Integer> pos = x -> x > 0;
        Predicate<Integer> small = x -> x < 10;
        System.out.println(pos.and(small).test(5) + " " + pos.and(small).test(50) + " " + pos.or(small).test(-5));
    }
}
