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

export function parseRichCompatSlashCommand(command = '') {
  const raw = String(command || '').trim();
  if (!raw.startsWith('/')) return null;
  const match = raw.match(/^\/([^\s]+)(?:\s+([\s\S]*))?$/);
  if (!match) return null;
  const name = String(match[1] || '').trim().toLowerCase();
  const text = String(match[2] || '');
  if (name === 'setinput' || name === 'input') {
    return { mode: 'replace', text };
  }
  if (name === 'addinput' || name === 'appendinput') {
    return { mode: 'append', text };
  }
  return null;
}
