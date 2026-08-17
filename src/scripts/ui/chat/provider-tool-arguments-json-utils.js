const isPlainObject = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));

const nextNonWhitespaceIndex = (source, start) => {
  let index = start;
  while (index < source.length && /\s/u.test(source[index])) index += 1;
  return index;
};

const isJsonValueStart = char => Boolean(char && /["{\[\-0-9tfn]/u.test(char));

const isLikelyClosingQuote = (source, quoteIndex) => {
  const nextIndex = nextNonWhitespaceIndex(source, quoteIndex + 1);
  if (nextIndex >= source.length) return true;
  const next = source[nextIndex];
  if (next === ':' || next === '}' || next === ']' || next === '"') return true;
  if (next !== ',') return false;
  const afterCommaIndex = nextNonWhitespaceIndex(source, nextIndex + 1);
  if (afterCommaIndex >= source.length) return true;
  const afterComma = source[afterCommaIndex];
  return afterComma === '}' || afterComma === ']' || isJsonValueStart(afterComma);
};

export const repairProviderToolArgumentsJson = (value = '') => {
  const source = String(value ?? '').trim();
  let output = '';
  let inString = false;
  let escaped = false;
  const kinds = new Set();
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (!inString) {
      output += char;
      if (char === '"') inString = true;
      continue;
    }
    if (escaped) {
      output += char;
      escaped = false;
      continue;
    }
    if (char === '\\') {
      output += char;
      escaped = true;
      continue;
    }
    if (char === '"') {
      if (isLikelyClosingQuote(source, index)) {
        output += char;
        inString = false;
      } else {
        output += '\\"';
        kinds.add('unescaped_quote');
      }
      continue;
    }
    if (char === '\n' || char === '\r' || char === '\t') {
      output += char === '\t' ? '\\t' : '\\n';
      kinds.add('unescaped_control');
      continue;
    }
    output += char;
  }
  return {
    changed: kinds.size > 0,
    value: output,
    kinds: Array.from(kinds),
  };
};

export const parseProviderToolArguments = (call = {}) => {
  const streamed = String(call?.metadata?.streamingArgumentsText ?? '').trim();
  if (!streamed) {
    return isPlainObject(call?.arguments)
      ? { ok: true, args: call.arguments, repairApplied: false, repairKinds: [] }
      : { ok: false, reason: 'invalid_arguments_json', repairApplied: false, repairKinds: [] };
  }
  try {
    const args = JSON.parse(streamed);
    return isPlainObject(args)
      ? { ok: true, args, repairApplied: false, repairKinds: [] }
      : { ok: false, reason: 'invalid_arguments_json', repairApplied: false, repairKinds: [] };
  } catch {}

  const repaired = repairProviderToolArgumentsJson(streamed);
  if (!repaired.changed) {
    return { ok: false, reason: 'invalid_arguments_json', repairApplied: false, repairKinds: [] };
  }
  try {
    const args = JSON.parse(repaired.value);
    return isPlainObject(args)
      ? { ok: true, args, repairApplied: true, repairKinds: repaired.kinds }
      : { ok: false, reason: 'invalid_arguments_json', repairApplied: false, repairKinds: [] };
  } catch {
    return { ok: false, reason: 'invalid_arguments_json', repairApplied: false, repairKinds: [] };
  }
};
