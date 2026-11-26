import java.util.ArrayList;
import java.util.List;
import java.util.Collections;

public class Main {
    public static void main(String[] args) {
        ArrayList<Integer> list = new ArrayList<>();
        list.add(5); list.add(3); list.add(8);
        list.add(1, 10);
        System.out.println(list + " " + list.size() + " " + list.get(1) + " " + list.contains(8) + " " + list.indexOf(3));
        list.remove(0);
        list.remove(Integer.valueOf(8));
        System.out.println(list);
        int old = list.set(0, 99);
        System.out.println(old + " " + list + " " + list.isEmpty());
        List<String> names = new ArrayList<>();
        names.add("bob"); names.add("al");
        Collections.sort(names);
        System.out.println(names + " " + String.join(",", names));
        int sum = 0;
        for (int x : list) sum += x;
        System.out.println(sum);
        StringBuilder sb = new StringBuilder();
        sb.append("a").append(1).append('c').append(2.5);
        sb.insert(0, "[").reverse();
        System.out.println(sb + " " + sb.length() + " " + sb.toString().charAt(0));
        Integer a = 127, b = 127, c = 128, d = 128;
        System.out.println((a == b) + " " + (c == d) + " " + c.equals(d));
        ArrayList<Double> ds = new ArrayList<>(List.of(1.5, 2.0));
        System.out.println(ds);
        System.out.println(list.get(5));
    }
}
