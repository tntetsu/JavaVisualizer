import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

public class Main {
    public static void main(String[] args) {
        List<Shape> shapes = new ArrayList<>();
        shapes.add(new Circle(1.5));
        shapes.add(new Rect(2, 3));
        shapes.add(new Rect(1, 1));
        double total = 0;
        for (Shape s : shapes) {
            System.out.println(s.describe());
            total += s.area();
        }
        System.out.printf("total = %.2f%n", total);
        Collections.sort(shapes);
        System.out.println(shapes);
    }
}

interface Shape extends Comparable<Shape> {
    double area();

    String name();

    default String describe() {
        return name() + " area=" + area();
    }

    default int compareTo(Shape other) {
        return Double.compare(area(), other.area());
    }
}

class Circle implements Shape {
    double r;

    Circle(double r) {
        this.r = r;
    }

    public double area() {
        return 3.14 * r * r;
    }

    public String name() {
        return "Circle";
    }

    public String toString() {
        return "Circle(" + r + ")";
    }
}

class Rect implements Shape {
    int w, h;

    Rect(int w, int h) {
        this.w = w;
        this.h = h;
    }

    public double area() {
        return w * h;
    }

    public String name() {
        return "Rect";
    }

    public String toString() {
        return "Rect(" + w + "x" + h + ")";
    }
}
