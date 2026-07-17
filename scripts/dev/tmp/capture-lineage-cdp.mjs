import { writeFileSync } from 'node:fs';
import { findAppPageTarget } from '../cdp-client.mjs';

const page = await findAppPageTarget();
if (!page?.webSocketDebuggerUrl) throw new Error('Chat App CDP target not found');

const socket = new WebSocket(page.webSocketDebuggerUrl);
const result = await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('CDP screenshot timed out')), 10000);
  socket.addEventListener('open', () => {
    socket.send(JSON.stringify({
      id: 1,
      method: 'Page.captureScreenshot',
      params: { format: 'png', fromSurface: true, captureBeyondViewport: false },
    }));
  });
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data || '{}'));
    if (message.id !== 1) return;
    clearTimeout(timer);
    if (message.error) reject(new Error(JSON.stringify(message.error)));
    else resolve(message.result?.data || '');
  });
  socket.addEventListener('error', reject);
});

socket.close();
const output = new URL('../../../.codex-lineage-cdp.png', import.meta.url);
writeFileSync(output, Buffer.from(result, 'base64'));
console.log(output.pathname);
