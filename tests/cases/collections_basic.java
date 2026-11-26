import java.util.*;

public class Main {
    static int sum(List<Integer> xs) {
        int s = 0;
        for (int x : xs) {
            s += x;
        }
        return s;
    }

    static ArrayList<String> words(String text) {
        ArrayList<String> out = new ArrayList<>();
        for (String w : text.split(" ")) {
            if (!w.isEmpty()) {
                out.add(w.toLowerCase());
            }
        }
        return out;
    }

    public static void main(String[] args) {
        ArrayList<Integer> nums = new ArrayList<>();
        for (int i = 1; i <= 5; i++) {
            nums.add(i * i);
        }
        System.out.println(nums + " sum=" + sum(nums) + " size=" + nums.size());
        nums.remove(Integer.valueOf(9));
        nums.remove(0);
        nums.add(0, 100);
        nums.set(nums.size() - 1, -1);
        System.out.println(nums + " " + nums.contains(100) + " " + nums.indexOf(16) + " " + nums.get(1));
        Collections.sort(nums);
        System.out.println(nums + " max=" + Collections.max(nums) + " min=" + Collections.min(nums));
        Collections.reverse(nums);
        System.out.println(nums);
        List<String> ws = words("The quick  brown THE fox");
        System.out.println(ws + " " + Collections.frequency(ws, "the"));
        ws.sort(null);
        System.out.println(ws);
        List<Integer> fixed = List.of(3, 1, 2);
        System.out.println(fixed + " " + fixed.size() + " " + fixed.isEmpty());
        try {
            fixed.add(4);
        } catch (UnsupportedOperationException e) {
            System.out.println("immutable");
        }
        ArrayList<Integer> copy = new ArrayList<>(fixed);
        copy.add(4);
        System.out.println(copy + " " + copy.equals(List.of(3, 1, 2, 4)));
        ArrayList<Point> pts = new ArrayList<>();
        pts.add(new Point(1, 2));
        pts.add(new Point(3, 4));
        System.out.println(pts + " " + pts.contains(new Point(1, 2)));
        StringBuilder sb = new StringBuilder("ab");
        for (int i = 0; i < 3; i++) {
            sb.append(i).append(',');
        }
        sb.deleteCharAt(sb.length() - 1);
        sb.insert(0, '[').append(']');
        System.out.println(sb + " " + sb.length() + " " + sb.reverse() + " " + sb.charAt(0));
        StringBuilder sb2 = new StringBuilder();
        sb2.append(1.5).append(true).append('x').append(10L).append("s");
        sb2.setCharAt(0, '9');
        System.out.println(sb2.toString() + " " + sb2.indexOf("true"));
        Integer boxed = 42;
        int unboxed = boxed + 1;
        Integer big1 = 1000, big2 = 1000, small1 = 100, small2 = 100;
        System.out.println(unboxed + " " + (big1 == big2) + " " + big1.equals(big2) + " " + (small1 == small2) + " " + boxed.compareTo(50));
        Double dd = 2.5;
        double sumD = dd * 2;
        System.out.println(sumD + " " + dd.intValue() + " " + Integer.valueOf(7).doubleValue());
        ArrayList<Character> chars = new ArrayList<>();
        for (char c : "hello".toCharArray()) {
            if (!chars.contains(c)) {
                chars.add(c);
            }
        }
        System.out.println(chars + " " + chars.size());
        System.out.println(String.join("-", ws));
    }
}

class Point {
    int x, y;

    Point(int x, int y) {
        this.x = x;
        this.y = y;
    }

    @Override
    public boolean equals(Object o) {
        if (!(o instanceof Point)) {
            return false;
        }
        Point p = (Point) o;
        return x == p.x && y == p.y;
    }

    @Override
    public String toString() {
        return "(" + x + "," + y + ")";
    }
}
