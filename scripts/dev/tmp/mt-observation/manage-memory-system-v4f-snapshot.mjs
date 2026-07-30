import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { evaluateInApp } from '../../cdp-client.mjs';

const mode = process.argv.includes('--restore') ? 'restore' : 'isolate';
const fileIndex = process.argv.indexOf('--file');
const scopeIndex = process.argv.indexOf('--scope');
const snapshotPath = resolve(
  fileIndex >= 0
    ? process.argv[fileIndex + 1]
    : 'scripts/dev/tmp/mt-observation/maid-memory-system-v4f-before-20260730.json',
);
const testScope = String(
  scopeIndex >= 0
    ? process.argv[scopeIndex + 1]
    : 'maid_systematic_v4f_20260730',
).trim();

if (mode === 'isolate') {
  if (existsSync(snapshotPath)) {
    throw new Error(`snapshot already exists: ${snapshotPath}`);
  }
  const before = await evaluateInApp(`(async () => {
    const stores = window.appBridge?.debugUiRegistry?.stores || {};
    const conversation = stores.maidConversationStore;
    const semantic = stores.maidSemanticMemoryStore;
    if (!conversation?.exportState || !semantic?.exportState) {
      return { ok: false, reason: 'maid_memory_runtime_missing' };
    }
    await conversation.flushPendingExtractions?.();
    return {
      ok: true,
      conversation: conversation.exportState(),
      semanticScope: semantic.scopeId || 'maid_default',
      semanticState: semantic.exportState(),
      context: conversation.getContextSnapshot?.() || null,
    };
  })()`, { timeoutMs: 300000 });
  if (!before?.ok) throw new Error(before?.reason || 'failed to snapshot maid memory runtime');
  writeFileSync(snapshotPath, `${JSON.stringify(before, null, 2)}\n`, 'utf8');

  const isolated = await evaluateInApp(`(async () => {
    const stores = window.appBridge?.debugUiRegistry?.stores || {};
    const conversation = stores.maidConversationStore;
    const semantic = stores.maidSemanticMemoryStore;
    if (!conversation?.write || !semantic?.setScope) {
      return { ok: false, reason: 'maid_memory_runtime_missing' };
    }
    const scope = ${JSON.stringify(testScope)};
    await semantic.setScope(scope);
    const existing = semantic.exportState?.() || {};
    if ((existing.memories || []).length) {
      return {
        ok: false,
        reason: 'test_scope_not_empty',
        scope,
        memoryCount: existing.memories.length,
      };
    }
    const now = Date.now();
    conversation.state = {
      version: 1,
      updatedAt: now,
      threadId: scope,
      threadTitle: \`女仆记忆系统批量观察 · \${scope}\`,
      totalInjectedTokens: 0,
      pendingInjectedTokens: 0,
      compactionCount: 0,
      lastCompactionAt: 0,
      turns: [],
      memoryRows: [],
      extractionBatches: [],
    };
    conversation.loaded = true;
    conversation.extractionPromise = null;
    conversation.lastExtractionPromise = null;
    conversation.extractionRerunRequested = false;
    await conversation.write();
    return {
      ok: true,
      scope,
      conversation: conversation.exportState(),
      semantic: semantic.exportState(),
      context: conversation.getContextSnapshot?.() || null,
    };
  })()`, { timeoutMs: 300000 });
  if (!isolated?.ok) throw new Error(isolated?.reason || 'failed to isolate maid memory runtime');
  console.log(JSON.stringify({
    ok: true,
    mode,
    snapshotPath,
    before: {
      threadId: before.conversation?.threadId || '',
      turns: before.conversation?.turns?.length || 0,
      memoryRows: before.conversation?.memoryRows?.length || 0,
      semanticScope: before.semanticScope,
      semanticMemories: before.semanticState?.memories?.length || 0,
      contextTokens: before.context?.tokenCount || 0,
    },
    after: {
      threadId: isolated.conversation?.threadId || '',
      turns: isolated.conversation?.turns?.length || 0,
      memoryRows: isolated.conversation?.memoryRows?.length || 0,
      semanticScope: isolated.scope,
      semanticMemories: isolated.semantic?.memories?.length || 0,
      contextTokens: isolated.context?.tokenCount || 0,
    },
  }, null, 2));
} else {
  if (!existsSync(snapshotPath)) throw new Error(`snapshot missing: ${snapshotPath}`);
  const snapshot = JSON.parse(readFileSync(snapshotPath, 'utf8'));
  const restored = await evaluateInApp(`(async () => {
    const stores = window.appBridge?.debugUiRegistry?.stores || {};
    const conversation = stores.maidConversationStore;
    const semantic = stores.maidSemanticMemoryStore;
    if (!conversation?.write || !semantic?.setScope) {
      return { ok: false, reason: 'maid_memory_runtime_missing' };
    }
    await conversation.flushPendingExtractions?.();
    const testState = {
      scope: semantic.scopeId || '',
      semantic: semantic.exportState?.() || {},
      conversation: conversation.exportState?.() || {},
    };
    await semantic.setScope(${JSON.stringify(snapshot.semanticScope || 'maid_default')});
    conversation.state = ${JSON.stringify(snapshot.conversation || {})};
    conversation.loaded = true;
    conversation.extractionPromise = null;
    conversation.lastExtractionPromise = null;
    conversation.extractionRerunRequested = false;
    await conversation.write();
    return {
      ok: true,
      testState,
      restored: {
        semanticScope: semantic.scopeId || '',
        semantic: semantic.exportState?.() || {},
        conversation: conversation.exportState?.() || {},
        context: conversation.getContextSnapshot?.() || null,
      },
    };
  })()`, { timeoutMs: 300000 });
  if (!restored?.ok) throw new Error(restored?.reason || 'failed to restore maid memory runtime');
  console.log(JSON.stringify({
    ok: true,
    mode,
    snapshotPath,
    test: {
      semanticScope: restored.testState?.scope || '',
      turns: restored.testState?.conversation?.turns?.length || 0,
      memoryRows: restored.testState?.conversation?.memoryRows?.length || 0,
      semanticMemories: restored.testState?.semantic?.memories?.length || 0,
    },
    restored: {
      semanticScope: restored.restored?.semanticScope || '',
      threadId: restored.restored?.conversation?.threadId || '',
      turns: restored.restored?.conversation?.turns?.length || 0,
      memoryRows: restored.restored?.conversation?.memoryRows?.length || 0,
      semanticMemories: restored.restored?.semantic?.memories?.length || 0,
      contextTokens: restored.restored?.context?.tokenCount || 0,
    },
  }, null, 2));
}
