import java.util.*;
import java.util.stream.*;

public class Main {
    static class Student {
        String name;
        int score;
        String club;

        Student(String name, int score, String club) {
            this.name = name;
            this.score = score;
            this.club = club;
        }

        String getName() { return name; }
        int getScore() { return score; }
        String getClub() { return club; }

        public String toString() { return name; }
    }

    public static void main(String[] args) {
        List<Integer> nums = List.of(5, 3, 8, 1, 9, 2, 8);
        List<Integer> evens = nums.stream().filter(n -> n % 2 == 0).collect(Collectors.toList());
        List<Integer> doubled = nums.stream().map(n -> n * 2).toList();
        System.out.println(evens + " " + doubled);
        System.out.println(nums.stream().mapToInt(n -> n).sum() + " " + nums.stream().count() + " " + nums.stream().distinct().sorted().toList());
        System.out.println(nums.stream().sorted((a, b) -> b - a).limit(3).toList() + " " + nums.stream().skip(4).toList());
        System.out.println(nums.stream().reduce(0, (a, b) -> a + b) + " " + nums.stream().reduce(Integer::max) + " " + nums.stream().max(Integer::compare).get());
        System.out.println(nums.stream().anyMatch(n -> n > 8) + " " + nums.stream().allMatch(n -> n > 0) + " " + nums.stream().noneMatch(n -> n == 4));
        System.out.println(nums.stream().filter(n -> n > 100).findFirst() + " " + nums.stream().filter(n -> n > 4).findFirst().get());
        System.out.println(nums.stream().mapToInt(Integer::intValue).average().getAsDouble() + " " + IntStream.of().average());
        System.out.println(nums.stream().mapToInt(n -> n).max() + " " + nums.stream().min((a, b) -> a - b).orElse(-1));

        // 遅延評価：要素ごとに filter → map → forEach と進む。limit で途中でやめる
        Stream.of("a", "bb", "ccc", "dd", "e")
            .peek(s -> System.out.println("see " + s))
            .filter(s -> s.length() >= 2)
            .map(s -> s.toUpperCase())
            .limit(2)
            .forEach(s -> System.out.println("got " + s));
        // sorted は上流をすべて読んでから流す
        Stream.of(3, 1, 2)
            .peek(x -> System.out.println("before " + x))
            .sorted()
            .forEach(x -> System.out.println("after " + x));

        // IntStream
        System.out.println(IntStream.range(0, 5).sum() + " " + IntStream.rangeClosed(1, 5).map(i -> i * i).boxed().toList());
        System.out.println(IntStream.rangeClosed(1, 10).filter(i -> i % 3 == 0).mapToObj(i -> "#" + i).collect(Collectors.joining(", ", "[", "]")));
        int[] arr = {4, 7, 1};
        System.out.println(Arrays.stream(arr).max().getAsInt() + " " + Arrays.stream(new String[]{"x", "y"}).collect(Collectors.joining("+")));
        System.out.println(Stream.iterate(1, x -> x * 3).limit(5).toList());
        double[] ds = {0.1, 0.2, 0.3};
        System.out.println(Arrays.stream(ds).sum() + " " + Arrays.stream(ds).average().getAsDouble());
        System.out.println(nums.stream().mapToDouble(n -> n * 0.1).sum());

        // 文字列
        List<String> words = List.of("banana", "apple", "cherry", "kiwi", "apple", "fig");
        System.out.println(words.stream().map(String::length).collect(Collectors.toList()));
        System.out.println(words.stream().filter(w -> w.contains("a")).map(String::toUpperCase).sorted().collect(Collectors.joining(",")));
        System.out.println(words.stream().collect(Collectors.toSet()));
        System.out.println(words.stream().collect(Collectors.groupingBy(String::length)));
        System.out.println(words.stream().collect(Collectors.groupingBy(w -> w.charAt(0), Collectors.counting())));
        System.out.println(words.stream().distinct().collect(Collectors.toMap(w -> w, w -> w.length())));
        System.out.println(words.stream().collect(Collectors.partitioningBy(w -> w.length() > 4)));
        Map<Integer, List<String>> byLen = words.stream().collect(Collectors.groupingBy(w -> w.length()));
        System.out.println(byLen.get(5));

        // オブジェクト
        List<Student> ss = List.of(new Student("Ken", 80, "tennis"), new Student("Ann", 95, "chess"),
            new Student("Bob", 70, "tennis"), new Student("Cid", 88, "chess"));
        System.out.println(ss.stream().sorted(Comparator.comparingInt(Student::getScore).reversed()).map(Student::getName).toList());
        System.out.println(ss.stream().mapToInt(Student::getScore).average().orElse(0));
        System.out.println(ss.stream().collect(Collectors.groupingBy(Student::getClub, Collectors.summingInt(Student::getScore))));
        System.out.println(ss.stream().collect(Collectors.groupingBy(s -> s.club, Collectors.averagingInt(s -> s.score))));
        Optional<Student> top = ss.stream().max(Comparator.comparingInt(s -> s.score));
        top.ifPresent(s -> System.out.println("top " + s));
        System.out.println(top.isPresent());
    }
}
