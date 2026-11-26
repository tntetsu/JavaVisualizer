import java.util.*;
import java.util.stream.*;

public class Main {
    public static void main(String[] args) {
        System.out.println(f(3));
    }

    static int f(int n) {
        do {
            if (n > 5) {
                continue;
            }
            return n;
        } while (n-- > 0);
    }
}

