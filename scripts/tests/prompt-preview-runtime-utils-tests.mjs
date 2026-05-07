import assert from 'node:assert/strict';

import { createPromptPreviewRuntime } from '../../src/scripts/ui/chat/prompt-preview-runtime-utils.js';

{
  const calls = [];
  let locateOptions = null;
  const runtime = createPromptPreviewRuntime({
    getCurrentSessionId: () => 's1',
    getContactBySessionId: () => ({ name: '角色A' }),
    getLastRequest: () => ({
      worldDebug: { sections: [] },
    }),
    buildPromptPreview: () => ({
      meta: '角色A · 现在',
      head: 'provider: openai',
      body: 'user:\n你好',
      messages: [{ role: 'user', content: '你好' }],
    }),
    formatWorldDebugText: () => 'WORLD DEBUG',
    buildWorldDebugCandidates: () => [{ worldId: 'world:1', entryId: 'entry:1', blockId: 'block:1', focusNodeId: 'node:1' }],
    showPromptPreviewModal: (text, meta, options) => {
      calls.push(['showPreview', text, meta, Boolean(options?.onLocate)]);
      locateOptions = options;
    },
    hidePromptPreviewModal: () => calls.push(['hidePreview']),
    showWorldDebugLocatorModal: (items, options) => {
      calls.push(['showLocator', items.length, options.meta]);
      options.onChoose(items[0]);
    },
    openWorldEditor: async (worldId, options) => {
      calls.push(['openWorld', worldId, options]);
    },
  });
  const ok = runtime();
  assert.equal(ok, true);
  await locateOptions.onLocate();
  assert.deepEqual(calls, [
    ['showPreview', 'provider: openai\n\nWORLD DEBUG\n\nuser:\n你好', '角色A · 现在', true],
    ['showLocator', 1, '角色A · 现在 · 1 条可定位记录'],
    ['hidePreview'],
    ['openWorld', 'world:1', { entryId: 'entry:1', blockId: 'block:1', nodeId: 'node:1' }],
  ]);
  console.log('ok - createPromptPreviewRuntime shows preview and bridges world debug locator actions');
}

{
  const warnings = [];
  const runtime = createPromptPreviewRuntime({
    buildPromptPreview: () => ({
      meta: '',
      head: '',
      body: '',
      messages: [],
    }),
    notifyWarning: (message) => warnings.push(message),
  });
  assert.equal(runtime(), false);
  assert.deepEqual(warnings, ['暂无本次 Prompt 记录（请先发送一次）']);
  console.log('ok - createPromptPreviewRuntime warns when no prompt snapshot is available');
}

{
  const warnings = [];
  const errors = [];
  const runtime = createPromptPreviewRuntime({
    getCurrentSessionId: () => 's1',
    getContactBySessionId: () => ({ name: '角色A' }),
    getLastRequest: () => ({}),
    buildPromptPreview: () => {
      throw new Error('boom');
    },
    notifyWarning: (message) => warnings.push(message),
    notifyError: (message) => errors.push(message),
    logger: { warn() {} },
  });
  assert.equal(runtime(), false);
  assert.deepEqual(warnings, []);
  assert.deepEqual(errors, ['打开本次 Prompt 失败']);
  console.log('ok - createPromptPreviewRuntime reports runtime failures through error toast');
}
