import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { evaluateInApp } from '../../cdp-client.mjs';

const pathArgIndex = process.argv.indexOf('--file');
const outputPath = resolve(
  process.argv[pathArgIndex + 1]
    || 'scripts/dev/tmp/mt-observation/maid-conversation-current.json',
);

const exported = await evaluateInApp(`(() => {
  const store = window.appBridge?.debugUiRegistry?.stores?.maidConversationStore;
  if (!store?.exportState) return { ok: false, reason: 'maid_conversation_store_missing' };
  return {
    ok: true,
    state: store.exportState(),
    context: store.getContextSnapshot?.() || null,
  };
})()`);

if (!exported?.ok || !exported.state) {
  throw new Error(exported?.reason || 'failed to export maid conversation');
}

writeFileSync(outputPath, `${JSON.stringify(exported.state, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  ok: true,
  outputPath,
  threadId: exported.state.threadId,
  turns: exported.state.turns?.length || 0,
  activeTurns: exported.state.turns?.filter((turn) => !turn?.compacted).length || 0,
  memoryRows: exported.state.memoryRows?.length || 0,
  contextTokens: exported.context?.tokenCount || 0,
}, null, 2));
