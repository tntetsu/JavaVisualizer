public class Main {
    public static void main(String[] args) {
        Node n = new Node();
        System.out.println(n.next == null);
        System.out.println(n.next.value);
    }
}

class Node {
    int value;
    Node next;
}
