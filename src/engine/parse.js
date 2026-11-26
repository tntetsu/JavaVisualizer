/**
 * parse.js — Java のソース → AST（Phase 0 スパイク）
 *
 * Lezer（@lezer/java）の構文木を、JSInterpreter・PyVisualizer と同じ流儀の AST（type 付きのプレーンオブジェクト）に変換する。
 * 意味が同じ構文は ESTree（JS）のノード型名を使い、Java 固有の構文には新しい型を足す（ADR-003）。
 *
 * 位置は JSInterpreter に合わせる：loc = {line（1 始まり）, column（1 始まり）}、
 * end = {line, column（0 始まりの終端の直後 = 1 始まりの最後の文字）}。
 * end は式にだけ付け、文には付けない（PyVisualizer の ADR-008：文に付けると、文全体がオレンジになる）。
 *
 * 型は文字列で表す（'int'・'double'・'String'・'int[]'・'Point'）。ジェネリクスの型引数は読み飛ばす
 * （ArrayList<Integer> → 'ArrayList'。開発計画書 5 節）。var は 'var'。
 */
import { parser } from '@lezer/java';
import { registerEnglish, whatToEnglish } from './messages-en.js';

/** 構文エラー（コンパイルエラーのうち、構文の誤り）。message は日本語の説明、javac は本物の javac の文面 */
export class JavaSyntaxError extends Error {
  /**
   * @param {string} message 日本語の説明
   * @param {string|null} javac 本物の javac の文面（英語表示で使う。ADR-006）
   * @param {string} [english] 英語の本文（javac の文面がないとき。まだ対応していない構文）
   */
  constructor(message, line, column, javac = null, english = null) {
    super(`構文エラー（${line}行目）: ${message}`);
    registerEnglish(this.message, `Syntax error (line ${line}): ${javac ?? english ?? message}`);
    this.name = 'SyntaxError';
    this.line = line;
    this.column = column;
    this.loc = { line, column };
    this.javac = javac;
  }
}

export class JavaUnsupportedError extends JavaSyntaxError {
  constructor(what, line, column) {
    super(`${what} はまだ対応していません`, line, column, null, `${whatToEnglish(what)} ${/s$|\)$/.test(whatToEnglish(what)) ? 'are' : 'is'} not supported yet`);
  }
}

// ── 位置 ──────────────────────────────────────────────────────────────────────

function makePosMapper(src) {
  const starts = [0];
  for (let i = 0; i < src.length; i++) if (src[i] === '\n') starts.push(i + 1);
  const lineOf = (off) => {
    let lo = 0, hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= off) lo = mid; else hi = mid - 1;
    }
    return lo;
  };
  return {
    loc(off) { const l = lineOf(off); return { line: l + 1, column: off - starts[l] + 1 }; },
    end(off) { const l = lineOf(Math.max(0, off - 1)); return { line: l + 1, column: off - starts[l] }; },
    line: (off) => lineOf(off) + 1,
  };
}

// ── 構文エラーの説明 ─────────────────────────────────────────────────────────

/** off の直前の、空白・コメントでない文字の位置 */
function prevSignificant(src, off) {
  let i = off - 1;
  for (;;) {
    while (i >= 0 && /\s/.test(src[i])) i--;
    // 行コメントの中なら、その行の // の手前へ
    const lineStart = src.lastIndexOf('\n', i) + 1;
    const slash = src.slice(lineStart, i + 1).indexOf('//');
    if (slash >= 0 && i >= 0) { i = lineStart + slash - 1; continue; }
    return i;
  }
}

/**
 * Lezer のエラーノード（最初の 1 つ）から、初学者向けの説明と javac の文面を選ぶ。
 * @returns {[string, number, string]} [説明, 行, javac の文面]
 */
function explainSyntaxError(src, err, pm) {
  const text = src.slice(err.from, err.to);
  const parent = err.parent ?? '';
  const lineOfPrev = pm.line(Math.max(0, prevSignificant(src, err.from)));
  const errLine = pm.line(err.from);
  if (text.startsWith('"')) return ['文字列の「"」が閉じていません', errLine, 'unclosed string literal'];
  if (text.startsWith("'") || parent === 'Identifier' && /'/.test(text)) {
    return ['文字（char）は「\'a\'」のように、\' \' の中に 1 文字だけ書きます（文字列は「"」で囲みます）', errLine, 'unclosed character literal'];
  }
  if (text === 'else') return ['対応する if のない else があります', errLine, "'else' without 'if'"];
  if (text === '}' && parent === 'Program') return ['「}」が多すぎます（括弧の対応を確かめてください）', errLine, 'class, interface, enum, or record expected'];
  if (err.from >= src.trimEnd().length) return ['「}」が足りません（括弧が閉じていません）', pm.line(src.trimEnd().length), 'reached end of file while parsing'];
  if (text === '==' && parent === 'VariableDeclarator') return ['変数に値を入れるときは「==」ではなく「=」を使います', errLine, "';' expected"];
  if (parent === 'IfStatement' || parent === 'WhileStatement') {
    const kw = parent === 'IfStatement' ? 'if' : 'while';
    return [`${kw} の条件は「(」と「)」で囲みます`, errLine, "'(' expected"];
  }
  if (parent === 'ArgumentList') return ['「)」が足りません（括弧が閉じていません）', lineOfPrev, "')' or ',' expected"];
  if (parent === 'ParenthesizedExpression') return ['「)」が足りません（括弧が閉じていません）', lineOfPrev, "')' expected"];
  if (err.from === err.to && /^(LocalVariableDeclaration|ExpressionStatement|ReturnStatement|BreakStatement|ContinueStatement|ThrowStatement|FieldDeclaration|DoStatement)$/.test(parent)) {
    return ['文の終わりに「;」がありません', lineOfPrev, "';' expected"];
  }
  if (parent === 'ForStatement' || parent === 'ForSpec') return ['for の書き方が正しくありません（for (初期化; 条件; 更新) の形にします）', errLine, "'(' expected"];
  return [`ここに書かれたもの${text ? `「${text.trim().slice(0, 20)}」` : ''}を読み取れません`, err.from === err.to ? lineOfPrev : errLine, 'illegal start of expression'];
}

// ── 変換 ──────────────────────────────────────────────────────────────────────

/** end を付けないノード型（文と宣言。ADR-008） */
const STATEMENT_TYPES = new Set([
  'Program', 'YieldStatement', 'ClassDeclaration', 'FieldDeclaration', 'MethodDefinition', 'BlockStatement', 'VariableDeclaration',
  'ExpressionStatement', 'IfStatement', 'WhileStatement', 'DoWhileStatement', 'ForStatement', 'ForOfStatement',
  'SwitchStatement', 'SwitchCase', 'BreakStatement', 'ContinueStatement', 'ReturnStatement', 'ThrowStatement',
  'TryStatement', 'CatchClause', 'EmptyStatement',
]);

const ESCAPES = { b: '\b', t: '\t', n: '\n', f: '\f', r: '\r', s: ' ', '"': '"', "'": "'", '\\': '\\' };

/** 文字列・文字のリテラルの中身（引用符の内側）のエスケープを解く */
function unescape(body) {
  return body.replace(/\\(u+[0-9a-fA-F]{4}|[0-7]{1,3}|.)/g, (m, e) => {
    if (e[0] === 'u') return String.fromCharCode(parseInt(e.replace(/^u+/, ''), 16));
    if (/^[0-7]/.test(e)) return String.fromCharCode(parseInt(e, 8));
    return ESCAPES[e] ?? e;
  });
}

/** テキストブロック（"""…"""）の中身：共通の字下げを取り除き、行末の空白を消す（JLS 3.10.6 の簡略版） */
function textBlockValue(raw) {
  const inner = raw.slice(3, -3).replace(/^[ \t]*\r?\n/, '');
  const lines = inner.split(/\r?\n/);
  const sig = lines.filter((l, i) => l.trim() !== '' || i === lines.length - 1);
  const indent = Math.min(...sig.map(l => l.match(/^[ \t]*/)[0].length));
  return unescape(lines.map(l => l.slice(indent).replace(/[ \t]+$/, '')).join('\n'));
}

/**
 * Java のソースを AST に変換する。
 * @param {string} src
 * @returns {object} Program
 * @throws {JavaSyntaxError}
 */
/**
 * 入れ子の型引数の閉じかっこ（Map<String, List<Integer>> m）を、@lezer/java はシフト演算子の >> として読んでしまう。
 * 型の文脈（大文字で始まる型名の < が閉じていない所）で、>> のあとに空白が続くときだけ、同じ長さの「> >」に置き換える
 * （文字の位置が変わらないので、ハイライトの位置はずれない。ADR-007）
 */
export function splitGenericClosers(src) {
  return src.replace(/>> /g, (m, off) => {
    // 同じ行の、この位置より前で閉じていない「型名<」の数（2 つ以上なら入れ子の型引数の閉じかっこ）
    const line = src.slice(src.lastIndexOf('\n', off - 1) + 1, off);
    let depth = 0;
    for (const t of line.matchAll(/[A-Z]\w*\s*<|[<>]/g)) {
      if (t[0] === '>') depth = Math.max(0, depth - 1);
      else if (t[0] !== '<') depth++;
    }
    return depth >= 2 ? '> >' : m;
  });
}

export function parse(src) {
  src = splitGenericClosers(src);
  const tree = parser.parse(src);
  const pm = makePosMapper(src);
  let firstErr = null;
  tree.iterate({ enter(n) {
    if (firstErr) return false;
    if (n.type.isError) { firstErr = { from: n.from, to: n.to, parent: n.node.parent?.name }; return false; }
    return undefined;
  } });
  if (firstErr) {
    const [msg, line, javac] = explainSyntaxError(src, firstErr, pm);
    throw new JavaSyntaxError(msg, line, 1, javac);
  }

  const text = (n) => src.slice(n.from, n.to);
  const kids = (n) => {
    const out = [];
    for (let c = n.firstChild; c; c = c.nextSibling) if (c.name !== 'LineComment' && c.name !== 'BlockComment') out.push(c);
    return out;
  };
  const child = (n, ...names) => kids(n).find(c => names.includes(c.name)) ?? null;
  const children = (n, ...names) => kids(n).filter(c => names.includes(c.name));
  const mk = (type, n, props) => ({
    type, ...props, loc: pm.loc(n.from), end: STATEMENT_TYPES.has(type) ? null : pm.end(n.to), range: [n.from, n.to],
  });
  const unsupported = (what, n) => { const p = pm.loc(n.from); throw new JavaUnsupportedError(what, p.line, p.column); };
  const qualifiedImports = [];   // 完全な名前で書いた java.util などのクラス（import したものとして数える）

  // ── 型 ──
  /** 型のノード → 型の文字列 */
  function typeOf(n) {
    switch (n.name) {
      case 'PrimitiveType': case 'TypeName': return text(n);
      case 'var': return 'var';
      case 'void': return 'void';
      case 'ScopedTypeName': qualifiedClass(n); return text(n).replace(/\s+/g, '').split('.').pop();
      case 'GenericType': {
        // ArrayList<Integer> → 'ArrayList<Integer>'、ArrayList<> → 'ArrayList<>'（型引数は静的な検査で使う。ADR-007）
        const [base, targs] = kids(n);
        const list = targs ? kids(targs).filter(c => c.name !== '<' && c.name !== '>' && c.name !== ',') : [];
        if (list.some(c => c.name === 'Wildcard')) unsupported('ワイルドカード（?）の型引数', n);
        return `${typeOf(base)}<${list.map(typeOf).join(',')}>`;
      }
      case 'ArrayType': {
        const [base, ...dims] = kids(n);
        return typeOf(base) + '[]'.repeat(dims.filter(d => d.name === 'Dimension').length);
      }
    }
    return unsupported(`型「${text(n)}」`, n);
  }
  const TYPE_NODES = ['PrimitiveType', 'TypeName', 'ScopedTypeName', 'GenericType', 'ArrayType', 'var', 'void'];
  const typeChild = (n) => child(n, ...TYPE_NODES);
  const modifiers = (n) => {
    const m = child(n, 'Modifiers');
    return m ? kids(m).map(text) : [];
  };

  // ── 宣言 ──
  function declarator(d, baseType) {
    const def = child(d, 'Definition');
    const dims = children(d, 'Dimension').length;   // int a[] の形
    const initNode = kids(d).find(c => c.name !== 'Definition' && c.name !== 'AssignOp' && c.name !== 'Dimension');
    const varType = baseType + '[]'.repeat(dims);
    return mk('VariableDeclarator', d, {
      id: mk('Identifier', def, { name: text(def) }),
      varType,
      init: initNode ? (initNode.name === 'ArrayInitializer' ? arrayInit(initNode, varType) : expr(initNode)) : null,
    });
  }

  function localVarDecl(n) {
    const mods = modifiers(n);
    const t = typeOf(typeChild(n));
    return mk('VariableDeclaration', n, {
      kind: mods.includes('final') ? 'const' : 'let',
      varType: t,
      declarations: children(n, 'VariableDeclarator').map(d => declarator(d, t)),
    });
  }

  function params(fp) {
    return children(fp, 'FormalParameter', 'SpreadParameter').map(p => {
      if (p.name === 'SpreadParameter') unsupported('可変長引数（...）', p);
      const def = child(p, 'Definition');
      return mk('Identifier', def, { name: text(def), varType: typeOf(typeChild(p)) });
    });
  }

  /**
   * クラス・インターフェース・enum の宣言（ADR-008）。クラスの中の型（入れ子の型）は static の入れ子として扱い、
   * nested に集めて、プログラムの直下の型と同じ並びに置く（outer に外側の型の名前）
   * @param {object} n Lezer のノード
   * @param {object[]} nested 入れ子の型を集める配列
   * @param {string|null} outer 外側の型の名前
   */
  function classDecl(n, nested, outer = null) {
    if (n.name === 'RecordDeclaration') return unsupported('レコード（record）', n);
    const kind = { ClassDeclaration: 'class', InterfaceDeclaration: 'interface', EnumDeclaration: 'enum' }[n.name];
    if (!kind) return unsupported(n.name, n);
    const id = child(n, 'Definition');
    const name = text(id);
    const sup = child(n, 'Superclass');
    if (child(n, 'TypeParameters')) unsupported('ジェネリクスのクラス', n);
    // implements（クラス・enum）と、インターフェースの extends
    const ifaceList = child(n, 'SuperInterfaces', 'ExtendsInterfaces');
    const interfaces = ifaceList ? kids(child(ifaceList, 'InterfaceTypeList')).filter(c => c.name !== ',').map(typeOf) : [];
    const body = child(n, 'ClassBody', 'InterfaceBody', 'EnumBody');
    const members = [];
    const constants = [];   // enum の定数
    const memberNodes = [];
    for (const m of kids(body)) {
      if (m.name === 'EnumBodyDeclarations') memberNodes.push(...kids(m));
      else memberNodes.push(m);
    }
    for (const m of memberNodes) {
      switch (m.name) {
        case '{': case '}': case ';': case ',': break;
        case 'EnumConstant': {
          if (child(m, 'ClassBody')) unsupported('本体のある enum の定数', m);
          const def = child(m, 'Definition');
          const al = child(m, 'ArgumentList');
          constants.push({ name: text(def), arguments: al ? args(al) : [], loc: pm.loc(m.from), end: pm.end(m.to) });
          break;
        }
        case 'FieldDeclaration': case 'ConstantDeclaration': {
          const mods = modifiers(m);
          const t = typeOf(typeChild(m));
          // インターフェースのフィールドは、書かなくても public static final
          const constant = m.name === 'ConstantDeclaration' || kind === 'interface';
          members.push(mk('FieldDeclaration', m, {
            static: constant || mods.includes('static'), final: constant || mods.includes('final'), modifiers: mods, varType: t,
            declarations: children(m, 'VariableDeclarator').map(d => declarator(d, t)),
          }));
          break;
        }
        case 'MethodDeclaration': case 'ConstructorDeclaration': {
          const mods = modifiers(m);
          const ctor = m.name === 'ConstructorDeclaration';
          if (child(m, 'TypeParameters')) unsupported('ジェネリクスのメソッド', m);
          const def = child(m, 'Definition');
          const bodyNode = child(m, 'Block', 'ConstructorBody');
          // 本体のないメソッドは抽象メソッド（インターフェースのメソッドは、default・static でなければ抽象）
          const isAbstract = !bodyNode;
          if (isAbstract && !(mods.includes('abstract') || kind === 'interface')) unsupported('本体のないメソッド', m);
          members.push(mk('MethodDefinition', m, {
            kind: ctor ? 'constructor' : 'method',
            static: mods.includes('static'), abstract: isAbstract, modifiers: mods,
            key: mk('Identifier', def, { name: text(def) }),
            returnType: ctor ? null : typeOf(typeChild(m)),
            throws: (() => { const t = child(m, 'Throws'); return t ? kids(t).filter(c => c.name !== 'throws' && c.name !== ',').map(typeOf) : []; })(),
            bodyEnd: bodyNode ? pm.loc(bodyNode.to - 1) : null,   // 閉じる } の位置（return の忘れの位置。javac と同じ）
            value: mk('FunctionExpression', m, {
              id: mk('Identifier', def, { name: text(def) }),
              params: params(child(m, 'FormalParameters')),
              body: bodyNode ? block(bodyNode) : null,
            }),
          }));
          break;
        }
        case 'ClassDeclaration': case 'InterfaceDeclaration': case 'EnumDeclaration': case 'RecordDeclaration':
          nested.push(classDecl(m, nested, name));
          break;
        case 'StaticInitializer': unsupported('static 初期化ブロック', m); break;
        case 'Block': unsupported('初期化ブロック', m); break;
        default: unsupported(m.name, m);
      }
    }
    const mods = modifiers(n);
    return mk('ClassDeclaration', n, {
      id: mk('Identifier', id, { name }),
      kind, outer,
      modifiers: mods,
      abstract: kind === 'interface' || mods.includes('abstract'),
      superClass: sup ? mk('Identifier', kids(sup)[1], { name: typeOf(kids(sup)[1]) }) : null,
      interfaces,
      constants,
      body: mk('ClassBody', body, { body: members }),
    });
  }

  // ── 文 ──
  function block(n) {
    return mk('BlockStatement', n, { body: kids(n).filter(c => c.name !== '{' && c.name !== '}').map(stmt) });
  }
  /** ( 式 ) の中身 */
  const parenInner = (n) => expr(child(n, 'ParenthesizedExpression'));
  const bodyStmt = (n) => {
    const ks = kids(n);
    return stmt(ks[ks.length - 1]);
  };

  function stmt(n) {
    switch (n.name) {
      case 'Block': return block(n);
      case ';': return mk('EmptyStatement', n, {});
      case 'LocalVariableDeclaration': return localVarDecl(n);
      case 'ExpressionStatement': return mk('ExpressionStatement', n, { expression: expr(kids(n)[0]) });
      case 'ExplicitConstructorInvocation': {   // super(…) / this(…)
        const k = kids(n)[0];
        const callee = k.name === 'super' ? mk('Super', k, {}) : mk('ThisExpression', k, {});
        const call = mk('CallExpression', { from: n.from, to: child(n, 'ArgumentList').to }, { callee, arguments: args(child(n, 'ArgumentList')), constructorCall: true });
        return mk('ExpressionStatement', n, { expression: call });
      }
      case 'IfStatement': {
        const ks = kids(n);
        const elseIdx = ks.findIndex(c => c.name === 'else');
        const thenNode = ks[elseIdx >= 0 ? elseIdx - 1 : ks.length - 1];
        return mk('IfStatement', n, {
          test: parenInner(n), consequent: stmt(thenNode), alternate: elseIdx >= 0 ? stmt(ks[elseIdx + 1]) : null,
        });
      }
      case 'WhileStatement': return mk('WhileStatement', n, { test: parenInner(n), body: bodyStmt(n) });
      case 'DoStatement': {
        const ks = kids(n);
        return mk('DoWhileStatement', n, { body: stmt(ks[1]), test: parenInner(n) });
      }
      case 'ForStatement': {
        const spec = child(n, 'ForSpec');
        const parts = [[]];
        for (const c of kids(spec)) {
          if (c.name === '(' || c.name === ')') continue;
          if (c.name === 'LocalVariableDeclaration') { parts[0].push(c); parts.push([]); continue; }   // 宣言は ; を含む
          if (c.name === ';') { parts.push([]); continue; }
          if (c.name !== ',') parts[parts.length - 1].push(c);
        }
        const [initN = [], testN = [], updateN = []] = parts;
        const seq = (ns) => (ns.length === 0 ? null : ns.length === 1 ? expr(ns[0])
          : mk('SequenceExpression', { from: ns[0].from, to: ns[ns.length - 1].to }, { expressions: ns.map(expr) }));
        return mk('ForStatement', n, {
          init: initN.length && initN[0].name === 'LocalVariableDeclaration' ? localVarDecl(initN[0]) : seq(initN),
          test: seq(testN), update: seq(updateN), body: bodyStmt(n),
        });
      }
      case 'EnhancedForStatement': {
        const spec = child(n, 'ForSpec');
        const def = child(spec, 'Definition');
        const ks = kids(spec);
        const colon = ks.findIndex(c => c.name === ':');
        return mk('ForOfStatement', n, {
          left: mk('Identifier', def, { name: text(def) }),
          varType: typeOf(typeChild(spec)),
          final: modifiers(spec).includes('final'),
          right: expr(ks[colon + 1]),
          body: bodyStmt(n),
        });
      }
      case 'SwitchStatement': return switchNode(n, 'SwitchStatement');
      case 'BreakStatement': case 'ContinueStatement': {
        if (child(n, 'Identifier', 'Label')) unsupported('ラベル付きの break・continue', n);
        return mk(n.name, n, { label: null });
      }
      case 'ReturnStatement': {
        const e = kids(n).find(c => c.name !== 'return' && c.name !== ';');
        return mk('ReturnStatement', n, { argument: e ? expr(e) : null });
      }
      case 'ThrowStatement': return mk('ThrowStatement', n, { argument: expr(kids(n)[1]) });
      case 'TryStatement': {
        const handlers = children(n, 'CatchClause').map(c => {
          const p = child(c, 'CatchFormalParameter');
          const def = child(p, 'Definition');
          const types = children(child(p, 'CatchType'), 'TypeName', 'ScopedTypeName').map(typeOf);
          return mk('CatchClause', c, {
            param: mk('Identifier', def, { name: text(def) }), types, body: block(child(c, 'Block')),
            head: { loc: pm.loc(c.from), end: pm.end(p.to) },
          });
        });
        const fin = child(n, 'FinallyClause');
        return mk('TryStatement', n, { block: block(child(n, 'Block')), handlers, finalizer: fin ? block(child(fin, 'Block')) : null });
      }
      case 'TryWithResourcesStatement': return unsupported('try-with-resources（try (…)）', n);
      case 'LabeledStatement': return unsupported('ラベル付きの文', n);
      case 'AssertStatement': return unsupported('assert 文', n);
      case 'YieldStatement': return mk('YieldStatement', n, { argument: expr(kids(n).find(c => c.name !== 'yield' && c.name !== ';')) });
      case 'ClassDeclaration': return unsupported('メソッドの中のクラス', n);
    }
    return unsupported(`文「${text(n).slice(0, 20)}」`, n);
  }

  /** switch（文・式）。従来の形（case 1:）と新しい形（case 1 ->）の両方を読む */
  function switchNode(n, type) {
    const sb = child(n, 'SwitchBlock');
    const cases = [];
    let arrow = false;
    let cur = null;
    for (const c of kids(sb)) {
      if (c.name === '{' || c.name === '}' || c.name === ':') continue;
      if (c.name === 'SwitchLabel') {
        const isDefault = !!child(c, 'default');
        const tests = kids(c).filter(k => k.name !== 'case' && k.name !== 'default' && k.name !== ',').map(expr);
        cur = mk('SwitchCase', c, { tests, default: isDefault, consequent: [], head: { loc: pm.loc(c.from), end: pm.end(c.to) } });
        cases.push(cur);
        continue;
      }
      if (c.name === 'SwitchRule') {
        arrow = true;
        const label = child(c, 'SwitchLabel');
        const isDefault = !!child(label, 'default');
        const tests = kids(label).filter(k => k.name !== 'case' && k.name !== 'default' && k.name !== ',').map(expr);
        const bodyN = kids(c).find(k => k.name !== 'SwitchLabel' && k.name !== '->' && k.name !== ';');
        // switch 式の「case 1 -> 10;」は値を出す式（YieldStatement と同じ扱い）。switch 文では式文
        let body;
        if (bodyN.name === 'Block' || bodyN.name === 'ThrowStatement') body = stmt(bodyN);
        else {
          const e = bodyN.name === 'ExpressionStatement' ? kids(bodyN)[0] : bodyN;
          body = type === 'SwitchExpression' ? mk('YieldStatement', bodyN, { argument: expr(e), implicit: true })
            : mk('ExpressionStatement', bodyN, { expression: expr(e) });
        }
        cases.push(mk('SwitchCase', c, { tests, default: isDefault, consequent: [body], head: { loc: pm.loc(label.from), end: pm.end(label.to) } }));
        continue;
      }
      if (!cur) unsupported('switch の書き方', c);
      cur.consequent.push(stmt(c));
    }
    return mk(type, n, { discriminant: parenInner(n), cases, arrow });
  }

  // ── 式 ──
  const args = (al) => kids(al).filter(c => c.name !== '(' && c.name !== ')' && c.name !== ',').map(expr);

  function arrayInit(n, varType) {
    const elemType = varType.endsWith('[]') ? varType.slice(0, -2) : 'Object';
    return mk('ArrayExpression', n, {
      elemType,
      elements: kids(n).filter(c => c.name !== '{' && c.name !== '}' && c.name !== ',')
        .map(c => (c.name === 'ArrayInitializer' ? arrayInit(c, elemType) : expr(c))),
    });
  }

  function literal(n) {
    const raw = text(n);
    switch (n.name) {
      case 'IntegerLiteral': {
        const isLong = /[lL]$/.test(raw);
        const digits = raw.replace(/[lL]$/, '').replace(/_/g, '');
        let big;
        if (/^0[xX]/.test(digits)) big = BigInt(digits);
        else if (/^0[bB]/.test(digits)) big = BigInt(digits);
        else if (/^0\d/.test(digits)) big = BigInt('0o' + digits.slice(1));
        else big = BigInt(digits);
        return mk('Literal', n, { jtype: isLong ? 'long' : 'int', value: big.toString(), decimal: /^[1-9]|^0$/.test(digits), raw });
      }
      case 'FloatingPointLiteral': {
        const isFloat = /[fF]$/.test(raw);
        if (/^0[xX]/.test(raw)) unsupported('16 進数の小数のリテラル', n);
        return mk('Literal', n, { jtype: isFloat ? 'float' : 'double', value: Number(raw.replace(/[fFdD]$/, '').replace(/_/g, '')), raw });
      }
      case 'BooleanLiteral': return mk('Literal', n, { jtype: 'boolean', value: raw === 'true', raw });
      case 'CharacterLiteral': {
        const v = unescape(raw.slice(1, -1));
        return mk('Literal', n, { jtype: 'char', value: v.charCodeAt(0), raw });
      }
      case 'StringLiteral': return mk('Literal', n, { jtype: 'String', value: unescape(raw.slice(1, -1)), raw });
      case 'TextBlock': return mk('Literal', n, { jtype: 'String', value: textBlockValue(raw), raw });
      case 'null': return mk('Literal', n, { jtype: 'null', value: null, raw });
    }
    return null;
  }

  /**
   * java.util.Arrays・java.lang.Math のような完全な名前を、クラス名の Identifier にまとめる（そうでなければ null）。
   * 完全な名前で書いたクラスは import が要らないので、import したものとして数える（qualifiedImports）
   */
  function qualifiedClass(n) {
    if (n.name !== 'FieldAccess' && n.name !== 'ScopedTypeName') return null;
    // java.util.function.Function・java.util.stream.Collectors も（ADR-010・011）
    const m = text(n).replace(/\s+/g, '').match(/^java\.(lang|util|io|util\.function|util\.stream)\.([A-Z]\w*)$/);
    if (!m) return null;
    qualifiedImports.push(`import java.${m[1]}.${m[2]};`);
    return mk('Identifier', n, { name: m[2], qualified: true });
  }

  function expr(n) {
    const lit = literal(n);
    if (lit) return lit;
    const q = qualifiedClass(n);
    if (q) return q;
    const ks = kids(n);
    switch (n.name) {
      case 'Identifier': return mk('Identifier', n, { name: text(n) });
      case 'this': return mk('ThisExpression', n, {});
      case 'ParenthesizedExpression': {
        const inner = expr(ks[1]);
        return { ...inner, parenthesized: true };
      }
      case 'BinaryExpression': {
        const [l, op, r] = ks;
        const o = text(op);
        if (o === '&&' || o === '||') return mk('LogicalExpression', n, { operator: o, left: expr(l), right: expr(r) });
        return mk('BinaryExpression', n, { operator: o, left: expr(l), right: expr(r) });
      }
      case 'UnaryExpression': {
        const [op, a] = ks;
        // -2147483648・-9223372036854775808L は、符号まで含めて 1 つのリテラル（JLS 3.10.1）
        if (text(op) === '-' && a.name === 'IntegerLiteral') {
          const l = literal(a);
          if (l.decimal) return { ...l, value: (-BigInt(l.value)).toString(), raw: `-${l.raw}`, loc: pm.loc(n.from), end: pm.end(n.to), range: [n.from, n.to] };
        }
        return mk('UnaryExpression', n, { operator: text(op), prefix: true, argument: expr(a) });
      }
      case 'UpdateExpression': {
        const prefix = ks[0].name === 'UpdateOp';
        const op = prefix ? ks[0] : ks[1];
        return mk('UpdateExpression', n, { operator: text(op), prefix, argument: expr(prefix ? ks[1] : ks[0]) });
      }
      case 'AssignmentExpression': {
        const [l, op, r] = ks;
        return mk('AssignmentExpression', n, { operator: text(op), left: expr(l), right: expr(r) });
      }
      case 'TernaryExpression': {
        const exprs = ks.filter(c => c.name !== 'LogicOp' && c.name !== ':');
        return mk('ConditionalExpression', n, { test: expr(exprs[0]), consequent: expr(exprs[1]), alternate: expr(exprs[2]) });
      }
      case 'MethodInvocation': {
        const nameNode = child(n, 'MethodName');
        const id = mk('Identifier', nameNode, { name: text(nameNode) });
        const dot = ks.findIndex(c => c.name === '.');
        let callee = id;
        if (dot > 0) {
          const objN = ks[dot - 1];
          const object = objN.name === 'super' ? mk('Super', objN, {}) : expr(objN);
          callee = mk('MemberExpression', { from: n.from, to: nameNode.to }, { object, property: id, computed: false });
        }
        if (child(n, 'TypeArguments')) unsupported('型引数つきのメソッド呼び出し', n);
        return mk('CallExpression', n, { callee, arguments: args(child(n, 'ArgumentList')) });
      }
      case 'FieldAccess': {
        const objN = ks[0];
        const prop = ks[ks.length - 1];
        const object = objN.name === 'super' ? mk('Super', objN, {}) : expr(objN);
        return mk('MemberExpression', n, { object, property: mk('Identifier', prop, { name: text(prop) }), computed: false });
      }
      case 'ArrayAccess': {
        const [o, , i] = ks;
        return mk('MemberExpression', n, { object: expr(o), property: expr(i), computed: true });
      }
      case 'ObjectCreationExpression': {
        if (child(n, 'ClassBody')) unsupported('匿名クラス', n);
        const t = typeChild(n);
        const full = typeOf(t);
        // callee はクラス名（型引数なし）。型引数つきの型は genericType に残す（new ArrayList<>() の <> は代入先から決まる）
        return mk('NewExpression', n, {
          callee: mk('Identifier', t, { name: full.replace(/<.*$/, '') }), genericType: full, arguments: args(child(n, 'ArgumentList')),
        });
      }
      case 'ArrayCreationExpression': {
        const base = typeOf(typeChild(n));
        const dimsN = children(n, 'Dimension');
        const sizes = dimsN.map(d => kids(d).find(c => c.name !== '[' && c.name !== ']')).filter(Boolean).map(expr);
        const totalType = base + '[]'.repeat(dimsN.length);
        const init = child(n, 'ArrayInitializer');
        return mk('NewArrayExpression', n, {
          elemType: totalType.slice(0, -2), dims: sizes, totalDims: dimsN.length,
          init: init ? arrayInit(init, totalType) : null,
        });
      }
      case 'ArrayInitializer': return unsupported('この場所の配列の初期化子 { … }', n);
      case 'CastExpression': {
        const t = typeChild(n);
        return mk('CastExpression', n, { targetType: typeOf(t), argument: expr(ks[ks.length - 1]) });
      }
      case 'InstanceofExpression': {
        const pat = child(n, 'TypePattern');
        if (pat) {
          // o instanceof String s（Java 16 以降）：当てはまれば s に入れる（ADR-008）
          const def = child(pat, 'Definition');
          return mk('InstanceofExpression', n, {
            expression: expr(ks[0]), targetType: typeOf(typeChild(pat)), binding: mk('Identifier', def, { name: text(def) }),
          });
        }
        return mk('InstanceofExpression', n, { expression: expr(ks[0]), targetType: typeOf(ks[2]) });
      }
      case 'SwitchExpression': return switchNode(n, 'SwitchExpression');
      case 'LambdaExpression': {
        // x -> …・(a, b) -> …・(int a, int b) -> { … }（ADR-010）。ESTree の ArrowFunctionExpression と同じ項目（params・body・expression）だが、型の名前は Java の LambdaExpression にする（画面の制御フローのビューが、変数に入れたアロー関数だけを別の関数として描くため）
        const head = ks[0], bodyN = ks[ks.length - 1];
        let ps;
        if (head.name === 'Definition') ps = [mk('Identifier', head, { name: text(head), varType: null })];
        else if (head.name === 'InferredParameters') ps = children(head, 'Definition').map(d => mk('Identifier', d, { name: text(d), varType: null }));
        else ps = params(head);
        const isBlock = bodyN.name === 'Block';
        return mk('LambdaExpression', n, {
          params: ps, body: isBlock ? block(bodyN) : expr(bodyN), expression: !isBlock, text: text(n).replace(/\s+/g, ' '),
        });
      }
      case 'MethodReference': {
        // Integer::sum・String::length・System.out::println・Main::isEven・Point::new（ADR-010）
        const [objN] = ks;
        const last = ks[ks.length - 1];
        const object = objN.name === 'TypeName' ? mk('Identifier', objN, { name: text(objN) }) : expr(objN);
        if (child(n, 'TypeArguments')) unsupported('型引数つきのメソッド参照', n);
        return mk('MethodReference', n, { object, name: last.name === 'new' ? 'new' : text(last), text: text(n).replace(/\s+/g, '') });
      }
      case 'ClassLiteral': return unsupported('クラスリテラル（.class）', n);
    }
    return unsupported(`式「${text(n).slice(0, 20)}」`, n);
  }

  // ── プログラム ──
  const top = tree.topNode;
  const body = [];
  const imports = [];
  for (const c of kids(top)) {
    if (c.name === 'ImportDeclaration') { imports.push(text(c)); continue; }
    if (c.name === 'PackageDeclaration') continue;
    if (c.name === ';') continue;
    const nested = [];
    body.push(classDecl(c, nested));
    body.push(...nested);
  }
  return { type: 'Program', body, imports: [...imports, ...qualifiedImports], loc: { line: 1, column: 1 }, end: null, range: [0, src.length] };
}
