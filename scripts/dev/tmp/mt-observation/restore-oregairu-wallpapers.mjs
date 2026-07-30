import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';

import { evaluateInApp } from '../../cdp-client.mjs';

const sourceDir = resolve(
  'scripts/dev/tmp/mt-observation/oregairu-final-visual-audit',
);
const targets = [
  ['比企谷八幡', 'hachiman-wallpaper.jpg'],
  ['雪之下雪乃', 'yukino-wallpaper.jpg'],
  ['由比滨结衣', 'yui-wallpaper.jpg'],
  ['平塚静', 'shizuka-wallpaper.jpg'],
].map(([sessionId, fileName]) => {
  const bytes = readFileSync(resolve(sourceDir, fileName));
  return {
    sessionId,
    fileName: basename(fileName),
    dataUrl: `data:image/jpeg;base64,${bytes.toString('base64')}`,
    bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  };
});

const expression = `
(async (targets) => {
  const registry = window.appBridge?.debugUiRegistry || {};
  const stores = registry.stores || {};
  const chatStore = stores.chatStore;
  const invoke = globalThis.__TAURI__?.core?.invoke
    || globalThis.__TAURI__?.invoke
    || globalThis.__TAURI_INTERNALS__?.invoke;
  if (!chatStore || typeof chatStore.setSessionSettings !== 'function') {
    return { ok: false, reason: 'chat_store_unavailable' };
  }
  if (typeof invoke !== 'function') {
    return { ok: false, reason: 'tauri_invoke_unavailable' };
  }
  const restored = [];
  for (const target of targets) {
    if (!chatStore.hasSession?.(target.sessionId)) {
      restored.push({
        sessionId: target.sessionId,
        ok: false,
        reason: 'session_not_found',
      });
      continue;
    }
    try {
      const existing = chatStore.getSessionSettings?.(target.sessionId) || {};
      const saved = await invoke('save_wallpaper', {
        sessionId: target.sessionId,
        dataUrl: target.dataUrl,
        fileName: target.fileName,
        previousPath: '',
      });
      const path = String(saved?.path || '').trim();
      if (!path) throw new Error('save_wallpaper returned no path');
      const wallpaper = {
        ...(existing?.wallpaper && typeof existing.wallpaper === 'object'
          ? existing.wallpaper
          : {}),
        path,
        name: target.fileName,
        width: 1344,
        height: 768,
        opacity: 1,
        transient: false,
        source: 'maid-restored',
        updatedAt: Date.now(),
      };
      const next = { ...existing, wallpaper };
      delete next.chatBg;
      await Promise.resolve(chatStore.setSessionSettings(target.sessionId, next));
      const pathExists = await invoke('wallpaper_path_exists', { path });
      restored.push({
        sessionId: target.sessionId,
        ok: pathExists === true,
        path,
        pathExists: pathExists === true,
        bytes: target.bytes,
        sha256: target.sha256,
      });
    } catch (error) {
      restored.push({
        sessionId: target.sessionId,
        ok: false,
        reason: String(error?.message || error),
      });
    }
  }
  const currentSessionId = String(chatStore.getCurrent?.() || '').trim();
  const current = restored.find(item => item.sessionId === currentSessionId && item.ok);
  if (current && typeof registry.actions?.enterChatRoom === 'function') {
    await registry.actions.enterChatRoom(currentSessionId, currentSessionId, 'chat');
  }
  return {
    ok: restored.length === targets.length && restored.every(item => item.ok),
    currentSessionId,
    restored,
  };
})(${JSON.stringify(targets)})
`;

const result = await evaluateInApp(expression, { timeoutMs: 300000 });
console.log(JSON.stringify(result, null, 2));
if (result?.ok !== true) process.exitCode = 1;
