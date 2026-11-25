public class Main {
    public static void main(String[] args) {
        char c = 'a';
        System.out.println(c);
        System.out.println(c + 1);
        System.out.println((char) (c + 1));
        c++;
        System.out.println(c);
        c += 2;
        System.out.println(c);
        char d = 65;
        System.out.println(d);
        System.out.println('a' + 'b');
        System.out.println("" + 'a' + 'b');
        System.out.println('a' + "b");
        int n = 'z' - 'a';
        System.out.println(n);
        String s = "Hello";
        for (int i = 0; i < s.length(); i++) {
            char ch = s.charAt(i);
            System.out.print(ch);
            System.out.print((int) ch);
            System.out.print(' ');
        }
        System.out.println();
        System.out.println(Character.isDigit('5') + " " + Character.isLetter('x') + " " + Character.toUpperCase('q') + " " + (char) ('0' + 7));
        char[] cs = {'d', 'a', 'c'};
        System.out.println(cs);
        System.out.println(cs.length);
        System.out.println(c == 'f');
        System.out.println(c < 'g');
    }
}
