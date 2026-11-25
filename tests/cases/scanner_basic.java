import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        int n = sc.nextInt();
        int sum = 0;
        for (int i = 0; i < n; i++) {
            sum += sc.nextInt();
        }
        System.out.println("sum = " + sum);
        double d = sc.nextDouble();
        System.out.printf("%.2f%n", d * 2);
        String word = sc.next();
        String rest = sc.nextLine();
        String line = sc.nextLine();
        System.out.println("[" + word + "][" + rest + "][" + line + "]");
        long big = sc.nextLong();
        boolean b = sc.nextBoolean();
        System.out.println(big * 2 + " " + !b);
        while (sc.hasNextInt()) {
            System.out.print(sc.nextInt() * 10 + " ");
        }
        System.out.println();
        System.out.println(sc.hasNext() + " " + sc.next() + " " + sc.hasNextLine());
        sc.close();
    }
}
