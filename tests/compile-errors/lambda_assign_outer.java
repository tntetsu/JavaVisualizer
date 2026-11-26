import java.util.*;
import java.util.function.*;

public class Main {
    public static void main(String[] args) {
        int sum = 0;
        List<Integer> xs = List.of(1, 2);
        xs.forEach(x -> sum += x);
    }
}
