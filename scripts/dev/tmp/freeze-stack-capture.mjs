// 抓取忙死主线程的当前调用栈：Debugger.enable + Debugger.pause 可中断正在执行的 JS。
// 用法：node scripts/dev/tmp/freeze-stack-capture.mjs
import { createWsClient, findAppPageTarget } from '../cdp-client.mjs';

const main = async () => {
  const target = await findAppPageTarget();
  if (!target?.webSocketDebuggerUrl) {
    console.error('no page target');
    process.exit(1);
  }
  let seq = 0;
  const pending = new Map();
  const scripts = new Map();
  let resolved = false;

  const finish = (payload, code = 0) => {
    if (resolved) return;
    resolved = true;
    console.log(JSON.stringify(payload, null, 2));
    process.exit(code);
  };

  const timer = setTimeout(() => finish({ error: 'pause timed out — thread may be blocked in native code (not JS loop)' }, 3), 15000);

  const ws = createWsClient(target.webSocketDebuggerUrl, {
    onOpen: () => {
      send('Debugger.enable', {});
      send('Debugger.pause', {});
    },
    onMessage: (raw) => {
      const msg = JSON.parse(raw);
      if (msg.id && pending.has(msg.id)) pending.delete(msg.id);
      if (msg.method === 'Debugger.scriptParsed') {
        scripts.set(msg.params.scriptId, msg.params.url || '');
        return;
      }
      if (msg.method === 'Debugger.paused') {
        clearTimeout(timer);
        const frames = (msg.params.callFrames || []).slice(0, 40).map(frame => ({
          fn: frame.functionName || '(anonymous)',
          url: (frame.url || scripts.get(frame.location?.scriptId) || '').replace(/^.*\/(src|scripts)\//, '$1/'),
          line: (frame.location?.lineNumber ?? -1) + 1,
          col: (frame.location?.columnNumber ?? -1) + 1,
        }));
        send('Debugger.resume', {});
        setTimeout(() => finish({ paused: true, frames }), 300);
      }
    },
    onError: err => finish({ error: err?.message || String(err) }, 2),
  });

  const send = (method, params) => {
    seq += 1;
    pending.set(seq, method);
    ws.send(JSON.stringify({ id: seq, method, params }));
  };
};

main();
