import java.util.*;

public class Main {
    public static void main(String[] args) {
        Set<String> names = new HashSet<>();
        names.add("Alice");
        names.add("Bob");
        names.add("Carol");
        for (String n : names) {
            System.out.println(n);
            if (n.startsWith("B")) {
                names.remove(n);
            }
        }
    }
}
