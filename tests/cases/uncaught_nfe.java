public class Main {
    public static void main(String[] args) {
        String[] inputs = {"12", " 3", "x"};
        for (String s : inputs) {
            System.out.println(Integer.parseInt(s.trim()) * 2);
        }
    }
}
