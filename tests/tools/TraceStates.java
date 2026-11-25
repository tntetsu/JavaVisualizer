import com.sun.jdi.*;
import com.sun.jdi.connect.Connector;
import com.sun.jdi.connect.LaunchingConnector;
import com.sun.jdi.event.*;
import com.sun.jdi.request.*;

import javax.tools.JavaCompiler;
import javax.tools.ToolProvider;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * TraceStates.java — 本物の Java でプログラムをステップ実行し、変数の状態の変化の列を JSON で出す
 *
 *   java tests/tools/TraceStates.java <program.java> [入力のファイル]
 *
 * PyVisualizer の tests/tools/trace_states.py に当たる。JDI（jdk.jdi）を使う：
 * 1. プログラムを javax.tools で -g（変数名の情報）を付けて一時ディレクトリにコンパイルする
 * 2. 最初のクラスの main を、デバッグ用の別の JVM で起動する
 * 3. メソッドに入ったとき・各行の実行前（行単位のステップ）・メソッドを抜けるときに、そのフレームのローカル変数（this を除く）を読み、
 *    前回から変わったものを「メソッド名:変数名=値」として順に記録する（同じ時点で変わった変数は名前の順）
 *
 * 値の書き方（tests/line-state.test.js の srepr と同じ）：int・long は 10 進、double は Double.toString、
 * char は 'a'、String は "abc"、null、配列は [1, 2]、オブジェクトは ClassName{a=1, b=2}（フィールドは名前の順、
 * 深さ 3 まで）、例外は <ArithmeticException>、JDK のクラスのオブジェクト（Scanner など）は <Scanner>。
 * 出力：{ "changes": [...], "error": null または例外のクラス名, "output": 標準出力 }
 */
public class TraceStates {
    static final String[] EXCLUDES = {"java.*", "javax.*", "jdk.*", "sun.*", "com.sun.*"};

    public static void main(String[] args) throws Exception {
        Path src = Path.of(args[0]);
        String code = Files.readString(src);
        String mainClass = firstClassName(code);

        Path dir = Files.createTempDirectory("trace-states");
        Path file = dir.resolve(mainClass + ".java");
        Files.writeString(file, code);
        JavaCompiler javac = ToolProvider.getSystemJavaCompiler();
        ByteArrayOutputStream cerr = new ByteArrayOutputStream();
        int rc = javac.run(null, null, cerr, "-g", "-d", dir.toString(), file.toString());
        if (rc != 0) {
            System.out.println("{\"changes\":[],\"error\":\"CompileError\",\"output\":" + json(cerr.toString()) + "}");
            return;
        }

        LaunchingConnector lc = Bootstrap.virtualMachineManager().defaultConnector();
        Map<String, Connector.Argument> ca = lc.defaultArguments();
        ca.get("main").setValue(mainClass);
        ca.get("options").setValue("-cp " + dir + " -Xss16m");
        VirtualMachine vm = lc.launch(ca);
        // 入力（Scanner）：対象の JVM の標準入力に書いて閉じる
        try (var in = vm.process().getOutputStream()) {
            if (args.length > 1) in.write(Files.readAllBytes(Path.of(args[1])));
        }
        EventRequestManager erm = vm.eventRequestManager();

        ExceptionRequest exr = erm.createExceptionRequest(null, false, true);   // 捕まえられなかった例外
        exr.setSuspendPolicy(EventRequest.SUSPEND_ALL);
        exr.enable();
        MethodEntryRequest men = erm.createMethodEntryRequest();
        MethodExitRequest mex = erm.createMethodExitRequest();
        for (EventRequest r : new EventRequest[]{men, mex}) {
            for (String ex : EXCLUDES) {
                if (r instanceof MethodEntryRequest m) m.addClassExclusionFilter(ex);
                else ((MethodExitRequest) r).addClassExclusionFilter(ex);
            }
            r.setSuspendPolicy(EventRequest.SUSPEND_ALL);
            r.enable();
        }

        List<String> changes = new ArrayList<>();
        // フレームの深さ → そのフレームの前回のスナップショット
        Map<Integer, Map<String, String>> prev = new HashMap<>();
        boolean stepping = false;
        String error = null;
        StringBuilder output = new StringBuilder();
        InputStream out = vm.process().getInputStream();

        EventQueue q = vm.eventQueue();
        outer:
        while (true) {
            EventSet set = q.remove();
            for (Event e : set) {
                if (e instanceof VMDeathEvent || e instanceof VMDisconnectEvent) break outer;
                if (e instanceof MethodEntryEvent me) {
                    ThreadReference t = me.thread();
                    prev.put(t.frameCount(), new HashMap<>());   // 新しい呼び出し
                    record(t, changes, prev);                     // 引数
                    if (!stepping) {
                        StepRequest sr = erm.createStepRequest(t, StepRequest.STEP_LINE, StepRequest.STEP_INTO);
                        for (String ex : EXCLUDES) sr.addClassExclusionFilter(ex);
                        sr.setSuspendPolicy(EventRequest.SUSPEND_ALL);
                        sr.enable();
                        stepping = true;
                    }
                } else if (e instanceof StepEvent se) {
                    record(se.thread(), changes, prev);
                } else if (e instanceof MethodExitEvent mx) {
                    record(mx.thread(), changes, prev);
                } else if (e instanceof ExceptionEvent ee) {
                    error = ee.exception().referenceType().name();
                }
            }
            set.resume();
        }
        output.append(new String(out.readAllBytes()));
        StringBuilder sb = new StringBuilder("{\"changes\":[");
        for (int i = 0; i < changes.size(); i++) sb.append(i > 0 ? "," : "").append(json(changes.get(i)));
        sb.append("],\"error\":").append(error == null ? "null" : json(error)).append(",\"output\":").append(json(output.toString())).append("}");
        System.out.println(sb);
    }

    /** いまのフレームのローカル変数を読み、前回から変わったものを記録する */
    static void record(ThreadReference t, List<String> changes, Map<Integer, Map<String, String>> prev) {
        try {
            StackFrame f = t.frame(0);
            String method = f.location().method().name();
            if (method.equals("<init>")) method = f.location().declaringType().name();
            if (method.equals("<clinit>")) return;
            Map<String, String> cur = new LinkedHashMap<>();
            List<LocalVariable> vars = f.visibleVariables();
            vars.sort(Comparator.comparing(LocalVariable::name));
            for (LocalVariable v : vars) cur.put(v.name(), repr(f.getValue(v), 0));
            Map<String, String> old = prev.computeIfAbsent(t.frameCount(), k -> new HashMap<>());
            for (Map.Entry<String, String> en : cur.entrySet()) {   // 同じ時点で変わった変数は名前の順
                if (!en.getValue().equals(old.get(en.getKey()))) changes.add(method + ":" + en.getKey() + "=" + en.getValue());
            }
            prev.put(t.frameCount(), cur);
        } catch (AbsentInformationException | IncompatibleThreadStateException | InvalidStackFrameException ex) {
            // 変数の情報がない（-g なしのクラス）・フレームが変わった場合は飛ばす
        }
    }

    static String repr(Value v, int depth) {
        if (v == null) return "null";
        if (v instanceof StringReference s) return quote(s.value());
        if (v instanceof CharValue c) return "'" + c.value() + "'";
        if (v instanceof DoubleValue d) return Double.toString(d.value());
        if (v instanceof FloatValue d) return Float.toString(d.value());
        if (v instanceof PrimitiveValue p) return p.toString();
        if (v instanceof ArrayReference a) {
            if (depth >= 3) return "[…]";
            StringBuilder sb = new StringBuilder("[");
            List<Value> vs = a.getValues();
            for (int i = 0; i < vs.size(); i++) sb.append(i > 0 ? ", " : "").append(repr(vs.get(i), depth + 1));
            return sb.append("]").toString();
        }
        if (v instanceof ObjectReference o) {
            ReferenceType t = o.referenceType();
            if (isThrowable(t)) return "<" + t.name().replaceFirst("^.*\\.", "") + ">";
            // JDK のクラスのオブジェクト（Scanner など）は、内部の状態を書かずに型名だけにする
            if (t.name().matches("^(java|javax|jdk|sun)\\..*")) return "<" + t.name().replaceFirst("^.*\\.", "") + ">";
            if (depth >= 3) return t.name() + "{…}";
            List<Field> fs = new ArrayList<>();
            for (Field f : t.allFields()) if (!f.isStatic()) fs.add(f);
            fs.sort(Comparator.comparing(Field::name));
            StringBuilder sb = new StringBuilder(t.name()).append("{");
            for (int i = 0; i < fs.size(); i++) sb.append(i > 0 ? ", " : "").append(fs.get(i).name()).append("=").append(repr(o.getValue(fs.get(i)), depth + 1));
            return sb.append("}").toString();
        }
        return v.toString();
    }

    static boolean isThrowable(ReferenceType t) {
        if (!(t instanceof ClassType c)) return false;
        for (ClassType k = c; k != null; k = k.superclass()) if (k.name().equals("java.lang.Throwable")) return true;
        return false;
    }

    static String quote(String s) {
        return "\"" + s.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n") + "\"";
    }

    static String json(String s) {
        StringBuilder sb = new StringBuilder("\"");
        for (char c : s.toCharArray()) {
            switch (c) {
                case '"' -> sb.append("\\\"");
                case '\\' -> sb.append("\\\\");
                case '\n' -> sb.append("\\n");
                case '\t' -> sb.append("\\t");
                case '\r' -> sb.append("\\r");
                default -> {
                    if (c < 0x20) sb.append(String.format("\\u%04x", (int) c));
                    else sb.append(c);
                }
            }
        }
        return sb.append("\"").toString();
    }

    static String firstClassName(String code) {
        String noComments = code.replaceAll("(?s)/\\*.*?\\*/", "").replaceAll("//[^\\n]*", "");
        Matcher m = Pattern.compile("\\bclass\\s+(\\w+)").matcher(noComments);
        if (!m.find()) throw new IllegalArgumentException("class が見つかりません");
        return m.group(1);
    }
}
