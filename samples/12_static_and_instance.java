public class Main {
    public static void main(String[] args) {
        Counter a = new Counter("a");
        Counter b = new Counter("b");
        a.increment();
        a.increment();
        b.increment();
        System.out.println(a.name + ": " + a.count);
        System.out.println(b.name + ": " + b.count);
        System.out.println("total: " + Counter.total);
    }
}

class Counter {
    static int total = 0;   // クラスに 1 つだけ（すべての Counter で共有）
    String name;            // Counter ごとに 1 つ
    int count = 0;

    Counter(String name) {
        this.name = name;
    }

    void increment() {
        count++;
        total++;
    }
}
