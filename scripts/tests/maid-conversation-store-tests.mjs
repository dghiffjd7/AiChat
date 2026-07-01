import assert from 'node:assert/strict';

import {
  MaidConversationStore,
  formatMaidHistoryContextText,
  formatMaidMemoryTableText,
  normalizeMaidConversationState,
} from '../../src/scripts/storage/maid-conversation-store.js';

const createStorage = () => {
  const data = new Map();
  return {
    getItem: key => data.get(key) || null,
    setItem: (key, value) => data.set(key, String(value)),
    data,
  };
};

{
  const state = normalizeMaidConversationState({
    turns: [
      { id: 't1', input: '创建角色卡 A', toolName: 'persona.create', message: '已完成' },
    ],
    memoryRows: [
      { id: 'm1', title: '摘要', content: '用户创建了角色卡 A。' },
    ],
  }, { now: () => 1000 });
  assert.equal(state.version, 1);
  assert.equal(state.turns.length, 1);
  assert.equal(state.memoryRows.length, 1);
  assert.equal(state.memoryRows[0].tokenCount > 0, true);
  console.log('ok - maid conversation state normalizes turns and memory rows');
}

{
  const historyText = formatMaidHistoryContextText({
    turns: [
      { id: 't1', at: 1000, input: '创建角色卡 A', toolName: 'persona.create', featureId: 'persona.create', status: 'succeeded', message: '已完成' },
      {
        id: 't2',
        at: 2000,
        input: '继续刚才那个',
        status: 'interrupted',
        continuable: true,
        reactStoppedReason: 'max_steps_reached',
        continueHint: '下一步建议工具：worldbook.update_entries',
        message: '已达到本轮执行预算。',
      },
    ],
  });
  assert.match(historyText, /创建角色卡 A/);
  assert.match(historyText, /继续刚才那个/);
  assert.match(historyText, /可继续: 是/);
  assert.match(historyText, /下一步建议工具/);

  const memoryText = formatMaidMemoryTableText({
    rows: [
      { title: '摘要', content: '用户创建了角色卡 A。', tags: ['角色卡'] },
    ],
  });
  assert.match(memoryText, /摘要/);
  assert.match(memoryText, /角色卡/);
  console.log('ok - maid conversation formatters render history and memory table text');
}

{
  const storage = createStorage();
  const saved = [];
  const store = new MaidConversationStore({
    storage,
    saveKv: async (key, value) => saved.push({ key, value }),
    loadKv: async () => null,
    now: () => 1000,
    compactionThresholdTokens: 12,
  });
  await store.load();
  await store.appendTurn({ input: '创建角色卡 A', toolName: 'persona.create', status: 'succeeded', message: '已创建 A' });
  await store.appendTurn({ input: '创建用户 B', toolName: 'user.create', status: 'succeeded', message: '已创建 B' });
  await store.appendTurn({ input: '为 A 创建世界书', toolName: 'worldbook.create', status: 'succeeded', message: '已创建世界书' });
  await store.appendTurn({ input: '创建聊天室 C', toolName: 'session.create', status: 'succeeded', message: '已创建 C' });
  await store.appendTurn({ input: '发送 hi', toolName: 'chat.send_message', status: 'succeeded', message: '已发送' });
  await store.appendTurn({ input: '继续刚才那个', status: 'responded', message: '好的' });
  await store.appendTurn({ input: '打开设置', toolName: 'app.open_panel', status: 'succeeded', message: '已打开' });
  await store.appendTurn({ input: '问候', status: 'responded', message: '你好' });
  await store.appendTurn({ input: '第九轮', status: 'responded', message: '九' });

  const before = store.exportState();
  assert.equal(before.memoryRows.length, 0);
  const row = await store.recordContextInjection(20);
  assert.equal(Boolean(row), true);
  const after = store.exportState();
  assert.equal(after.memoryRows.length, 1);
  assert.match(after.memoryRows[0].content, /创建角色卡 A/);
  assert.equal(after.turns.filter(turn => turn.compacted).length > 0, true);
  assert.equal(after.turns.filter(turn => !turn.compacted).length, 8);
  assert.equal(saved.length > 0, true);
  console.log('ok - maid conversation store compacts older turns after injection threshold');
}

{
  const store = new MaidConversationStore({
    storage: createStorage(),
    loadKv: async () => null,
    saveKv: async () => true,
    now: () => 2000,
  });
  await store.load();
  await store.appendTurn({ input: '你好', message: '我在' });
  const snapshot = store.getContextSnapshot();
  assert.equal(snapshot.turnCount, 1);
  assert.match(snapshot.historyText, /你好/);
  assert.equal(snapshot.memoryText, '');
  assert.equal(snapshot.tokenCount > 0, true);
  console.log('ok - maid conversation store exposes context snapshots');
}
