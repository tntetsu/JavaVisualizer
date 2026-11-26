import java.util.*;
import java.util.function.*;

public class Main {
    public static void main(String[] args) {
        BinaryOperator<Integer> f = (a, b) -> a + b;
        String s = f.apply(1, 2);
    }
}
