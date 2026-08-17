import assert from 'node:assert/strict';
import { buildChatStructuredContractSummary } from '../../src/scripts/ui/chat/chat-structured-contract-summary.js';

{
  const summary = buildChatStructuredContractSummary({
    adapter: 'phone_batch',
    surface: 'group_chat',
    target: {
      sessionId: 'group:1',
      targetName: '测试群',
      members: [{ id: 'a', name: '甲' }, { id: 'b', name: '乙' }],
      tableTargets: [{ id: 'relations', name: '关系表', rowIds: ['row-1', 'row-2'] }],
    },
    capabilities: { tableEdit: true, imagePrompt: true, momentCommentSideChats: true },
    allowedItemTypes: ['text', 'sticker', 'text'],
    allowedStickerKeywords: ['微笑', '点头'],
  });
  assert.deepEqual(summary.allowedItemTypes, ['text', 'sticker']);
  assert.equal(summary.frozenTarget.targetName, '测试群');
  assert.deepEqual(summary.frozenTarget.members.map(item => item.name), ['甲', '乙']);
  assert.deepEqual(summary.tableTargets[0], {
    id: 'relations',
    name: '关系表',
    rowIds: ['row-1', 'row-2'],
  });
  assert.deepEqual(summary.fixedOrder, ['primary_reply', 'side_chats', 'image_prompt', 'table_edit']);
  console.log('ok - the local contract summary preserves real frozen targets and per-turn capabilities');
}

console.log('chat-structured-contract-summary-tests passed');
