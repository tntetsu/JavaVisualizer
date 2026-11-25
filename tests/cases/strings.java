public class Main {
    public static void main(String[] args) {
        String a = "hello";
        String b = "hello";
        String c = new String("hello");
        String d = "hel";
        String e = d + "lo";
        String f = "hel" + "lo";
        System.out.println(a == b);
        System.out.println(a == c);
        System.out.println(a == e);
        System.out.println(a == f);
        System.out.println(a.equals(c) + " " + a.equals(e));
        System.out.println(e.intern() == a);
        String s = "Java Programming";
        System.out.println(s.length() + " " + s.charAt(5) + " " + s.substring(5) + " " + s.substring(0, 4) + " " + s.indexOf("a") + " " + s.lastIndexOf('a') + " " + s.indexOf("xyz"));
        System.out.println(s.toUpperCase() + " " + s.toLowerCase() + " " + s.contains("Pro") + " " + s.startsWith("Ja") + " " + s.endsWith("ing"));
        System.out.println("  trim me  ".trim() + "|" + "abc".compareTo("abd") + " " + "b".compareTo("a") + " " + "abc".compareTo("ab") + " " + "Abc".equalsIgnoreCase("aBC"));
        System.out.println("a,b,,c,,".split(",").length + " " + "x".repeat(3) + " " + "banana".replace('a', 'o') + " " + "banana".replace("an", "AN") + " " + "".isEmpty());
        System.out.println("hash " + "hello".hashCode() + " " + "".hashCode() + " " + "Aa".hashCode() + " " + "BB".hashCode());
        String t = "";
        for (int i = 0; i < 5; i++) {
            t += i;
        }
        System.out.println(t);
        System.out.println(1 + 2 + "3" + 4 + 5);
        System.out.println("x" + null);
        String n = null;
        System.out.println(n + "!");
        System.out.println(String.valueOf(3.0) + String.valueOf(true) + String.valueOf('c') + String.valueOf(42));
        System.out.println(String.join("-", "a", "b", "c"));
        System.out.println(Integer.parseInt("-123") + 1);
        System.out.println(Double.parseDouble("2.5") * 2);
        System.out.println(Integer.toString(255, 16) + " " + Integer.toBinaryString(10) + " " + Integer.toHexString(-1));
    }
}
