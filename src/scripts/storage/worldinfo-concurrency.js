export const WORLDINFO_REVISION_CONFLICT = 'worldbook_revision_conflict';

const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key);

const cloneValue = (value) => {
  if (value === undefined || value === null) return value;
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(value);
    } catch {}
  }
  return JSON.parse(JSON.stringify(value));
};

const canonicalStringify = (value, stack = new Set()) => {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value !== 'object') return JSON.stringify(String(value));
  if (stack.has(value)) return '"[Circular]"';
  stack.add(value);
  let result = '';
  if (Array.isArray(value)) {
    result = `[${value.map(item => canonicalStringify(item, stack)).join(',')}]`;
  } else {
    const keys = Object.keys(value).sort();
    result = `{${keys.map(key => `${JSON.stringify(key)}:${canonicalStringify(value[key], stack)}`).join(',')}}`;
  }
  stack.delete(value);
  return result;
};

const fingerprintMemo = new WeakMap();

const fingerprintValue = (value) => {
  if (value === null || value === undefined) return 'absent';
  if (typeof value === 'object') {
    const memoized = fingerprintMemo.get(value);
    if (memoized) return memoized;
  }
  const text = canonicalStringify(value);
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    first ^= code;
    first = Math.imul(first, 0x01000193);
    second ^= code + ((second << 6) >>> 0) + (second >>> 2);
  }
  const fingerprint = `${text.length}:${first >>> 0}:${second >>> 0}`;
  if (typeof value === 'object') fingerprintMemo.set(value, fingerprint);
  return fingerprint;
};

const normalizeResourceId = value => String(value || '').trim();

export class WorldInfoConcurrencyCoordinator {
  constructor() {
    this.states = new Map();
    this.queues = new Map();
  }

  _getState(resourceId) {
    const id = normalizeResourceId(resourceId);
    if (!this.states.has(id)) {
      this.states.set(id, {
        initialized: false,
        exists: false,
        revision: 0,
        generation: 0,
        fingerprint: 'absent',
      });
    }
    return this.states.get(id);
  }

  _metadata(resourceId, state = this._getState(resourceId)) {
    return Object.freeze({
      worldbookId: normalizeResourceId(resourceId),
      exists: state.exists,
      revision: state.revision,
      generation: state.generation,
    });
  }

  observe(resourceId, data) {
    const state = this._getState(resourceId);
    const exists = data !== null && data !== undefined;
    const fingerprint = fingerprintValue(data);
    if (!state.initialized) {
      state.initialized = true;
      state.exists = exists;
      state.revision = exists ? 1 : 0;
      state.generation = exists ? 1 : 0;
      state.fingerprint = fingerprint;
      return this._metadata(resourceId, state);
    }
    if (state.exists !== exists || state.fingerprint !== fingerprint) {
      if (!state.exists && exists) state.generation += 1;
      state.exists = exists;
      state.revision += 1;
      state.fingerprint = fingerprint;
    }
    return this._metadata(resourceId, state);
  }

  snapshot(resourceId, data) {
    const metadata = this.observe(resourceId, data);
    return Object.freeze({
      ...metadata,
      data: cloneValue(data),
    });
  }

  validate(resourceId, options = {}) {
    const state = this._getState(resourceId);
    const checksRevision = hasOwn(options, 'expectedRevision')
      && options.expectedRevision !== null
      && options.expectedRevision !== undefined;
    const checksGeneration = hasOwn(options, 'expectedGeneration')
      && options.expectedGeneration !== null
      && options.expectedGeneration !== undefined;
    const checksExists = hasOwn(options, 'expectedExists')
      && typeof options.expectedExists === 'boolean';
    const revisionMatches = !checksRevision || Number(options.expectedRevision) === state.revision;
    const generationMatches = !checksGeneration || Number(options.expectedGeneration) === state.generation;
    const existenceMatches = !checksExists || options.expectedExists === state.exists;
    if (revisionMatches && generationMatches && existenceMatches) return null;
    return {
      ok: false,
      conflict: true,
      reason: WORLDINFO_REVISION_CONFLICT,
      worldbookId: normalizeResourceId(resourceId),
      expectedRevision: checksRevision ? Number(options.expectedRevision) : null,
      currentRevision: state.revision,
      expectedGeneration: checksGeneration ? Number(options.expectedGeneration) : null,
      currentGeneration: state.generation,
      expectedExists: checksExists ? options.expectedExists : null,
      currentExists: state.exists,
    };
  }

  commitSave(resourceId, data) {
    const state = this._getState(resourceId);
    if (!state.initialized) this.observe(resourceId, null);
    if (!state.exists) state.generation += 1;
    state.initialized = true;
    state.exists = true;
    state.revision += 1;
    state.fingerprint = fingerprintValue(data);
    return this._metadata(resourceId, state);
  }

  commitDelete(resourceId) {
    const state = this._getState(resourceId);
    if (!state.initialized) this.observe(resourceId, null);
    if (state.exists) state.revision += 1;
    state.initialized = true;
    state.exists = false;
    state.fingerprint = 'absent';
    return this._metadata(resourceId, state);
  }

  _enqueueKey(resourceId, operation) {
    const id = normalizeResourceId(resourceId);
    const previous = this.queues.get(id) || Promise.resolve();
    const result = previous.catch(() => {}).then(operation);
    const tail = result.catch(() => {});
    this.queues.set(id, tail);
    return result.finally(() => {
      if (this.queues.get(id) === tail) this.queues.delete(id);
    });
  }

  enqueue(resourceId, operation) {
    if (typeof operation !== 'function') return Promise.resolve(undefined);
    return this._enqueueKey(resourceId, operation);
  }

  enqueueMany(resourceIds = [], operation) {
    if (typeof operation !== 'function') return Promise.resolve(undefined);
    const ids = Array.from(new Set(
      (Array.isArray(resourceIds) ? resourceIds : [resourceIds])
        .map(normalizeResourceId)
        .filter(Boolean),
    )).sort();
    const acquire = index => (
      index >= ids.length
        ? operation()
        : this._enqueueKey(ids[index], () => acquire(index + 1))
    );
    return acquire(0);
  }
}

export const cloneWorldInfoValue = cloneValue;
