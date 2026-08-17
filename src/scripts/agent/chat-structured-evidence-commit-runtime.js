const trim = value => String(value ?? '').trim();

const clone = (value, fallback = null) => {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return fallback;
  }
};

export const createChatStructuredEvidenceCommitRuntime = ({
  store,
  maxPending = 32,
} = {}) => {
  const pending = new Map();
  const limit = Math.max(1, Math.min(256, Math.trunc(Number(maxPending) || 32)));

  const prune = () => {
    while (pending.size > limit) pending.delete(pending.keys().next().value);
  };

  return Object.freeze({
    stage({ requestId = '', identity = null, mode = '', outcome = null } = {}) {
      const id = trim(requestId);
      if (!id || !identity || typeof identity !== 'object' || !trim(mode)) return false;
      pending.delete(id);
      pending.set(id, {
        identity: clone(identity, {}),
        mode: trim(mode),
        outcome: clone(outcome, {}),
      });
      prune();
      return true;
    },

    async finalize({ requestId = '', committed = false } = {}) {
      const id = trim(requestId);
      const staged = id ? pending.get(id) : null;
      if (!staged) return { recorded: false, reason: 'pending_evidence_missing', transition: null };
      pending.delete(id);
      if (committed !== true) {
        return { recorded: false, reason: 'transaction_not_committed', transition: null };
      }
      if (typeof store?.record !== 'function') {
        return { recorded: false, reason: 'evidence_store_unavailable', transition: null };
      }
      const transition = await store.record(staged.identity, staged.mode, {
        ...staged.outcome,
        committed: true,
        fallbackUsed: false,
      });
      return { recorded: true, reason: '', transition };
    },

    discard(requestId = '') {
      const id = trim(requestId);
      return id ? pending.delete(id) : false;
    },

    getPendingCount() {
      return pending.size;
    },
  });
};
