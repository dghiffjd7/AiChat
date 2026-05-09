import assert from 'node:assert/strict';

import { createDebugTraceTimeline } from '../../src/scripts/ui/debug-trace-timeline-utils.js';
import {
  dispatchRuntimeHookLifecycleEvent,
  runRuntimeHookLifecycleEvent,
} from '../../src/scripts/ui/chat/hook-lifecycle-trace-utils.js';

const sessionId = 'plugin-session';
let currentTime = 2000;
const timeline = createDebugTraceTimeline({
  maxEvents: 80,
  now: () => currentTime,
});
const recordTraceEvent = (event) => {
  currentTime += 11;
  return timeline.record(event);
};

const calls = [];
const warnings = [];
const logger = { warn: (...args) => warnings.push(args) };
const createRuntime = (runtimeLabel) => ({
  dispatchEvent(event, payload) {
    calls.push(`${runtimeLabel}:${event}`);
    if (event === 'prompt.before_build') {
      return Promise.resolve({
        input: `${payload.input}-${runtimeLabel}`,
        context: {
          ...(payload.context || {}),
          [`${runtimeLabel}BeforeBuild`]: true,
        },
      });
    }
    if (event === 'prompt.after_build') {
      return Promise.resolve({
        prompt: [
          ...(Array.isArray(payload.prompt) ? payload.prompt : []),
          { role: 'system', content: `${runtimeLabel} prompt marker` },
        ],
        context: payload.context,
      });
    }
    return Promise.resolve({ ok: true });
  },
});

const pluginRuntime = createRuntime('plugin');
const scriptRuntime = createRuntime('script');
const sessionPayload = {
  oldSession: { id: 'old-session', name: '旧会话', isGroup: false },
  newSession: { id: sessionId, name: '新会话', isGroup: true },
};

dispatchRuntimeHookLifecycleEvent({
  runtime: pluginRuntime,
  runtimeLabel: 'plugin',
  hookName: 'session.changed',
  payload: sessionPayload,
  sessionId,
  details: { oldSessionId: 'old-session', newSessionId: sessionId, newIsGroup: true },
  logger,
  warningMessage: 'plugin session.changed failed',
  recordTraceEvent,
});
dispatchRuntimeHookLifecycleEvent({
  runtime: scriptRuntime,
  runtimeLabel: 'script',
  hookName: 'session.changed',
  payload: sessionPayload,
  sessionId,
  details: { oldSessionId: 'old-session', newSessionId: sessionId, newIsGroup: true },
  logger,
  warningMessage: 'script session.changed failed',
  recordTraceEvent,
});

let promptInput = 'raw prompt secret';
let promptContext = { session: { id: sessionId }, meta: { hidden: 'context-secret' } };
for (const [runtimeLabel, runtime] of [['script', scriptRuntime], ['plugin', pluginRuntime]]) {
  const beforeInput = promptInput;
  const beforeContext = promptContext;
  const { result } = await runRuntimeHookLifecycleEvent({
    runtime,
    runtimeLabel,
    hookName: 'prompt.before_build',
    payload: { input: promptInput, context: promptContext },
    sessionId,
    details: { inputLength: promptInput.length, hasContext: true },
    finishDetails: updated => ({
      hasInputOverride: typeof updated?.input === 'string',
      inputChanged: typeof updated?.input === 'string' && updated.input !== beforeInput,
      hasContextOverride: Boolean(updated?.context && typeof updated.context === 'object'),
      contextChanged: Boolean(updated?.context && typeof updated.context === 'object' && updated.context !== beforeContext),
    }),
    logger,
    warningMessage: `${runtimeLabel} prompt.before_build failed`,
    recordTraceEvent,
  });
  if (result && typeof result === 'object') {
    if (typeof result.input === 'string') promptInput = result.input;
    if (result.context && typeof result.context === 'object') promptContext = result.context;
  }
}

let promptMessages = [{ role: 'user', content: promptInput }];
for (const [runtimeLabel, runtime] of [['script', scriptRuntime], ['plugin', pluginRuntime]]) {
  const beforePrompt = promptMessages;
  const { result } = await runRuntimeHookLifecycleEvent({
    runtime,
    runtimeLabel,
    hookName: 'prompt.after_build',
    payload: { prompt: promptMessages, context: promptContext },
    sessionId,
    details: { promptCount: promptMessages.length, hasContext: true },
    finishDetails: updated => ({
      hasPromptOverride: Array.isArray(updated?.prompt),
      promptChanged: Array.isArray(updated?.prompt) && updated.prompt !== beforePrompt,
      promptCount: Array.isArray(updated?.prompt) ? updated.prompt.length : undefined,
    }),
    logger,
    warningMessage: `${runtimeLabel} prompt.after_build failed`,
    recordTraceEvent,
  });
  if (result && typeof result === 'object' && Array.isArray(result.prompt)) {
    promptMessages = result.prompt;
  }
}

const variablePayload = {
  name: 'mood',
  oldValue: 'old-secret-value',
  newValue: 'new-secret-value',
  sessionId,
  scope: 'chat',
};
for (const [runtimeLabel, runtime] of [['plugin', pluginRuntime], ['script', scriptRuntime]]) {
  dispatchRuntimeHookLifecycleEvent({
    runtime,
    runtimeLabel,
    hookName: 'variable.changed',
    payload: variablePayload,
    sessionId,
    details: { name: 'mood', scope: 'chat', hasSession: true, changed: true },
    logger,
    warningMessage: `${runtimeLabel} variable.changed failed`,
    recordTraceEvent,
  });
}

dispatchRuntimeHookLifecycleEvent({
  runtime: pluginRuntime,
  runtimeLabel: 'plugin',
  hookName: 'command.parsed',
  payload: { text: '/secret-command', handled: true, sessionId },
  sessionId,
  details: { handled: true, commandLength: '/secret-command'.length },
  logger,
  warningMessage: 'plugin command.parsed failed',
  recordTraceEvent,
});

const renderMessage = {
  id: 'render-1',
  role: 'assistant',
  type: 'text',
  content: 'secret rendered message',
};
for (const hookName of ['message.before_render', 'message.after_render']) {
  for (const [runtimeLabel, runtime] of [['plugin', pluginRuntime], ['script', scriptRuntime]]) {
    dispatchRuntimeHookLifecycleEvent({
      runtime,
      runtimeLabel,
      hookName,
      payload: { message: renderMessage, elementId: hookName.endsWith('after_render') ? renderMessage.id : undefined },
      sessionId,
      messageId: renderMessage.id,
      details: {
        role: renderMessage.role,
        type: renderMessage.type,
        hasElement: hookName.endsWith('after_render') ? true : undefined,
      },
      logger,
      warningMessage: `${runtimeLabel} ${hookName} failed`,
      recordTraceEvent,
    });
  }
}

await Promise.resolve();

assert.deepEqual(calls, [
  'plugin:session.changed',
  'script:session.changed',
  'script:prompt.before_build',
  'plugin:prompt.before_build',
  'script:prompt.after_build',
  'plugin:prompt.after_build',
  'plugin:variable.changed',
  'script:variable.changed',
  'plugin:command.parsed',
  'plugin:message.before_render',
  'script:message.before_render',
  'plugin:message.after_render',
  'script:message.after_render',
]);
assert.equal(promptInput, 'raw prompt secret-script-plugin');
assert.equal(promptContext.scriptBeforeBuild, true);
assert.equal(promptContext.pluginBeforeBuild, true);
assert.equal(promptMessages.length, 3);
assert.equal(warnings.length, 0);

const trace = timeline.snapshot({ category: 'plugin-hooks', sessionId });
assert.equal(trace.length, 26);
assert.equal(trace.filter(event => event.status === 'started').length, 13);
assert.equal(trace.filter(event => event.status === 'queued').length, 9);
assert.equal(trace.filter(event => event.status === 'success').length, 4);
assert.equal(trace.some(event => event.phase === 'session.changed.finish' && event.runtimeLabel === 'plugin'), true);
assert.equal(trace.some(event => event.phase === 'prompt.before_build.finish' && event.runtimeLabel === 'plugin' && event.details.inputChanged === true), true);
assert.equal(trace.some(event => event.phase === 'prompt.after_build.finish' && event.runtimeLabel === 'script' && event.details.promptCount === 2), true);
assert.equal(trace.some(event => event.phase === 'variable.changed.finish' && event.runtimeLabel === 'script'), true);
assert.equal(trace.some(event => event.phase === 'command.parsed.finish' && event.runtimeLabel === 'plugin'), true);
assert.equal(trace.some(event => event.phase === 'message.after_render.finish' && event.messageId === 'render-1'), true);

const serializedTrace = JSON.stringify(trace);
assert.equal(serializedTrace.includes('old-secret-value'), false);
assert.equal(serializedTrace.includes('new-secret-value'), false);
assert.equal(serializedTrace.includes('/secret-command'), false);
assert.equal(serializedTrace.includes('secret rendered message'), false);
assert.equal(serializedTrace.includes('context-secret'), false);
assert.equal(serializedTrace.includes('raw prompt secret'), false);

console.log('ok - plugin hook lifecycle integration records session prompt variable command and render hooks');
