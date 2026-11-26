import java.util.*;
import java.util.function.*;

public class Main {
    public static void main(String[] args) {
        int c = 0;
        c++;
        Runnable r = () -> System.out.println(c);
    }
}
