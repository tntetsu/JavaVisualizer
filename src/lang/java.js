/**
 * lang/java.js — Java の言語プロファイル（JSVisualizer のフロントエンドに渡す）
 *
 * JSVisualizer の src/lang/index.js の LanguageProfile の形。値の表現は ADR-002、トレースへの追加は ADR-003。
 * Phase 0 のスパイク：値の見せ方は仮のもの（Phase 3 で決める）。
 */
import { java } from '@codemirror/lang-java';
import { JavaDebugger, ExecutionError } from '../engine/java-debugger.js';
import { JDouble, JChar, JString, isArray, isObject, num, literalOf } from '../engine/values.js';
import { isClass } from '../engine/objects.js';
import { isBuiltin } from '../engine/builtins.js';

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
    if (isArray(v)) return 'sequence';
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
    if (isArray(v)) return v.map((x, i) => [i, x]);
    if (isObject(v)) return Object.entries(v.fields);
    return [];
  },
  length(v) {
    if (isArray(v)) return v.length;
    if (isObject(v)) return Object.keys(v.fields).length;
    return 0;
  },
  // メモリのビューで、String をヒープの箱として置く（== が同じオブジェクトかを比べることが見える。ADR-002 追記）
  onHeap: (v) => v instanceof JString,
  label(v) {
    if (v instanceof JString) return 'String';
    if (isArray(v)) return `${v.__jelem ?? '?'}[${v.length}]`;
    if (isObject(v)) return v.cls.name;
    return 'Object';
  },
  shortLabel(v) {
    if (isArray(v)) return `${v.__jelem ?? '?'}[]`;
    if (isObject(v)) return v.cls.name;
    return 'Object';
  },
  brackets(v) {
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
  syntaxTokens: [
    { cls: 'tok-comment', re: /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)/g },
    { cls: 'tok-string',  re: /("""[\s\S]*?"""|"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*')/g },
    { cls: 'tok-number',  re: /\b(\d+(?:\.\d+)?[lLfFdD]?)\b/g },
    { cls: 'tok-keyword', re: /\b(public|private|protected|static|final|class|extends|implements|interface|new|return|if|else|while|do|for|switch|case|default|break|continue|try|catch|finally|throw|throws|this|super|null|true|false|void|int|long|short|byte|double|float|char|boolean|var|import|package|instanceof)\b/g },
  ],
});
