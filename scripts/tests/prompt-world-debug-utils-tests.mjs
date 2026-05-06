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
    trimmedEntries: [],
    budgetTokens: 100,
    usedTokens: 20,
    overflowed: false,
  });
  assert.match(text, /\[世界书调试\]/);
  assert.match(text, /变量自动建立: first_hit（命中后建立）/);
  assert.match(text, /激活条目/);
  assert.match(text, /模板注入/);
  assert.match(text, /render:regex:x/);
  console.log('ok - formatPromptWorldDebug formats sectioned prompt debug summary');
}
