import {
  createWsClient,
  findAppPageTarget,
} from '../../cdp-client.mjs';

const page = await findAppPageTarget();
if (!page?.webSocketDebuggerUrl) {
  throw new Error('app page target not found');
}

const result = await new Promise((resolve, reject) => {
  let ws = null;
  let paused = false;
  let snapshot = null;
  const timer = setTimeout(() => {
    if (paused) {
      try {
        ws?.send(JSON.stringify({ id: 99, method: 'Debugger.resume' }));
      } catch {}
    }
    try {
      ws?.close();
    } catch {}
    reject(new Error('busy renderer stack capture timed out'));
  }, 15000);
  const finish = (fn, value) => {
    clearTimeout(timer);
    try {
      ws?.close();
    } catch {}
    fn(value);
  };
  ws = createWsClient(page.webSocketDebuggerUrl, {
    onOpen: () => {
      ws.send(JSON.stringify({ id: 1, method: 'Debugger.enable' }));
      // Debugger.enable can be queued behind a long-running script. Queue the
      // interrupt immediately so the renderer does not need to yield first.
      ws.send(JSON.stringify({ id: 2, method: 'Debugger.pause' }));
    },
    onMessage: (raw) => {
      let message = null;
      try {
        message = JSON.parse(raw);
      } catch {
        return;
      }
      if (message.method === 'Debugger.paused') {
        paused = true;
        const params = message.params || {};
        snapshot = {
          reason: params.reason || '',
          hitBreakpoints: params.hitBreakpoints || [],
          callFrames: (params.callFrames || []).slice(0, 40).map(frame => ({
            functionName: frame.functionName || '(anonymous)',
            url: frame.url || '',
            location: {
              scriptId: frame.location?.scriptId || '',
              lineNumber: Number(frame.location?.lineNumber || 0) + 1,
              columnNumber: Number(frame.location?.columnNumber || 0) + 1,
            },
            scopeTypes: (frame.scopeChain || []).map(scope => scope.type),
          })),
          asyncStackTrace: params.asyncStackTrace || null,
        };
        ws.send(JSON.stringify({ id: 3, method: 'Debugger.resume' }));
        return;
      }
      if (message.id === 3) {
        paused = false;
        finish(resolve, snapshot || { reason: 'resume_without_snapshot', callFrames: [] });
      }
    },
    onError: error => finish(reject, error),
  });
});

console.log(JSON.stringify({
  ok: true,
  target: { id: page.id, title: page.title, url: page.url },
  ...result,
}, null, 2));
