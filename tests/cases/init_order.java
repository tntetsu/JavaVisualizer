public class Main {
    static int a = trace("Main.a", 1);

    static int trace(String what, int v) {
        System.out.println("init " + what);
        return v;
    }

    public static void main(String[] args) {
        System.out.println("main start");
        Child c = new Child();
        System.out.println(c.x + " " + c.y + " " + Child.s);
    }
}

class Base {
    int x = Main.trace("Base.x", 5);

    Base() {
        System.out.println("Base() x=" + x);
        show();
    }

    void show() {
        System.out.println("Base.show");
    }
}

class Child extends Base {
    static int s = Main.trace("Child.s", 7);
    int y = Main.trace("Child.y", 6);

    Child() {
        super();
        System.out.println("Child() y=" + y);
    }

    void show() {
        System.out.println("Child.show y=" + y);
    }
}
