import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { evaluateInApp } from '../../cdp-client.mjs';

const readArg = (name, fallback = '') => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? String(process.argv[index + 1] ?? fallback) : fallback;
};
const marker = readArg('--marker', '这是格式工具的测试');
const outputPath = resolve(readArg(
  '--output',
  'scripts/dev/tmp/mt-observation/v4f-v2-role-reply-20260731.json',
));
const deadline = Date.now() + 600_000;
const sleep = ms => new Promise(resolvePromise => setTimeout(resolvePromise, ms));

const expression = `(async () => {
  const store = window.appBridge?.debugUiRegistry?.stores?.chatStore;
  const sessionId = '艾琳·洛';
  const messages = store?.getMessages?.(sessionId) || [];
  let markerIndex = -1;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (
      String(message?.role || '') === 'user'
      && String(message?.content || '').includes(${JSON.stringify(marker)})
    ) {
      markerIndex = index;
      break;
    }
  }
  const assistant = markerIndex >= 0
    ? messages.slice(markerIndex + 1).find(message => String(message?.role || '') === 'assistant')
    : null;
  const rawOriginal = assistant
    ? await store?.loadRawOriginal?.(assistant, sessionId)
    : '';
  const activeSwipe = assistant && Array.isArray(assistant?.swipes)
    ? assistant.swipes[Number(assistant?.activeSwipe || 0)] || null
    : null;
  return {
    ready: Boolean(assistant && !window.appBridge?.isGenerating),
    isGenerating: window.appBridge?.isGenerating === true,
    currentSessionId: store?.getCurrent?.() || '',
    messageCount: messages.length,
    markerIndex,
    user: markerIndex >= 0 ? {
      id: String(messages[markerIndex]?.id || ''),
      content: String(messages[markerIndex]?.content || ''),
    } : null,
    assistant: assistant ? {
      id: String(assistant.id || ''),
      role: String(assistant.role || ''),
      content: String(assistant.content || ''),
      raw: String(assistant.raw || assistant.rawSource || ''),
      rawOriginal: String(rawOriginal || activeSwipe?.rawOriginal || ''),
      rawOriginalRef: assistant.rawOriginalRef || null,
      turnId: String(
        assistant?.meta?.formatRepairTurnId
        || assistant?.meta?.turnId
        || assistant?.formatRepairTurnId
        || '',
      ),
      meta: assistant.meta || null,
      swipeCount: Array.isArray(assistant.swipes) ? assistant.swipes.length : 0,
      activeSwipe: Number(assistant.activeSwipe || 0),
    } : null,
  };
})()`;

let last = null;
let readyAt = 0;
while (Date.now() < deadline) {
  last = await evaluateInApp(expression, { timeoutMs: 30_000 });
  if (last?.ready) {
    if (!readyAt) readyAt = Date.now();
    if (Date.now() - readyAt >= 3_000) break;
  } else {
    readyAt = 0;
  }
  console.log(JSON.stringify({
    waiting: true,
    isGenerating: last?.isGenerating,
    messageCount: last?.messageCount,
    markerIndex: last?.markerIndex,
    hasAssistant: Boolean(last?.assistant),
  }));
  await sleep(2_000);
}

const report = {
  schemaVersion: 1,
  capturedAt: Date.now(),
  ok: Boolean(
    last?.ready
    && last?.assistant?.id
    && last?.assistant?.rawOriginal
    && last?.assistant?.rawOriginalRef?.messageId
  ),
  ...last,
};
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ outputPath, ...report }, null, 2));
if (!report.ok) process.exitCode = 1;
