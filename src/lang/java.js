/**
 * lang/java.js — Java の言語プロファイル（JSVisualizer のフロントエンドに渡す）
 *
 * JSVisualizer の src/lang/index.js の LanguageProfile の形。値の表現は ADR-002、トレースへの追加は ADR-003。
 * Phase 0 のスパイク：値の見せ方は仮のもの（Phase 3 で決める）。
 */
import { java } from '@codemirror/lang-java';
import { JavaDebugger, ExecutionError } from '../engine/java-debugger.js';
import { JDouble, JChar, JString, isArray, isList, isSet, isMap, isEntry, isObject, num, literalOf } from '../engine/values.js';
import { isClass } from '../engine/objects.js';
import { isBuiltin } from '../engine/builtins.js';
import { messageToEnglish } from '../engine/messages-en.js';
import { localizeErrorMessage } from 'js-visualizer/src/utils/error-message.js';

/**
 * エラーの表示欄の文字列を表示言語に合わせる（ADR-006）。エンジンのメッセージは日本語で作られ、
 * 英語の文面（javac・JVM と同じ）は作ったときに登録してある。登録がないもの（共通コアの「最大ステップ数を超えた」など）は、
 * JS 用の英語化に任せる
 */
export function localizeJavaError(message, lang) {
  if (lang !== 'en') return message;
  return messageToEnglish(message) ?? localizeErrorMessage(message, lang);
}

/** リストの型の名前（ArrayList<Integer>・List<String>） */
const listName = (v) => `${v.__jlist}${v.__jlistElem ? `<${v.__jlistElem}>` : ''}`;
/** 集合の型の名前（HashSet<String>） */
const setName = (v) => `${v.__jset}${v.__jsetElem ? `<${v.__jsetElem.replace(/,/g, ', ')}>` : ''}`;
/** マップの型の名前（HashMap<String, Integer>） */
const mapName = (v) => `${v.kind}${v.keyType ? `<${v.keyType}, ${v.valType}>` : ''}`;
/** 集合・リストなどの配列（ビューでは配列と同じく添字と要素で見せる） */
const isSeq = (v) => isArray(v) || isList(v) || isSet(v);

/** マップのキーの書き方（"the"・3・'a'・Color.RED。オブジェクトは型の名前だけ） */
function keyText(k) {
  if (isObject(k)) return k.__enum ? `${k.cls.name}.${k.__enum.name}` : `${k.cls.name}{…}`;
  if (isList(k) || isSet(k)) return '[…]';
  if (isArray(k)) return '{…}';
  if (isMap(k)) return '{…}';
  return literalOf(k);
}

/** Java の値の見せ方（JSVisualizer の ValueModel） */
export const javaValueModel = {
  kind(v) {
    if (v === undefined) return 'undefined';
    if (v === null) return 'none';
    switch (typeof v) {
      case 'boolean': return 'bool';
      case 'number':
      case 'bigint':  return 'number';
      case 'function': return 'native';
    }
    if (v instanceof JDouble) return 'number';
    if (v instanceof JChar || v instanceof JString) return 'string';
    if (isObject(v) && v.__enum) return 'string';   // enum の定数は Color.GREEN と 1 語で書く（ADR-008）
    if (v.__type__ === 'JSFunction') return 'function';   // 呼び出し先のメソッド（ADR-003 追記）
    if (v.__type__ === 'JLambda') return 'function';      // ラムダ式・メソッド参照（ƒ x -> x * 2。ADR-010）
    // ストリーム・Collector は中身を見せず、型の名前を 1 語で書く（enum の定数と同じ扱い）。Optional は中の値を持つ箱（ADR-011）
    if (v.__type__ === 'JStream' || v.__type__ === 'JCollector') return 'string';
    if (v.__type__ === 'JOptional') return 'object';
    if (isClass(v) || isBuiltin(v)) return 'other';
    if (isSeq(v)) return 'sequence';   // ArrayList・HashSet も配列のビューで見せる（ADR-007・ADR-009）
    if (isMap(v)) return 'mapping';    // HashMap は辞書として見せる（ADR-009）
    if (isEntry(v)) return 'object';   // Map.Entry は key と value を持つオブジェクト
    if (isObject(v)) return 'object';
    return 'other';
  },
  numberValue: (v) => num(v),
  literal(v) {
    if (v === undefined) return 'void';
    if (isObject(v) && v.__enum) return `${v.cls.name}.${v.__enum.name}`;
    if (v?.__type__ === 'JStream') return v.kind;
    if (v?.__type__ === 'JCollector') return 'Collector';
    if (isClass(v) || isBuiltin(v)) return v.name;
    return literalOf(v);
  },
  entries(v) {
    if (isSeq(v)) return v.map((x, i) => [i, x]);
    if (isMap(v)) return v.entries.map(e => [keyText(e.key), e.value]);
    if (isEntry(v)) return [['key', v.key], ['value', v.value]];
    if (v.__type__ === 'JOptional') return v.present ? [['value', v.value]] : [];
    if (isObject(v)) return Object.entries(v.fields);
    return [];
  },
  length(v) {
    if (isSeq(v)) return v.length;
    if (isMap(v)) return v.entries.length;
    if (isEntry(v)) return 2;
    if (v.__type__ === 'JOptional') return v.present ? 1 : 0;
    if (isObject(v)) return Object.keys(v.fields).length;
    return 0;
  },
  // メモリのビューで、String をヒープの箱として置く（== が同じオブジェクトかを比べることが見える。ADR-002 追記）
  onHeap: (v) => v instanceof JString,
  label(v) {
    if (v instanceof JString) return 'String';
    if (isList(v)) return `${listName(v)}(${v.length})`;   // ArrayList<Integer>(3)。配列の int[3] と書き分ける
    if (isSet(v)) return `${setName(v)}(${v.length})`;
    if (isMap(v)) return `${mapName(v)}(${v.entries.length})`;
    if (isEntry(v)) return 'Map.Entry';
    if (v.__type__ === 'JOptional') return v.kind;
    if (isArray(v)) return `${v.__jelem ?? '?'}[${v.length}]`;
    if (isObject(v)) return v.cls.name;
    return 'Object';
  },
  shortLabel(v) {
    if (isList(v)) return listName(v);
    if (isSet(v)) return setName(v);
    if (isMap(v)) return mapName(v);
    if (isEntry(v)) return 'Map.Entry';
    if (v.__type__ === 'JOptional') return v.kind;
    if (isArray(v)) return `${v.__jelem ?? '?'}[]`;
    if (isObject(v)) return v.cls.name;
    return 'Object';
  },
  brackets(v) {
    if (isList(v) || isSet(v)) return ['[', ']'];   // リスト・集合は toString と同じ [1, 2, 3]（配列の {1, 2, 3} と書き分ける。ADR-007）
    if (isMap(v)) return ['{', '}'];
    if (isEntry(v)) return ['Entry{', '}'];
    if (v.__type__ === 'JOptional') return [`${v.kind}[`, ']'];
    if (isArray(v)) return ['{', '}'];   // Java の配列の初期化子の書き方
    if (isObject(v)) return [`${v.cls.name}{`, '}'];
    return ['{', '}'];
  },
  padMapping: false,
  emptyText: (v) => (v?.__type__ === 'JOptional' ? `${v.kind}.empty` : null),
};

/**
 * Java の言語プロファイルを作る。
 * @param {Object<string, {label: string, code: string}>} samples 組み込みサンプル（ビルドでは samples/*.java と samples.json から作る）
 * @param {{ groups?: {label: string, keys: string[]}[], defaultSample?: string }} [opts]
 * @returns {import('js-visualizer/src/lang/index.js').LanguageProfile}
 */
export const createJavaProfile = (samples, { groups, defaultSample } = {}) => ({
  id: 'java',
  name: 'Java',
  Debugger: JavaDebugger,
  ExecutionError,
  editorExtension: () => java(),
  supportsInput: true,
  localizeError: localizeJavaError,
  inputText: {
    ja: { label: '入力（Scanner で読みます。空白や改行で区切ります）', placeholder: '例：\n3\n10 20 30' },
    en: { label: 'Input (read with Scanner; separate values with spaces or new lines)', placeholder: 'e.g.\n3\n10 20 30' },
  },   // 入力欄を出し、実行時に { stdin } を渡す（Scanner。ADR-005）
  samples,
  sampleGroups: groups ?? [{ label: '─ Samples ─', keys: Object.keys(samples) }],
  defaultSample: defaultSample ?? Object.keys(samples)[0],
  // 拡張 for の各回（LoopBinding）・catch（CatchBinding）・switch の case（CaseMatch）・フィールドの初期化でも行を作る（ADR-003）
  traceRowTypes: {
    enter: ['ExpressionStatement', 'IfStatement', 'SwitchStatement', 'BreakStatement', 'ContinueStatement'],
    exit:  ['VariableDeclaration', 'AssignmentExpression', 'UpdateExpression', 'ReturnStatement', 'ThrowStatement', 'CallExpression',
      'LoopBinding', 'CatchBinding', 'CaseMatch', 'FieldDeclaration'],
  },
  // 変数の宣言の型（コールスタック・メモリのビューで int x と表示する）。エンジンがフレームに持たせた表を引く。
  // グローバル（static フィールド Main.count）は、どのフレームにもある globalTypes を引く
  varType: (name, frame, callStack) => (frame ? frame.varTypes?.[name] : callStack?.[0]?.globalTypes?.[name]) ?? null,
  // グローバルのスコープには static フィールド（Main.count）だけを置くので、見出しを static にし、ないときは出さない
  globalScope: { label: 'static', hideEmpty: true },
  // 制御フローのビュー：クラスの中のメソッドを描き、switch を case ごとの分岐として描く（JSVisualizer の ADR-055 追記）
  controlFlow: { classMethods: true, switchCases: true },
  valueModel: javaValueModel,
  // コード表示の色分け。先頭の 2 つは HTML エスケープの前に順に当てる。文字列を先にして、文字列の中の // をコメントにしない
  // （コメントの中の "…" は文字列の色になる。ADR-006）
  syntaxTokens: [
    { cls: 'tok-string',  re: /("""[\s\S]*?"""|"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*')/g },
    { cls: 'tok-comment', re: /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)/g },
    { cls: 'tok-number',  re: /\b(0[xX][0-9a-fA-F_]+[lL]?|0[bB][01_]+[lL]?|\d[\d_]*(?:\.\d[\d_]*)?(?:[eE][+-]?\d+)?[lLfFdD]?)\b/g },
    { cls: 'tok-keyword', re: /\b(public|private|protected|static|final|abstract|class|extends|implements|interface|enum|record|new|return|if|else|while|do|for|switch|case|default|break|continue|try|catch|finally|throw|throws|this|super|null|true|false|void|int|long|short|byte|double|float|char|boolean|var|import|package|instanceof|yield)\b/g },
    { cls: 'tok-keyword', re: /(@[A-Za-z]\w*)/g },
  ],
});
