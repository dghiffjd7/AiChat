export const normalizeZipEntryName = (name = '', { trim = false } = {}) => {
  const normalized = String(name || '').replace(/\\/g, '/');
  return trim ? normalized.trim() : normalized;
};

export const decodeZipEntryBase64Text = (base64 = '') => {
  const raw = atob(String(base64 || ''));
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return new TextDecoder().decode(bytes);
};

export const buildZipEntryMap = (entries = [], { trimNames = false } = {}) => {
  const map = new Map();
  const list = Array.isArray(entries) ? entries : [];
  list.forEach((entry) => {
    const name = normalizeZipEntryName(entry?.name, { trim: trimNames });
    if (!name) return;
    map.set(name, entry);
  });
  return map;
};

export const findZipEntryByName = (entries = [], name = '', { trimNames = false } = {}) => {
  const target = normalizeZipEntryName(name, { trim: trimNames });
  if (!target) return null;
  const list = Array.isArray(entries) ? entries : [];
  return list.find(entry => normalizeZipEntryName(entry?.name, { trim: trimNames }) === target) || null;
};

export const readZipEntryText = (
  entry,
  {
    decodeBase64Text = decodeZipEntryBase64Text,
  } = {},
) => {
  if (!entry) return '';
  if (typeof entry.text === 'string' && entry.text.trim()) return entry.text;
  if (entry.base64) return decodeBase64Text(entry.base64);
  return '';
};

export const readZipEntryJson = (
  entry,
  {
    fallback = null,
    decodeBase64Text = decodeZipEntryBase64Text,
  } = {},
) => {
  const text = readZipEntryText(entry, { decodeBase64Text });
  if (!text) return fallback;
  return JSON.parse(text);
};
