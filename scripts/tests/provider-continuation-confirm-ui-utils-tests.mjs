import assert from 'node:assert/strict';

import {
  buildProviderContinuationConfirmViewModel,
  showProviderContinuationConfirmDialog,
} from '../../src/scripts/ui/chat/provider-continuation-confirm-ui-utils.js';

const createFakeDocument = () => {
  class FakeElement {
    constructor(tagName) {
      this.tagName = String(tagName || '').toUpperCase();
      this.className = '';
      this.textContent = '';
      this.children = [];
      this.dataset = {};
      this.disabled = false;
      this.parentNode = null;
      this.style = { cssText: '' };
      this.listeners = {};
    }

    appendChild(child) {
      child.parentNode = this;
      this.children.push(child);
      return child;
    }

    addEventListener(type, handler) {
      if (!this.listeners[type]) this.listeners[type] = [];
      this.listeners[type].push(handler);
    }

    click() {
      (this.listeners.click || []).forEach(handler => handler({
        currentTarget: this,
        stopPropagation: () => {},
      }));
    }

    focus() {}

    remove() {
      if (!this.parentNode) return;
      this.parentNode.children = this.parentNode.children.filter(child => child !== this);
      this.parentNode = null;
    }
  }

  return {
    body: new FakeElement('body'),
    createElement(tagName) {
      return new FakeElement(tagName);
    },
  };
};

const createReadyContinuation = () => ({
  status: 'ready',
  requestPreview: {
    toolResultCount: 1,
  },
  runnerRequestDraft: {
    status: 'ready',
    runner: 'real_runner',
    provider: 'openai',
    model: 'gpt-test',
    sessionId: 's1',
    payloadKind: 'messages',
    payloadCount: 2,
    toolResultCount: 1,
    request: {
      provider: 'openai',
      model: 'gpt-test',
      apiKey: 'sk-secret',
      messages: [
        { role: 'user', content: 'continue' },
        { role: 'tool', content: 'result' },
      ],
    },
  },
});

{
  const model = buildProviderContinuationConfirmViewModel({
    continuation: createReadyContinuation(),
    currentRunner: {
      status: 'ready',
      provider: 'openai',
      model: 'gpt-test',
      network: true,
    },
  });

  assert.equal(model.canRun, true);
  assert.equal(model.canAppend, false);
  assert.equal(model.confirmLabel, 'Run Preview');
  assert.equal(model.appendLabel, 'Run + Append');
  assert.equal(model.previewText.includes('sk-secret'), false);
  assert.equal(model.previewText.includes('[redacted]'), true);
  assert.equal(model.rows.some(row => row.label === 'network after confirm' && row.value === 'yes'), true);
  console.log('ok - provider continuation confirm model shows runnable preview without secrets');
}

{
  const model = buildProviderContinuationConfirmViewModel({
    continuation: createReadyContinuation(),
    currentRunner: {
      status: 'ready',
      provider: 'openai',
      model: 'gpt-test',
      network: true,
    },
    allowAppendCommit: true,
  });

  assert.equal(model.canRun, true);
  assert.equal(model.canAppend, true);
  console.log('ok - provider continuation confirm model exposes append when a target message exists');
}

{
  const model = buildProviderContinuationConfirmViewModel({
    continuation: createReadyContinuation(),
    currentRunner: {
      status: 'blocked',
      reason: 'current provider runner blocked by session gate',
    },
  });

  assert.equal(model.canRun, false);
  assert.equal(model.blockedReason, 'current provider runner blocked by session gate');
  console.log('ok - provider continuation confirm model blocks when current runner is not ready');
}

{
  const documentLike = createFakeDocument();
  let confirmed = 0;
  const promise = showProviderContinuationConfirmDialog({
    documentRef: documentLike,
    continuation: createReadyContinuation(),
    currentRunner: {
      status: 'ready',
      provider: 'openai',
      model: 'gpt-test',
      network: true,
    },
    onConfirm: async () => {
      confirmed += 1;
      return { status: 'succeeded' };
    },
  });

  const overlay = documentLike.body.children[0];
  const panel = overlay.children[0];
  const footer = panel.children[2];
  const confirmButton = footer.children[1];
  assert.equal(confirmButton.disabled, false);
  assert.equal(confirmButton.textContent, 'Run Preview');
  confirmButton.click();
  const result = await promise;
  assert.equal(confirmed, 1);
  assert.equal(result.action, 'confirm');
  assert.equal(result.commitStrategy, 'preview_only');
  assert.equal(result.result.status, 'succeeded');
  assert.equal(documentLike.body.children.length, 0);
  console.log('ok - provider continuation confirm dialog runs callback only after confirm click');
}

{
  const documentLike = createFakeDocument();
  let commitStrategy = '';
  const promise = showProviderContinuationConfirmDialog({
    documentRef: documentLike,
    continuation: createReadyContinuation(),
    currentRunner: {
      status: 'ready',
      provider: 'openai',
      model: 'gpt-test',
      network: true,
    },
    allowAppendCommit: true,
    onConfirm: async payload => {
      commitStrategy = payload.commitStrategy;
      return { status: 'succeeded' };
    },
  });

  const panel = documentLike.body.children[0].children[0];
  const footer = panel.children[2];
  const appendButton = footer.children[2];
  assert.equal(appendButton.disabled, false);
  assert.equal(appendButton.textContent, 'Run + Append');
  appendButton.click();
  const result = await promise;
  assert.equal(commitStrategy, 'append_to_previous_bubble');
  assert.equal(result.action, 'confirm');
  assert.equal(result.commitStrategy, 'append_to_previous_bubble');
  console.log('ok - provider continuation confirm dialog supports append commit action');
}

{
  const documentLike = createFakeDocument();
  let confirmed = 0;
  const promise = showProviderContinuationConfirmDialog({
    documentRef: documentLike,
    continuation: createReadyContinuation(),
    currentRunner: {
      status: 'blocked',
      reason: 'gate closed',
    },
    onConfirm: async () => {
      confirmed += 1;
      return { status: 'succeeded' };
    },
  });

  const panel = documentLike.body.children[0].children[0];
  const footer = panel.children[2];
  const cancelButton = footer.children[0];
  const confirmButton = footer.children[1];
  assert.equal(confirmButton.disabled, true);
  cancelButton.click();
  const result = await promise;
  assert.equal(confirmed, 0);
  assert.equal(result.action, 'cancel');
  console.log('ok - provider continuation confirm dialog disables real runner when gates are not ready');
}
