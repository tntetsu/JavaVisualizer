public class Main {
    static int created = 0;

    public static void main(String[] args) {
        Counter c1 = new Counter();
        Counter c2 = new Counter(10);
        c1.inc();
        c1.inc();
        c2.inc();
        System.out.println(c1.get() + " " + c2.get() + " " + Counter.total + " " + created);
        Shape[] shapes = {new Circle(1.0), new Rect(2, 3), new Square(2)};
        for (Shape s : shapes) {
            System.out.println(s.name() + " " + s.area() + " " + s.describe());
        }
        Point p = new Point(1, 2);
        Point q = p;
        q.x = 10;
        System.out.println(p.x + " " + (p == q) + " " + p.equals(q));
        Point r = new Point(10, 2);
        System.out.println((p == r) + " " + p.equals(r));
        System.out.println(p);
        System.out.println(add(1, 2) + " " + add(1.5, 2) + " " + add("a", "b") + " " + add(1, 2, 3));
        System.out.println(new Rect(1, 1) instanceof Shape);
        Shape sh = new Square(3);
        System.out.println(sh instanceof Rect);
        System.out.println(((Rect) sh).w);
    }

    static int add(int a, int b) { return a + b; }
    static double add(double a, double b) { return a + b; }
    static String add(String a, String b) { return a + b; }
    static int add(int a, int b, int c) { return a + b + c; }
}

class Counter {
    static int total = 0;
    private int count;

    Counter() {
        this(0);
    }

    Counter(int start) {
        count = start;
        Main.created++;
    }

    void inc() {
        count++;
        total++;
    }

    int get() {
        return count;
    }
}

class Shape {
    String name() { return "shape"; }
    double area() { return 0; }
    String describe() { return name() + " with area " + area(); }
}

class Circle extends Shape {
    double r;
    Circle(double r) { this.r = r; }
    String name() { return "circle"; }
    double area() { return 3.0 * r * r; }
}

class Rect extends Shape {
    int w, h;
    Rect(int w, int h) { this.w = w; this.h = h; }
    String name() { return "rect"; }
    double area() { return w * h; }
}

class Square extends Rect {
    Square(int side) { super(side, side); }
    String name() { return "square(" + super.name() + ")"; }
}

class Point {
    int x, y;
    Point(int x, int y) { this.x = x; this.y = y; }
    public String toString() { return "Point(" + x + ", " + y + ")"; }
}
