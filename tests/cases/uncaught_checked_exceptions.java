public class Main {
    static int parsePositive(String s) throws InvalidInput {
        int n = Integer.parseInt(s);
        if (n <= 0) {
            throw new InvalidInput("not positive: " + n);
        }
        return n;
    }

    static int safe(String s) {
        try {
            return parsePositive(s);
        } catch (InvalidInput e) {
            System.out.println("invalid: " + e.getMessage());
            return -1;
        }
    }

    public static void main(String[] args) throws Exception {
        System.out.println(safe("5") + " " + safe("-3"));
        try {
            parsePositive("0");
        } catch (Exception e) {
            System.out.println("caught " + e);
        }
        throw new Exception("done");
    }
}

class InvalidInput extends Exception {
    InvalidInput(String message) {
        super(message);
    }
}
