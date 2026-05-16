import assert from 'node:assert/strict';

import {
  buildAssistantStreamMessageCore,
  createAssistantStreamUiRuntime,
  finishMessageDomCore,
  renderAssistantStreamStateCore,
} from '../../src/scripts/ui/chat/assistant-stream-ui-utils.js';

const createTarget = () => ({
  textContent: '',
  style: {},
});

{
  const message = buildAssistantStreamMessageCore(
    { meta: { base: true }, avatar: 'a0' },
    { meta: { mode: 'creative' }, renderRich: true, avatar: 'a1' },
    'm1',
    {
      content: 'hello',
      raw: 'raw-hello',
      rawOriginal: 'raw-original',
      reasoning: 'think',
      meta: { patch: true },
    },
  );
  assert.equal(message.id, 'm1');
  assert.equal(message.content, 'hello');
  assert.equal(message.raw, 'raw-hello');
  assert.equal(message.rawOriginal, 'raw-original');
  assert.equal(message.avatar, 'a1');
  assert.equal(message.meta.base, true);
  assert.equal(message.meta.mode, 'creative');
  assert.equal(message.meta.patch, true);
  assert.equal(message.meta.reasoning, 'think');
  assert.equal(message.meta.renderRich, true);
  console.log('ok - buildAssistantStreamMessageCore merges placeholder meta stream state and render-rich flags');
}

{
  const target = createTarget();
  const wrapper = {
    dataset: { typingPlaceholder: '1' },
    __chatappMessage: { content: 'old' },
  };
  const next = renderAssistantStreamStateCore({
    messageEl: { nodeName: 'DIV' },
    wrapperEl: wrapper,
    msgId: 'm2',
    meta: {},
    placeholder: { id: 'm2' },
    state: { content: 'line1\nline2' },
    applyReasoningUiState() {},
    cleanupRichTextMounts() {},
    prepareTextContainer() { return target; },
    normalizeAssistantLineBreaks: text => text,
    renderTextWithStickers: () => false,
    renderRichText() {},
    applyCreativeBubbleState() {},
  });
  assert.equal(next.content, 'line1\nline2');
  assert.equal(target.textContent, 'line1\nline2');
  assert.equal(target.style.whiteSpace, 'pre-wrap');
  assert.equal('typingPlaceholder' in wrapper.dataset, false);
  assert.equal(wrapper.__chatappMessage.content, 'line1\nline2');
  console.log('ok - renderAssistantStreamStateCore updates wrapper state and renders plain text fallback');
}

{
  const messageEl = { parentElement: { parentElement: { remove() {} } } };
  const target = createTarget();
  const wrapper = { __chatappMessage: { content: 'prev' } };
  const messageBuffer = [{ content: 'old' }];
  const finished = finishMessageDomCore({
    messageEl,
    wrapperEl: wrapper,
    finalMessage: { id: 'm3', type: 'text', content: 'done', meta: {} },
    bufferIndex: 0,
    msgId: 'm3',
    meta: {},
    placeholder: { id: 'm3' },
    messageBuffer,
    addMessage() {},
    applyReasoningUiState() {},
    applyCreativeBubbleState() {},
    prepareTextContainer() { return target; },
    renderRichText() {},
    normalizeAssistantLineBreaks: text => text,
    renderTextWithStickers: () => false,
  });
  assert.equal(finished.content, 'done');
  assert.equal(messageBuffer[0].content, 'done');
  assert.equal(wrapper.__chatappMessage.content, 'done');
  assert.equal(target.textContent, 'done');
  console.log('ok - finishMessageDomCore persists final plain text message into buffer wrapper and DOM');
}

{
  const runtime = createAssistantStreamUiRuntime({
    scheduleFrame: cb => {
      cb();
      return 1;
    },
    cancelFrame() {},
  });
  const wrapper = {
    dataset: {},
    isConnected: true,
    removeCalled: false,
    remove() { this.removeCalled = true; },
  };
  const messageEl = {
    isConnected: true,
    closest() { return wrapper; },
    parentElement: wrapper,
    innerHTML: '',
    textContent: '',
  };
  wrapper.dataset.msgId = 'm4';
  const messageBuffer = [];
  const renders = [];
  const finishes = [];
  const streamStates = [];
  let autoFollow = false;
  const stream = runtime.startAssistantStream({
    meta: { id: 'm4', typing: false },
    addMessage() { return messageEl; },
    messageBuffer,
    setStreamingState(active) { streamStates.push(active); },
    isNearBottom: () => true,
    getStreamAutoFollow: () => autoFollow,
    setStreamAutoFollow(value) { autoFollow = value; },
    renderAssistantStreamState: (...args) => { renders.push(args); },
    finishMessageDom: (...args) => { finishes.push(args); },
    normalizeAssistantStreamState: value => (typeof value === 'object' ? { ...value } : { content: String(value ?? '') }),
    isTypingDotsEnabled: () => false,
    scrollToBottom() {},
  });
  stream.update({ content: 'draft' });
  assert.equal(messageBuffer[0].content, 'draft');
  assert.equal(renders.length, 1);
  const partial = stream.cancel({ keepPartial: true });
  assert.equal(streamStates[0], true);
  assert.equal(streamStates.at(-1), false);
  assert.equal(partial.content, 'draft');
  assert.equal(partial.meta.partial, true);
  assert.equal(finishes.length, 1);
  console.log('ok - startAssistantStream runtime updates buffered state and returns partial payload on cancel');
}

{
  const runtime = createAssistantStreamUiRuntime({
    scheduleFrame: cb => {
      cb();
      return 1;
    },
    cancelFrame() {},
  });
  const wrapper = {
    dataset: { msgId: 'm4-reasoning' },
    isConnected: true,
    removeCalled: false,
    remove() { this.removeCalled = true; },
  };
  const messageEl = {
    isConnected: true,
    closest() { return wrapper; },
    parentElement: wrapper,
    innerHTML: '',
    textContent: '',
  };
  const messageBuffer = [];
  const finishes = [];
  const stream = runtime.startAssistantStream({
    meta: { id: 'm4-reasoning', typing: false, renderRich: true },
    addMessage() { return messageEl; },
    messageBuffer,
    setStreamingState() {},
    isNearBottom: () => true,
    getStreamAutoFollow: () => false,
    setStreamAutoFollow() {},
    renderAssistantStreamState() {},
    finishMessageDom: (...args) => { finishes.push(args); },
    normalizeAssistantStreamState: value => (typeof value === 'object' ? { ...value } : { content: String(value ?? '') }),
    isTypingDotsEnabled: () => false,
    scrollToBottom() {},
  });
  stream.update({
    content: '',
    raw: '',
    rawOriginal: '',
    meta: { reasoningDisplay: 'thinking only' },
  });
  const partial = stream.cancel({ keepPartial: true });
  assert.equal(wrapper.removeCalled, false);
  assert.equal(partial.content, '');
  assert.equal(partial.meta.reasoningDisplay, 'thinking only');
  assert.equal(partial.meta.partial, true);
  assert.equal(finishes.length, 1);
  console.log('ok - startAssistantStream keeps reasoning-only partials on cancel');
}

{
  const runtime = createAssistantStreamUiRuntime({
    scheduleFrame: cb => {
      cb();
      return 1;
    },
    cancelFrame() {},
  });
  const baseMessage = {
    id: 'm5',
    content: 'seed',
    raw: 'seed-raw',
    meta: { from: 'base' },
  };
  const messageEl = { isConnected: true };
  const wrapper = {
    __chatappMessage: baseMessage,
    isConnected: true,
    attributes: new Map(),
    setAttribute(name, value) { this.attributes.set(name, value); },
    querySelector(selector) {
      return selector === '.QQ_chat_msgdiv' ? messageEl : null;
    },
  };
  const scrollEl = {
    querySelector(selector) {
      return selector.includes('m5') ? wrapper : null;
    },
  };
  const messageBuffer = [];
  const renders = [];
  const finishes = [];
  const streamStates = [];
  let autoFollow = false;
  const stream = runtime.startAssistantContinuationStream({
    scrollEl,
    msgId: 'm5',
    meta: {},
    messageBuffer,
    setStreamingState(active) { streamStates.push(active); },
    isNearBottom: () => true,
    getStreamAutoFollow: () => autoFollow,
    setStreamAutoFollow(value) { autoFollow = value; },
    renderAssistantStreamState: (...args) => { renders.push(args); },
    finishMessageDom: (...args) => { finishes.push(args); },
    normalizeAssistantStreamState: value => (typeof value === 'object' ? { ...value } : { content: String(value ?? '') }),
    scrollToBottom() {},
  });
  stream.update({ content: 'continued', raw: 'raw-continued' });
  const partial = stream.cancel({ keepPartial: true });
  assert.equal(streamStates[0], true);
  assert.equal(streamStates.at(-1), false);
  assert.equal(partial.content, 'continued');
  assert.equal(partial.meta.partial, true);
  assert.equal(wrapper.attributes.get('aria-busy'), 'false');
  assert.equal(renders.length, 2);
  assert.equal(finishes.length, 1);
  console.log('ok - startAssistantContinuationStream runtime preserves partial continuation state on cancel');
}
