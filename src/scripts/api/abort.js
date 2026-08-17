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
  const onProviderSources =
    typeof src.onProviderSources === 'function' ? src.onProviderSources : null;
  const {
    signal: _signal,
    nativeRequestId: _nativeRequestId,
    requestId: _requestId,
    onProviderToolCallDelta: _onProviderToolCallDelta,
    onProviderSources: _onProviderSources,
    ...rest
  } = src;
  return { signal, requestId, onProviderToolCallDelta, onProviderSources, options: rest };
};

export const createLinkedAbortController = ({ timeoutMs, signal, idle = false } = {}) => {
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

  const armTimeout = () => {
    timeoutId = setTimeout(() => {
      try { controller.abort(); } catch {}
    }, ms);
  };

  if (shouldTimeout) {
    armTimeout();
  }

  // idle 模式：timeoutMs 是「无数据空闲上限」而非总时长；每次 touch() 重置计时。
  // 流式请求必须用它——总时长超时会把健康的长流在中途杀死。
  const touch = () => {
    if (!shouldTimeout || idle !== true || controller.signal.aborted) return;
    if (timeoutId) {
      try { clearTimeout(timeoutId); } catch {}
      timeoutId = null;
    }
    armTimeout();
  };

  const cleanup = () => {
    if (timeoutId) {
      try { clearTimeout(timeoutId); } catch {}
      timeoutId = null;
    }
    if (signal) {
      try { signal.removeEventListener('abort', abortInner); } catch {}
    }
  };

  return { controller, cleanup, touch };
};
