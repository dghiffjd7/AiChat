const INLINE_ROOT_PREFIXES = ['stat_data', 'status_current_variables'];
const KNOWN_ROOT_ALIASES = new Set([...INLINE_ROOT_PREFIXES, 'variables', 'variable', 'vars', '变量']);

const trimSegmentQuotes = (segment) => String(segment ?? '').trim().replace(/^['"`]|['"`]$/g, '');

export const isVariablePathIndex = (segment) => /^\d+$/.test(String(segment || '').trim());

export const normalizeVariablePathParts = (parts = [], { coerceNumeric = true } = {}) => {
  const list = Array.isArray(parts) ? parts : [parts];
  return list
    .map(trimSegmentQuotes)
    .filter(Boolean)
    .map((segment) => (coerceNumeric && isVariablePathIndex(segment) ? Number(segment) : segment));
};

export const toVariablePath = (raw, { coerceNumeric = true } = {}) => {
  const text = String(raw || '').trim();
  if (!text) return [];
  const parts = [];
  let buffer = '';
  let inBracket = false;
  let quote = '';
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const prev = i > 0 ? text[i - 1] : '';
    if (inBracket) {
      if (quote) {
        if (ch === quote && prev !== '\\') {
          quote = '';
        } else {
          buffer += ch;
        }
      } else if (ch === '"' || ch === "'" || ch === '`') {
        quote = ch;
      } else if (ch === ']') {
        const segment = buffer.trim();
        if (segment) parts.push(segment);
        buffer = '';
        inBracket = false;
      } else {
        buffer += ch;
      }
      continue;
    }
    if (ch === '.') {
      if (buffer) parts.push(buffer);
      buffer = '';
      continue;
    }
    if (ch === '[') {
      if (buffer) parts.push(buffer);
      buffer = '';
      inBracket = true;
      continue;
    }
    buffer += ch;
  }
  if (buffer) parts.push(buffer);
  return normalizeVariablePathParts(parts, { coerceNumeric });
};

export const normalizeVariablePathInput = (raw, { inlineRootPrefixes = INLINE_ROOT_PREFIXES } = {}) => {
  let text = String(raw || '').trim();
  if (!text) return '';
  const isQuoted =
    (text.startsWith('"') && text.endsWith('"')) ||
    (text.startsWith("'") && text.endsWith("'")) ||
    (text.startsWith('`') && text.endsWith('`'));
  if (isQuoted) text = text.slice(1, -1);
  if (inlineRootPrefixes.includes(text)) return '';
  if (isQuoted && text.includes('.') && !text.includes('[') && !text.includes(']')) {
    const escaped = text.replace(/"/g, '\\"');
    return `["${escaped}"]`;
  }
  const escapedPrefixes = inlineRootPrefixes.map(prefix => prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (escapedPrefixes.length) {
    const rootsPattern = escapedPrefixes.join('|');
    text = text.replace(new RegExp(`^(?:${rootsPattern})\\.`), '');
    text = text.replace(new RegExp(`^(?:${rootsPattern})\\[`), '[');
  }
  return text;
};

export const decodeJsonPointer = (path) => {
  const raw = String(path || '');
  if (!raw) return [];
  return raw
    .replace(/^\/+/, '')
    .split('/')
    .map(seg => seg.replace(/~1/g, '/').replace(/~0/g, '~'))
    .filter(Boolean);
};

export const stripKnownVariableRootPrefix = (parts = [], { knownRoots = KNOWN_ROOT_ALIASES } = {}) => {
  let next = normalizeVariablePathParts(parts, { coerceNumeric: false });
  while (next.length > 1 && knownRoots.has(String(next[0] || '').trim().toLowerCase())) {
    next = next.slice(1);
  }
  return next;
};

export const getValueAtPath = (obj, path, { allowDirectKey = true } = {}) => {
  if (!obj || (typeof obj !== 'object' && typeof obj !== 'function')) return undefined;
  if (allowDirectKey && !Array.isArray(path)) {
    const directKey = String(path || '').trim();
    if (directKey && Object.prototype.hasOwnProperty.call(obj, directKey)) return obj[directKey];
  }
  const parts = Array.isArray(path) ? normalizeVariablePathParts(path) : toVariablePath(path);
  if (!parts.length) return undefined;
  let current = obj;
  for (let i = 0; i < parts.length; i += 1) {
    const key = parts[i];
    if (current == null || (typeof current !== 'object' && typeof current !== 'function')) return undefined;
    if (!(key in current)) return undefined;
    current = current[key];
  }
  return current;
};

export const hasValueAtPath = (obj, path) => {
  if (!obj || (typeof obj !== 'object' && typeof obj !== 'function')) return false;
  const parts = Array.isArray(path) ? normalizeVariablePathParts(path) : toVariablePath(path);
  if (!parts.length) return false;
  let current = obj;
  for (let i = 0; i < parts.length; i += 1) {
    const key = parts[i];
    if (current == null || typeof current !== 'object' || !(key in current)) return false;
    current = current[key];
  }
  return true;
};

export const setValueAtPath = (obj, path, value, { create = false } = {}) => {
  const parts = Array.isArray(path) ? normalizeVariablePathParts(path) : toVariablePath(path);
  if (!parts.length) return { root: value, ok: true };
  let current = obj;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const key = parts[i];
    const nextKey = parts[i + 1];
    if (current[key] === undefined || current[key] === null || typeof current[key] !== 'object') {
      if (!create) return { root: obj, ok: false };
      current[key] = typeof nextKey === 'number' ? [] : {};
    }
    current = current[key];
  }
  current[parts[parts.length - 1]] = value;
  return { root: obj, ok: true };
};

export const deleteValueAtPath = (obj, path) => {
  const parts = Array.isArray(path) ? normalizeVariablePathParts(path) : toVariablePath(path);
  if (!parts.length) return { root: obj, ok: false };
  const parentPath = parts.slice(0, -1);
  const key = parts[parts.length - 1];
  const parent = parentPath.length ? getValueAtPath(obj, parentPath, { allowDirectKey: false }) : obj;
  if (!parent || typeof parent !== 'object') return { root: obj, ok: false };
  if (Array.isArray(parent) && typeof key === 'number') {
    if (key >= 0 && key < parent.length) {
      parent.splice(key, 1);
      return { root: obj, ok: true };
    }
    return { root: obj, ok: false };
  }
  if (key in parent) {
    delete parent[key];
    return { root: obj, ok: true };
  }
  return { root: obj, ok: false };
};

export const resolveExistingVariablePath = (obj, path, { allowLeaf = false } = {}) => {
  const base = Array.isArray(path) ? normalizeVariablePathParts(path) : toVariablePath(path);
  if (!base.length) return [];
  const dotKey = base.map(seg => String(seg)).join('.');
  if (dotKey && hasValueAtPath(obj, [dotKey])) return [dotKey];
  if (hasValueAtPath(obj, base)) return base;
  for (let i = 1; i < base.length; i += 1) {
    const suffix = base.slice(i);
    if (!suffix.length) continue;
    if (hasValueAtPath(obj, suffix)) return suffix;
    const suffixDot = suffix.map(seg => String(seg)).join('.');
    if (suffixDot && hasValueAtPath(obj, [suffixDot])) return [suffixDot];
  }
  if (obj && typeof obj === 'object') {
    const flatKeys = Object.keys(obj).filter(key => typeof key === 'string' && key.trim().length > 0);
    if (flatKeys.length) {
      const leaf = String(base[base.length - 1] ?? '').trim();
      if (leaf) {
        const leafMatches = flatKeys.filter((key) => {
          const parts = String(key).split('.');
          return String(parts[parts.length - 1] || '').trim() === leaf;
        });
        if (leafMatches.length === 1 && hasValueAtPath(obj, [leafMatches[0]])) return [leafMatches[0]];
      }
      if (base.length > 1) {
        const tailDot = base.slice(1).map(seg => String(seg)).join('.');
        if (tailDot) {
          const tailMatches = flatKeys.filter(key => key === tailDot || key.endsWith(`.${tailDot}`));
          if (tailMatches.length === 1 && hasValueAtPath(obj, [tailMatches[0]])) return [tailMatches[0]];
        }
      }
    }
  }
  if (allowLeaf) {
    const leaf = String(base[base.length - 1] ?? '').trim();
    if (leaf && hasValueAtPath(obj, [leaf])) return [leaf];
  }
  return null;
};

export const buildNestedVars = (flat = {}) => {
  const root = {};
  Object.entries(flat || {}).forEach(([key, value]) => {
    const name = String(key || '').trim();
    if (!name) return;
    setValueAtPath(root, name, value, { create: true });
  });
  return root;
};

export const buildVariableContext = ({ baseVars = {}, globalVars = {}, localVars = null } = {}) => {
  const baseVarsNested = buildNestedVars(baseVars);
  const globalVarsNested = buildNestedVars(globalVars);
  const effectiveLocalVars = localVars && typeof localVars === 'object' ? localVars : baseVars;
  const localVarsNested = buildNestedVars(effectiveLocalVars);
  const variableContext = {
    ...baseVars,
    stat_data: { ...baseVars, ...baseVarsNested },
    variables: { ...baseVars, ...baseVarsNested },
    status_current_variables: { ...baseVars, ...baseVarsNested },
    global_variables: { ...globalVars, ...globalVarsNested },
    local_variables: { ...effectiveLocalVars, ...localVarsNested },
  };
  const resolvePathValue = (path) => {
    const key = String(path || '').trim();
    if (!key) return undefined;
    if (Object.prototype.hasOwnProperty.call(variableContext, key)) return variableContext[key];
    if (Object.prototype.hasOwnProperty.call(baseVars, key)) return baseVars[key];
    if (Object.prototype.hasOwnProperty.call(globalVars, key)) return globalVars[key];
    if (Object.prototype.hasOwnProperty.call(effectiveLocalVars, key)) return effectiveLocalVars[key];
    return getValueAtPath(variableContext, key);
  };
  return {
    baseVars,
    globalVars,
    localVars: effectiveLocalVars,
    variableContext,
    resolvePathValue,
  };
};

export const buildMacroVariableContext = ({
  baseVars = {},
  globalVars = {},
  localVars = null,
  topLevelMode = 'base',
} = {}) => {
  const effectiveLocalVars = localVars && typeof localVars === 'object' ? localVars : baseVars;
  const variableContext = buildVariableContext({ baseVars, globalVars, localVars: effectiveLocalVars }).variableContext;
  let topLevelVars = {};
  if (String(topLevelMode || '').trim().toLowerCase() === 'merged') {
    topLevelVars = { ...globalVars, ...effectiveLocalVars };
  } else if (String(topLevelMode || '').trim().toLowerCase() === 'base') {
    topLevelVars = { ...baseVars };
  }
  return {
    ...topLevelVars,
    stat_data: variableContext.stat_data,
    variables: variableContext.variables,
    status_current_variables: variableContext.status_current_variables,
    global_variables: variableContext.global_variables,
    local_variables: variableContext.local_variables,
  };
};
