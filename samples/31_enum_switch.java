public class Main {
    enum Day { MON, TUE, WED, THU, FRI, SAT, SUN }

    static String kind(Day d) {
        return switch (d) {
            case SAT, SUN -> "weekend";
            case FRI -> {
                String s = "almost";
                yield s + " weekend";
            }
            default -> "weekday";
        };
    }

    public static void main(String[] args) {
        int[] hours = new int[Day.values().length];
        for (Day d : Day.values()) {
            hours[d.ordinal()] = d.compareTo(Day.FRI) < 0 ? 8 : 0;
            System.out.println(d + " (" + d.ordinal() + "): " + kind(d));
        }
        Day today = Day.valueOf("WED");
        switch (today) {
            case MON:
                System.out.println("start");
                break;
            case WED:
                System.out.println("middle, hours = " + hours[today.ordinal()]);
                break;
            default:
                System.out.println("other");
        }
    }
}
