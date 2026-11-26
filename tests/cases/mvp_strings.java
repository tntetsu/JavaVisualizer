public class Main {
    static boolean isPalindrome(String s) {
        int i = 0, j = s.length() - 1;
        while (i < j) {
            if (s.charAt(i) != s.charAt(j)) {
                return false;
            }
            i++;
            j--;
        }
        return true;
    }

    static String reverse(String s) {
        String r = "";
        for (int i = s.length() - 1; i >= 0; i--) {
            r += s.charAt(i);
        }
        return r;
    }

    static int countVowels(String s) {
        int n = 0;
        for (char c : s.toLowerCase().toCharArray()) {
            if ("aeiou".indexOf(c) >= 0) {
                n++;
            }
        }
        return n;
    }

    public static void main(String[] args) {
        System.out.println(isPalindrome("racecar") + " " + isPalindrome("hello"));
        System.out.println(reverse("Java"));
        System.out.println(countVowels("Programming Language"));
        String csv = "apple,banana,,cherry";
        String[] parts = csv.split(",");
        System.out.println(parts.length + " " + parts[1] + " [" + parts[2] + "]");
        String sentence = "  the quick  brown fox ";
        String[] words = sentence.trim().split(" +");
        System.out.println(words.length + " " + String.join("|", words));
        StringBuilderLike sb = new StringBuilderLike();
        System.out.println("abc".compareTo("abd") < 0);
        System.out.println("Hello".replace("l", "L") + " " + "a-b-c".replace('-', '+'));
        System.out.println("x".repeat(3) + " " + "abc".contains("bc") + " " + "abc".indexOf("c", 1));
        System.out.println(String.valueOf(12) + String.valueOf(3.0) + String.valueOf(true));
        System.out.println("Java".substring(1, 3) + "Java".charAt(0) + "Java".length());
        System.out.println("ABC".toLowerCase().equals("abc") + " " + "ABC".equalsIgnoreCase("abc"));
        char c = "hello".charAt(1);
        System.out.println(c + 1);
        System.out.println((char) (c + 1));
        System.out.println(Character.isUpperCase('A') + " " + Character.toLowerCase('Q') + " " + Character.getNumericValue('7'));
        int digitSum = 0;
        for (char d : "12345".toCharArray()) {
            digitSum += d - '0';
        }
        System.out.println(digitSum);
        System.out.println("" + 1 + 2 + " " + (1 + 2) + " " + 1 + 2);
        System.out.println("a".hashCode() + " " + "b".compareTo("a"));
        System.out.println("  x ".isBlank() + " " + "".isEmpty() + " " + "Ab".startsWith("A") + " " + "Ab".endsWith("b"));
        System.out.println("%d items".formatted(3));
    }
}

class StringBuilderLike {
}
