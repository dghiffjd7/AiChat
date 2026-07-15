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
globalThis.CustomEvent = class CustomEvent {
  constructor(type, options = {}) {
    this.type = type;
    this.detail = options.detail;
  }
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

{
  const clone = value => JSON.parse(JSON.stringify(value));
  let active = {
    name: 'Preset A',
    temperature: 1,
    prompts: [{
      identifier: 'block', name: 'Block', role: 'system', system_prompt: true, content: 'saved',
    }],
    prompt_order: [{ character_id: 100001, order: [{ identifier: 'block', enabled: true }] }],
  };
  const writes = [];
  const card = {
    dataset: { identifier: 'block' },
    querySelector: selector => (selector === '.block-enabled' ? { checked: true } : null),
  };
  const panel = makePanel();
  panel.element = { querySelectorAll: () => [] };
  panel.currentSectionId = 'custom';
  panel.detailEditorEl = {
    children: [{}],
    querySelectorAll: selector => (selector === '.openai-block' ? [card] : []),
    querySelector: () => null,
  };
  panel.drafts.set('openai:preset-a', {
    ...clone(active),
    temperature: 0.5,
    prompts: [{ ...clone(active.prompts[0]), content: 'older-snapshot' }],
  });
  panel.openaiBlockDrafts.set('block', {
    name: 'Block', role: 'system', system_prompt: true, content: 'accepted-now',
  });
  panel.openaiBlockBase.set('block', clone(active.prompts[0]));
  panel.store = {
    ready: Promise.resolve(),
    getActiveId: type => (type === 'openai' ? 'preset-a' : ''),
    getActive: () => active,
    upsert: async (_type, { data }) => {
      active = clone(data);
      writes.push(active.prompts[0].content);
    },
  };
  panel.getBlockCards = () => [];
  panel.updateUnsavedIndicator = () => {};
  panel.renderAllSections = () => {};
  panel.showStatus = () => {};

  await panel.acceptBlockDraft('block');
  assert.equal(active.prompts[0].content, 'accepted-now');
  assert.equal(
    panel.drafts.get('openai:preset-a').prompts[0].content,
    'accepted-now',
    '立即接受区块后必须同步仍待保存的完整快照',
  );
  await panel.onSave();
  assert.equal(active.prompts[0].content, 'accepted-now', '整体保存不得用旧快照覆盖已接受内容');
  assert.deepEqual(writes, ['accepted-now', 'accepted-now']);
  console.log('ok - 区块接受结果不会被旧分区快照覆盖');
}

{
  const clone = value => JSON.parse(JSON.stringify(value));
  const baseText = 'a\nb\nc\nd\ne\nf\ng\nh\ni\nj';
  const draftText = 'a\nB\nc\nd\ne\nf\ng\nh\nI\nj';
  let active = {
    name: 'Preset A',
    prompts: [{
      identifier: 'block', name: 'Block', role: 'system', system_prompt: true, content: baseText,
    }],
    prompt_order: [{ character_id: 100001, order: [{ identifier: 'block', enabled: true }] }],
  };
  const statuses = [];
  const panel = makePanel();
  panel.openaiBlockDrafts.set('block', {
    name: 'Block', role: 'system', system_prompt: true, content: draftText,
  });
  panel.openaiBlockBase.set('block', clone(active.prompts[0]));
  panel.store = {
    ready: Promise.resolve(),
    getActiveId: type => (type === 'openai' ? 'preset-a' : ''),
    getActive: () => active,
    upsert: async (_type, { data }) => {
      active = clone(data);
      await new Promise(resolve => setTimeout(resolve, 30));
    },
  };
  panel.updateUnsavedIndicator = () => {};
  panel.showStatus = (message, kind) => statuses.push([message, kind]);

  const first = panel.acceptBlockHunk('block', 0);
  await new Promise(resolve => setTimeout(resolve, 0));
  const secondAccepted = await panel.acceptBlockHunk('block', 1);
  await first;

  assert.equal(secondAccepted, false, '持久化期间的旧 hunk 点击必须明确拒绝，不能排队后覆盖新基线');
  assert.equal(active.prompts[0].content, 'a\nB\nc\nd\ne\nf\ng\nh\ni\nj', '第一处已接受修改不得丢失');
  assert.equal(panel.isBlockDraftModified('block'), true, '未处理的第二处修改必须继续保留为草稿');
  assert.ok(statuses.some(([message]) => /正在保存/.test(message)), '被拒绝的快速点击应给出明确状态提示');
  console.log('ok - 快速连续接受不会发生旧基线覆盖');
}

{
  const panel = makePanel();
  const trackedDisabled = {
    disabled: true,
    dataset: { ppMutationWasDisabled: '1' },
  };
  const newlyRenderedDisabled = {
    disabled: true,
    dataset: {},
  };
  panel.element = {
    querySelectorAll: () => [trackedDisabled, newlyRenderedDisabled],
  };
  panel._presetMutationBusy = true;

  panel.setPresetMutationBusy(false);

  assert.equal(trackedDisabled.disabled, true, '解锁应恢复进入队列前已禁用的控件');
  assert.equal(newlyRenderedDisabled.disabled, true, '解锁不得误启用队列期间新渲染且本就禁用的控件');
  console.log('ok - 预设写入解锁保留新旧控件的原始禁用状态');
}
