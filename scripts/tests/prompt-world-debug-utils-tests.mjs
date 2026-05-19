import assert from 'node:assert/strict';

import {
  buildWorldDebugLocatorCandidates,
  formatPromptWorldDebug,
} from '../../src/scripts/ui/chat/prompt-world-debug-utils.js';

{
  const candidates = buildWorldDebugLocatorCandidates({
    injectedEntries: [
      {
        worldId: 'w1',
        entryId: 'e1',
        blockId: 'b1',
        title: '条目1',
        sourceKind: 'global',
        positionLabel: 'system',
      },
    ],
    mergedEntries: [
      {
        worldId: 'w1',
        entryId: 'e1',
        blockId: 'b1',
        title: '条目1',
      },
    ],
  });
  assert.equal(candidates.length, 1);
  assert.deepEqual(candidates[0], {
    key: 'w1::e1::b1',
    sectionLabel: '实际注入',
    worldId: 'w1',
    entryId: 'e1',
    blockId: 'b1',
    blockTitle: '',
    focusNodeId: '',
    title: '条目1',
    sourceKind: 'global',
    sourceKindLabel: '全局',
    positionLabel: 'system',
    role: 'system',
  });
  console.log('ok - buildWorldDebugLocatorCandidates deduplicates repeated world entries');
}

{
  const text = formatPromptWorldDebug({
    insertionStrategy: 'role_first',
    variableDefineStrategy: 'first_hit',
    builtinEntries: [{ worldId: 'w1', entryId: 'e1', blockId: 'legacy', title: '内置1', sourceKind: 'builtin', role: 'system' }],
    globalEntries: [],
    roleEntries: [],
    sessionEntries: [],
    mergedEntries: [{ worldId: 'w1', entryId: 'e1', blockId: 'legacy', title: '内置1', sourceKind: 'builtin', role: 'system', positionLabel: 'system', depth: 1 }],
    injectedEntries: [{ worldId: 'w1', entryId: 'e1', blockId: 'legacy', title: '内置1', sourceKind: 'builtin', role: 'system', positionLabel: 'system', contentPreview: 'preview' }],
    templateEntries: [{ worldId: 'w2', entryId: 'e2', blockId: 'b2', title: '模板1', sourceKind: 'role', role: 'user', positionLabel: 'user', tags: [{ stage: 'render', type: 'regex', pattern: 'x' }] }],
    initialVariableEntries: [],
    trimmedEntries: [{ worldId: 'w3', entryId: 'e3', blockId: 'legacy', title: '裁剪1', sourceKind: 'session', role: 'system', trimReason: 'moment_session_budget', triggerSourceName: 'Alice', triggerReason: 'mention' }],
    budgetTokens: 100,
    usedTokens: 20,
    overflowed: false,
    dynamicWorld: {
      enabled: true,
      candidates: [{ sessionId: 'contact:alice', name: 'Alice', reasons: ['mention'], worldIds: ['w3'] }],
      selectedSources: [{ sessionId: 'contact:alice', name: 'Alice', reasons: ['mention'], worldIds: ['w3'] }],
      sessionBudgetTokens: 30,
      sessionUsedTokens: 10,
      sessionTrimmedCount: 1,
      overflowed: true,
    },
    dynamicProfiles: {
      enabled: true,
      promptInjected: true,
      candidates: [
        {
          contactId: 'contact:alice',
          name: 'Alice',
          score: 5,
          status: 'active',
          matchedTerms: ['拍照'],
          matchedRows: [
            { id: 'r1', tableId: 'events', tableName: '重要事件', rowSummary: 'Alice 和用户约过拍照' },
          ],
        },
      ],
      selectedSources: [{ contactId: 'contact:alice', name: 'Alice' }],
      injectedRows: [{ contactId: 'contact:alice', row: { id: 'r1' } }],
    },
  });
  assert.match(text, /\[世界书调试\]/);
  assert.match(text, /变量自动建立: first_hit（命中后建立）/);
  assert.match(text, /激活条目/);
  assert.match(text, /模板注入/);
  assert.match(text, /render:regex:x/);
  assert.match(text, /动态强触发: 候选 1 \/ 注入来源 1/);
  assert.match(text, /动态弱触发: 候选 1 \/ 命中 1 \/ 注入记忆行 1/);
  assert.match(text, /动态弱触发画像\/记忆/);
  assert.match(text, /动态强触发来源/);
  assert.match(text, /裁剪=moment_session_budget/);
  console.log('ok - formatPromptWorldDebug formats sectioned prompt debug summary');
}
