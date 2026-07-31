import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { evaluateInApp } from '../../cdp-client.mjs';

const outputPath = resolve(
  'scripts/dev/tmp/mt-observation/v4f-v2-memory-aging-20260731.json',
);
const result = await evaluateInApp(`(async () => {
  const stores = window.appBridge?.debugUiRegistry?.stores || {};
  const conversation = stores.maidConversationStore;
  const semantic = stores.maidSemanticMemoryStore;
  if (!conversation?.appendTurn || !semantic?.exportState) {
    return { ok: false, reason: 'maid_memory_runtime_missing' };
  }
  const before = conversation.exportState();
  const appendedTurnIds = [];
  for (let index = 1; index <= 10; index += 1) {
    const turn = await conversation.appendTurn({
      input: \`冻结观察自然间隔 \${index}：这轮没有新增长期事项。\`,
      status: 'responded',
      responseType: 'chat',
      message: '收到，这轮没有新增长期事项。',
      context: { source: 'v4f_v2_memory_aging' },
    });
    appendedTurnIds.push(String(turn?.id || ''));
  }
  await conversation.flushPendingExtractions?.();
  const after = conversation.exportState();
  const semanticState = semantic.exportState();
  const targets = (semanticState.memories || []).filter(memory => (
    /霜港核对完成|名字含「?V4F-V2」?/.test(String(memory?.content || ''))
  ));
  return {
    ok: targets.length > 0,
    appendedTurnIds,
    before: {
      turns: before.turns?.length || 0,
      activeTurns: (before.turns || []).filter(turn => !turn.compacted).length,
      compactedTurns: (before.turns || []).filter(turn => turn.compacted).length,
      memoryRows: before.memoryRows?.length || 0,
      extractionBatchCount: before.extractionBatches?.length || 0,
    },
    after: {
      turns: after.turns?.length || 0,
      activeTurns: (after.turns || []).filter(turn => !turn.compacted).length,
      compactedTurns: (after.turns || []).filter(turn => turn.compacted).length,
      memoryRows: after.memoryRows?.length || 0,
      extractionBatches: (after.extractionBatches || []).slice(-3).map(batch => ({
        id: batch.id,
        sourceTurnIds: batch.sourceTurnIds || [],
        status: batch.status,
        attempts: batch.attempts,
        deterministicComplete: batch.deterministicComplete,
        extractedCount: batch.extractedCount,
        modelSource: batch.modelSource,
        model: batch.model,
        fallbackUsed: batch.fallbackUsed,
        lastError: batch.lastError || '',
      })),
    },
    targets: targets.map(memory => ({
      id: memory.id,
      kind: memory.kind,
      key: memory.key,
      content: memory.content,
      confidence: memory.confidence,
      status: memory.status,
      sourceTurnIds: memory.sourceTurnIds || [],
    })),
  };
})()`, { timeoutMs: 600_000 });

writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ outputPath, ...result }, null, 2));
if (!result?.ok) process.exitCode = 1;
