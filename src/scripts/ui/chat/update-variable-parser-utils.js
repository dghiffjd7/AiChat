import {
  decodeJsonPointer,
  normalizeVariablePathInput,
  normalizeVariablePathParts,
  stripKnownVariableRootPrefix,
  toVariablePath,
} from '../../variables/variable-path-utils.js';

const stripCodeFence = (text) => {
  const raw = String(text || '').trim();
  if (!raw) return '';
  const withoutStart = raw.replace(/^```[a-z0-9_-]*\s*/i, '');
  return withoutStart.replace(/```\s*$/i, '').trim();
};

const safeJsonParse = (text) => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

const parseLooseJson = (text) => {
  let raw = String(text || '').trim();
  if (!raw) return null;
  raw = raw.replace(/\/\*[\s\S]*?\*\//g, '');
  raw = raw.replace(/(^|[^\\])\/\/.*$/gm, '$1');
  raw = raw.replace(/,\s*([}\]])/g, '$1');
  raw = raw.replace(/([{,]\s*)([A-Za-z0-9_-]+)\s*:/g, '$1"$2":');
  raw = raw.replace(/'([^'\\]*(\\.[^'\\]*)*)'/g, (_match, body) => {
    const cleaned = String(body || '').replace(/\\"/g, '"').replace(/"/g, '\\"');
    return `"${cleaned}"`;
  });
  return safeJsonParse(raw);
};

const parseValue = (input) => {
  const raw = String(input ?? '').trim();
  if (!raw) return '';
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (raw === 'null') return null;
  if (raw === 'undefined') return undefined;
  if (/^[+-]?\d+(\.\d+)?$/.test(raw)) return Number(raw);
  const quoted =
    (raw.startsWith('"') && raw.endsWith('"')) ||
    (raw.startsWith("'") && raw.endsWith("'")) ||
    (raw.startsWith('`') && raw.endsWith('`'));
  const unquoted = quoted ? raw.slice(1, -1) : raw;
  if (unquoted.startsWith('{') || unquoted.startsWith('[')) {
    const parsed = parseLooseJson(unquoted);
    if (parsed !== null) return parsed;
    const direct = safeJsonParse(unquoted);
    if (direct !== null) return direct;
  }
  return unquoted;
};

const findMatchingParen = (text, startIndex) => {
  let depth = 1;
  let inQuote = false;
  let quoteChar = '';
  for (let i = startIndex; i < text.length; i += 1) {
    const ch = text[i];
    const prev = i > 0 ? text[i - 1] : '';
    if ((ch === '"' || ch === "'" || ch === '`') && prev !== '\\') {
      if (inQuote && ch === quoteChar) {
        inQuote = false;
        quoteChar = '';
      } else if (!inQuote) {
        inQuote = true;
        quoteChar = ch;
      }
    }
    if (inQuote) continue;
    if (ch === '(') depth += 1;
    if (ch === ')') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
};

const splitArgs = (text) => {
  const args = [];
  let buf = '';
  let inQuote = false;
  let quoteChar = '';
  let paren = 0;
  let bracket = 0;
  let brace = 0;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const prev = i > 0 ? text[i - 1] : '';
    if ((ch === '"' || ch === "'" || ch === '`') && prev !== '\\') {
      if (inQuote && ch === quoteChar) {
        inQuote = false;
        quoteChar = '';
      } else if (!inQuote) {
        inQuote = true;
        quoteChar = ch;
      }
    }
    if (!inQuote) {
      if (ch === '(') paren += 1;
      if (ch === ')') paren -= 1;
      if (ch === '[') bracket += 1;
      if (ch === ']') bracket -= 1;
      if (ch === '{') brace += 1;
      if (ch === '}') brace -= 1;
    }
    if (ch === ',' && !inQuote && paren === 0 && bracket === 0 && brace === 0) {
      const trimmed = buf.trim();
      if (trimmed) args.push(trimmed);
      buf = '';
      continue;
    }
    buf += ch;
  }
  const trimmed = buf.trim();
  if (trimmed) args.push(trimmed);
  return args;
};

const parseJsonPatchArray = (value, reason = 'json_patch') => {
  if (!Array.isArray(value)) return [];
  const commands = [];
  value.forEach((op) => {
    const action = String(op?.op || '').toLowerCase();
    let pathParts = decodeJsonPointer(op?.path || op?.to || '');
    pathParts = stripKnownVariableRootPrefix(pathParts);
    const path = normalizeVariablePathParts(pathParts);
    if (!action || !path.length) return;
    if (action === 'replace') {
      commands.push({ type: 'set', path, value: op?.value, reason });
      return;
    }
    if (action === 'delta') {
      commands.push({ type: 'add', path, value: op?.value, reason });
      return;
    }
    if (action === 'add' || action === 'insert') {
      const key = path[path.length - 1];
      const parentPath = path.slice(0, -1);
      if (!parentPath.length) {
        commands.push({ type: 'set', path, value: op?.value, reason });
        return;
      }
      commands.push({ type: 'insert', path: parentPath, key, value: op?.value, reason });
      return;
    }
    if (action === 'remove') {
      commands.push({ type: 'delete', path, reason });
      return;
    }
    if (action === 'move') {
      let fromParts = decodeJsonPointer(op?.from || '');
      fromParts = stripKnownVariableRootPrefix(fromParts);
      const from = normalizeVariablePathParts(fromParts);
      if (!from.length) return;
      commands.push({ type: 'move', from, to: path, reason });
    }
  });
  return commands;
};

const parseJsonPatchCommands = (text) => {
  const commands = [];
  const re = /<(json_?patch)>(?:\s*```.*)?([\s\S]*?)(?:```\s*)?<\/\1>/gim;
  let match;
  while ((match = re.exec(text))) {
    const body = stripCodeFence(match[2] || '');
    if (!body) continue;
    const parsed = parseLooseJson(body) ?? safeJsonParse(body);
    commands.push(...parseJsonPatchArray(parsed, 'json_patch'));
  }
  return commands;
};

const parseInlineCommands = (text) => {
  const commands = [];
  let index = 0;
  while (index < text.length) {
    const match = text.substring(index).match(/_\.(set|insert|assign|remove|unset|delete|add)\(/);
    if (!match || match.index === undefined) break;
    const type = match[1];
    const start = index + match.index + match[0].length;
    const end = findMatchingParen(text, start);
    if (end === -1) break;
    const argsText = text.slice(start, end);
    const args = splitArgs(argsText);
    if (!args.length) {
      index = end + 1;
      continue;
    }
    const rawPath = normalizeVariablePathInput(args[0]);
    const path = toVariablePath(rawPath);
    if (!path.length && rawPath !== '') {
      index = end + 1;
      continue;
    }
    if (type === 'set') {
      if (args.length >= 3 && rawPath === '') {
        const keyPathRaw = normalizeVariablePathInput(args[1]);
        let keyPath = toVariablePath(keyPathRaw);
        if (!keyPath.length && keyPathRaw !== '') {
          const parsedKey = parseValue(args[1]);
          if (parsedKey !== undefined && parsedKey !== null && parsedKey !== '') {
            keyPath = [String(parsedKey)];
          }
        }
        if (keyPath.length) commands.push({ type: 'set', path: keyPath, value: parseValue(args[args.length - 1]) });
      } else if (args.length >= 2) {
        commands.push({ type: 'set', path, value: parseValue(args[args.length - 1]) });
      }
    } else if (type === 'add') {
      if (args.length >= 2) commands.push({ type: 'add', path, value: parseValue(args[1]) });
    } else if (type === 'insert' || type === 'assign') {
      if (args.length === 2) {
        commands.push({ type: 'insert', path, key: null, value: parseValue(args[1]) });
      } else if (args.length >= 3) {
        commands.push({ type: 'insert', path, key: parseValue(args[1]), value: parseValue(args[2]) });
      }
    } else if (type === 'remove' || type === 'unset' || type === 'delete') {
      if (args.length >= 2) {
        commands.push({ type: 'remove', path, key: parseValue(args[1]) });
      } else {
        commands.push({ type: 'delete', path });
      }
    }
    index = end + 1;
  }
  return commands;
};

export const buildUpdateVariableParser = () => {
  const parseCommands = (text) => {
    const stripped = String(text || '')
      .replace(/<analysis>[\s\S]*?<\/analysis>/gi, '')
      .replace(/<analyze>[\s\S]*?<\/analyze>/gi, '');
    const commands = [];
    const jsonCmds = parseJsonPatchCommands(stripped);
    commands.push(...jsonCmds);
    const cleaned = stripped.replace(/<(json_?patch)>(?:\s*```.*)?[\s\S]*?<\/\1>/gim, '');
    commands.push(...parseInlineCommands(cleaned));
    if (!commands.length) {
      const body = stripCodeFence(stripped);
      const parsed = parseLooseJson(body) ?? safeJsonParse(body);
      commands.push(...parseJsonPatchArray(parsed, 'json_patch_raw'));
    }
    return commands;
  };

  return { parseCommands };
};
