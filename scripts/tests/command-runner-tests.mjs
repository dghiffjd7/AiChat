import assert from 'node:assert/strict';

const toasts = [];
globalThis.localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};
globalThis.window = {
  toastr: {
    info: message => toasts.push(['info', message]),
    success: message => toasts.push(['success', message]),
    warning: message => toasts.push(['warning', message]),
    error: message => toasts.push(['error', message]),
  },
};

const { runCommand } = await import('../../src/scripts/ui/command-runner.js');

const createHarness = () => {
  const messages = [
    { id: 'greeting', role: 'assistant', content: '开场白', meta: { isGreeting: true } },
    { id: 'u1', role: 'user', content: '用户一楼', meta: {} },
    { id: 'a1', role: 'assistant', content: '助手一楼', meta: {} },
    { id: 'u2', role: 'user', content: '用户二楼', meta: {} },
    { id: 'a2', role: 'assistant', content: '助手二楼', meta: {} },
  ];
  const updates = [];
  let reloads = 0;
  const chatStore = {
    getCurrent: () => 's1',
    getMessages: () => messages,
    updateMessage: (id, patch) => {
      const index = messages.findIndex(item => item.id === id);
      if (index < 0) return null;
      messages[index] = {
        ...messages[index],
        ...patch,
      };
      updates.push([id, patch]);
      return messages[index];
    },
  };
  return {
    messages,
    updates,
    ctx: {
      chatStore,
      uiMode: 'rp',
      reloadCurrentSession: () => {
        reloads += 1;
      },
    },
    get reloads() {
      return reloads;
    },
  };
};

{
  toasts.length = 0;
  const h = createHarness();
  assert.equal(runCommand('/hide 1', h.ctx), true);
  assert.equal(h.messages[0].meta.hiddenFromRpPrompt, undefined);
  assert.equal(h.messages[1].meta.hiddenFromRpPrompt, true);
  assert.equal(h.messages[2].meta.hiddenFromRpPrompt, true);
  assert.equal(h.messages[3].meta.hiddenFromRpPrompt, undefined);
  assert.equal(h.messages[4].meta.hiddenFromRpPrompt, undefined);
  assert.deepEqual(h.updates.map(item => item[0]), ['u1', 'a1']);
  assert.equal(h.reloads, 1);
  assert.deepEqual(toasts.at(-1), ['success', '已隐藏楼层 1，后续创意写作提示词将忽略它']);
  console.log('ok - /hide marks both user and assistant messages on the requested RP floor');
}

{
  toasts.length = 0;
  const h = createHarness();
  assert.equal(runCommand('/hide', h.ctx), true);
  assert.equal(h.messages[3].meta.hiddenFromRpPrompt, true);
  assert.equal(h.messages[4].meta.hiddenFromRpPrompt, true);
  assert.deepEqual(h.updates.map(item => item[0]), ['u2', 'a2']);
  assert.deepEqual(toasts.at(-1), ['success', '已隐藏楼层 2，后续创意写作提示词将忽略它']);
  console.log('ok - /hide without a floor hides the latest RP floor');
}

{
  toasts.length = 0;
  const h = createHarness();
  runCommand('/hide 1-2', h.ctx);
  assert.equal(runCommand('/unhide 1', h.ctx), true);
  assert.equal(h.messages[1].meta.hiddenFromRpPrompt, false);
  assert.equal(h.messages[2].meta.hiddenFromRpPrompt, false);
  assert.equal(h.messages[3].meta.hiddenFromRpPrompt, true);
  assert.equal(h.messages[4].meta.hiddenFromRpPrompt, true);
  assert.deepEqual(toasts.at(-1), ['success', '已恢复楼层 1 到创意写作提示词']);
  console.log('ok - /unhide restores only the requested RP floor');
}
