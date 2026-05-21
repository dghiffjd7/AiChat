export const splitRequestOptions = (options = {}) => {
  const src = (options && typeof options === 'object') ? options : {};
  const signal = src.signal;
  const nativeRequestIdRaw =
    typeof src.nativeRequestId === 'string'
      ? src.nativeRequestId
      : (typeof src.requestId === 'string' ? src.requestId : '');
  const requestId = String(nativeRequestIdRaw || '').trim();
  const onProviderToolCallDelta =
    typeof src.onProviderToolCallDelta === 'function' ? src.onProviderToolCallDelta : null;
  const {
    signal: _signal,
    nativeRequestId: _nativeRequestId,
    requestId: _requestId,
    onProviderToolCallDelta: _onProviderToolCallDelta,
    ...rest
  } = src;
  return { signal, requestId, onProviderToolCallDelta, options: rest };
};

export const createLinkedAbortController = ({ timeoutMs, signal } = {}) => {
  const controller = new AbortController();
  const ms = Number(timeoutMs);
  const shouldTimeout = Number.isFinite(ms) && ms > 0;
  let timeoutId = null;

  const abortInner = () => {
    try {
      controller.abort(signal?.reason);
    } catch {
      try { controller.abort(); } catch {}
    }
  };

  if (signal) {
    if (signal.aborted) {
      abortInner();
    } else {
      try { signal.addEventListener('abort', abortInner, { once: true }); } catch {}
    }
  }

  if (shouldTimeout) {
    timeoutId = setTimeout(() => {
      try { controller.abort(); } catch {}
    }, ms);
  }

  const cleanup = () => {
    if (timeoutId) {
      try { clearTimeout(timeoutId); } catch {}
      timeoutId = null;
    }
    if (signal) {
      try { signal.removeEventListener('abort', abortInner); } catch {}
    }
  };

  return { controller, cleanup };
};
