import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { evaluateInApp } from '../../cdp-client.mjs';

const mode = process.argv.includes('--restore') ? 'restore' : 'isolate';
const pathArgIndex = process.argv.indexOf('--file');
const snapshotPath = resolve(process.argv[pathArgIndex + 1] || 'scripts/dev/tmp/mt-observation/maid-conversation-before-v4f.json');

if (mode === 'isolate') {
  if (existsSync(snapshotPath)) {
    throw new Error(`snapshot already exists: ${snapshotPath}`);
  }
  const before = await evaluateInApp(`(() => {
    const store = window.appBridge?.debugUiRegistry?.stores?.maidConversationStore;
    if (!store?.exportState) return { ok: false, reason: 'maid_conversation_store_missing' };
    return { ok: true, state: store.exportState(), context: store.getContextSnapshot?.() || null };
  })()`);
  if (!before?.ok || !before.state) throw new Error(before?.reason || 'failed to export maid conversation');
  writeFileSync(snapshotPath, `${JSON.stringify(before.state, null, 2)}\n`, 'utf8');

  const isolated = await evaluateInApp(`(async () => {
    const store = window.appBridge?.debugUiRegistry?.stores?.maidConversationStore;
    if (!store?.write) return { ok: false, reason: 'maid_conversation_store_missing' };
    const now = Date.now();
    store.state = {
      version: 1,
      updatedAt: now,
      threadId: 'maid_v4f_observation_20260728',
      threadTitle: 'v4f 冻结观察测试',
      totalInjectedTokens: 0,
      pendingInjectedTokens: 0,
      compactionCount: 0,
      lastCompactionAt: 0,
      turns: [],
      memoryRows: [],
    };
    store.loaded = true;
    await store.write();
    return { ok: true, state: store.exportState(), context: store.getContextSnapshot?.() || null };
  })()`);
  if (!isolated?.ok) throw new Error(isolated?.reason || 'failed to isolate maid conversation');
  console.log(JSON.stringify({
    ok: true,
    mode,
    snapshotPath,
    before: {
      threadId: before.state.threadId,
      turns: before.state.turns?.length || 0,
      memoryRows: before.state.memoryRows?.length || 0,
      contextTokens: before.context?.tokenCount || 0,
    },
    after: {
      threadId: isolated.state.threadId,
      turns: isolated.state.turns?.length || 0,
      memoryRows: isolated.state.memoryRows?.length || 0,
      contextTokens: isolated.context?.tokenCount || 0,
    },
  }, null, 2));
} else {
  if (!existsSync(snapshotPath)) throw new Error(`snapshot missing: ${snapshotPath}`);
  const state = JSON.parse(readFileSync(snapshotPath, 'utf8'));
  const restored = await evaluateInApp(`(async () => {
    const store = window.appBridge?.debugUiRegistry?.stores?.maidConversationStore;
    if (!store?.write) return { ok: false, reason: 'maid_conversation_store_missing' };
    store.state = ${JSON.stringify(state)};
    store.loaded = true;
    await store.write();
    return { ok: true, state: store.exportState(), context: store.getContextSnapshot?.() || null };
  })()`);
  if (!restored?.ok) throw new Error(restored?.reason || 'failed to restore maid conversation');
  console.log(JSON.stringify({
    ok: true,
    mode,
    snapshotPath,
    restored: {
      threadId: restored.state.threadId,
      turns: restored.state.turns?.length || 0,
      memoryRows: restored.state.memoryRows?.length || 0,
      contextTokens: restored.context?.tokenCount || 0,
    },
  }, null, 2));
}
