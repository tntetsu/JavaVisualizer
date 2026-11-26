import java.util.*;

public class Main {
    public static void main(String[] args) {
        List<Shape> shapes = new ArrayList<>();
        shapes.add(new Circle(1.0));
        shapes.add(new Rect(2, 3));
        shapes.add(new Square(2));
        double total = 0;
        for (Shape s : shapes) {
            System.out.println(s.name() + " " + s.area() + " " + s.describe());
            total += s.area();
        }
        System.out.println("total " + total + " sides " + Shape.SIDES_UNKNOWN);
        Shape first = shapes.get(0);
        if (first instanceof Circle c && c.r > 0.5) {
            System.out.println("circle r=" + c.r);
        }
        System.out.println(first instanceof Shape);
        System.out.println(shapes.get(2) instanceof Rect);
        List<Student> students = new ArrayList<>();
        students.add(new Student("Carol", 78));
        students.add(new Student("Alice", 92));
        students.add(new Student("Bob", 85));
        Collections.sort(students);
        System.out.println(students);
        System.out.println(Collections.max(students) + " " + students.get(0).compareTo(students.get(1)));
        Greeter g = new Polite();
        System.out.println(g.greet("Ann") + " " + Greeter.version());
    }
}

interface Shape {
    int SIDES_UNKNOWN = -1;

    double area();

    String name();

    default String describe() {
        return name() + " with area " + area();
    }
}

abstract class Polygon implements Shape {
    abstract int sides();

    public String name() {
        return "polygon" + sides();
    }
}

class Circle implements Shape {
    double r;

    Circle(double r) {
        this.r = r;
    }

    public double area() {
        return 3.0 * r * r;
    }

    public String name() {
        return "circle";
    }
}

class Rect extends Polygon {
    int w, h;

    Rect(int w, int h) {
        this.w = w;
        this.h = h;
    }

    int sides() {
        return 4;
    }

    public double area() {
        return w * h;
    }
}

class Square extends Rect {
    Square(int s) {
        super(s, s);
    }

    @Override
    public String name() {
        return "square";
    }
}

class Student implements Comparable<Student> {
    String name;
    int score;

    Student(String name, int score) {
        this.name = name;
        this.score = score;
    }

    public int compareTo(Student other) {
        return other.score - score;
    }

    public String toString() {
        return name + ":" + score;
    }
}

interface Greeter {
    String greet(String who);

    static String version() {
        return "v1";
    }
}

class Polite implements Greeter {
    public String greet(String who) {
        return "Hello, " + who;
    }
}
