import java.io.BufferedReader;
import java.io.InputStreamReader;

/**
 * FormatEcho.java — 書式と小数の表示を本物の Java で求める（tests/format.test.js が使う）
 *
 * 標準入力の各行「書式<TAB>値のビット列（16 進の long）」について、書式が "toString" なら Double.toString(値)、
 * そうでなければ String.format(書式, 値) を 1 行ずつ出力する。
 */
public class FormatEcho {
    public static void main(String[] args) throws Exception {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        StringBuilder out = new StringBuilder();
        String line;
        while ((line = in.readLine()) != null) {
            String[] parts = line.split("\t");
            double v = Double.longBitsToDouble(Long.parseUnsignedLong(parts[1], 16));
            out.append(parts[0].equals("toString") ? Double.toString(v) : String.format(parts[0], v)).append('\n');
        }
        System.out.print(out);
    }
}
