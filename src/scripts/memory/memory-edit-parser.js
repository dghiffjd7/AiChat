export const stripTableEditBlocks = (text) => {
  return extractTableEditBlocks(text).text.replace(/\n{3,}/g, '\n\n').trim();
};

export const extractTableEditBlocks = (text) => {
  const raw = String(text ?? '');
  const re = /<tableEdit\b[^>]*>([\s\S]*?)<\/tableEdit\s*>/gi;
  const matches = [];
  let m;
  while ((m = re.exec(raw))) {
    const block = m[1];
    const actions = parseTableEditActions(block);
    if (!actions.length) continue;
    matches.push({
      start: m.index,
      end: re.lastIndex,
      block,
      actions,
    });
  }
  if (!matches.length) return { text: raw, blocks: [], actions: [] };
  let cursor = 0;
  let stripped = '';
  const blocks = [];
  const actions = [];
  for (const match of matches) {
    stripped += raw.slice(cursor, match.start);
    cursor = match.end;
    blocks.push(match.block);
    actions.push(...match.actions);
  }
  stripped += raw.slice(cursor);
  stripped = stripped.replace(/\n{3,}/g, '\n\n').trim();
  return { text: stripped, blocks, actions };
};

export const parseTableEditActions = (content) => {
  const cleaned = String(content ?? '').replace(/<!--([\s\S]*?)-->/g, '$1').trim();
  if (!cleaned) return [];
  const actions = [];
  const pushAction = (raw) => {
    if (!raw || typeof raw !== 'object') return;
    const action = String(raw.action || raw.type || '').trim().toLowerCase();
    if (!['insert', 'update', 'delete', 'init'].includes(action)) return;
    actions.push({
      action,
      tableId: raw.table_id ?? raw.tableId ?? raw.table,
      tableIndex: raw.table_index ?? raw.tableIndex,
      tableName: raw.table_name ?? raw.tableName,
      rowId: raw.row_id ?? raw.rowId ?? raw.id,
      rowIndex: raw.row_index ?? raw.rowIndex ?? raw.index,
      data: raw.data ?? raw.row_data ?? raw.rowData ?? raw.values,
    });
  };
  const tryParse = (text) => {
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  };
  const parseArgValue = (raw) => {
    const text = String(raw || '').trim();
    if (!text) return null;
    if ((text.startsWith('{') && text.endsWith('}')) || (text.startsWith('[') && text.endsWith(']'))) {
      const parsed = tryParse(text);
      return parsed == null ? null : parsed;
    }
    if (/^-?\d+(?:\.\d+)?$/.test(text)) return Number(text);
    if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
      return text.slice(1, -1);
    }
    return text;
  };
  const parseIndex = (value) => {
    if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
    if (typeof value !== 'string') return null;
    const raw = value.trim().replace(/^['"]|['"]$/g, '');
    if (/^-?\d+$/.test(raw)) return Math.trunc(Number(raw));
    return null;
  };
  const splitFunctionArgs = (raw) => {
    const text = String(raw || '');
    const args = [];
    let buf = '';
    let depthParen = 0;
    let depthBrace = 0;
    let depthBracket = 0;
    let inString = false;
    let quote = '';
    let escape = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (inString) {
        buf += ch;
        if (escape) {
          escape = false;
          continue;
        }
        if (ch === '\\') {
          escape = true;
          continue;
        }
        if (ch === quote) {
          inString = false;
          quote = '';
        }
        continue;
      }
      if (ch === '"' || ch === "'") {
        inString = true;
        quote = ch;
        buf += ch;
        continue;
      }
      if (ch === '{') {
        depthBrace += 1;
        buf += ch;
        continue;
      }
      if (ch === '}') {
        depthBrace = Math.max(0, depthBrace - 1);
        buf += ch;
        continue;
      }
      if (ch === '[') {
        depthBracket += 1;
        buf += ch;
        continue;
      }
      if (ch === ']') {
        depthBracket = Math.max(0, depthBracket - 1);
        buf += ch;
        continue;
      }
      if (ch === '(') {
        depthParen += 1;
        buf += ch;
        continue;
      }
      if (ch === ')') {
        depthParen = Math.max(0, depthParen - 1);
        buf += ch;
        continue;
      }
      if (ch === ',' && depthBrace === 0 && depthBracket === 0 && depthParen === 0) {
        args.push(buf.trim());
        buf = '';
        continue;
      }
      buf += ch;
    }
    if (buf.trim()) args.push(buf.trim());
    return args;
  };
  const findMatchingParen = (text, openIdx) => {
    let depth = 0;
    let inString = false;
    let quote = '';
    let escape = false;
    for (let i = openIdx; i < text.length; i++) {
      const ch = text[i];
      if (inString) {
        if (escape) {
          escape = false;
          continue;
        }
        if (ch === '\\') {
          escape = true;
          continue;
        }
        if (ch === quote) {
          inString = false;
          quote = '';
        }
        continue;
      }
      if (ch === '"' || ch === "'") {
        inString = true;
        quote = ch;
        continue;
      }
      if (ch === '(') {
        depth += 1;
        continue;
      }
      if (ch === ')') {
        depth -= 1;
        if (depth === 0) return i;
      }
    }
    return -1;
  };
  const parseFunctionActions = (text) => {
    const source = String(text || '');
    const out = [];
    const re = /(insertRow|updateRow|deleteRow)\s*\(/gi;
    let match;
    while ((match = re.exec(source))) {
      const name = String(match[1] || '').toLowerCase();
      const openIdx = source.indexOf('(', match.index);
      if (openIdx < 0) continue;
      const closeIdx = findMatchingParen(source, openIdx);
      if (closeIdx < 0) continue;
      const args = splitFunctionArgs(source.slice(openIdx + 1, closeIdx));
      const values = args.map(parseArgValue);
      const tableIndex = parseIndex(values[0]);
      if (tableIndex == null) {
        re.lastIndex = closeIdx + 1;
        continue;
      }
      if (name === 'insertrow') {
        const data = values[1];
        if (data && typeof data === 'object') {
          out.push({ action: 'insert', tableIndex, data });
        }
      } else if (name === 'updaterow') {
        const rowIndex = parseIndex(values[1]);
        const data = values[2];
        if (rowIndex != null && data && typeof data === 'object') {
          out.push({ action: 'update', tableIndex, rowIndex, data });
        }
      } else if (name === 'deleterow') {
        const rowIndex = parseIndex(values[1]);
        if (rowIndex != null) {
          out.push({ action: 'delete', tableIndex, rowIndex });
        }
      }
      re.lastIndex = closeIdx + 1;
    }
    return out;
  };
  const parsed = cleaned.startsWith('[') ? tryParse(cleaned) : null;
  if (Array.isArray(parsed)) {
    parsed.forEach(pushAction);
  }
  const lineItems = cleaned
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);
  for (const line of lineItems) {
    const normalized = line.replace(/,$/, '');
    if (!normalized) continue;
    const labeledMatch = normalized.match(/^(insert|update|delete|init)\s*:\s*(.+)$/i);
    if (labeledMatch) {
      const label = String(labeledMatch[1] || '').toLowerCase();
      const payload = labeledMatch[2].trim();
      const labeledObj = payload ? tryParse(payload) : null;
      if (labeledObj) {
        if (Array.isArray(labeledObj)) {
          labeledObj.forEach((item) => {
            if (item && typeof item === 'object' && !('action' in item)) item.action = label;
            pushAction(item);
          });
        } else if (labeledObj && typeof labeledObj === 'object') {
          if (!('action' in labeledObj)) labeledObj.action = label;
          pushAction(labeledObj);
        }
        continue;
      }
    }
    const obj = tryParse(normalized);
    if (obj) {
      if (Array.isArray(obj)) {
        obj.forEach(pushAction);
      } else {
        pushAction(obj);
      }
    }
  }
  const jsonActionCount = actions.length;
  const functionActions = parseFunctionActions(cleaned);
  if (functionActions.length) actions.push(...functionActions);
  if (jsonActionCount > 0) return actions;
  const matches = cleaned.match(/\{[\s\S]*?\}/g) || [];
  for (const chunk of matches) {
    const obj = tryParse(chunk);
    if (obj) pushAction(obj);
  }
  return actions;
};
