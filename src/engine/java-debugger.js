/**
 * java-debugger.js — JavaDebugger
 *
 * 共通コアの TraceDebugger の派生クラス。プログラムを最後まで実行してトレースを作り、ステップ操作
 * （stepIn/Over/Out/Back・humanStep・continue）は TraceDebugger のものを使う。humanStep の停止点は
 * JAVA_NODE_CATEGORIES で決まる。
 */
import { TraceDebugger, ExecutionError, finalizePartialTrace } from 'js-interpreter/core';
import { parse } from './parse.js';
import { check } from './check.js';
import { evaluate, createRecorder, createRuntime, buildClasses } from './interpreter.js';
import { JavaError, JavaCompileError } from './values.js';
import { toJavaException, throwableString } from './objects.js';
import { resetRandom } from './builtins.js';
import { registerEnglish } from './messages-en.js';

/**
 * Java のノード型の役割（共通コアの NodeCategories）。ADR-003
 * - 宣言・代入・++/--・return・throw の exit、拡張 for の各回（LoopBinding）、catch（CatchBinding）、
 *   switch の当てはまった case（CaseMatch）、フィールドの初期化（FieldDeclaration）で止まる
 * - コンストラクタの呼び出し（new）も、メソッドの呼び出しと同じく、入る・本体の最初の文・出るで止まる
 */
export const JAVA_NODE_CATEGORIES = Object.freeze({
  stopOnExit: ['VariableDeclaration', 'AssignmentExpression', 'UpdateExpression', 'ReturnStatement', 'ThrowStatement',
    'LoopBinding', 'CatchBinding', 'CaseMatch', 'FieldDeclaration'],
  call:       ['CallExpression', 'NewExpression', 'LambdaCall'],   // LambdaCall：forEach などがラムダ式を呼ぶ 1 回（ADR-010）
  block:      ['BlockStatement'],
  branch:     ['IfStatement', 'ConditionalExpression'],
  condLoop:   ['WhileStatement', 'DoWhileStatement'],
  forLoop:    ['ForStatement'],
  forInit:    ['VariableDeclaration'],
  exprStmt:   ['ExpressionStatement'],
});

/** よく出る実行時の例外の、初学者向けの説明（Phase 3 で messages-en.js と合わせて整える） */
const EXCEPTION_HINTS = {
  ArithmeticException: '整数を 0 で割りました',
  ArrayIndexOutOfBoundsException: '配列の範囲の外の添字を使いました',
  StringIndexOutOfBoundsException: '文字列の範囲の外の位置を使いました',
  NullPointerException: 'null（何も指していない参照）のフィールドやメソッドを使いました',
  NumberFormatException: '数として読めない文字列を数に変換しようとしました',
  NegativeArraySizeException: '配列の長さに負の数を指定しました',
  ClassCastException: 'その型には変換（キャスト）できません',
  StackOverflowError: 'メソッドの呼び出しが深くなりすぎました（再帰が止まっていない可能性があります）',
  InputMismatchException: '入力欄の値を、読もうとした型（int など）として読めませんでした',
  NoSuchElementException: '入力欄に、読む値（行）がもうありません',
};

/** 捕まえられなかった例外のメッセージ（日本語の説明＋Java の表示）。detail はエンジンが作った具体的な説明（NullPointerException） */
function uncaughtMessage(exc, loc, detail = null) {
  const hint = detail ?? EXCEPTION_HINTS[exc.cls.name];
  const where = loc ? `（${loc.line}行目）` : '';
  return `実行時エラー${where}: ${hint ? `${hint}。` : ''}${throwableString(exc)}`;
}

/**
 * Java のソースを実行してトレースを作る。
 * @param {string} source
 * @param {{ maxSteps?: number, stdin?: string }} [options] stdin：Scanner が読む入力欄の内容（ADR-005）
 * @returns {{ ast, trace, consoleLogs }}
 * @throws {JavaSyntaxError|JavaCompileError|ExecutionError}
 */
export function runJava(source, { maxSteps = 100_000, stdin = '' } = {}) {
  const ast = parse(source);
  const classes = buildClasses(ast);
  check(ast, classes);
  resetRandom();
  const recorder = createRecorder(maxSteps);
  const rt = createRuntime(recorder, classes, { stdin });
  try {
    evaluate(ast, rt.global, rt, 0, 0);
  } catch (e) {
    let err = e;
    if (e instanceof RangeError && /call stack|too much recursion/i.test(e.message)) {
      err = new JavaError('StackOverflowError', null, recorder.trace[recorder.trace.length - 1]?.loc);
    }
    // コンパイルエラー（実行してから見つかったもの）は、ソースの誤りとして扱う
    if (err instanceof JavaCompileError) throw err;
    const exc = err instanceof RangeError ? null : toJavaException(err);
    if (exc) {
      const wrapped = new Error(uncaughtMessage(exc, err.loc, err.hint ?? null));
      // 英語表示：本物の JVM と同じ 1 行に、行番号を添える（ADR-006）
      registerEnglish(wrapped.message, `Exception in thread "main" ${throwableString(exc)}${err.loc ? ` (line ${err.loc.line})` : ''}`);
      wrapped.javaException = throwableString(exc);
      wrapped.javaClass = exc.cls.qualifiedName;
      err = wrapped;
    }
    throw new ExecutionError(err, source, finalizePartialTrace(recorder.trace), ast, recorder.consoleLogs);
  }
  return { ast, trace: recorder.trace, consoleLogs: recorder.consoleLogs };
}

export class JavaDebugger extends TraceDebugger {
  static nodeCategories = JAVA_NODE_CATEGORIES;

  /**
   * @param {string} source
   * @param {{ maxSteps?: number }} [options]
   */
  constructor(source, options = {}) {
    const maxSteps = options.maxSteps ?? 100_000;
    const { ast, trace, consoleLogs } = runJava(source, { maxSteps, stdin: options.stdin ?? '' });
    super({ source, trace, ast, consoleLogs, maxSteps });
  }
}

export { ExecutionError };
