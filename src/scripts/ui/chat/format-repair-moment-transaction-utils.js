const list = value => (Array.isArray(value) ? value : []);

export const createFormatRepairMomentTransactionRuntime = ({
  exportState = null,
  importState = null,
  addMany = null,
  getMoment = null,
  finalizePosts = null,
  render = null,
} = {}) => {
  let active = null;

  const renderSafe = () => {
    try {
      render?.();
    } catch {}
  };

  const restore = (transaction) => {
    if (!transaction || typeof importState !== 'function') return false;
    importState(transaction.snapshot);
    return true;
  };

  return {
    isActive() {
      return Boolean(active);
    },

    begin() {
      if (active || typeof exportState !== 'function') return false;
      active = {
        snapshot: exportState(),
        postIds: [],
      };
      return true;
    },

    addPosts(items = []) {
      if (!active || typeof addMany !== 'function') return [];
      const saved = list(addMany(list(items)));
      saved.forEach((moment) => {
        const id = String(moment?.id || '').trim();
        if (id && !active.postIds.includes(id)) active.postIds.push(id);
      });
      return saved;
    },

    async commit() {
      const transaction = active;
      if (!transaction) return { ok: true, momentPostCount: 0 };
      try {
        const posts = transaction.postIds
          .map(id => getMoment?.(id))
          .filter(Boolean);
        await Promise.resolve(finalizePosts?.(posts));
        active = null;
        renderSafe();
        return { ok: true, momentPostCount: posts.length };
      } catch (error) {
        let restored = false;
        try {
          restored = restore(transaction);
        } catch {}
        active = null;
        renderSafe();
        return {
          ok: false,
          reason: 'moment_commit_failed',
          restored,
          error,
        };
      }
    },

    rollback() {
      const transaction = active;
      active = null;
      if (!transaction) return { ok: true, restored: false };
      let restored = false;
      try {
        restored = restore(transaction);
      } catch {
        renderSafe();
        return { ok: false, restored: false, reason: 'moment_rollback_failed' };
      }
      renderSafe();
      return { ok: true, restored };
    },
  };
};
