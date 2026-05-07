import assert from 'node:assert/strict';

import { createDebugTraceTimeline } from '../../src/scripts/ui/debug-trace-timeline-utils.js';
import { dispatchAfterReceiveEffects } from '../../src/scripts/ui/chat/after-receive-dispatch-utils.js';
import { createMomentSummaryCompactionRuntime } from '../../src/scripts/ui/chat/moments-runtime-utils.js';
import { buildSendFlowTraceEvent } from '../../src/scripts/ui/chat/send-flow-utils.js';
import { applyBeforeSendHooks } from '../../src/scripts/ui/chat/send-before-hook-utils.js';
import { dispatchAfterSendEvents } from '../../src/scripts/ui/chat/send-side-effect-utils.js';

let currentTime = 1000;
const timeline = createDebugTraceTimeline({
  maxEvents: 80,
  now: () => currentTime,
});
const recordTraceEvent = (event) => {
  currentTime += 7;
  return timeline.record(event);
};

recordTraceEvent(buildSendFlowTraceEvent({
  phase: 'send.start',
  sessionId: 'session-trace',
  status: 'started',
  summary: 'integration send started',
  details: { generationId: 1, content: undefined },
}));

const hookCalls = [];
const text = await applyBeforeSendHooks({
  text: 'hello',
  sessionId: 'session-trace',
  userName: '我',
  scriptRuntime: {
    dispatchEvent(event, payload) {
      hookCalls.push(['script-before', event, payload.content]);
      return Promise.resolve({ content: `${payload.content}-script` });
    },
  },
  pluginRuntime: {
    dispatchEvent(event, payload) {
      hookCalls.push(['plugin-before', event, payload.content]);
      return Promise.resolve({ content: `${payload.content}-plugin` });
    },
  },
  recordTraceEvent,
});

dispatchAfterSendEvents({
  messages: [{ id: 'user-1', role: 'user', type: 'text', content: text }],
  sessionId: 'session-trace',
  scriptRuntime: {
    dispatchEvent(event, payload) {
      hookCalls.push(['script-after-send', event, payload.message.id]);
      return Promise.resolve();
    },
  },
  pluginRuntime: {
    dispatchEvent(event, payload) {
      hookCalls.push(['plugin-after-send', event, payload.message.id]);
      return Promise.resolve();
    },
  },
  recordTraceEvent,
});

dispatchAfterReceiveEffects({
  message: { id: 'assistant-1', role: 'assistant', type: 'text', content: 'reply' },
  sessionId: 'session-trace',
  scriptRuntime: {
    dispatchEvent(event, payload) {
      hookCalls.push(['script-after-receive', event, payload.message.id]);
      return Promise.resolve();
    },
  },
  pluginRuntime: {
    dispatchEvent(event, payload) {
      hookCalls.push(['plugin-after-receive', event, payload.message.id]);
      return Promise.resolve();
    },
  },
  applyUpdateVariable(message, sessionId) {
    hookCalls.push(['update-variable', message.id, sessionId]);
  },
  handleVariableRules(payload) {
    hookCalls.push(['variable-rules', payload.message.id, payload.sessionId]);
    return Promise.resolve();
  },
  recordTraceEvent,
  logger: { warn() {} },
});

const store = {
  summaries: [{ text: '旧1' }, { text: '旧2' }, { text: '新3' }],
  compacted: null,
  getSummaries() { return this.summaries; },
  setSummaries(next) { this.summaries = next; },
  getCompactedSummary() { return { text: '已有大总结' }; },
  setCompactedSummaryRaw(raw) { this.raw = raw; },
  setCompactedSummary(text, meta) { this.compacted = { text, meta }; },
};
const compact = createMomentSummaryCompactionRuntime({
  scopeKey: 'integration-moments',
  momentSummaryStore: store,
  getIsConfigured: () => true,
  buildMessages: () => ['message'],
  backgroundChat: async () => '<summary>ignored</summary>',
  getActiveUserProfile: () => ({ name: '我' }),
  buildContext: ({ sessionId, characterName }) => ({ sessionId, characterName }),
  requestCompactionRaw: async () => '<summary>摘要</summary>',
  parseCompactionResult: raw => ({ text: '摘要', valid: raw.includes('<summary>') }),
  normalizeItems: items => (Array.isArray(items) ? items : []),
  shouldCompact: ({ items }) => items.length >= 3,
  dispatchUpdated: () => hookCalls.push(['moment-updated']),
  setTimeoutFn: (fn) => { Promise.resolve().then(fn); return 1; },
  delayMs: 0,
  recordTraceEvent,
});
const compacted = await compact();

await Promise.resolve();
await Promise.resolve();

assert.equal(text, 'hello-script-plugin');
assert.equal(compacted, true);
assert.equal(store.compacted?.text, '摘要');
assert.deepEqual(hookCalls.map(call => call[0]), [
  'script-before',
  'plugin-before',
  'script-after-send',
  'plugin-after-send',
  'script-after-receive',
  'plugin-after-receive',
  'update-variable',
  'variable-rules',
  'moment-updated',
]);

const trace = timeline.snapshot();
assert.equal(trace.some(event => event.category === 'generation' && event.phase === 'send.start'), true);
assert.equal(trace.some(event => event.category === 'plugin-hooks' && event.phase === 'before_send.finish'), true);
assert.equal(trace.some(event => event.category === 'plugin-hooks' && event.phase === 'after_send.finish'), true);
assert.equal(trace.some(event => event.category === 'plugin-hooks' && event.phase === 'after_receive.finish'), true);
assert.equal(trace.some(event => event.category === 'moments' && event.phase === 'summary.compaction.finish'), true);
assert.equal(trace.every(event => !Object.hasOwn(event.details || {}, 'content')), true);
assert.equal(timeline.snapshot({ category: 'plugin-hooks', sessionId: 'session-trace' }).length, 12);

console.log('ok - lifecycle trace integration records send, plugin hooks, and moment summary lifecycle together');
