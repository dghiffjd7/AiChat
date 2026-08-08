import assert from 'node:assert/strict';

import {
  addSwipeBranchCore,
  applySwipeCore,
  bindSwipeEventsCore,
  createSwipeGenerationStreamCore,
  deleteSwipeBranchCore,
  normalizeAssistantSwipeStreamStateCore,
  setSwipeRegeneratingCore,
} from '../../src/scripts/ui/chat/swipe-runtime-utils.js';

const createClassList = () => {
  const set = new Set();
  return {
    add: (...tokens) => tokens.forEach(token => set.add(token)),
    remove: (...tokens) => tokens.forEach(token => set.delete(token)),
    contains: token => set.has(token),
    toggle: (token, force) => {
      if (force === undefined) {
        if (set.has(token)) {
          set.delete(token);
          return false;
        }
        set.add(token);
        return true;
      }
      if (force) set.add(token);
      else set.delete(token);
      return Boolean(force);
    },
  };
};

const createWrapper = (message = null) => {
  const bubble = {
    dataset: {},
  };
  return {
    __chatappMessage: message,
    isConnected: true,
    classList: createClassList(),
    attributes: new Map(),
    setAttribute(name, value) {
      this.attributes.set(name, value);
    },
    querySelector(selector) {
      if (selector === '.QQ_chat_msgdiv') return bubble;
      return null;
    },
    bubble,
  };
};

{
  assert.deepEqual(normalizeAssistantSwipeStreamStateCore({ content: 'a', meta: { done: true } }), {
    content: 'a',
    meta: { done: true },
  });
  assert.deepEqual(normalizeAssistantSwipeStreamStateCore('draft'), { content: 'draft' });
  console.log('ok - normalizeAssistantSwipeStreamStateCore normalizes object and string inputs');
}

{
  const message = {
    id: 'm1',
    content: 'a',
	    raw: 'ra',
	    rawSource: 'source-a',
	    meta: {
	      activeSwipe: 0,
	      reasoningDisplay: 'old reasoning',
	      sources: [{ url: 'https://first.example', title: 'First' }],
	      swipes: [
	        {
	          content: 'a',
	          raw: 'ra',
	          rawSource: 'source-a',
	          reasoningDisplay: 'reason-a',
	          sources: [{ url: 'https://first.example', title: 'First' }],
	        },
	        {
	          content: 'b',
	          raw: 'rb',
	          rawSource: 'source-b',
	          rawOriginal: 'original-b',
	          sources: [{ url: 'https://second.example', title: 'Second' }],
	        },
	      ],
	    },
	  };
  const wrapper = createWrapper(message);
  const renders = [];
  const syncs = [];
  let change = null;
  const applied = applySwipeCore({
    wrapper,
    message,
    newIndex: 1,
    renderSwipeContent: (...args) => renders.push(args),
    syncSwipeIndicator: (...args) => syncs.push(args),
    onSwipeChange: payload => { change = payload; },
  });
  assert.equal(applied, true);
  assert.equal(message.meta.activeSwipe, 1);
	  assert.equal(message.content, 'b');
	  assert.equal(message.raw, 'rb');
	  assert.equal(message.rawSource, 'source-b');
	  assert.equal(message.rawOriginal, 'original-b');
	  assert.equal(message.meta.reasoningDisplay, undefined);
	  assert.deepEqual(message.meta.sources, [{ url: 'https://second.example', title: 'Second' }]);
	  assert.equal(renders.length, 1);
  assert.equal(syncs.length, 1);
  assert.equal(change.index, 1);
  assert.equal(change.previousIndex, 0);
  console.log('ok - applySwipeCore updates active branch, renders content and emits change payload');
}

{
  const message = {
    id: 'm1-reason',
    content: 'a',
    raw: 'ra',
    meta: {
      activeSwipe: 0,
      swipes: [
        { content: 'a', raw: 'ra' },
        { content: 'b', raw: 'rb', reasoningDisplay: 'reason-b', reasoningLabel: '推理' },
      ],
    },
  };
  const wrapper = createWrapper(message);
  const applied = applySwipeCore({
    wrapper,
    message,
    newIndex: 1,
    renderSwipeContent() {},
    syncSwipeIndicator() {},
  });
  assert.equal(applied, true);
  assert.equal(message.meta.reasoningDisplay, 'reason-b');
  assert.equal(message.meta.reasoningLabel, '推理');
  console.log('ok - applySwipeCore applies branch-local reasoning state');
}

{
  const message = {
    id: 'm2',
    content: 'a',
    raw: 'ra',
    meta: {
      activeSwipe: 0,
      swipes: [{ content: 'a', raw: 'ra' }],
    },
  };
  const wrapper = createWrapper(message);
  const scrollEl = {
    querySelector(selector) {
      return selector.includes('m2') ? wrapper : null;
    },
  };
  const applied = [];
  const added = addSwipeBranchCore({
    scrollEl,
    msgId: 'm2',
    content: 'branch-1',
    raw: 'raw-1',
    applySwipe: payload => {
      applied.push(payload);
      return true;
    },
  });
  assert.equal(added, true);
  assert.equal(message.meta.swipes.length, 2);
  assert.equal(applied[0].newIndex, 1);
  console.log('ok - addSwipeBranchCore appends a new branch and requests activation');
}

{
  const message = {
    id: 'm-delete',
    content: 'b',
    raw: 'rb',
    meta: {
      activeSwipe: 1,
      swipes: [
        { content: 'a', raw: 'ra' },
        { content: 'b', raw: 'rb' },
        { content: 'c', raw: 'rc' },
      ],
    },
  };
  const wrapper = createWrapper(message);
  const scrollEl = {
    querySelector(selector) {
      return selector.includes('m-delete') ? wrapper : null;
    },
  };
  const applied = [];
  const result = deleteSwipeBranchCore({
    scrollEl,
    msgId: 'm-delete',
    applySwipe: ({ message: nextMessage, newIndex }) => {
      applied.push({ nextMessage, newIndex });
      applySwipeCore({
        wrapper,
        message: nextMessage,
        newIndex,
        renderSwipeContent() {},
        syncSwipeIndicator() {},
      });
      return true;
    },
  });
  assert.equal(result.deleted, true);
  assert.equal(result.deletedIndex, 1);
  assert.equal(result.newIndex, 1);
  assert.equal(message.meta.swipes.length, 2);
  assert.deepEqual(message.meta.swipes.map(branch => branch.content), ['a', 'c']);
  assert.equal(message.meta.activeSwipe, 1);
  assert.equal(message.content, 'c');
  assert.equal(applied.length, 1);
  console.log('ok - deleteSwipeBranchCore removes current branch and activates the adjacent swipe');
}

{
  const wrapper = createWrapper();
  const scrollEl = {
    querySelector(selector) {
      return selector.includes('m3') ? wrapper : null;
    },
  };
  const active = setSwipeRegeneratingCore({
    scrollEl,
    msgId: 'm3',
    active: true,
    label: '生成中...',
  });
  assert.equal(active, true);
  assert.equal(wrapper.classList.contains('is-rp-regenerating'), true);
  assert.equal(wrapper.attributes.get('aria-busy'), 'true');
  assert.equal(wrapper.bubble.dataset.rpRegeneratingLabel, '生成中...');
  setSwipeRegeneratingCore({
    scrollEl,
    msgId: 'm3',
    active: false,
  });
  assert.equal(wrapper.classList.contains('is-rp-regenerating'), false);
  assert.equal(wrapper.attributes.get('aria-busy'), 'false');
  assert.equal('rpRegeneratingLabel' in wrapper.bubble.dataset, false);
  console.log('ok - setSwipeRegeneratingCore toggles wrapper busy state and bubble label');
}

{
  let handler = null;
  const message = {
    id: 'm4',
    meta: {
      activeSwipe: 0,
      swipes: [
        { content: 'a' },
        { content: 'b' },
      ],
    },
  };
  const wrapper = createWrapper(message);
  const scrollEl = {
    addEventListener(event, next) {
      if (event === 'click') handler = next;
    },
    removeEventListener() {},
  };
  const calls = [];
  const regens = [];
  bindSwipeEventsCore({
    scrollEl,
    getSwipeHandlers: () => ({
      wrapper,
      message,
      applySwipe: payload => calls.push(payload),
      onSwipeRegen: payload => regens.push(payload),
    }),
  });
  const indicator = {
    dataset: { msgId: 'm4' },
    closest(selector) {
      if (selector === '.QQ_chat_charmsg.is-rp-regenerating') return null;
      return null;
    },
  };
  const btn = {
    classList: { contains: token => token === 'rp-swipe-next' },
    closest(selector) {
      if (selector === '.rp-swipe-indicator') return indicator;
      return null;
    },
  };
  handler({
    target: { closest: selector => (selector === '.rp-swipe-prev, .rp-swipe-next' ? btn : null) },
    stopPropagation() {},
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].newIndex, 1);

  message.meta.activeSwipe = 1;
  handler({
    target: { closest: selector => (selector === '.rp-swipe-prev, .rp-swipe-next' ? btn : null) },
    stopPropagation() {},
  });
  assert.equal(regens.length, 1);
  assert.equal(regens[0].msgId, 'm4');
  console.log('ok - bindSwipeEventsCore routes next click to apply or regen handlers');
}

{
  const message = {
    id: 'm5',
    content: 'seed',
    raw: 'seed-raw',
    meta: {},
  };
  const wrapper = createWrapper(message);
  const scheduled = [];
  const scrollEl = {
    querySelector(selector) {
      return selector.includes('m5') ? wrapper : null;
    },
  };
  const renders = [];
  const indicators = [];
  const streamingStates = [];
  let autoFollow = false;
  const stream = createSwipeGenerationStreamCore({
    scrollEl,
    msgId: 'm5',
    meta: { label: '生成新回复中...' },
    setSwipeRegenerating() {},
    syncSwipeIndicator: (...args) => indicators.push(args),
    renderSwipeContent: (...args) => renders.push(args),
    setStreamingState: active => streamingStates.push(active),
    isNearBottom: () => true,
    getStreamAutoFollow: () => autoFollow,
    setStreamAutoFollow: value => { autoFollow = value; },
    buildAssistantStreamMessage: (placeholder, meta, msgId, state) => ({
      ...placeholder,
      id: msgId,
      content: String(state.content ?? ''),
      raw: typeof state.raw === 'string' ? state.raw : String(state.content ?? ''),
      rawOriginal: typeof state.rawOriginal === 'string' ? state.rawOriginal : String(state.content ?? ''),
      meta: {
        ...((placeholder?.meta && typeof placeholder.meta === 'object') ? placeholder.meta : {}),
        ...((state.meta && typeof state.meta === 'object') ? state.meta : {}),
      },
    }),
    applyReasoningUiState() {},
    scrollToBottom() {},
    scheduleFrame: (cb) => {
      scheduled.push(cb);
      return scheduled.length - 1;
    },
    cancelFrame: (id) => {
      scheduled[id] = null;
    },
  });
  assert.equal(Boolean(stream), true);
  assert.equal(streamingStates[0], true);
  assert.equal(indicators.length, 1);
  assert.equal(renders[0][2], '');
  assert.equal(renders[0][3].placeholder, '生成新回复中...');

  stream.update({ content: 'draft', raw: 'draft-raw' });
  scheduled[0]();
  assert.equal(renders.at(-1)[2], 'draft');

  const partial = stream.cancel({ keepPartial: true });
  assert.equal(streamingStates.at(-1), false);
  assert.equal(partial.content, 'draft');
  assert.equal(partial.meta.partial, true);
  assert.equal(partial.meta.cancelled, true);
  console.log('ok - createSwipeGenerationStreamCore renders updates and returns partial message on cancel');
}

{
  const message = {
    id: 'm6',
    role: 'assistant',
    content: '',
    meta: { swipes: [{ content: 'old', raw: 'old' }], activeSwipe: 0 },
  };
  const wrapper = createWrapper(message);
  const scrollEl = {
    querySelector(selector) {
      return selector.includes('m6') ? wrapper : null;
    },
  };
  const stream = createSwipeGenerationStreamCore({
    scrollEl,
    msgId: 'm6',
    meta: { label: '生成新回复中...' },
    setSwipeRegenerating() {},
    syncSwipeIndicator() {},
    renderSwipeContent() {},
    setStreamingState() {},
    isNearBottom: () => false,
    getStreamAutoFollow: () => false,
    setStreamAutoFollow() {},
    buildAssistantStreamMessage: (placeholder, meta, msgId, state) => ({
      ...placeholder,
      id: msgId,
      content: '',
      raw: typeof state.raw === 'string' ? state.raw : '',
      rawOriginal: typeof state.rawOriginal === 'string' ? state.rawOriginal : '',
      rawSource: typeof state.rawSource === 'string' ? state.rawSource : '',
      meta: {},
    }),
    applyReasoningUiState() {},
    scrollToBottom() {},
  });

  stream.update({ content: '', raw: 'raw partial', rawSource: 'source partial' });
  const partial = stream.cancel({ keepPartial: true });
  assert.equal(partial.content, 'source partial');
  assert.equal(partial.rawSource, 'source partial');
  console.log('ok - createSwipeGenerationStreamCore keeps raw-only partial on cancel');
}

{
  const message = {
    id: 'm7',
    role: 'assistant',
    content: '',
    meta: { swipes: [{ content: 'old', raw: 'old' }], activeSwipe: 0 },
  };
  const wrapper = createWrapper(message);
  const scrollEl = {
    querySelector(selector) {
      return selector.includes('m7') ? wrapper : null;
    },
  };
  const stream = createSwipeGenerationStreamCore({
    scrollEl,
    msgId: 'm7',
    meta: { label: '生成新回复中...' },
    setSwipeRegenerating() {},
    syncSwipeIndicator() {},
    renderSwipeContent() {},
    setStreamingState() {},
    isNearBottom: () => false,
    getStreamAutoFollow: () => false,
    setStreamAutoFollow() {},
    buildAssistantStreamMessage: (placeholder, meta, msgId, state) => ({
      ...placeholder,
      id: msgId,
      content: '',
      raw: '',
      rawOriginal: '',
      rawSource: '',
      meta: {
        ...((state.meta && typeof state.meta === 'object') ? state.meta : {}),
      },
    }),
    applyReasoningUiState() {},
    scrollToBottom() {},
  });

  stream.update({ content: '', meta: { reasoningDisplay: '只生成了思考' } });
  const partial = stream.cancel({ keepPartial: true });
  assert.equal(partial.content, '');
  assert.equal(partial.meta.reasoningDisplay, '只生成了思考');
  assert.equal(partial.meta.cancelled, true);
  console.log('ok - createSwipeGenerationStreamCore keeps reasoning-only partial on cancel');
}

{
  globalThis.window = {};
  globalThis.localStorage = {
    getItem() { return null; },
    setItem() {},
  };
  globalThis.document = {
    body: { dataset: {} },
    getElementById() { return null; },
    querySelector() { return null; },
  };
  const { ChatUI } = await import('../../src/scripts/ui/chat/chat-ui.js');
  let bubbleClearCount = 0;
  let contentClearCount = 0;
  const bubble = {
    classList: createClassList(),
    style: { removeProperty() {} },
    set innerHTML(value) {
      if (value === '') bubbleClearCount += 1;
    },
  };
  const contentTarget = {
    classList: createClassList(),
    style: {
      removeProperty() {},
      whiteSpace: '',
    },
    textContent: '',
    set innerHTML(value) {
      if (value === '') contentClearCount += 1;
    },
  };
  const wrapper = {
    querySelector(selector) {
      return selector === '.QQ_chat_msgdiv' ? bubble : null;
    },
  };
  const ui = Object.create(ChatUI.prototype);
  ui.cleanupRichTextMounts = () => {};
  ui.prepareTextContainer = () => contentTarget;
  ui.normalizeAssistantLineBreaks = value => String(value ?? '');
  ui.renderTextWithStickers = () => false;

  const rendered = ui._renderSwipeContent(
    wrapper,
    { id: 'm-swipe-reasoning', meta: { reasoningDisplay: '推理中' } },
    '正文',
    { streaming: true },
  );

  assert.equal(rendered, true);
  assert.equal(bubbleClearCount, 0);
  assert.equal(contentClearCount, 1);
  assert.equal(contentTarget.textContent, '正文');
  console.log('ok - swipe stream clears only the body target so reasoning action nodes remain mounted');
}
