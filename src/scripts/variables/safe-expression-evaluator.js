const MAX_CACHE_SIZE = 256;

const PARSE_CACHE = new Map();

const isWhitespace = (ch) => /\s/.test(ch);
const isDigit = (ch) => /[0-9]/.test(ch);
const isIdentifierStart = (ch) => /[A-Za-z_$]/.test(ch);
const isIdentifierPart = (ch) => /[A-Za-z0-9_$]/.test(ch);

const OPERATORS = [
  '===',
  '!==',
  '&&',
  '||',
  '==',
  '!=',
  '>=',
  '<=',
  '>',
  '<',
  '+',
  '-',
  '*',
  '/',
  '%',
  '!',
];

const KEYWORD_LITERALS = new Map([
  ['true', true],
  ['false', false],
  ['null', null],
]);

const tokenize = (input = '') => {
  const text = String(input || '');
  const tokens = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (isWhitespace(ch)) {
      i += 1;
      continue;
    }
    if (ch === '(' || ch === ')' || ch === '[' || ch === ']' || ch === '.') {
      tokens.push({ type: ch, value: ch });
      i += 1;
      continue;
    }
    const op = OPERATORS.find((token) => text.startsWith(token, i));
    if (op) {
      tokens.push({ type: 'operator', value: op });
      i += op.length;
      continue;
    }
    if (isDigit(ch) || (ch === '.' && isDigit(text[i + 1]))) {
      let end = i;
      let seenDot = ch === '.';
      while (end < text.length) {
        const cur = text[end];
        if (isDigit(cur)) {
          end += 1;
          continue;
        }
        if (cur === '.' && !seenDot) {
          seenDot = true;
          end += 1;
          continue;
        }
        break;
      }
      const raw = text.slice(i, end);
      const value = Number(raw);
      if (!Number.isFinite(value)) {
        throw new Error(`invalid number literal: ${raw}`);
      }
      tokens.push({ type: 'number', value });
      i = end;
      continue;
    }
    if (ch === '"' || ch === "'") {
      const quote = ch;
      let end = i + 1;
      let out = '';
      while (end < text.length) {
        const cur = text[end];
        if (cur === '\\') {
          const next = text[end + 1];
          if (next === undefined) throw new Error('unterminated string literal');
          if (next === 'n') out += '\n';
          else if (next === 'r') out += '\r';
          else if (next === 't') out += '\t';
          else out += next;
          end += 2;
          continue;
        }
        if (cur === quote) break;
        out += cur;
        end += 1;
      }
      if (text[end] !== quote) throw new Error('unterminated string literal');
      tokens.push({ type: 'string', value: out });
      i = end + 1;
      continue;
    }
    if (isIdentifierStart(ch)) {
      let end = i + 1;
      while (end < text.length && isIdentifierPart(text[end])) end += 1;
      const raw = text.slice(i, end);
      if (KEYWORD_LITERALS.has(raw)) {
        tokens.push({ type: 'literal', value: KEYWORD_LITERALS.get(raw) });
      } else {
        tokens.push({ type: 'identifier', value: raw });
      }
      i = end;
      continue;
    }
    throw new Error(`unexpected token: ${ch}`);
  }
  tokens.push({ type: 'eof', value: '' });
  return tokens;
};

class Parser {
  constructor(tokens) {
    this.tokens = Array.isArray(tokens) ? tokens : [];
    this.index = 0;
  }

  current() {
    return this.tokens[this.index] || { type: 'eof', value: '' };
  }

  eat(type, value = null) {
    const token = this.current();
    if (!token || token.type !== type || (value !== null && token.value !== value)) {
      const expected = value !== null ? `${type}:${value}` : type;
      throw new Error(`expected ${expected}`);
    }
    this.index += 1;
    return token;
  }

  match(type, value = null) {
    const token = this.current();
    if (!token || token.type !== type) return false;
    if (value !== null && token.value !== value) return false;
    this.index += 1;
    return true;
  }

  parse() {
    const expr = this.parseLogicalOr();
    this.eat('eof');
    return expr;
  }

  parseLogicalOr() {
    let node = this.parseLogicalAnd();
    while (this.match('operator', '||')) {
      node = { type: 'logical', op: '||', left: node, right: this.parseLogicalAnd() };
    }
    return node;
  }

  parseLogicalAnd() {
    let node = this.parseEquality();
    while (this.match('operator', '&&')) {
      node = { type: 'logical', op: '&&', left: node, right: this.parseEquality() };
    }
    return node;
  }

  parseEquality() {
    let node = this.parseRelational();
    while (true) {
      if (this.match('operator', '==')) {
        node = { type: 'binary', op: '==', left: node, right: this.parseRelational() };
      } else if (this.match('operator', '!=')) {
        node = { type: 'binary', op: '!=', left: node, right: this.parseRelational() };
      } else if (this.match('operator', '===')) {
        node = { type: 'binary', op: '===', left: node, right: this.parseRelational() };
      } else if (this.match('operator', '!==')) {
        node = { type: 'binary', op: '!==', left: node, right: this.parseRelational() };
      } else {
        break;
      }
    }
    return node;
  }

  parseRelational() {
    let node = this.parseAdditive();
    while (true) {
      if (this.match('operator', '>=')) {
        node = { type: 'binary', op: '>=', left: node, right: this.parseAdditive() };
      } else if (this.match('operator', '<=')) {
        node = { type: 'binary', op: '<=', left: node, right: this.parseAdditive() };
      } else if (this.match('operator', '>')) {
        node = { type: 'binary', op: '>', left: node, right: this.parseAdditive() };
      } else if (this.match('operator', '<')) {
        node = { type: 'binary', op: '<', left: node, right: this.parseAdditive() };
      } else {
        break;
      }
    }
    return node;
  }

  parseAdditive() {
    let node = this.parseMultiplicative();
    while (true) {
      if (this.match('operator', '+')) {
        node = { type: 'binary', op: '+', left: node, right: this.parseMultiplicative() };
      } else if (this.match('operator', '-')) {
        node = { type: 'binary', op: '-', left: node, right: this.parseMultiplicative() };
      } else {
        break;
      }
    }
    return node;
  }

  parseMultiplicative() {
    let node = this.parseUnary();
    while (true) {
      if (this.match('operator', '*')) {
        node = { type: 'binary', op: '*', left: node, right: this.parseUnary() };
      } else if (this.match('operator', '/')) {
        node = { type: 'binary', op: '/', left: node, right: this.parseUnary() };
      } else if (this.match('operator', '%')) {
        node = { type: 'binary', op: '%', left: node, right: this.parseUnary() };
      } else {
        break;
      }
    }
    return node;
  }

  parseUnary() {
    if (this.match('operator', '!')) {
      return { type: 'unary', op: '!', argument: this.parseUnary() };
    }
    if (this.match('operator', '+')) {
      return { type: 'unary', op: '+', argument: this.parseUnary() };
    }
    if (this.match('operator', '-')) {
      return { type: 'unary', op: '-', argument: this.parseUnary() };
    }
    return this.parseMember();
  }

  parseMember() {
    let node = this.parsePrimary();
    while (true) {
      if (this.match('.')) {
        const token = this.eat('identifier');
        node = {
          type: 'member',
          object: node,
          property: { type: 'literal', value: token.value },
          computed: false,
        };
        continue;
      }
      if (this.match('[')) {
        const property = this.parseLogicalOr();
        this.eat(']');
        node = {
          type: 'member',
          object: node,
          property,
          computed: true,
        };
        continue;
      }
      break;
    }
    return node;
  }

  parsePrimary() {
    const token = this.current();
    if (this.match('number')) return { type: 'literal', value: token.value };
    if (this.match('string')) return { type: 'literal', value: token.value };
    if (this.match('literal')) return { type: 'literal', value: token.value };
    if (this.match('identifier')) return { type: 'identifier', name: token.value };
    if (this.match('(')) {
      const expr = this.parseLogicalOr();
      this.eat(')');
      return expr;
    }
    throw new Error(`unexpected token type: ${token?.type || 'unknown'}`);
  }
}

const parseExpression = (input = '') => {
  const text = String(input || '').trim();
  if (!text) return { type: 'literal', value: undefined };
  if (PARSE_CACHE.has(text)) return PARSE_CACHE.get(text);
  const ast = new Parser(tokenize(text)).parse();
  PARSE_CACHE.set(text, ast);
  if (PARSE_CACHE.size > MAX_CACHE_SIZE) {
    const firstKey = PARSE_CACHE.keys().next().value;
    if (firstKey !== undefined) PARSE_CACHE.delete(firstKey);
  }
  return ast;
};

const getOwnValue = (obj, key) => {
  if (obj == null) return undefined;
  if (Array.isArray(obj) && key === 'length') return obj.length;
  if (typeof obj === 'string' && key === 'length') return obj.length;
  if (typeof key === 'number' && Array.isArray(obj)) return obj[key];
  if (typeof obj === 'object' || typeof obj === 'function') {
    return Object.prototype.hasOwnProperty.call(obj, key) ? obj[key] : undefined;
  }
  return undefined;
};

const evaluateNode = (node, scope) => {
  if (!node || typeof node !== 'object') return undefined;
  if (node.type === 'literal') return node.value;
  if (node.type === 'identifier') return getOwnValue(scope, node.name);
  if (node.type === 'member') {
    const target = evaluateNode(node.object, scope);
    const key = node.computed ? evaluateNode(node.property, scope) : node.property?.value;
    return getOwnValue(target, key);
  }
  if (node.type === 'unary') {
    const value = evaluateNode(node.argument, scope);
    if (node.op === '!') return !value;
    if (node.op === '+') return +value;
    if (node.op === '-') return -value;
    return undefined;
  }
  if (node.type === 'logical') {
    const left = evaluateNode(node.left, scope);
    if (node.op === '&&') return left ? evaluateNode(node.right, scope) : left;
    if (node.op === '||') return left ? left : evaluateNode(node.right, scope);
    return undefined;
  }
  if (node.type === 'binary') {
    const left = evaluateNode(node.left, scope);
    const right = evaluateNode(node.right, scope);
    switch (node.op) {
      case '+': return left + right;
      case '-': return left - right;
      case '*': return left * right;
      case '/': return left / right;
      case '%': return left % right;
      case '>': return left > right;
      case '>=': return left >= right;
      case '<': return left < right;
      case '<=': return left <= right;
      case '==': return left == right; // eslint-disable-line eqeqeq
      case '!=': return left != right; // eslint-disable-line eqeqeq
      case '===': return left === right;
      case '!==': return left !== right;
      default: return undefined;
    }
  }
  return undefined;
};

export const evaluateExpression = (input = '', scope = {}) => {
  const ast = parseExpression(input);
  return evaluateNode(ast, scope && typeof scope === 'object' ? scope : {});
};

export const validateExpressionSyntax = (input = '') => {
  const text = String(input || '').trim();
  if (!text) {
    return { ok: false, error: 'empty expression' };
  }
  try {
    parseExpression(text);
    return { ok: true, error: '' };
  } catch (err) {
    return { ok: false, error: String(err?.message || err || 'invalid expression') };
  }
};

export const evaluateBooleanExpression = (input = '', scope = {}, { fallback = false } = {}) => {
  const text = String(input || '').trim();
  if (!text) return Boolean(fallback);
  return Boolean(evaluateExpression(text, scope));
};
