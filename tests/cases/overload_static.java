public class Main {
    static String kind(Object o) { return "Object"; }
    static String kind(String s) { return "String"; }
    static String kind(Animal a) { return "Animal"; }
    static String kind(Dog d) { return "Dog"; }
    static String num(long x) { return "long"; }
    static String num(double x) { return "double"; }
    static String ch(int x) { return "int"; }
    static String ch(char x) { return "char"; }

    public static void main(String[] args) {
        Object o = "text";
        String s = "text";
        Animal a = new Dog();
        Dog d = new Dog();
        System.out.println(kind(o) + " " + kind(s) + " " + kind(a) + " " + kind(d) + " " + kind(null == null ? d : a));
        System.out.println(num(3) + " " + num(3L) + " " + num(3.0) + " " + num('c'));
        System.out.println(ch('a') + " " + ch(97) + " " + ch('a' + 1));
        System.out.println(a.speak() + " " + d.speak());
    }
}

class Animal {
    String speak() { return "..."; }
}

class Dog extends Animal {
    String speak() { return "woof"; }
}
