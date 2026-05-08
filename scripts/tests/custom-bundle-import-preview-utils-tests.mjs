import assert from 'node:assert/strict';

const {
  buildCustomBundleImportConfirmLines,
  buildCustomBundleImportPreview,
} = await import('../../src/scripts/ui/custom-bundle-import-preview-utils.js');

{
  const roomMap = new Map([
    ['chat:a', { manifest: { uiMode: 'chat' }, archives: [{ id: 'a1' }, { id: 'a2' }] }],
    ['rp:a', { manifest: { uiMode: 'rp' }, archives: [{ id: 'r1' }] }],
    ['ignored', { manifest: { uiMode: 'other' }, archives: null }],
  ]);
  const preview = buildCustomBundleImportPreview({
    manifest: {
      roles: [{ id: 'role:a' }, { id: 'role:b' }],
      options: {
        includeConversationContent: true,
        includeMemoryData: false,
        includeVariableState: true,
        hideServiceAddresses: true,
      },
      summary: {
        momentEntries: 9,
        moments: 4,
        momentSummaries: 3,
        momentCompacted: 2,
      },
    },
    roomMap,
    roles: [
      {
        momentsPayload: {
          moments: [{ id: 'fallback' }],
          summaries: [{ at: 1, text: 'fallback summary' }],
          compactedSummary: { at: 2, text: 'fallback compacted' },
        },
      },
    ],
  });
  assert.deepEqual(preview, {
    roles: 2,
    chats: 1,
    creative: 1,
    archives: 3,
    moments: 9,
    momentScopes: 4,
    momentSummaries: 3,
    momentCompacted: 2,
    includeConversationContent: true,
    includeMemoryData: false,
    includeVariableState: true,
    hideServiceAddresses: true,
  });
  console.log('ok - buildCustomBundleImportPreview prefers manifest summary and counts room records');
}

{
  const preview = buildCustomBundleImportPreview({
    manifest: {
      roles: [],
      options: {},
      summary: {
        momentEntries: 0,
        moments: 0,
        momentSummaries: 0,
        momentCompacted: 0,
      },
    },
    roomMap: new Map(),
    roles: [
      {
        momentsPayload: {
          moments: [{ id: 'm1' }, { id: 'm2' }],
          summaries: [{ at: 1, text: ' valid ' }, { at: 2, text: '   ' }],
          compactedSummary: { at: 3, text: ' compacted ' },
        },
      },
      {
        momentsPayload: {
          moments: [],
          summaries: [],
          compactedSummary: null,
        },
      },
    ],
  });
  assert.equal(preview.moments, 2);
  assert.equal(preview.momentScopes, 1);
  assert.equal(preview.momentSummaries, 1);
  assert.equal(preview.momentCompacted, 1);
  console.log('ok - buildCustomBundleImportPreview falls back to role moments payload summary counts');
}

{
  const lines = buildCustomBundleImportConfirmLines({
    fileName: ' bundle.zip ',
    preview: {
      roles: 2,
      chats: 1,
      creative: 1,
      archives: 3,
      moments: 9,
      momentSummaries: 3,
      momentCompacted: 1,
      includeConversationContent: true,
      includeMemoryData: false,
      includeVariableState: true,
      hideServiceAddresses: false,
    },
  });
  assert.deepEqual(lines, [
    '文件：bundle.zip',
    '角色 2 个',
    '聊天室 1 个',
    '创意写作 1 个',
    '动态 9 条',
    '动态摘要 3 条 · 含大总结',
    '历史存档 3 个',
    '包含聊天正文 / 创作正文',
    '不含记忆表格已填数据',
    '包含变量快照',
    '保留服务地址',
  ]);
  assert.deepEqual(
    buildCustomBundleImportConfirmLines({
      preview: {
        roles: 0,
        chats: 0,
        creative: 0,
        archives: 0,
        includeConversationContent: false,
        includeMemoryData: false,
        includeVariableState: false,
        hideServiceAddresses: true,
      },
    }),
    [
      '文件：自定义资料包',
      '角色 0 个',
      '聊天室 0 个',
      '创意写作 0 个',
      '历史存档 0 个',
      '不含聊天正文 / 创作正文',
      '不含记忆表格已填数据',
      '不含变量快照',
      '已隐藏服务地址',
    ],
  );
  console.log('ok - buildCustomBundleImportConfirmLines preserves import confirm copy order');
}
