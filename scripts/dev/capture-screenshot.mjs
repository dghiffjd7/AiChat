// 截取运行中 APP 的当前画面：node scripts/dev/capture-screenshot.mjs <输出.png>
// 仅本地调试用途；依赖 --remote-debugging-port=9222。
import { writeFileSync } from 'node:fs';
import { createWsClient, findAppPageTarget } from './cdp-client.mjs';

const outPath = process.argv[2] || 'screenshot.png';

const page = await findAppPageTarget();
if (!page?.webSocketDebuggerUrl) {
  console.error('app page target not found');
  process.exit(1);
}

await new Promise((resolve, reject) => {
  const timeout = setTimeout(() => { reject(new Error('screenshot timed out')); }, 20000);
  let ws = null;
  ws = createWsClient(page.webSocketDebuggerUrl, {
    onOpen: () => {
      ws.send(JSON.stringify({ id: 1, method: 'Page.captureScreenshot', params: { format: 'png' } }));
    },
    onMessage: (raw) => {
      let message = null;
      try { message = JSON.parse(raw); } catch { return; }
      if (message.id !== 1) return;
      clearTimeout(timeout);
      try { ws?.close(); } catch {}
      if (message.error || !message.result?.data) {
        reject(new Error(`cdp error: ${JSON.stringify(message.error || message)}`));
        return;
      }
      writeFileSync(outPath, Buffer.from(message.result.data, 'base64'));
      console.log(`saved ${outPath}`);
      resolve();
    },
    onError: reject,
  });
});
