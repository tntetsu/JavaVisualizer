public class Main {
    public static void main(String[] args) {
        Dog d = new Dog("Rex");
        d.learn("sit");
        d.learn("roll");
        System.out.println(d.speak() + " " + d.trickCount);
        Animal a = new Animal("Generic");
        System.out.println(a.speak());
        Animal b = d;
        System.out.println(b.speak());
    }
}

class Animal {
    String name;

    Animal(String name) {
        this.name = name;
    }

    String speak() {
        return name + " makes a sound.";
    }
}

class Dog extends Animal {
    String[] tricks = new String[3];
    int trickCount = 0;

    Dog(String name) {
        super(name);
    }

    void learn(String trick) {
        tricks[trickCount] = trick;
        trickCount++;
    }

    String speak() {
        return name + " barks.";
    }
}
