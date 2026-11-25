public class Main {
    static Node insert(Node tree, int value) {
        if (tree == null) {
            return new Node(value);
        }
        if (value < tree.value) {
            tree.left = insert(tree.left, value);
        } else {
            tree.right = insert(tree.right, value);
        }
        return tree;
    }

    static boolean search(Node tree, int value) {
        if (tree == null) {
            return false;
        }
        if (tree.value == value) {
            return true;
        }
        if (value < tree.value) {
            return search(tree.left, value);
        }
        return search(tree.right, value);
    }

    public static void main(String[] args) {
        Node tree = null;
        int[] values = {5, 3, 8, 1, 4};
        for (int v : values) {
            tree = insert(tree, v);
        }
        System.out.println(search(tree, 4));
    }
}

class Node {
    int value;
    Node left;
    Node right;

    Node(int value) {
        this.value = value;
    }
}
