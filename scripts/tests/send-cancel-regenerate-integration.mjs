import assert from 'node:assert/strict';

import { createDebugTraceTimeline } from '../../src/scripts/ui/debug-trace-timeline-utils.js';
import {
  createActiveGenerationRecord,
  runActiveGenerationCancelFlow,
} from '../../src/scripts/ui/chat/generation-state-utils.js';
import {
  buildSendFlowTraceEvent,
  resolveRegenerateFromUserIndexPlan,
} from '../../src/scripts/ui/chat/send-flow-utils.js';

let now = 2000;
const timeline = createDebugTraceTimeline({
  maxEvents: 80,
  now: () => now,
});
const recordSendTrace = (event) => {
  now += 13;
  return timeline.record(buildSendFlowTraceEvent(event));
};

const messages = [
  { id: 'u1', role: 'user', type: 'text', raw: '第一轮', content: '第一轮' },
  { id: 'a1', role: 'assistant', type: 'text', content: '旧回复' },
  { id: 'u2', role: 'user', type: 'text', raw: '第二轮', content: '第二轮' },
];
const appended = [];
let refreshed = 0;
const chatStore = {
  findMessage(id) {
    return messages.find(message => message.id === id) || appended.find(message => message.id === id) || null;
  },
  appendMessage(message) {
    const saved = { ...message, id: message.id || `saved-${appended.length + 1}` };
    appended.push(saved);
    messages.push(saved);
    return saved;
  },
};

const generation = createActiveGenerationRecord({
  id: 7,
  sessionId: 'session-send',
  userMsgId: 'u2',
});
generation.streamText = '取消时保留的回复';
generation.streamMeta = {
  id: 'partial-7',
  name: '助手',
  avatar: 'assistant.png',
  time: '15:00',
};

const cancelResult = runActiveGenerationCancelFlow({
  generation,
  reason: 'user',
  recordTraceEvent: recordSendTrace,
  chatStore,
  getAssistantAvatarForSession: () => 'fallback.png',
  formatNowTime: () => '14:59',
  refreshChatAndContacts: () => { refreshed += 1; },
});
const partial = cancelResult.partial;
const commitResult = cancelResult.commitResult;

const regeneratePlan = resolveRegenerateFromUserIndexPlan({
  messages,
  userIdx: 2,
  allowEmpty: false,
  isSyntheticUser: message => message?.role === 'user' && message?.meta?.generatedByAssistant === true,
});
recordSendTrace({
  phase: 'regenerate.start',
  sessionId: generation.sessionId,
  status: 'started',
  summary: 'regenerate flow started',
  details: {
    userIdx: 2,
    regenMessageCount: regeneratePlan.regenMessages.length,
  },
});

assert.equal(partial.id, 'partial-7');
assert.equal(commitResult.appended, true);
assert.equal(refreshed, 1);
assert.equal(appended.length, 1);
assert.equal(appended[0].content, '取消时保留的回复');
assert.equal(appended[0].meta.partial, true);
assert.equal(appended[0].meta.cancelled, true);
assert.equal(regeneratePlan.canRegenerate, true);
assert.deepEqual(regeneratePlan.regenMessages.map(message => message.id), ['partial-7']);
assert.equal(regeneratePlan.prevUser.id, 'u2');

assert.deepEqual(
  timeline.snapshot({ category: 'generation', sessionId: 'session-send' }).map(event => [event.phase, event.status]),
  [
    ['generation.cancel', 'started'],
    ['generation.cancel', 'success'],
    ['regenerate.start', 'started'],
  ],
);
assert.equal(
  timeline.snapshot().some(event => Object.hasOwn(event.details || {}, 'content')),
  false,
);

console.log('ok - send cancel regenerate integration commits partials and plans retry with trace events');
