import java.util.*;
public class Main {
    public static void main(String[] args) {
        List<Integer> xs = List.of(1, 2);
        List<Integer> ys = xs.stream().collect(Collectors.toList());
    }
}
