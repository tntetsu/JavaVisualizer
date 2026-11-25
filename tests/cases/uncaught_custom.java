public class Main {
    public static void main(String[] args) {
        System.out.print("before ");
        throw new BankException("not enough money");
    }
}

class BankException extends RuntimeException {
    BankException(String m) {
        super(m);
    }
}
