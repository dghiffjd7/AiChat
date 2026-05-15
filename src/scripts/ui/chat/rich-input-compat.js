export function normalizeRichCompatInputMode(options = {}) {
  const raw = typeof options === 'string' ? options : options?.mode;
  const token = String(raw || '').trim().toLowerCase();
  if (token === 'append' || options?.append === true) return 'append';
  return 'replace';
}

export function mergeRichCompatInputText(currentValue = '', nextText = '', options = {}) {
  const current = String(currentValue ?? '');
  const text = String(nextText ?? '');
  const mode = normalizeRichCompatInputMode(options);
  if (mode !== 'append') return text;
  if (!current) return text;
  if (!text) return current;
  const separator = typeof options?.separator === 'string' ? options.separator : '\n';
  if (!separator) return `${current}${text}`;
  return `${current}${separator}${text}`;
}

export function tokenizeRichCompatSlashArgs(text = '') {
  const raw = String(text ?? '');
  const tokens = [];
  let buf = '';
  let inQuote = false;
  let quoteChar = '';
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i];
    if (ch === '\\' && i + 1 < raw.length) {
      buf += raw[i + 1];
      i += 1;
      continue;
    }
    if ((ch === '"' || ch === "'" || ch === '`')) {
      if (inQuote && ch === quoteChar) {
        inQuote = false;
        quoteChar = '';
        continue;
      }
      if (!inQuote) {
        inQuote = true;
        quoteChar = ch;
        continue;
      }
    }
    if (/\s/.test(ch) && !inQuote) {
      if (buf.length) {
        tokens.push(buf);
        buf = '';
      }
      continue;
    }
    buf += ch;
  }
  if (buf.length) tokens.push(buf);
  return tokens;
}

export function parseRichCompatSlashArgs(text = '') {
  const tokens = tokenizeRichCompatSlashArgs(text);
  const named = {};
  const positional = [];
  tokens.forEach((token) => {
    const match = String(token || '').match(/^([A-Za-z][\w-]*)=([\s\S]*)$/);
    if (match) {
      named[match[1].toLowerCase()] = match[2] ?? '';
      return;
    }
    positional.push(token);
  });
  return {
    tokens,
    named,
    positional,
    text: positional.join(' '),
  };
}

export function parseRichCompatSlashCommand(command = '') {
  const raw = String(command || '').trim();
  if (!raw.startsWith('/')) return null;
  const match = raw.match(/^\/([^\s]+)(?:\s+([\s\S]*))?$/);
  if (!match) return null;
  const name = String(match[1] || '').trim().toLowerCase();
  const argsText = String(match[2] || '');
  const args = parseRichCompatSlashArgs(argsText);
  const base = {
    command: name,
    name,
    argsText,
    tokens: args.tokens,
    named: args.named,
    positional: args.positional,
    text: args.text,
  };
  if (name === 'setinput') {
    return { ...base, command: 'setinput', mode: 'replace' };
  }
  if (name === 'input') {
    return { ...base, command: 'input' };
  }
  if (name === 'addinput' || name === 'appendinput') {
    return { ...base, command: 'setinput', mode: 'append' };
  }
  if (name === 'send' || name === 'sendas' || name === 'sys' || name === 'comment') {
    return { ...base, command: name, mode: 'replace' };
  }
  if (
    name === 'trigger' ||
    name === 'continue' ||
    name === 'echo' ||
    name === 'popup' ||
    name === 'buttons' ||
    name === 'sysname' ||
    name === 'help' ||
    name === 'messages' ||
    name === 'hide' ||
    name === 'unhide' ||
    name === 'setvar' ||
    name === 'getvar' ||
    name === 'addvar' ||
    name === 'incvar' ||
    name === 'decvar' ||
    name === 'flushvar' ||
    name === 'setglobalvar' ||
    name === 'getglobalvar' ||
    name === 'addglobalvar' ||
    name === 'incglobalvar' ||
    name === 'decglobalvar' ||
    name === 'flushglobalvar' ||
    name === 'pass' ||
    name === 'add' ||
    name === 'mul' ||
    name === 'sub' ||
    name === 'div' ||
    name === 'mod' ||
    name === 'pow' ||
    name === 'min' ||
    name === 'max' ||
    name === 'round' ||
    name === 'abs' ||
    name === 'rand' ||
    name === 'getchatbook' ||
    name === 'findentry' ||
    name === 'getentryfield' ||
    name === 'setentryfield' ||
    name === 'createentry' ||
    name === 'imagine' ||
    name === 'sd'
  ) {
    return base;
  }
  if (/^audio(?:select|mode|play|stop|pause|resume)$/i.test(name)) {
    return { ...base, command: 'audio' };
  }
  if (name === 'speak' || name === 'beep' || name === 'music' || name === 'ambient' || name === 'bg') {
    return { ...base, command: 'extension-noop' };
  }
  return null;
}

export function splitRichCompatSlashPipeline(command = '') {
  const raw = String(command || '').trim();
  if (!raw) return [];
  if (!raw.includes('|')) return [raw];
  const parts = [];
  let buf = '';
  let inQuote = false;
  let quoteChar = '';
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i];
    if (ch === '\\' && i + 1 < raw.length) {
      buf += raw[i + 1];
      i += 1;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      if (inQuote && ch === quoteChar) {
        inQuote = false;
        quoteChar = '';
      } else if (!inQuote) {
        inQuote = true;
        quoteChar = ch;
      }
      buf += ch;
      continue;
    }
    if (ch === '|' && !inQuote) {
      const trimmed = buf.trim();
      if (trimmed) parts.push(trimmed);
      buf = '';
      continue;
    }
    buf += ch;
  }
  const tail = buf.trim();
  if (tail) parts.push(tail);
  if (parts.length <= 1) return [raw];
  return parts.every(part => part.startsWith('/')) ? parts : [raw];
}
