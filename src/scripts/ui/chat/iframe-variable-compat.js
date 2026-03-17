export function cloneMvuCompatValue(input) {
  try {
    return structuredClone(input);
  } catch {}
  try {
    return JSON.parse(JSON.stringify(input));
  } catch {}
  return input;
}

export function isMvuCompatContainer(value) {
  return Boolean(value) && typeof value === 'object';
}

export function normalizeMvuCompatOptionType(option = {}) {
  const raw = typeof option === 'string' ? option : option?.type;
  const token = String(raw || '').trim().toLowerCase();
  if (token === 'global') return 'global';
  if (token === 'local') return 'local';
  if (token === 'chat') return 'chat';
  if (token === 'message') return 'message';
  return 'message';
}

export function getMvuCompatScopeRootKey(option = {}) {
  const type = normalizeMvuCompatOptionType(option);
  if (type === 'global') return 'global_variables';
  if (type === 'local') return 'local_variables';
  return 'stat_data';
}

export function normalizeMvuCompatVars(input = {}) {
  const vars = input && typeof input === 'object' ? input : {};
  const stat = (vars.stat_data && typeof vars.stat_data === 'object')
    ? vars.stat_data
    : ((vars.variables && typeof vars.variables === 'object') ? vars.variables : {});
  const globalVars = (vars.global_variables && typeof vars.global_variables === 'object')
    ? vars.global_variables
    : {};
  const localVars = (vars.local_variables && typeof vars.local_variables === 'object')
    ? vars.local_variables
    : {};
  return {
    ...vars,
    stat_data: stat,
    variables: stat,
    status_current_variables: stat,
    global_variables: globalVars,
    local_variables: localVars,
  };
}

export function getMvuCompatScopedVariables(input = {}, option = {}) {
  const normalized = normalizeMvuCompatVars(input);
  const rootKey = getMvuCompatScopeRootKey(option);
  const scoped = normalized[rootKey];
  return isMvuCompatContainer(scoped) ? cloneMvuCompatValue(scoped) : {};
}

export function normalizeMvuCompatPath(path) {
  const text = String(path || '').trim();
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
        const segment = String(buffer || '').trim();
        if (segment) parts.push(/^\d+$/.test(segment) ? Number(segment) : segment);
        buffer = '';
        inBracket = false;
      } else {
        buffer += ch;
      }
      continue;
    }
    if (ch === '.') {
      const segment = String(buffer || '').trim();
      if (segment) parts.push(segment);
      buffer = '';
      continue;
    }
    if (ch === '[') {
      const segment = String(buffer || '').trim();
      if (segment) parts.push(segment);
      buffer = '';
      inBracket = true;
      continue;
    }
    buffer += ch;
  }
  const tail = String(buffer || '').trim();
  if (tail) parts.push(tail);
  return parts;
}

export function mergeMvuCompatValues(base, patch) {
  if (Array.isArray(patch)) return cloneMvuCompatValue(patch);
  if (!isMvuCompatContainer(patch)) return patch;
  const out = (isMvuCompatContainer(base) && !Array.isArray(base)) ? cloneMvuCompatValue(base) : {};
  Object.entries(patch || {}).forEach(([key, value]) => {
    out[key] = mergeMvuCompatValues(out[key], value);
  });
  return out;
}

export function deleteMvuCompatValueAtPath(target, path) {
  const parts = Array.isArray(path) ? path.slice() : normalizeMvuCompatPath(path);
  if (!parts.length || !isMvuCompatContainer(target)) return false;
  let current = target;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const key = parts[i];
    if (!isMvuCompatContainer(current) || !(key in current)) return false;
    current = current[key];
  }
  const leaf = parts[parts.length - 1];
  if (!isMvuCompatContainer(current) || !(leaf in current)) return false;
  if (Array.isArray(current) && typeof leaf === 'number') {
    current.splice(leaf, 1);
    return true;
  }
  delete current[leaf];
  return true;
}

export function flattenMvuCompatVariables(input = {}, prefix = '') {
  const out = {};
  const visit = (value, path) => {
    if (Array.isArray(value)) {
      if (!value.length && path) {
        out[path] = [];
        return;
      }
      value.forEach((item, index) => {
        const nextPath = path ? `${path}.${index}` : String(index);
        visit(item, nextPath);
      });
      return;
    }
    if (isMvuCompatContainer(value)) {
      const entries = Object.entries(value);
      if (!entries.length && path) {
        out[path] = {};
        return;
      }
      entries.forEach(([key, item]) => {
        const safeKey = String(key || '').trim();
        if (!safeKey) return;
        const nextPath = path ? `${path}.${safeKey}` : safeKey;
        visit(item, nextPath);
      });
      return;
    }
    if (!path) return;
    out[path] = cloneMvuCompatValue(value);
  };
  if (prefix) visit(input, prefix);
  else visit(input, '');
  return out;
}

export function setMvuCompatScopedVariables(input = {}, nextScoped, option = {}) {
  const normalized = normalizeMvuCompatVars(input);
  const rootKey = getMvuCompatScopeRootKey(option);
  const scoped = isMvuCompatContainer(nextScoped) ? cloneMvuCompatValue(nextScoped) : {};
  const next = { ...normalized };
  if (rootKey === 'stat_data') {
    next.stat_data = scoped;
    next.variables = scoped;
    next.status_current_variables = scoped;
  } else if (rootKey === 'global_variables') {
    next.global_variables = scoped;
  } else if (rootKey === 'local_variables') {
    next.local_variables = scoped;
  }
  return normalizeMvuCompatVars(next);
}

export function replaceMvuCompatScopedVariables(input = {}, nextScoped, option = {}) {
  return setMvuCompatScopedVariables(input, nextScoped, option);
}

export function mergeMvuCompatScopedVariables(input = {}, patch = {}, option = {}) {
  const current = getMvuCompatScopedVariables(input, option);
  const payload = isMvuCompatContainer(patch) ? patch : {};
  return setMvuCompatScopedVariables(input, mergeMvuCompatValues(current, payload), option);
}

export function deleteMvuCompatScopedVariable(input = {}, path, option = {}) {
  const scoped = getMvuCompatScopedVariables(input, option);
  deleteMvuCompatValueAtPath(scoped, path);
  return setMvuCompatScopedVariables(input, scoped, option);
}

export function pickMvuCompatSeedVars(input = {}) {
  const normalized = normalizeMvuCompatVars(input);
  return {
    stat_data: normalized.stat_data,
    variables: normalized.variables,
    status_current_variables: normalized.status_current_variables,
    global_variables: normalized.global_variables,
    local_variables: normalized.local_variables,
  };
}

export function buildMvuCompatWindowContext({ vars = {}, chat = [], currentMessageId = '' } = {}) {
  const normalized = normalizeMvuCompatVars(vars);
  const safeChat = Array.isArray(chat) ? chat : [];
  return {
    chat: safeChat,
    messages: safeChat,
    currentMessageId: currentMessageId === undefined || currentMessageId === null ? '' : currentMessageId,
    variables: normalized.stat_data,
    stat_data: normalized.stat_data,
    status_current_variables: normalized.status_current_variables,
    global_variables: normalized.global_variables,
    local_variables: normalized.local_variables,
  };
}
