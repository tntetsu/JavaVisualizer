import java.util.ArrayList;

public class Main {
    public static void main(String[] args) {
        ArrayList<Integer> scores = new ArrayList<>();
        scores.add(70);
        scores.add(85);
        scores.add(60);
        scores.add(1, 90);
        int total = 0;
        for (int s : scores) {
            total += s;
        }
        System.out.println(scores + " average=" + (double) total / scores.size());
        scores.remove(0);
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < scores.size(); i++) {
            if (i > 0) {
                sb.append(" / ");
            }
            sb.append(scores.get(i));
        }
        System.out.println(sb);
    }
}
