const trim = value => String(value ?? '').trim();

const normalizeTimeout = value => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 5000;
  return Math.max(0, Math.trunc(parsed));
};

const createDeferred = () => {
  let resolve;
  const promise = new Promise(next => { resolve = next; });
  return { promise, resolve };
};

export const createSessionAsyncWorkRuntime = () => {
  const recordsBySession = new Map();
  const closingSessions = new Map();
  let sequence = 0;

  const getRecords = (sessionId) => {
    const sid = trim(sessionId);
    return sid ? Array.from(recordsBySession.get(sid) || []) : [];
  };

  const requestCancel = (record, reason) => {
    if (!record || record.cancelRequested) return;
    record.cancelRequested = true;
    try {
      Promise.resolve(record.cancel?.(reason)).catch(() => {});
    } catch {}
  };

  const register = ({ sessionId = '', kind = 'async_work', cancel = null } = {}) => {
    const sid = trim(sessionId);
    if (!sid) {
      return {
        id: '',
        sessionId: '',
        kind: trim(kind) || 'async_work',
        settle: () => false,
      };
    }
    const deferred = createDeferred();
    const record = {
      id: `session-work-${++sequence}`,
      sessionId: sid,
      kind: trim(kind) || 'async_work',
      cancel: typeof cancel === 'function' ? cancel : null,
      cancelRequested: false,
      settled: false,
      settledPromise: deferred.promise,
      resolveSettled: deferred.resolve,
    };
    if (!recordsBySession.has(sid)) recordsBySession.set(sid, new Set());
    recordsBySession.get(sid).add(record);

    const closingState = closingSessions.get(sid);
    if (closingState?.reason) requestCancel(record, closingState.reason);

    return {
      id: record.id,
      sessionId: sid,
      kind: record.kind,
      settle(result) {
        if (record.settled) return false;
        record.settled = true;
        recordsBySession.get(sid)?.delete(record);
        if (!recordsBySession.get(sid)?.size) recordsBySession.delete(sid);
        record.resolveSettled(result);
        return true;
      },
    };
  };

  const cancelAndWait = async (sessionId, {
    reason = 'session_deleted',
    timeoutMs = 5000,
    holdClosing = false,
  } = {}) => {
    const sid = trim(sessionId);
    if (!sid) {
      return { ok: false, reason: 'missing_session_id', cancelledCount: 0, timedOut: false };
    }
    const cancelReason = trim(reason) || 'session_deleted';
    const timeout = normalizeTimeout(timeoutMs);
    const deadline = Date.now() + timeout;
    const cancelledIds = new Set();
    const closeToken = Symbol(sid);
    const closingState = closingSessions.get(sid) || { reason: cancelReason, tokens: new Set() };
    closingState.reason = cancelReason;
    closingState.tokens.add(closeToken);
    closingSessions.set(sid, closingState);
    let held = false;
    const release = () => {
      const current = closingSessions.get(sid);
      if (!current?.tokens?.has(closeToken)) return false;
      current.tokens.delete(closeToken);
      if (!current.tokens.size) closingSessions.delete(sid);
      return true;
    };
    try {
      while (true) {
        const records = getRecords(sid);
        if (!records.length) {
          held = holdClosing === true;
          return {
            ok: true,
            reason: '',
            sessionId: sid,
            cancelledCount: cancelledIds.size,
            timedOut: false,
            ...(held ? { release } : {}),
          };
        }
        records.forEach((record) => {
          cancelledIds.add(record.id);
          requestCancel(record, cancelReason);
        });
        const remaining = Math.max(0, deadline - Date.now());
        if (remaining === 0) {
          return {
            ok: false,
            reason: 'session_async_work_timeout',
            sessionId: sid,
            cancelledCount: cancelledIds.size,
            timedOut: true,
            pendingKinds: getRecords(sid).map(record => record.kind),
          };
        }
        let timer = null;
        const outcome = await Promise.race([
          Promise.allSettled(records.map(record => record.settledPromise)).then(() => 'settled'),
          new Promise(resolve => {
            timer = setTimeout(() => resolve('timeout'), remaining);
          }),
        ]);
        if (timer) clearTimeout(timer);
        if (outcome === 'timeout') {
          return {
            ok: false,
            reason: 'session_async_work_timeout',
            sessionId: sid,
            cancelledCount: cancelledIds.size,
            timedOut: true,
            pendingKinds: getRecords(sid).map(record => record.kind),
          };
        }
      }
    } finally {
      if (!held) release();
    }
  };

  return {
    register,
    cancelAndWait,
    count: sessionId => getRecords(sessionId).length,
    isClosing: sessionId => closingSessions.has(trim(sessionId)),
  };
};
