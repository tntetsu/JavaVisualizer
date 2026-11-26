import java.util.*;
import java.util.stream.*;

public class Main {
    public static void main(String[] args) {
        List<Integer> xs = List.of(1, 2);
        int m = xs.stream().max((a, b) -> a - b);
    }
}
