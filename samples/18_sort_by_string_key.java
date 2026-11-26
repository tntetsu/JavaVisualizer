public class Main {
    public static void main(String[] args) {
        Fruit[] fruits = {
            new Fruit("banana", "yellow"),
            new Fruit("apple", "red"),
            new Fruit("cherry", "red"),
            new Fruit("blueberry", "blue"),
        };
        // 名前の辞書順に並べ替える（挿入ソート）
        for (int i = 1; i < fruits.length; i++) {
            Fruit key = fruits[i];
            int j = i - 1;
            while (j >= 0 && fruits[j].name.compareTo(key.name) > 0) {
                fruits[j + 1] = fruits[j];
                j--;
            }
            fruits[j + 1] = key;
        }
        for (Fruit f : fruits) {
            System.out.println(f.name + " (" + f.color + ")");
        }
    }
}

class Fruit {
    String name;
    String color;

    Fruit(String name, String color) {
        this.name = name;
        this.color = color;
    }
}
