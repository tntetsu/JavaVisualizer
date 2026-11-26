import java.util.*;
import java.util.function.*;

public class Main {
    public static void main(String[] args) {
        Function<Integer, Integer> f = x -> x * 2;
        int y = f.call(3);
    }
}
