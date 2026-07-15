import assert from 'node:assert/strict';

globalThis.localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};
globalThis.window = {
  appBridge: null,
  addEventListener: () => {},
  dispatchEvent: () => {},
};

const { PresetPanel } = await import('../../src/scripts/ui/preset-panel.js');

const makePanel = () => {
  const panel = Object.create(PresetPanel.prototype);
  panel.drafts = new Map();
  panel.openaiBlockDrafts = new Map();
  panel.openaiBlockBase = new Map();
  panel.openaiDeletedBlockIds = new Set();
  panel.store = {
    ready: Promise.resolve(),
    getActiveId: type => (type === 'openai' ? 'preset-a' : ''),
    getActive: () => ({ name: 'saved', prompts: [] }),
  };
  return panel;
};

{
  const panel = makePanel();
  panel.openaiBlockBase.set('block', {
    identifier: 'block', name: 'Block', role: 'system', system_prompt: true, content: 'a\r\nb',
  });
  panel.openaiBlockDrafts.set('block', {
    name: 'Block', role: 'system', system_prompt: true, content: 'a\nb',
  });
  assert.equal(panel.isBlockDraftModified('block'), false, '换行格式不应制造空白 diff');
  panel.openaiBlockDrafts.get('block').name = 'Renamed';
  assert.equal(panel.isBlockDraftModified('block'), true, '元数据修改仍需计为未保存');
  assert.equal(panel.isBlockDraftContentModified('block'), false, '元数据修改不应进入正文 diff 分支');
  console.log('ok - 区块元数据与正文 diff 判定分离');
}

{
  const panel = makePanel();
  panel.openaiBlockBase.set('block', {
    identifier: 'block', name: 'Block', role: 'system', system_prompt: true, content: 'saved',
  });
  panel.openaiBlockDrafts.set('block', {
    name: 'Block', role: 'system', system_prompt: true, content: 'draft',
  });
  panel.drafts.set('openai:preset-a', { name: 'saved', prompts: [] });
  assert.equal(panel.countUnsavedChanges(), 1, '同一份区块草稿不得被 Map 与分区快照重复计数');
  console.log('ok - 未保存计数不重复');
}

{
  const panel = makePanel();
  panel.openaiBlockDrafts.set('block', { content: 'draft' });
  panel.openaiDeletedBlockIds.add('deleted');
  panel.openaiBlockDraftsScope = 'openai:preset-a';
  panel.drafts.set('openai:preset-a', { name: 'draft' });
  panel.drafts.set('sysprompt:sys-a', { name: 'keep' });
  panel.discardOpenAIDrafts({ presetId: 'preset-a' });
  assert.equal(panel.drafts.has('openai:preset-a'), false);
  assert.equal(panel.drafts.has('sysprompt:sys-a'), true, '切换生成参数预设不应丢弃其它分类草稿');
  assert.equal(panel.openaiBlockDrafts.size, 0);
  assert.equal(panel.openaiDeletedBlockIds.size, 0);
  console.log('ok - 确认丢弃只清理目标生成参数草稿');
}

{
  const panel = makePanel();
  const statuses = [];
  panel.store.upsert = async () => { throw new Error('write failed'); };
  panel.showStatus = (message, kind) => statuses.push([message, kind]);
  const originalConsoleLog = console.log;
  console.log = () => {};
  let saved = false;
  try {
    saved = await panel.applyBlockContentToStore('block', 'next');
  } finally {
    console.log = originalConsoleLog;
  }
  assert.equal(saved, false);
  assert.deepEqual(statuses, [['write failed', 'error']], '写入失败不得再显示成功状态');

  panel.openaiBlockDrafts.set('block', { content: 'next' });
  panel.applyBlockHunk = () => 'next';
  panel.applyBlockContentToStore = async () => false;
  await panel.acceptBlockHunk('block', 0);
  assert.deepEqual(statuses, [['write failed', 'error']], 'hunk 写入失败不得追加成功提示');
  console.log('ok - hunk 保存失败只报告错误');
}
