public class Main {
    static int avg(int[] a) {
        int sum = 0;
        for (int v : a) sum += v;
        return sum / a.length;
    }

    public static void main(String[] args) {
        System.out.println(avg(new int[]{1, 2, 3}));
        System.out.println(avg(new int[0]));
        System.out.println("never");
    }
}
