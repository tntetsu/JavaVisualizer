public class Main {
    public static void main(String[] args) {
        Student[] students = {
            new Student("Alice", 82),
            new Student("Bob", 95),
            new Student("Carol", 78),
        };
        for (int i = 0; i < students.length - 1; i++) {
            for (int j = 0; j < students.length - 1 - i; j++) {
                if (students[j].score < students[j + 1].score) {
                    Student tmp = students[j];
                    students[j] = students[j + 1];
                    students[j + 1] = tmp;
                }
            }
        }
        for (Student s : students) {
            System.out.println(s.name + " " + s.score);
        }
    }
}

class Student {
    String name;
    int score;

    Student(String name, int score) {
        this.name = name;
        this.score = score;
    }
}
