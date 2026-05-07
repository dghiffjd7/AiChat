import assert from 'node:assert/strict';

import {
  clearInputCore,
  clearMessagesCore,
  scrollToBottomCore,
  scrollToMessageCore,
  showConversationLoadingCore,
  updateSendButtonStateCore,
} from '../../src/scripts/ui/chat/chat-view-state-ui-utils.js';

const createClassList = () => {
  const set = new Set();
  return {
    add: token => set.add(token),
    remove: token => set.delete(token),
    contains: token => set.has(token),
    toggle: (token, force) => {
      if (force) set.add(token);
      else set.delete(token);
    },
  };
};

{
  let focused = 0;
  const inputEl = {
    value: 'text',
    focus() { focused += 1; },
  };
  clearInputCore({ inputEl, options: { focus: true } });
  assert.equal(inputEl.value, '');
  assert.equal(focused, 1);
  console.log('ok - clearInputCore clears composer text and focuses when requested');
}

{
  let removed = 0;
  const floatingTypingEl = { remove() { removed += 1; } };
  const scrollEl = { innerHTML: '<div></div>' };
  const cleared = clearMessagesCore({
    scrollEl,
    cleanupRichTextMounts() {},
    hideReactionPicker() {},
    hideScrollDateBadge() {},
    hideScrollBottomButton() {},
    clearDeliverySequence() {},
    clearTypingTimers() {},
    getReadCountTimer: () => null,
    setReadCountTimer() {},
    setReadCountCurrent() {},
    setReadCountMax() {},
    setReadCountTargets() {},
    setDeliverySequenceDone() {},
    setTypingEl() {},
    getFloatingTypingEl: () => floatingTypingEl,
    setFloatingTypingEl(value) { assert.equal(value, null); },
    setRpFloorCount(value) { assert.equal(value, 0); },
  });
  assert.equal(cleared, true);
  assert.equal(scrollEl.innerHTML, '');
  assert.equal(removed, 1);
  console.log('ok - clearMessagesCore resets scroll content and floating typing state');
}

{
  const children = [];
  const documentLike = {
    createElement() {
      return {
        style: {},
        children: [],
        appendChild(child) {
          this.children.push(child);
          return child;
        },
      };
    },
  };
  const scrollEl = {
    appendChild(node) { children.push(node); },
    scrollTop: 99,
  };
  const wrapper = showConversationLoadingCore({
    title: '测试会话',
    scrollEl,
    documentLike,
    clearMessages() {},
    scheduleScrollBottomButtonRefresh() {},
  });
  assert.equal(Boolean(wrapper), true);
  assert.equal(children.length, 1);
  assert.equal(scrollEl.scrollTop, 0);
  console.log('ok - showConversationLoadingCore mounts loading skeleton and resets scroll top');
}

{
  const sendBtn = {
    disabled: false,
    classList: createClassList(),
    attrs: new Map(),
    setAttribute(name, value) { this.attrs.set(name, value); },
  };
  const contBtn = { disabled: false };
  const state = updateSendButtonStateCore({
    sendBtn,
    isSending: true,
    isStreaming: false,
    isOnline: true,
    continueButton: contBtn,
  });
  assert.equal(state.isBusy, true);
  assert.equal(sendBtn.classList.contains('is-generating'), true);
  assert.equal(sendBtn.attrs.get('aria-label'), '停止生成');
  assert.equal(contBtn.disabled, true);
  console.log('ok - updateSendButtonStateCore synchronizes busy state aria label and continue button');
}

{
  const scrollEl = { scrollTop: 0, scrollHeight: 320 };
  let autoFollow = false;
  scrollToBottomCore({
    scrollEl,
    isStreaming: true,
    setProgrammaticScroll() {},
    setProgrammaticStreamFollowScroll() {},
    setStreamAutoFollow(value) { autoFollow = value; },
    scheduleScrollBottomButtonRefresh() {},
  });
  assert.equal(scrollEl.scrollTop, 320);
  assert.equal(autoFollow, true);
  console.log('ok - scrollToBottomCore jumps to the bottom and reenables stream auto-follow');
}

{
  const target = { offsetTop: 88 };
  const scrollEl = {
    scrollTop: 0,
    querySelector(selector) {
      if (selector.includes('msg-1')) return target;
      return null;
    },
  };
  const resolved = scrollToMessageCore({
    msgId: 'msg-1',
    scrollEl,
    setProgrammaticStreamFollowScroll() {},
    scheduleScrollBottomButtonRefresh() {},
  });
  assert.equal(resolved, target);
  assert.equal(scrollEl.scrollTop, 76);
  console.log('ok - scrollToMessageCore resolves target wrapper and scrolls near it');
}
