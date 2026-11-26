import java.util.*;

public class Main {
    public static void main(String[] args) {
        Map<String, Integer> stock = new HashMap<>();
        stock.put("apple", 3);
        stock.put("pear", 0);
        String[] orders = {"apple", "pear", "melon"};
        for (String o : orders) {
            int n = stock.get(o);
            System.out.println(o + ": " + n);
        }
    }
}
