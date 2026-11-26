public class Main {
    public static void main(String[] args) {
        Account a = new Account("Ann", 100);
        a.deposit(50);
        a.withdraw(30);
        System.out.println(a.getOwner() + " " + a.getBalance());
        SavingsAccount s = new SavingsAccount("Ben", 1000, 0.05);
        s.addInterest();
        s.withdraw(2000);
        System.out.println(s);
        Account[] list = {a, s, new Account("Cy", 7)};
        int total = 0;
        for (Account x : list) {
            total += x.getBalance();
        }
        System.out.println("total " + total + " count " + Account.count);
        Account same = a;
        same.deposit(1);
        System.out.println(a.getBalance() + " " + (same == a) + " " + a.equals(same));
        Point p1 = new Point(1, 2);
        Point p2 = new Point(1, 2);
        System.out.println((p1 == p2) + " " + p1.equals(p2) + " " + p1.distanceTo(new Point(4, 6)));
        Object o = p1;
        System.out.println(o instanceof Point);
        System.out.println(describe(3) + describe(3.0) + describe("3") + describe('3'));
    }

    static String describe(int x) { return "int "; }
    static String describe(double x) { return "double "; }
    static String describe(String x) { return "String "; }
    static String describe(char x) { return "char "; }
}

class Account {
    static int count = 0;
    private String owner;
    protected int balance;

    Account(String owner, int balance) {
        this.owner = owner;
        this.balance = balance;
        count++;
    }

    void deposit(int amount) {
        balance += amount;
    }

    boolean withdraw(int amount) {
        if (amount > balance) {
            System.out.println("insufficient: " + owner);
            return false;
        }
        balance -= amount;
        return true;
    }

    String getOwner() {
        return owner;
    }

    int getBalance() {
        return balance;
    }

    public String toString() {
        return owner + ":" + balance;
    }
}

class SavingsAccount extends Account {
    private double rate;

    SavingsAccount(String owner, int balance, double rate) {
        super(owner, balance);
        this.rate = rate;
    }

    void addInterest() {
        balance += (int) (balance * rate);
    }

    @Override
    public String toString() {
        return "Savings " + super.toString() + " rate=" + rate;
    }
}

class Point {
    private int x, y;

    Point(int x, int y) {
        this.x = x;
        this.y = y;
    }

    double distanceTo(Point other) {
        int dx = x - other.x;
        int dy = y - other.y;
        return Math.sqrt(dx * dx + dy * dy);
    }

    public boolean equals(Point other) {
        return x == other.x && y == other.y;
    }
}
