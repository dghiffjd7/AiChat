import assert from 'node:assert/strict';

import { buildMessageElementCore } from '../../src/scripts/ui/chat/message-element-ui-utils.js';

const createFakeDocument = () => ({
  createElement(tagName) {
    return {
      tagName: String(tagName || '').toUpperCase(),
      className: '',
      dataset: {},
      children: [],
      appendChild(child) {
        this.children.push(child);
        return child;
      },
    };
  },
});

{
  assert.equal(buildMessageElementCore({
    message: {},
    resolveActiveSwipeMessage: value => value,
  }), null);
  console.log('ok - buildMessageElementCore skips empty messages without type content or active swipe draft');
}

{
  const dividerCalls = [];
  const result = buildMessageElementCore({
    message: { id: 'd1', role: 'system', type: 'divider', content: '---' },
    resolveActiveSwipeMessage: value => value,
    resolveMessageSessionId: () => '',
    createMessageId: () => 'generated',
    createDividerMessageWrapper: payload => {
      dividerCalls.push(payload.message.id);
      return { kind: 'divider', id: payload.message.id };
    },
    documentLike: createFakeDocument(),
  });
  assert.deepEqual(dividerCalls, ['d1']);
  assert.deepEqual(result, { kind: 'divider', id: 'd1' });
  console.log('ok - buildMessageElementCore routes divider system messages into divider wrapper builder');
}

{
  const bound = [];
  const systemWrapper = { kind: 'system' };
  const result = buildMessageElementCore({
    message: { role: 'system', content: 'notice' },
    resolveActiveSwipeMessage: value => value,
    resolveMessageSessionId: () => '',
    createMessageId: () => 'sys-id',
    createSystemMessageWrapper: ({ message }) => {
      assert.equal(message.id, 'sys-id');
      return systemWrapper;
    },
    bindMessageContextInteractions: ({ wrapper, message }) => {
      bound.push([wrapper, message.id]);
      return wrapper;
    },
    documentLike: createFakeDocument(),
  });
  assert.deepEqual(bound, [[systemWrapper, 'sys-id']]);
  assert.equal(result, systemWrapper);
  console.log('ok - buildMessageElementCore builds system wrappers and binds context interactions');
}

{
  const calls = [];
  const documentLike = createFakeDocument();
  const standardWrapper = { kind: 'standard' };
  const avatar = { kind: 'avatar' };
  const bubble = { kind: 'bubble' };
  const bubbleStack = { kind: 'bubble-stack' };
  const result = buildMessageElementCore({
    message: { id: 'm1', role: 'assistant', type: 'text', content: 'hello' },
    resolveActiveSwipeMessage: value => value,
    resolveMessageSessionId: () => 'chat:1',
    createMessageId: () => 'generated',
    createStandardMessageWrapper: ({ message, isUser }) => {
      calls.push(['wrapper', message.id, isUser]);
      return standardWrapper;
    },
    createMessageAvatarImage: () => avatar,
    defaultAvatar: '/default.png',
    documentLike,
    createBubble: () => bubble,
    renderMessageBubbleContent: payload => {
      calls.push(['bubble', payload.message.id, payload.resolvedSessionId, payload.bubble]);
    },
    buildMessageSidecarElement: ({ message }) => {
      calls.push(['sidecar', message.id]);
      return 'agent-sidecar';
    },
    buildReactionSummaryElement: () => 'summary',
    createReactionTriggerButton: (_message, options) => {
      calls.push(['reaction-btn', options.isThreadingEnabled]);
      options.onShowPicker?.('btn', { id: 'm1' });
      return 'button';
    },
    buildBubbleStack: payload => {
      calls.push(['stack', payload.isUser, payload.messageSidecarEl, payload.reactionSummaryEl, payload.reactionButton]);
      return bubbleStack;
    },
    appendStandardMessageLayout: payload => {
      calls.push(['layout', payload.wrapper, payload.avatarImg, payload.bubbleStack, payload.uiMode]);
    },
    isThreadingEnabledForMessage: () => true,
    showReactionPicker: (button, message) => calls.push(['show-picker', button, message.id]),
    createSwipeIndicatorElement: () => null,
    getUiMode: () => 'chat',
    selectionMode: true,
    scheduleSelectionModeApply: payload => calls.push(['selection', payload.selectionMode, payload.messageId]),
    scrollEl: { id: 'scroll' },
    markWrapperSelectable: () => {},
    setSelectionBarVisible: () => {},
    bindMessageContextInteractions: ({ wrapper, message }) => {
      calls.push(['bind', wrapper, message.id]);
      return wrapper;
    },
  });
  assert.equal(result, standardWrapper);
  assert.deepEqual(calls, [
    ['wrapper', 'm1', false],
    ['bubble', 'm1', 'chat:1', bubble],
    ['sidecar', 'm1'],
    ['reaction-btn', true],
    ['show-picker', 'btn', 'm1'],
    ['stack', false, 'agent-sidecar', 'summary', 'button'],
    ['layout', standardWrapper, avatar, bubbleStack, 'chat'],
    ['bind', standardWrapper, 'm1'],
    ['selection', true, 'm1'],
  ]);
  console.log('ok - buildMessageElementCore orchestrates standard message wrapper bubble reactions layout binding and selection scheduling');
}
