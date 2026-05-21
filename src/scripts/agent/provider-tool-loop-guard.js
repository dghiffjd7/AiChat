const isPlainObject = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));

const trim = (value, fallback = '') => {
  const text = String(value ?? '').trim();
  return text || fallback;
};

const stableSerialize = (value) => {
  if (value === null || value === undefined) return 'null';
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
  if (!isPlainObject(value)) return JSON.stringify(value);
  const entries = Object.keys(value)
    .sort()
    .map(key => `${JSON.stringify(key)}:${stableSerialize(value[key])}`);
  return `{${entries.join(',')}}`;
};

const getArgs = (toolCall = {}) => {
  if (isPlainObject(toolCall.arguments)) return toolCall.arguments;
  if (isPlainObject(toolCall.args)) return toolCall.args;
  if (isPlainObject(toolCall.input)) return toolCall.input;
  return {};
};

export const buildProviderToolLoopKey = ({
  provider = '',
  model = '',
  sessionId = '',
  toolName = '',
  name = '',
  arguments: args = null,
  args: legacyArgs = null,
  input = null,
} = {}) => {
  const normalizedArgs = isPlainObject(args)
    ? args
    : (isPlainObject(legacyArgs) ? legacyArgs : (isPlainObject(input) ? input : {}));
  return [
    trim(provider, 'provider'),
    trim(model, 'model'),
    trim(sessionId, 'session'),
    trim(toolName || name, 'tool'),
    stableSerialize(normalizedArgs),
  ].join('|');
};

export const createProviderToolLoopGuard = ({
  maxRepeats = 3,
  windowMs = 60_000,
  now = Date.now,
} = {}) => {
  const calls = new Map();
  const limit = Math.max(1, Math.trunc(Number(maxRepeats)) || 3);
  const span = Math.max(1, Math.trunc(Number(windowMs)) || 60_000);
  const readNow = () => Number(now?.() || Date.now()) || Date.now();

  const prune = (timestamp = readNow()) => {
    const cutoff = timestamp - span;
    calls.forEach((items, key) => {
      const kept = items.filter(item => item >= cutoff);
      if (kept.length) calls.set(key, kept);
      else calls.delete(key);
    });
  };

  const check = (toolCall = {}) => {
    const timestamp = readNow();
    prune(timestamp);
    const key = buildProviderToolLoopKey({
      ...toolCall,
      arguments: isPlainObject(toolCall.arguments) ? toolCall.arguments : getArgs(toolCall),
    });
    const items = calls.get(key) || [];
    const nextCount = items.length + 1;
    return {
      allowed: nextCount <= limit,
      key,
      repeatCount: nextCount,
      maxRepeats: limit,
      windowMs: span,
      reason: nextCount <= limit
        ? ''
        : `repeated provider tool call blocked: ${trim(toolCall.toolName || toolCall.name, 'tool')}`,
    };
  };

  const record = (toolCall = {}) => {
    const result = check(toolCall);
    const timestamp = readNow();
    const items = calls.get(result.key) || [];
    calls.set(result.key, [...items, timestamp]);
    return result;
  };

  return {
    check,
    record,
    clear: () => calls.clear(),
    getSnapshot: () => Array.from(calls.entries()).map(([key, timestamps]) => ({
      key,
      count: timestamps.length,
      timestamps: timestamps.slice(),
    })),
  };
};
