export const readSessionEnterNowPerfMs = () => {
  try {
    if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
      return performance.now();
    }
  } catch {}
  return Date.now();
};

export const createSessionEnterRequestTracker = ({
  getCurrentSessionId = () => '',
} = {}) => {
  let requestToken = 0;
  return {
    beginRequest(sessionId = '') {
      const sid = String(sessionId || '').trim();
      requestToken += 1;
      return {
        token: requestToken,
        sessionId: sid,
      };
    },
    isStale(request) {
      const token = Number(request?.token || 0);
      const sid = String(request?.sessionId || '').trim();
      if (!token || !sid) return true;
      if (token !== requestToken) return true;
      if (String(getCurrentSessionId?.() || '').trim() !== sid) return true;
      return false;
    },
  };
};

export const createSessionEnterProgressiveHistoryRuntime = ({
  getCurrentSessionId = () => '',
  preloadHistory = () => {},
  prependHistory = () => {},
  decorateMessagesForDisplay = (messages) => messages,
  scheduleChunk = null,
  nowPerfMs = readSessionEnterNowPerfMs,
} = {}) => {
  const jobs = new Map();
  const schedule = typeof scheduleChunk === 'function'
    ? scheduleChunk
    : (runner) => {
      if (typeof runner !== 'function') return;
      try {
        if (typeof requestAnimationFrame === 'function') {
          requestAnimationFrame(() => setTimeout(runner, 0));
          return;
        }
      } catch {}
      setTimeout(runner, 0);
    };

  const cancelSessionFill = (sessionId = '') => {
    const sid = String(sessionId || '').trim();
    if (!sid) return;
    const job = jobs.get(sid);
    if (job) job.cancelled = true;
    jobs.delete(sid);
  };

  const cancelAll = () => {
    jobs.forEach((job) => {
      if (job) job.cancelled = true;
    });
    jobs.clear();
  };

  const renderHistory = (sessionId, messages = [], {
    keepScroll = true,
    recentCount = 24,
    chunkSize = 12,
  } = {}) => {
    const sid = String(sessionId || '').trim();
    const list = Array.isArray(messages) ? messages : [];
    if (!sid || !list.length) {
      preloadHistory([], { keepScroll });
      return {
        decorateMs: 0,
        preloadMs: 0,
        deferred: false,
        deferredCount: 0,
      };
    }
    const recentLimit = Math.max(1, recentCount);
    const prependChunkSize = Math.max(1, chunkSize);
    const splitAt = Math.max(0, list.length - recentLimit);
    const older = list.slice(0, splitAt);
    const recent = list.slice(splitAt);
    const decorateStart = nowPerfMs();
    const decoratedRecent = decorateMessagesForDisplay(recent, { sessionId: sid });
    const decorateMs = Math.round(nowPerfMs() - decorateStart);
    const preloadStart = nowPerfMs();
    preloadHistory(decoratedRecent, { keepScroll });
    const preloadMs = Math.round(nowPerfMs() - preloadStart);
    if (!older.length) {
      return {
        decorateMs,
        preloadMs,
        deferred: false,
        deferredCount: 0,
      };
    }
    cancelSessionFill(sid);
    const queue = [];
    for (let end = older.length; end > 0; end -= prependChunkSize) {
      const start = Math.max(0, end - prependChunkSize);
      queue.push(older.slice(start, end));
    }
    const job = { cancelled: false };
    jobs.set(sid, job);
    const pump = () => {
      if (job.cancelled || String(getCurrentSessionId?.() || '').trim() !== sid) {
        jobs.delete(sid);
        return;
      }
      const nextChunk = queue.shift();
      if (!nextChunk?.length) {
        jobs.delete(sid);
        return;
      }
      prependHistory(decorateMessagesForDisplay(nextChunk, { sessionId: sid }));
      if (queue.length) schedule(pump);
      else jobs.delete(sid);
    };
    schedule(pump);
    return {
      decorateMs,
      preloadMs,
      deferred: true,
      deferredCount: older.length,
    };
  };

  return {
    cancelSessionFill,
    cancelAll,
    renderHistory,
  };
};
