/**
 * lang/java.js — Java の言語プロファイル（JSVisualizer のフロントエンドに渡す）
 *
 * JSVisualizer の src/lang/index.js の LanguageProfile の形。値の表現は ADR-002、トレースへの追加は ADR-003。
 * Phase 0 のスパイク：値の見せ方は仮のもの（Phase 3 で決める）。
 */
import { java } from '@codemirror/lang-java';
import { JavaDebugger, ExecutionError } from '../engine/java-debugger.js';
import { JDouble, JChar, JString, isArray, isList, isObject, num, literalOf } from '../engine/values.js';
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
    if (v.__type__ === 'JSFunction') return 'function';   // 呼び出し先のメソッド（ADR-003 追記）
    if (isClass(v) || isBuiltin(v)) return 'other';
    if (isArray(v) || isList(v)) return 'sequence';   // ArrayList も配列のビューで見せる（ADR-007）
    if (isObject(v)) return 'object';
    return 'other';
  },
  numberValue: (v) => num(v),
  literal(v) {
    if (v === undefined) return 'void';
    if (isClass(v) || isBuiltin(v)) return v.name;
    return literalOf(v);
  },
  entries(v) {
    if (isArray(v) || isList(v)) return v.map((x, i) => [i, x]);
    if (isObject(v)) return Object.entries(v.fields);
    return [];
  },
  length(v) {
    if (isArray(v) || isList(v)) return v.length;
    if (isObject(v)) return Object.keys(v.fields).length;
    return 0;
  },
  // メモリのビューで、String をヒープの箱として置く（== が同じオブジェクトかを比べることが見える。ADR-002 追記）
  onHeap: (v) => v instanceof JString,
  label(v) {
    if (v instanceof JString) return 'String';
    if (isList(v)) return `${listName(v)}(${v.length})`;   // ArrayList<Integer>(3)。配列の int[3] と書き分ける
    if (isArray(v)) return `${v.__jelem ?? '?'}[${v.length}]`;
    if (isObject(v)) return v.cls.name;
    return 'Object';
  },
  shortLabel(v) {
    if (isList(v)) return listName(v);
    if (isArray(v)) return `${v.__jelem ?? '?'}[]`;
    if (isObject(v)) return v.cls.name;
    return 'Object';
  },
  brackets(v) {
    if (isList(v)) return ['[', ']'];   // リストは toString と同じ [1, 2, 3]（配列の {1, 2, 3} と書き分ける。ADR-007）
    if (isArray(v)) return ['{', '}'];   // Java の配列の初期化子の書き方
    if (isObject(v)) return [`${v.cls.name}{`, '}'];
    return ['{', '}'];
  },
  padMapping: false,
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
