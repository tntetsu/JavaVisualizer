import java.util.*;

public class Main {
    public static void main(String[] args) {
        System.out.println(new ByLen());
    }
}

class ByLen implements Comparator<String> {
    public int compareTo(String a, String b) {
        return a.length() - b.length();
    }
}
