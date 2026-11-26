import javax.tools.JavaCompiler;
import javax.tools.ToolProvider;
import java.io.ByteArrayOutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * RunWithDebugInfo.java — プログラムを -g（変数名の情報）付きでコンパイルして、別の JVM で実行する
 *
 *   java tests/tools/RunWithDebugInfo.java <program.java> < 入力
 *
 * `java Main.java`（単一ファイルの実行）は変数名の情報なしでコンパイルするので、NullPointerException の詳しい
 * メッセージが "<local1>" になる。IDE で実行したときと同じく、変数名が入った文面を比べるために使う（tests/npe.test.js）。
 * 標準入力・標準出力・標準エラーは、そのまま子の JVM に渡す。
 */
public class RunWithDebugInfo {
    public static void main(String[] args) throws Exception {
        String code = Files.readString(Path.of(args[0]));
        String noComments = code.replaceAll("(?s)/\\*.*?\\*/", "").replaceAll("//[^\\n]*", "");
        Matcher m = Pattern.compile("\\bclass\\s+(\\w+)").matcher(noComments);
        if (!m.find()) throw new IllegalArgumentException("class が見つかりません");
        String mainClass = m.group(1);
        Path dir = Files.createTempDirectory("run-g");
        Path file = dir.resolve(mainClass + ".java");
        Files.writeString(file, code);
        JavaCompiler javac = ToolProvider.getSystemJavaCompiler();
        ByteArrayOutputStream err = new ByteArrayOutputStream();
        if (javac.run(null, null, err, "-g", "-d", dir.toString(), file.toString()) != 0) {
            System.err.print(err);
            System.exit(1);
        }
        Process p = new ProcessBuilder("java", "-cp", dir.toString(), mainClass).inheritIO().start();
        System.exit(p.waitFor());
    }
}
