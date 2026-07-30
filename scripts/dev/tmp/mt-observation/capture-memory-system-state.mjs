import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { evaluateInApp } from '../../cdp-client.mjs';

const outputIndex = process.argv.indexOf('--output');
const outputPath = resolve(
  outputIndex >= 0
    ? process.argv[outputIndex + 1]
    : 'scripts/dev/tmp/mt-observation/maid-memory-system-v4f-final-20260730.json',
);

const state = await evaluateInApp(`(async () => {
  const stores = window.appBridge?.debugUiRegistry?.stores || {};
  const conversation = stores.maidConversationStore;
  const semantic = stores.maidSemanticMemoryStore;
  if (!conversation?.exportState || !semantic?.exportState) {
    return { ok: false, reason: 'maid_memory_runtime_missing' };
  }
  await conversation.flushPendingExtractions?.();
  return {
    ok: true,
    capturedAt: Date.now(),
    semanticScope: semantic.scopeId || '',
    conversation: conversation.exportState(),
    semantic: semantic.exportState(),
    context: await conversation.getContextSnapshotAsync?.({
      query: '请回忆这轮测试要求的回复风格与后台操作偏好',
    }),
  };
})()`, { timeoutMs: 300000 });

if (!state?.ok) throw new Error(state?.reason || 'failed to capture maid memory state');
writeFileSync(outputPath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  ok: true,
  outputPath,
  semanticScope: state.semanticScope,
  turns: state.conversation?.turns?.length || 0,
  memoryRows: state.conversation?.memoryRows?.length || 0,
  extractionBatches: state.conversation?.extractionBatches?.length || 0,
  semanticMemories: state.semantic?.memories?.length || 0,
  contextTokens: state.context?.tokenCount || 0,
}, null, 2));
