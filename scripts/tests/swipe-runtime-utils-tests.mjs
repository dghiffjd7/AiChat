import assert from 'node:assert/strict';

import {
  addSwipeBranchCore,
  applySwipeCore,
  bindSwipeEventsCore,
  createSwipeGenerationStreamCore,
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
	      swipes: [
	        { content: 'a', raw: 'ra', rawSource: 'source-a' },
	        { content: 'b', raw: 'rb', rawSource: 'source-b', rawOriginal: 'original-b' },
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
	  assert.equal(renders.length, 1);
  assert.equal(syncs.length, 1);
  assert.equal(change.index, 1);
  assert.equal(change.previousIndex, 0);
  console.log('ok - applySwipeCore updates active branch, renders content and emits change payload');
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
