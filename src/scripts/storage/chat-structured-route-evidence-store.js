import {
  CHAT_STRUCTURED_EVIDENCE_MAX_CELLS,
  CHAT_STRUCTURED_EVIDENCE_SCHEMA_VERSION,
  applyChatStructuredEvidenceOutcome,
  createEmptyChatStructuredEvidenceCell,
  getChatStructuredEvidenceAvailability,
  getChatStructuredEvidenceKey,
  normalizeChatStructuredEvidenceCell,
} from '../agent/chat-structured-route-evidence.js';
import { safeInvoke } from '../utils/tauri.js';

export const CHAT_STRUCTURED_EVIDENCE_STORE_KEY = 'chat_structured_route_evidence_v2';

const clone = (value, fallback = null) => {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return fallback;
  }
};

const normalizeSavedAt = value => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.trunc(number) : 0;
};

const normalizeStore = (input = null, { now = Date.now } = {}) => {
  if (!input || typeof input !== 'object') return null;
  if (Number(input.schemaVersion) !== CHAT_STRUCTURED_EVIDENCE_SCHEMA_VERSION) return null;
  const source = Array.isArray(input.cells) ? input.cells : [];
  if (source.length > CHAT_STRUCTURED_EVIDENCE_MAX_CELLS) return null;
  const cells = [];
  const keys = new Set();
  for (const entry of source) {
    const normalized = normalizeChatStructuredEvidenceCell(entry, { now });
    if (!normalized || keys.has(normalized.key)) return null;
    keys.add(normalized.key);
    cells.push(normalized);
  }
  return {
    schemaVersion: CHAT_STRUCTURED_EVIDENCE_SCHEMA_VERSION,
    savedAt: normalizeSavedAt(input.savedAt),
    cells,
  };
};

const chooseNewest = (left, right) => {
  if (!left) return right;
  if (!right) return left;
  return left.savedAt >= right.savedAt ? left : right;
};

const readMirror = (storage, now) => {
  try {
    const raw = storage?.getItem?.(CHAT_STRUCTURED_EVIDENCE_STORE_KEY);
    return raw ? normalizeStore(JSON.parse(raw), { now }) : null;
  } catch {
    return null;
  }
};

export const createChatStructuredRouteEvidenceStore = ({
  invoke = safeInvoke,
  storage = globalThis?.localStorage,
  now = Date.now,
} = {}) => {
  let state = {
    schemaVersion: CHAT_STRUCTURED_EVIDENCE_SCHEMA_VERSION,
    savedAt: 0,
    cells: [],
  };
  let mutationQueue = Promise.resolve();
  const halfOpenLeases = new Map();

  const enqueue = (operation) => {
    const run = mutationQueue.then(operation, operation);
    mutationQueue = run.catch(() => {});
    return run;
  };

  const commit = (payload) => {
    const normalized = normalizeStore(payload, { now });
    if (!normalized) throw new TypeError('chat_structured_evidence_store_invalid');
    state = normalized;
    return clone(state.cells, []);
  };

  const persist = async (cells) => {
    const normalizedCells = [];
    const keys = new Set();
    for (const entry of Array.isArray(cells) ? cells : []) {
      const normalized = normalizeChatStructuredEvidenceCell(entry, { now });
      if (!normalized || keys.has(normalized.key)) {
        throw new TypeError('chat_structured_evidence_cell_invalid');
      }
      keys.add(normalized.key);
      normalizedCells.push(normalized);
    }
    if (normalizedCells.length > CHAT_STRUCTURED_EVIDENCE_MAX_CELLS) {
      throw new RangeError('chat_structured_evidence_limit_exceeded');
    }
    const payload = {
      schemaVersion: CHAT_STRUCTURED_EVIDENCE_SCHEMA_VERSION,
      savedAt: Math.max(1, Math.trunc(Number(now?.() || Date.now()) || Date.now())),
      cells: normalizedCells,
    };
    let nativeSaved = false;
    let mirrorSaved = false;
    try {
      await invoke?.('save_kv', { name: CHAT_STRUCTURED_EVIDENCE_STORE_KEY, data: payload });
      nativeSaved = true;
    } catch {}
    try {
      storage?.setItem?.(CHAT_STRUCTURED_EVIDENCE_STORE_KEY, JSON.stringify(payload));
      mirrorSaved = true;
    } catch {}
    if (!nativeSaved && !mirrorSaved) throw new Error('chat_structured_evidence_save_failed');
    return commit(payload);
  };

  const findIndex = (identity, mode) => {
    const key = getChatStructuredEvidenceKey(identity, mode);
    return key ? state.cells.findIndex(cell => cell.key === key) : -1;
  };

  return Object.freeze({
    async load() {
      return enqueue(async () => {
        let nativeStore = null;
        try {
          nativeStore = normalizeStore(await invoke?.('load_kv', {
            name: CHAT_STRUCTURED_EVIDENCE_STORE_KEY,
          }), { now });
        } catch {}
        const selected = chooseNewest(nativeStore, readMirror(storage, now)) || {
          schemaVersion: CHAT_STRUCTURED_EVIDENCE_SCHEMA_VERSION,
          savedAt: 0,
          cells: [],
        };
        return commit(selected);
      });
    },

    list() {
      return clone(state.cells, []);
    },

    get(identity = {}, mode = '') {
      const index = findIndex(identity, mode);
      return index >= 0 ? clone(state.cells[index], null) : null;
    },

    getHalfOpenAvailability(identity = {}, mode = '') {
      const key = getChatStructuredEvidenceKey(identity, mode);
      const index = key ? state.cells.findIndex(cell => cell.key === key) : -1;
      const cell = index >= 0 ? state.cells[index] : null;
      return getChatStructuredEvidenceAvailability(cell, {
        now,
        halfOpenLeaseAvailable: Boolean(key) && !halfOpenLeases.has(key),
      });
    },

    tryAcquireHalfOpen(identity = {}, mode = '', { requestId = '' } = {}) {
      const key = getChatStructuredEvidenceKey(identity, mode);
      const id = String(requestId || '').trim();
      if (!key || !id || halfOpenLeases.has(key)) return false;
      const index = state.cells.findIndex(cell => cell.key === key);
      if (index < 0) return false;
      const availability = getChatStructuredEvidenceAvailability(state.cells[index], {
        now,
        halfOpenLeaseAvailable: true,
      });
      if (availability.halfOpen !== true) return false;
      halfOpenLeases.set(key, id);
      return true;
    },

    releaseHalfOpen(identity = {}, mode = '', { requestId = '' } = {}) {
      const key = getChatStructuredEvidenceKey(identity, mode);
      const id = String(requestId || '').trim();
      if (!key || !halfOpenLeases.has(key)) return false;
      if (id && halfOpenLeases.get(key) !== id) return false;
      halfOpenLeases.delete(key);
      return true;
    },

    releaseHalfOpenRequest(requestId = '') {
      const id = String(requestId || '').trim();
      if (!id) return false;
      let released = false;
      for (const [key, owner] of halfOpenLeases.entries()) {
        if (owner !== id) continue;
        halfOpenLeases.delete(key);
        released = true;
      }
      return released;
    },

    async armHalfOpen(identity = {}, mode = '') {
      return enqueue(async () => {
        const index = findIndex(identity, mode);
        if (index < 0 || state.cells[index]?.health?.circuitOpen !== true) return false;
        const next = state.cells.slice();
        next[index] = {
          ...state.cells[index],
          health: {
            ...state.cells[index].health,
            halfOpenReady: true,
          },
          updatedAt: Math.max(1, Math.trunc(Number(now?.() || Date.now()) || Date.now())),
        };
        await persist(next);
        return true;
      });
    },

    async record(identity = {}, mode = '', outcome = {}) {
      return enqueue(async () => {
        const index = findIndex(identity, mode);
        const current = index >= 0
          ? state.cells[index]
          : createEmptyChatStructuredEvidenceCell({ identity, mode, now });
        const transition = applyChatStructuredEvidenceOutcome(current, outcome, { now });
        if (!transition.changed) return transition;
        const next = state.cells.slice();
        if (index >= 0) next[index] = transition.cell;
        else next.push(transition.cell);
        await persist(next);
        const savedIndex = findIndex(identity, mode);
        return {
          ...transition,
          cell: savedIndex >= 0 ? clone(state.cells[savedIndex], null) : null,
        };
      });
    },

    async reset(identity = {}, mode = '') {
      return enqueue(async () => {
        const key = getChatStructuredEvidenceKey(identity, mode);
        const index = findIndex(identity, mode);
        if (index < 0) return false;
        const current = state.cells[index];
        const reset = createEmptyChatStructuredEvidenceCell({
          identity: current.identity,
          mode: current.mode,
          now,
        });
        reset.createdAt = current.createdAt;
        const next = state.cells.slice();
        next[index] = reset;
        await persist(next);
        if (key) halfOpenLeases.delete(key);
        return true;
      });
    },

    async remove(identity = {}, mode = '') {
      return enqueue(async () => {
        const key = getChatStructuredEvidenceKey(identity, mode);
        const index = findIndex(identity, mode);
        if (index < 0) return false;
        const next = state.cells.slice();
        next.splice(index, 1);
        await persist(next);
        if (key) halfOpenLeases.delete(key);
        return true;
      });
    },

    async clear() {
      return enqueue(async () => {
        if (!state.cells.length) {
          halfOpenLeases.clear();
          return true;
        }
        await persist([]);
        halfOpenLeases.clear();
        return true;
      });
    },
  });
};

export const chatStructuredRouteEvidenceStore = createChatStructuredRouteEvidenceStore();
