import java.util.*;
import java.util.stream.*;

public class Main {
    public static void main(String[] args) {
        List<String> xs = List.of("a");
        List<Integer> ys = xs.stream().map(s -> s.length()).collect(Collectors.toList());
        List<String> zs = xs.stream().map(s -> s.length()).collect(Collectors.toList());
    }
}
