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
 * 深さ 3 まで）、例外は <ArithmeticException>、enum の定数は Color.GREEN、JDK のクラスのオブジェクト（Scanner など）は <Scanner>。
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
            // JDK のクラスと、ラムダ式の裏で作られるクラス（Main$$Lambda）のフレームは記録しない（後者から JDK の中に止まることがある）
            String owner = f.location().declaringType().name();
            if (owner.matches("^(java|javax|jdk|sun|com\\.sun)\\..*") || owner.contains("$$Lambda")) return;
            String method = f.location().method().name();
            // 入れ子のクラスのコンストラクタは Main$Planet → Planet（JavaVisualizer のフレームの名前に合わせる）
            if (method.equals("<init>")) method = f.location().declaringType().name().replaceFirst("^.*[.$]", "");
            if (method.equals("<clinit>")) return;
            // ラムダ式の本体（lambda$main$0）は比べない。JDK の中から呼ばれるときに、同じ状態が 2 回記録されるなどのぶれがある（ADR-010）
            if (method.startsWith("lambda$")) return;
            // enum の values()・valueOf() はコンパイラが作るメソッドなので比べない
            if (isEnum(f.location().declaringType()) && (method.equals("values") || method.equals("valueOf"))) return;
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
            // enum の定数は Color.GREEN（型の名前は入れ子の外側を除く）
            if (isEnum(t)) return t.name().replaceFirst("^.*[.$]", "") + "." + ((StringReference) o.getValue(((ClassType) t).superclass().fieldByName("name"))).value();
            // ラッパー型（Integer など）は中の値、リスト（ArrayList・List.of）は [要素, …]、StringBuilder は StringBuilder("…")
            if (t.name().contains("$$Lambda")) return "<lambda>";   // ラムダ式・メソッド参照の値（ADR-010）
            if (t.name().startsWith("java.util.stream.")) return "<stream>";   // ストリーム（ADR-011）
            String jdk = jdkRepr(o, t, depth);
            if (jdk != null) return jdk;
            // そのほかの JDK のクラスのオブジェクト（Scanner など）は、内部の状態を書かずに型名だけにする
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

    /** JDK のクラスのうち、中身を読んで書くもの（読めなければ null） */
    static String jdkRepr(ObjectReference o, ReferenceType t, int depth) {
        String n = t.name();
        switch (n) {
            case "java.lang.Integer", "java.lang.Long", "java.lang.Short", "java.lang.Byte", "java.lang.Double",
                 "java.lang.Float", "java.lang.Character", "java.lang.Boolean" -> {
                return repr(o.getValue(t.fieldByName("value")), depth);
            }
            case "java.util.ArrayList" -> {
                int size = ((IntegerValue) o.getValue(t.fieldByName("size"))).value();
                ArrayReference data = (ArrayReference) o.getValue(t.fieldByName("elementData"));
                return listRepr(data == null ? List.of() : data.getValues(0, size), depth);
            }
            case "java.util.ImmutableCollections$ListN" -> {
                ArrayReference data = (ArrayReference) o.getValue(t.fieldByName("elements"));
                return listRepr(data.getValues(), depth);
            }
            case "java.util.ImmutableCollections$List12" -> {
                List<Value> vs = new ArrayList<>();
                vs.add(o.getValue(t.fieldByName("e0")));
                Value e1 = o.getValue(t.fieldByName("e1"));
                // List12 は要素が 1 つのとき、e1 に EMPTY（要素ではないオブジェクト）を入れている
                if (e1 instanceof ObjectReference r && r.referenceType().name().equals("java.lang.Object")) { } else vs.add(e1);
                return listRepr(vs, depth);
            }
            // マップは {キー=値, …}、集合は [要素, …]、Map.Entry は キー=値（ADR-009）。順序は本物の繰り返しの順。
            // Map.of・Set.of は本物では実行のたびに順序が変わるので、書いた文字列の順に並べる（state-changes.js と同じ）
            case "java.util.HashMap", "java.util.LinkedHashMap", "java.util.TreeMap" -> {
                return mapRepr(mapEntries(o), depth, false);
            }
            case "java.util.ImmutableCollections$MapN", "java.util.ImmutableCollections$Map1" -> {
                return mapRepr(mapEntries(o), depth, true);
            }
            // keySet()・values()・entrySet()（HashMap の中のクラス）は、元のマップ（this$0）の今の中身を書く（ADR-009）
            case "java.util.HashMap$KeySet", "java.util.HashMap$Values", "java.util.HashMap$EntrySet" -> {
                List<Value> xs = new ArrayList<>();
                for (Value[] kv : mapEntries((ObjectReference) o.getValue(fieldOf(t, "this$0")))) {
                    if (n.endsWith("KeySet")) xs.add(kv[0]);
                    else if (n.endsWith("Values")) xs.add(kv[1]);
                }
                if (n.endsWith("EntrySet")) {
                    if (depth >= 3) return "[…]";
                    List<String> items = new ArrayList<>();
                    for (Value[] kv : mapEntries((ObjectReference) o.getValue(fieldOf(t, "this$0")))) items.add(repr(kv[0], depth + 2) + "=" + repr(kv[1], depth + 2));
                    return "[" + String.join(", ", items) + "]";
                }
                return setRepr(xs, depth, false);
            }
            case "java.util.HashSet", "java.util.LinkedHashSet" -> {
                List<Value> ks = new ArrayList<>();
                for (Value[] kv : mapEntries((ObjectReference) o.getValue(fieldOf(t, "map")))) ks.add(kv[0]);
                return setRepr(ks, depth, false);
            }
            case "java.util.TreeSet" -> {
                List<Value> ks = new ArrayList<>();
                for (Value[] kv : mapEntries((ObjectReference) o.getValue(fieldOf(t, "m")))) ks.add(kv[0]);
                return setRepr(ks, depth, false);
            }
            case "java.util.ImmutableCollections$SetN" -> {
                List<Value> ks = new ArrayList<>();
                for (Value v : ((ArrayReference) o.getValue(t.fieldByName("elements"))).getValues()) if (v != null) ks.add(v);
                return setRepr(ks, depth, true);
            }
            case "java.util.ImmutableCollections$Set12" -> {
                List<Value> ks = new ArrayList<>();
                ks.add(o.getValue(t.fieldByName("e0")));
                Value e1 = o.getValue(t.fieldByName("e1"));
                if (e1 instanceof ObjectReference r && r.referenceType().name().equals("java.lang.Object")) { } else if (e1 != null) ks.add(e1);
                return setRepr(ks, depth, true);
            }
            case "java.util.HashMap$Node", "java.util.HashMap$TreeNode", "java.util.LinkedHashMap$Entry", "java.util.TreeMap$Entry", "java.util.KeyValueHolder" -> {
                if (depth >= 3) return "…=…";
                return repr(o.getValue(fieldOf(t, "key")), depth + 1) + "=" + repr(o.getValue(fieldOf(t, "value")), depth + 1);
            }
            // Optional[3]・Optional.empty・OptionalInt[3]（ADR-011）
            case "java.util.Optional" -> {
                Value v = o.getValue(t.fieldByName("value"));
                return v == null ? "Optional.empty" : "Optional[" + repr(v, depth + 1) + "]";
            }
            case "java.util.OptionalInt", "java.util.OptionalDouble" -> {
                String k = t.name().replaceFirst("^.*\\.", "");
                boolean present = ((BooleanValue) o.getValue(t.fieldByName("isPresent"))).value();
                return present ? k + "[" + repr(o.getValue(t.fieldByName("value")), depth + 1) + "]" : k + ".empty";
            }
            case "java.lang.StringBuilder" -> {
                ClassType sup = ((ClassType) t).superclass();
                ArrayReference bytes = (ArrayReference) o.getValue(sup.fieldByName("value"));
                int count = ((IntegerValue) o.getValue(sup.fieldByName("count"))).value();
                byte coder = ((ByteValue) o.getValue(sup.fieldByName("coder"))).value();
                StringBuilder sb = new StringBuilder();
                for (int i = 0; i < count; i++) {
                    if (coder == 0) sb.append((char) (((ByteValue) bytes.getValue(i)).value() & 0xff));
                    else {
                        int lo = ((ByteValue) bytes.getValue(2 * i)).value() & 0xff, hi = ((ByteValue) bytes.getValue(2 * i + 1)).value() & 0xff;
                        sb.append((char) (java.nio.ByteOrder.nativeOrder() == java.nio.ByteOrder.LITTLE_ENDIAN ? (hi << 8 | lo) : (lo << 8 | hi)));
                    }
                }
                return "StringBuilder(" + quote(sb.toString()) + ")";
            }
        }
        return null;
    }

    /** クラスとその上のクラスから、名前でフィールドを探す */
    static Field fieldOf(ReferenceType t, String name) {
        for (Field f : t.allFields()) if (f.name().equals(name)) return f;
        throw new IllegalStateException(t.name() + "." + name);
    }

    /** マップの組（キーと値）を、本物の繰り返しの順に読む */
    static List<Value[]> mapEntries(ObjectReference o) {
        List<Value[]> out = new ArrayList<>();
        ReferenceType t = o.referenceType();
        String n = t.name();
        if (n.equals("java.util.LinkedHashMap")) {
            for (Value e = o.getValue(fieldOf(t, "head")); e != null; e = ((ObjectReference) e).getValue(fieldOf(((ObjectReference) e).referenceType(), "after"))) {
                out.add(kv((ObjectReference) e));
            }
        } else if (n.equals("java.util.TreeMap")) {
            inorder((ObjectReference) o.getValue(fieldOf(t, "root")), out);
        } else if (n.equals("java.util.ImmutableCollections$Map1")) {
            out.add(new Value[] { o.getValue(fieldOf(t, "k0")), o.getValue(fieldOf(t, "v0")) });
        } else if (n.equals("java.util.ImmutableCollections$MapN")) {
            List<Value> tab = ((ArrayReference) o.getValue(fieldOf(t, "table"))).getValues();
            for (int i = 0; i < tab.size(); i += 2) if (tab.get(i) != null) out.add(new Value[] { tab.get(i), tab.get(i + 1) });
        } else {
            ArrayReference tab = (ArrayReference) o.getValue(fieldOf(t, "table"));
            if (tab != null) {
                for (Value b : tab.getValues()) {
                    for (Value e = b; e != null; e = ((ObjectReference) e).getValue(fieldOf(((ObjectReference) e).referenceType(), "next"))) {
                        out.add(kv((ObjectReference) e));
                    }
                }
            }
        }
        return out;
    }

    static Value[] kv(ObjectReference e) {
        return new Value[] { e.getValue(fieldOf(e.referenceType(), "key")), e.getValue(fieldOf(e.referenceType(), "value")) };
    }

    static void inorder(ObjectReference e, List<Value[]> out) {
        if (e == null) return;
        inorder((ObjectReference) e.getValue(fieldOf(e.referenceType(), "left")), out);
        out.add(kv(e));
        inorder((ObjectReference) e.getValue(fieldOf(e.referenceType(), "right")), out);
    }

    static String mapRepr(List<Value[]> es, int depth, boolean sort) {
        if (depth >= 3) return "{…}";
        List<String> items = new ArrayList<>();
        for (Value[] e : es) items.add(repr(e[0], depth + 1) + "=" + repr(e[1], depth + 1));
        if (sort) Collections.sort(items);
        return "{" + String.join(", ", items) + "}";
    }

    static String setRepr(List<Value> vs, int depth, boolean sort) {
        if (depth >= 3) return "[…]";
        List<String> items = new ArrayList<>();
        for (Value v : vs) items.add(repr(v, depth + 1));
        if (sort) Collections.sort(items);
        return "[" + String.join(", ", items) + "]";
    }

    static String listRepr(List<Value> vs, int depth) {
        if (depth >= 3) return "[…]";
        StringBuilder sb = new StringBuilder("[");
        for (int i = 0; i < vs.size(); i++) sb.append(i > 0 ? ", " : "").append(repr(vs.get(i), depth + 1));
        return sb.append("]").toString();
    }

    static boolean isEnum(ReferenceType t) {
        return t instanceof ClassType c && c.superclass() != null && c.superclass().name().equals("java.lang.Enum");
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
