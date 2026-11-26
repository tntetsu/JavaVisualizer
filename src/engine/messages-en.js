/**
 * messages-en.js — エラーメッセージの英語表示（ADR-006）
 *
 * エンジンは、エラーを作る場所で日本語の説明と、本物の Java（javac・JVM）の英語の文面を対にして持つ
 * （JavaCompileError.javac など）。エラーを作るときに、表示する日本語のメッセージと英語のメッセージをここに登録し、
 * 画面が英語表示のとき、言語プロファイルの localizeError が引く。
 *
 * | 種類 | 日本語 | 英語 |
 * |---|---|---|
 * | 構文エラー | 構文エラー（3行目）: 文の終わりに「;」がありません | Syntax error (line 3): ';' expected |
 * | コンパイルエラー | コンパイルエラー（4行目）: double の値を int の変数に… | Compile error (line 4): incompatible types: possible lossy conversion from double to int |
 * | 実行時の例外 | 実行時エラー（5行目）: 整数を 0 で割りました。java.lang.ArithmeticException: / by zero | Exception in thread "main" java.lang.ArithmeticException: / by zero (line 5) |
 */

/** 日本語のメッセージ → 英語のメッセージ（同じ実行で作ったエラーを引く。大きくなりすぎないよう上限を置く） */
const EN = new Map();
const LIMIT = 2000;

/** 表示する日本語のメッセージに、英語のメッセージを対応させる */
export function registerEnglish(ja, en) {
  if (EN.size >= LIMIT) EN.delete(EN.keys().next().value);
  EN.set(ja, en);
}

/** 日本語のメッセージに対応する英語のメッセージ（登録がなければ null） */
export function messageToEnglish(ja) {
  return EN.get(ja) ?? null;
}

/** 「まだ対応していません」の構文の名前の英語（parse.js の unsupported） */
const WHAT_EN = {
  '可変長引数（...）': 'variable-arity parameters (...)',
  'インターフェース': 'interfaces',
  '列挙型（enum）': 'enums',
  'レコード（record）': 'records',
  'ジェネリクスのクラス': 'generic classes',
  'インターフェースの実装（implements）': 'implementing interfaces (implements)',
  'ジェネリクスのメソッド': 'generic methods',
  '本体のないメソッド（abstract など）': 'methods without a body (abstract)',
  'クラスの中のクラス（内部クラス・入れ子のクラス）': 'nested and inner classes',
  'static 初期化ブロック': 'static initializers',
  '初期化ブロック': 'instance initializers',
  'ラベル付きの break・continue': 'labeled break and continue',
  'try-with-resources（try (…)）': 'try-with-resources',
  'ラベル付きの文': 'labeled statements',
  'assert 文': 'assert statements',
  'yield': 'yield',
  'メソッドの中のクラス': 'local classes',
  'switch の書き方': 'this form of switch',
  'switch 式': 'switch expressions',
  '16 進数の小数のリテラル': 'hexadecimal floating-point literals',
  '型引数つきのメソッド呼び出し': 'method calls with type arguments',
  '匿名クラス': 'anonymous classes',
  'この場所の配列の初期化子 { … }': 'an array initializer { ... } here',
  'instanceof のパターン（instanceof 型 変数）': 'instanceof patterns',
  'ラムダ式': 'lambda expressions',
  'メソッド参照（::）': 'method references (::)',
  'クラスリテラル（.class）': 'class literals (.class)',
  'ワイルドカード（?）の型引数': 'wildcard type arguments (?)',
  '本体のある enum の定数': 'enum constants with a body',
  '本体のないメソッド': 'methods without a body',
};

/** 「まだ対応していません」の構文の名前を英語にする（表にない名前は、「型「…」」などの形を読む） */
export function whatToEnglish(what) {
  if (WHAT_EN[what]) return WHAT_EN[what];
  const m = what.match(/^(型|文|式)「(.*)」$/s);
  if (m) return `${{ 型: 'type', 文: 'statement', 式: 'expression' }[m[1]]} "${m[2]}"`;
  return what;   // Lezer のノード名（英語）など
}
