import assert from 'node:assert/strict';

import {
  buildChatBodyQualityAgentRun,
  buildChatBodyQualityMessagePart,
  buildChatFormatGuardianAgentRun,
  buildChatFormatGuardianMessagePart,
  dispatchAfterReceiveEffects,
  resolveChatFormatGuardianInputText,
  resolveAfterReceiveSkipScripts,
  runChatBodyQualityPreview,
  runChatFormatGuardianPreview,
} from '../../src/scripts/ui/chat/after-receive-dispatch-utils.js';
import {
  buildAfterReceiveHookFinishTraceEvent,
  buildAfterReceiveHookStartTraceEvent,
  buildAfterSendHookFinishTraceEvent,
  buildAfterSendHookStartTraceEvent,
  buildBeforeSendHookFinishTraceEvent,
  buildBeforeSendHookStartTraceEvent,
  buildHookLifecycleTraceEvent,
  buildRuntimeHookFinishTraceEvent,
  buildRuntimeHookStartTraceEvent,
  dispatchRuntimeHookLifecycleEvent,
  runRuntimeHookLifecycleEvent,
} from '../../src/scripts/ui/chat/hook-lifecycle-trace-utils.js';

const tests = [];
const test = (name, fn) => tests.push({ name, fn });
const flushMicrotasks = () => new Promise(resolve => setTimeout(resolve, 0));

test('resolveAfterReceiveSkipScripts prefers explicit override', () => {
  assert.equal(resolveAfterReceiveSkipScripts(true, false), true);
  assert.equal(resolveAfterReceiveSkipScripts(false, true), false);
  assert.equal(resolveAfterReceiveSkipScripts(undefined, true), true);
});

test('buildHookLifecycleTraceEvent normalizes hook metadata and drops undefined details', () => {
  const event = buildHookLifecycleTraceEvent({
    phase: ' after_receive.start ',
    hookName: ' message.after_receive ',
    runtimeLabel: ' plugin ',
    sessionId: ' s1 ',
    messageId: ' m1 ',
    status: ' started ',
    summary: ' started ',
    details: { kept: true, dropped: undefined },
  });
  assert.deepEqual(event, {
    category: 'plugin-hooks',
    source: 'hook-lifecycle',
    phase: 'after_receive.start',
    hookName: 'message.after_receive',
    runtimeLabel: 'plugin',
    sessionId: 's1',
    messageId: 'm1',
    status: 'started',
    summary: 'started',
    details: { kept: true },
  });
});

test('hook trace patch builders preserve runtime hook payload contracts', () => {
  assert.deepEqual(buildBeforeSendHookStartTraceEvent({
    runtimeLabel: 'script',
    sessionId: 's1',
    text: 'hello',
    isGroupChat: true,
    hasAttachments: false,
    allowTextOverride: true,
  }), {
    phase: 'before_send.start',
    hookName: 'message.before_send',
    runtimeLabel: 'script',
    sessionId: 's1',
    status: 'started',
    summary: 'message.before_send hook started',
    details: {
      isGroupChat: true,
      hasAttachments: false,
      allowTextOverride: true,
      contentLength: 5,
    },
  });
  assert.deepEqual(buildBeforeSendHookFinishTraceEvent({
    runtimeLabel: 'plugin',
    sessionId: 's1',
    text: 'hello',
    nextText: 'hello!',
    changed: true,
  }), {
    phase: 'before_send.finish',
    hookName: 'message.before_send',
    runtimeLabel: 'plugin',
    sessionId: 's1',
    status: 'success',
    summary: 'message.before_send hook changed content',
    details: {
      changed: true,
      originalLength: 5,
      nextLength: 6,
    },
  });
  assert.deepEqual(buildAfterSendHookStartTraceEvent({
    runtimeLabel: 'plugin',
    sessionId: 's2',
    message: { id: ' m1 ', role: 'user', type: 'text' },
  }), {
    phase: 'after_send.start',
    hookName: 'message.after_send',
    runtimeLabel: 'plugin',
    sessionId: 's2',
    messageId: 'm1',
    status: 'started',
    summary: 'message.after_send hook started',
    details: { role: 'user', type: 'text' },
  });
  assert.deepEqual(buildAfterSendHookFinishTraceEvent({
    runtimeLabel: 'plugin',
    sessionId: 's2',
    messageId: 'm1',
    status: 'queued',
  }), {
    phase: 'after_send.finish',
    hookName: 'message.after_send',
    runtimeLabel: 'plugin',
    sessionId: 's2',
    messageId: 'm1',
    status: 'queued',
    summary: 'message.after_send hook queued',
  });
  assert.deepEqual(buildAfterReceiveHookStartTraceEvent({
    runtimeLabel: 'script',
    sessionId: 's3',
    message: { id: 'm2', role: 'assistant', type: 'text' },
  }), {
    phase: 'after_receive.start',
    hookName: 'message.after_receive',
    runtimeLabel: 'script',
    sessionId: 's3',
    messageId: 'm2',
    status: 'started',
    summary: 'message.after_receive hook started',
    details: { role: 'assistant', type: 'text' },
  });
  assert.deepEqual(buildAfterReceiveHookFinishTraceEvent({
    runtimeLabel: 'script',
    sessionId: 's3',
    messageId: 'm2',
    status: 'error',
    errorMessage: 'failed',
  }), {
    phase: 'after_receive.finish',
    hookName: 'message.after_receive',
    runtimeLabel: 'script',
    sessionId: 's3',
    messageId: 'm2',
    status: 'error',
    summary: 'failed',
  });
  assert.deepEqual(buildRuntimeHookStartTraceEvent({
    runtimeLabel: 'plugin',
    hookName: 'variable.changed',
    sessionId: 's4',
    details: { name: 'mood', dropped: undefined },
  }), {
    phase: 'variable.changed.start',
    hookName: 'variable.changed',
    runtimeLabel: 'plugin',
    sessionId: 's4',
    messageId: '',
    status: 'started',
    summary: 'variable.changed hook started',
    details: { name: 'mood' },
  });
  assert.deepEqual(buildRuntimeHookFinishTraceEvent({
    runtimeLabel: 'plugin',
    hookName: 'prompt.before_build',
    sessionId: 's5',
    status: 'success',
    details: { hasInputOverride: true },
  }), {
    phase: 'prompt.before_build.finish',
    hookName: 'prompt.before_build',
    runtimeLabel: 'plugin',
    sessionId: 's5',
    messageId: '',
    status: 'success',
    summary: 'prompt.before_build hook finished',
    details: { hasInputOverride: true },
  });
});

test('dispatchRuntimeHookLifecycleEvent records queued and async error without exposing payload', async () => {
  const calls = [];
  const trace = [];
  const warnings = [];
  const ok = dispatchRuntimeHookLifecycleEvent({
    runtime: {
      dispatchEvent(event, payload) {
        calls.push([event, payload.secret]);
        return Promise.reject(new Error('async failed'));
      },
    },
    runtimeLabel: 'plugin',
    hookName: 'variable.changed',
    payload: { secret: 'raw-value' },
    sessionId: 's1',
    details: { name: 'mood', scope: 'chat', raw: undefined },
    logger: { warn: (...args) => warnings.push(args) },
    warningMessage: 'plugin variable.changed failed',
    recordTraceEvent: event => trace.push(event),
  });
  await flushMicrotasks();

  assert.equal(ok, true);
  assert.deepEqual(calls, [['variable.changed', 'raw-value']]);
  assert.deepEqual(
    trace.map(event => [event.runtimeLabel, event.phase, event.status, event.summary]),
    [
      ['plugin', 'variable.changed.start', 'started', 'variable.changed hook started'],
      ['plugin', 'variable.changed.finish', 'queued', 'variable.changed hook queued'],
      ['plugin', 'variable.changed.finish', 'error', 'async failed'],
    ],
  );
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0][0], 'plugin variable.changed failed');
  assert.equal(JSON.stringify(trace).includes('raw-value'), false);
});

test('dispatchRuntimeHookLifecycleEvent preserves synchronous dispatch failures', () => {
  const trace = [];
  assert.throws(() => dispatchRuntimeHookLifecycleEvent({
    runtime: {
      dispatchEvent() {
        throw new Error('sync failed');
      },
    },
    runtimeLabel: 'plugin',
    hookName: 'command.parsed',
    payload: { text: '/secret' },
    sessionId: 's1',
    details: { commandLength: 7 },
    recordTraceEvent: event => trace.push(event),
  }), /sync failed/);
  assert.deepEqual(
    trace.map(event => [event.phase, event.status, event.summary]),
    [
      ['command.parsed.start', 'started', 'command.parsed hook started'],
      ['command.parsed.finish', 'error', 'sync failed'],
    ],
  );
  assert.equal(JSON.stringify(trace).includes('/secret'), false);
});

test('runRuntimeHookLifecycleEvent awaits mutable hooks and records non-sensitive result metadata', async () => {
  const trace = [];
  const warnings = [];
  const success = await runRuntimeHookLifecycleEvent({
    runtime: {
      dispatchEvent(event, payload) {
        assert.equal(event, 'prompt.before_build');
        assert.equal(payload.input, 'raw prompt');
        return Promise.resolve({ input: 'next prompt', context: payload.context });
      },
    },
    runtimeLabel: 'script',
    hookName: 'prompt.before_build',
    payload: { input: 'raw prompt', context: { session: { id: 's1' } } },
    sessionId: 's1',
    details: { inputLength: 10 },
    finishDetails: result => ({
      hasInputOverride: typeof result?.input === 'string',
      inputLength: String(result?.input || '').length,
    }),
    logger: { warn: (...args) => warnings.push(args) },
    recordTraceEvent: event => trace.push(event),
  });
  const failure = await runRuntimeHookLifecycleEvent({
    runtime: {
      dispatchEvent() {
        return Promise.reject(new Error('mutate failed'));
      },
    },
    runtimeLabel: 'plugin',
    hookName: 'prompt.after_build',
    payload: { prompt: [{ content: 'secret prompt' }] },
    sessionId: 's1',
    details: { promptCount: 1 },
    logger: { warn: (...args) => warnings.push(args) },
    warningMessage: 'plugin prompt.after_build failed',
    recordTraceEvent: event => trace.push(event),
  });

  assert.equal(success.dispatched, true);
  assert.equal(success.result.input, 'next prompt');
  assert.equal(failure.dispatched, true);
  assert.equal(failure.error?.message, 'mutate failed');
  assert.deepEqual(
    trace.map(event => [event.runtimeLabel, event.phase, event.status]),
    [
      ['script', 'prompt.before_build.start', 'started'],
      ['script', 'prompt.before_build.finish', 'success'],
      ['plugin', 'prompt.after_build.start', 'started'],
      ['plugin', 'prompt.after_build.finish', 'error'],
    ],
  );
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0][0], 'plugin prompt.after_build failed');
  assert.equal(JSON.stringify(trace).includes('raw prompt'), false);
  assert.equal(JSON.stringify(trace).includes('secret prompt'), false);
});

test('dispatchAfterReceiveEffects ignores non-assistant messages', () => {
  const calls = [];
  const handled = dispatchAfterReceiveEffects({
    message: { role: 'user' },
    sessionId: 's1',
    applyUpdateVariable: () => calls.push('update'),
  });
  assert.equal(handled, false);
  assert.deepEqual(calls, []);
});

test('dispatchAfterReceiveEffects dispatches runtimes, update apply, and variable rules', async () => {
  const calls = [];
  const trace = [];
  const handled = dispatchAfterReceiveEffects({
    message: { id: 'm1', role: 'assistant' },
    sessionId: 's2',
    defaultSkipScripts: false,
    scriptRuntime: {
      dispatchEvent(event, payload) {
        calls.push(['script', event, payload.sessionId, payload.message.id]);
        return Promise.resolve();
      },
    },
    pluginRuntime: {
      dispatchEvent(event, payload) {
        calls.push(['plugin', event, payload.sessionId, payload.message.id]);
        return Promise.resolve();
      },
    },
    applyUpdateVariable(message, sessionId) {
      calls.push(['update', message.id, sessionId]);
    },
    handleVariableRules(payload) {
      calls.push(['rules', payload.message.id, payload.sessionId, payload.useGlobalVariables]);
      return Promise.resolve();
    },
    useGlobalVariables: true,
    recordTraceEvent: event => trace.push(event),
    logger: { warn() {} },
  });
  await flushMicrotasks();
  assert.equal(handled, true);
  assert.deepEqual(calls, [
    ['script', 'message.after_receive', 's2', 'm1'],
    ['plugin', 'message.after_receive', 's2', 'm1'],
    ['update', 'm1', 's2'],
    ['rules', 'm1', 's2', true],
  ]);
  assert.deepEqual(
    trace.map(event => [event.runtimeLabel, event.phase, event.status, event.messageId]),
    [
      ['script', 'after_receive.start', 'started', 'm1'],
      ['script', 'after_receive.finish', 'queued', 'm1'],
      ['plugin', 'after_receive.start', 'started', 'm1'],
      ['plugin', 'after_receive.finish', 'queued', 'm1'],
    ],
  );
});

test('buildChatFormatGuardianMessagePart summarizes warnings without exposing full content', () => {
  const part = buildChatFormatGuardianMessagePart({
    now: 1000,
    sessionId: 'group:case',
    message: { id: 'm-format' },
    result: {
      status: 'needs_review',
      sourceMessageId: 'm-format',
      summary: '1 chat format event draft(s), 0 error(s), 1 warning(s)',
      eventDrafts: [{
        type: 'group_message',
        surface: 'chat',
        targetId: 'group:case',
        targetName: '调查组',
        speakerId: 'contact:snow',
        speakerName: '雪',
        content: '这是一段非常长的内容，用来确认 sidecar 只保存预览摘要，不把完整正文复制到元数据里。'.repeat(3),
        warnings: ['time is missing'],
      }],
      errors: [],
      warnings: ['time is missing'],
    },
  });

  assert.equal(part.type, 'agent_status');
  assert.equal(part.runId, 'run:chat-format-guardian:m-format');
  assert.equal(part.source, 'chat-format-guardian');
  assert.equal(part.kind, 'chat_format.validate');
  assert.equal(part.status, 'waiting_permission');
  assert.equal(part.title, '聊天格式待确认');
  assert.equal(part.metadata.eventCount, 1);
  assert.deepEqual(part.metadata.countsByType, { group_message: 1 });
  assert.equal(part.metadata.events[0].contentPreview.endsWith('...'), true);
  assert.deepEqual(
    part.metadata.decisionActions.filter(action => action.enabled !== false).map(action => action.id),
    ['swipe_retry', 'review_original', 'edit_user_input_suggestion', 'open_agent_center'],
  );
  assert.equal(part.metadata.inputSuggestion.includes('补齐每条聊天消息的时间'), true);
});

test('buildChatFormatGuardianAgentRun records review state without storing full content', () => {
  const run = buildChatFormatGuardianAgentRun({
    now: 1000,
    sessionId: 'group:case',
    message: { id: 'm-format', role: 'assistant' },
    result: {
      status: 'needs_review',
      sourceMessageId: 'm-format',
      summary: '1 chat format event draft(s), 0 error(s), 1 warning(s)',
      eventDrafts: [{
        type: 'group_message',
        surface: 'chat',
        targetId: 'group:case',
        targetName: '调查组',
        speakerId: 'contact:snow',
        speakerName: '雪',
        content: '这是一段非常长的内容，用来确认 Agent Run 只保存预览摘要，不把完整正文复制到元数据里。'.repeat(3),
        warnings: ['time is missing'],
      }],
      errors: [],
      warnings: ['time is missing'],
    },
  });

  assert.equal(run.id, 'run:chat-format-guardian:m-format');
  assert.equal(run.kind, 'chat_format_guardian');
  assert.equal(run.status, 'waiting_permission');
  assert.equal(run.surface, 'chat');
  assert.equal(run.finishedAt, null);
  assert.equal(run.steps.length, 1);
  assert.equal(run.steps[0].type, 'chat_format.validate');
  assert.equal(run.steps[0].status, 'waiting_permission');
  assert.equal(run.metadata.events[0].contentPreview.endsWith('...'), true);
  assert.equal(JSON.stringify(run).includes('非常长的内容'.repeat(2)), false);
});

test('runChatFormatGuardianPreview keeps ready results silent by default', () => {
  const runs = [];
  const result = runChatFormatGuardianPreview({
    message: {
      id: 'm-ready',
      role: 'assistant',
      content: [
        '<我和菲伦的私聊>',
        '菲伦--今晚别一个人走。--22:10',
        '</我和菲伦的私聊>',
      ].join('\n'),
    },
    sessionId: 'contact:firen',
    chatFormatGuardian: {
      enabled: true,
      userName: '我',
      resolvePrivateTargetId: name => (name === '菲伦' ? 'contact:firen' : ''),
      resolveSpeakerId: name => (name === '菲伦' ? 'contact:firen' : ''),
    },
    now: 1000,
    onChatFormatGuardianRun({ agentRun }) {
      runs.push(agentRun);
    },
  });

  assert.equal(result.result.status, 'ready');
  assert.equal(result.part, null);
  assert.equal(result.patchedMessage, null);
  assert.equal(result.agentRun.status, 'succeeded');
  assert.equal(result.agentRun.finishedAt, 1000);
  assert.equal(runs.length, 1);
  assert.equal(runs[0].id, 'run:chat-format-guardian:m-ready');
});

test('runChatFormatGuardianPreview validates the full rawOriginal before cleaned content', () => {
  const message = {
    id: 'm-raw-original',
    role: 'assistant',
    content: '菲伦：今晚别一个人走。',
    raw: '菲伦：今晚别一个人走。',
    rawOriginal: [
      '<我和菲伦的私聊>',
      '菲伦--今晚别一个人走。',
      '</我和菲伦的私聊>',
    ].join('\n'),
  };

  assert.deepEqual(resolveChatFormatGuardianInputText(message), {
    text: message.rawOriginal,
    source: 'rawOriginal',
    hasRawOriginal: true,
  });

  const result = runChatFormatGuardianPreview({
    message,
    sessionId: 'contact:firen',
    chatFormatGuardian: {
      enabled: true,
      userName: '我',
      resolvePrivateTargetId: name => (name === '菲伦' ? 'contact:firen' : ''),
      resolveSpeakerId: name => (name === '菲伦' ? 'contact:firen' : ''),
    },
    now: 1000,
  });

  assert.equal(result.result.status, 'needs_review');
  assert.equal(result.result.sourceTextKind, 'rawOriginal');
  assert.equal(result.part.metadata.sourceTextKind, 'rawOriginal');
  assert.equal(result.part.metadata.repairCandidate.available, true);
  assert.equal(result.part.metadata.repairCandidate.replacementText.includes('菲伦--今晚别一个人走。--00:00'), true);
  assert.equal(result.agentRun.steps[0].input.sourceTextKind, 'rawOriginal');
  assert.equal(result.agentRun.metadata.repairCandidate.replacementText, undefined);
  assert.equal(result.result.warnings.includes('time is missing'), true);
});

test('buildChatBodyQualityMessagePart summarizes issues without storing replacement text', () => {
  const part = buildChatBodyQualityMessagePart({
    now: 1000,
    sessionId: 'contact:firen',
    message: { id: 'm-body', role: 'assistant' },
    result: {
      status: 'minor_issues',
      sourceMessageId: 'm-body',
      sourceTextKind: 'rawOriginal',
      hasRawOriginal: true,
      issueCount: 1,
      issues: [{
        id: 'consecutive_duplicate_lines',
        severity: 'warning',
        title: '连续重复句段',
        summary: '发现 1 行连续重复正文。',
        risk: 'low',
        patchable: true,
      }],
      patchCandidate: {
        available: true,
        id: 'body_quality_deterministic_cleanup',
        title: '清理重复正文',
        summary: '移除 1 行连续重复',
        risk: 'low',
        replacementText: 'should not be stored in sidecar metadata',
        preview: '她看了看门口。',
      },
    },
  });
  assert.equal(part.kind, 'chat_body_quality.review');
  assert.equal(part.status, 'waiting_permission');
  assert.equal(part.title, '正文可优化');
  assert.equal(part.metadata.sourceTextKind, 'rawOriginal');
  assert.equal(part.metadata.patchCandidate.summary, '移除 1 行连续重复');
  assert.equal(part.metadata.patchCandidate.replacementText, undefined);
  assert.deepEqual(part.metadata.decisionActions.map(action => action.id), ['apply_body_patch', 'review_original', 'open_agent_center']);
  assert.equal(part.metadata.decisionActions[0].patchCandidate.summary, '移除 1 行连续重复');
  assert.equal(part.metadata.decisionActions[0].patchCandidate.replacementText, undefined);
  assert.equal(JSON.stringify(part).includes('should not be stored in sidecar metadata'), false);
});

test('buildChatBodyQualityAgentRun records review state without full replacement text', () => {
  const run = buildChatBodyQualityAgentRun({
    now: 1000,
    sessionId: 'contact:firen',
    message: { id: 'm-body-run', role: 'assistant' },
    result: {
      status: 'minor_issues',
      sourceMessageId: 'm-body-run',
      sourceTextKind: 'rawOriginal',
      hasRawOriginal: true,
      issueCount: 1,
      issues: [{
        id: 'consecutive_duplicate_lines',
        severity: 'warning',
        title: '连续重复句段',
        summary: '发现 1 行连续重复正文。',
        risk: 'low',
        patchable: true,
      }],
      patchCandidate: {
        available: true,
        id: 'body_quality_deterministic_cleanup',
        title: '清理重复正文',
        summary: '移除 1 行连续重复',
        risk: 'low',
        replacementText: 'hidden replacement',
        preview: '她看了看门口。',
      },
    },
  });
  assert.equal(run.id, 'run:chat-body-quality:m-body-run');
  assert.equal(run.kind, 'chat_body_quality_guardian');
  assert.equal(run.status, 'waiting_permission');
  assert.equal(run.finishedAt, null);
  assert.equal(run.steps[0].type, 'chat_body_quality.review');
  assert.equal(run.metadata.patchCandidate.replacementText, undefined);
  assert.equal(JSON.stringify(run).includes('hidden replacement'), false);
  assert.deepEqual(run.metadata.decisionActions.map(action => action.id), ['apply_body_patch', 'review_original', 'open_agent_center']);
});

test('runChatBodyQualityPreview stays silent for ready text by default', () => {
  const runs = [];
  const result = runChatBodyQualityPreview({
    message: {
      id: 'm-body-ready',
      role: 'assistant',
      content: '菲伦把伞往你这边偏了偏。',
    },
    sessionId: 'contact:firen',
    chatBodyQualityGuardian: { enabled: true },
    now: 1000,
    onChatBodyQualityRun({ agentRun }) {
      runs.push(agentRun);
    },
  });
  assert.equal(result.result.status, 'ready');
  assert.equal(result.part, null);
  assert.equal(result.patchedMessage, null);
  assert.equal(result.agentRun, null);
  assert.equal(runs.length, 0);
});

test('dispatchAfterReceiveEffects attaches chat format preview only through callback', () => {
  const calls = [];
  const message = {
    id: 'm-needs-review',
    role: 'assistant',
    content: [
      '<群聊:调查组>',
      '<成员>我,菲伦,雪</成员>',
      '<聊天内容>',
      '雪--我看到了门口的鞋印。',
      '</聊天内容>',
      '</群聊:调查组>',
    ].join('\n'),
  };

  const handled = dispatchAfterReceiveEffects({
    message,
    sessionId: 'group:case',
    chatFormatGuardian: {
      enabled: true,
      userName: '我',
      resolveGroupTargetId: name => (name === '调查组' ? 'group:case' : ''),
      resolveSpeakerId: name => (name === '雪' ? 'contact:snow' : ''),
    },
    onChatFormatGuardianPreview({ patchedMessage, result, part, sessionId }) {
      calls.push(['preview', sessionId, result.status, part.status, patchedMessage.meta.agentMessageParts.length]);
      assert.equal(patchedMessage.id, message.id);
    },
    applyUpdateVariable(received) {
      calls.push(['update', received.id]);
    },
    logger: { warn() {} },
  });

  assert.equal(handled, true);
  assert.equal(message.meta, undefined);
  assert.deepEqual(calls, [
    ['preview', 'group:case', 'needs_review', 'waiting_permission', 1],
    ['update', 'm-needs-review'],
  ]);
});

test('dispatchAfterReceiveEffects merges chat format and body quality sidecars', () => {
  const calls = [];
  const runs = [];
  const message = {
    id: 'm-combined-review',
    role: 'assistant',
    rawOriginal: [
      '<群聊:调查组>',
      '<成员>我,菲伦,雪</成员>',
      '<聊天内容>',
      '雪--我看到了门口的鞋印。',
      '雪--我看到了门口的鞋印。',
      '</聊天内容>',
      '</群聊:调查组>',
    ].join('\n'),
    content: '清理后正文',
  };

  dispatchAfterReceiveEffects({
    message,
    sessionId: 'group:case',
    chatFormatGuardian: {
      enabled: true,
      userName: '我',
      resolveGroupTargetId: name => (name === '调查组' ? 'group:case' : ''),
      resolveSpeakerId: name => (name === '雪' ? 'contact:snow' : ''),
    },
    chatBodyQualityGuardian: { enabled: true },
    onChatFormatGuardianPreview({ patchedMessage }) {
      calls.push(['format', patchedMessage.meta.agentMessageParts.map(part => part.kind)]);
    },
    onChatBodyQualityPreview({ patchedMessage }) {
      calls.push(['body', patchedMessage.meta.agentMessageParts.map(part => part.kind)]);
    },
    onChatFormatGuardianRun({ agentRun }) {
      runs.push(agentRun.kind);
    },
    onChatBodyQualityRun({ agentRun }) {
      runs.push(agentRun.kind);
    },
    logger: { warn() {} },
  });

  assert.deepEqual(calls, [
    ['format', ['chat_format.validate']],
    ['body', ['chat_format.validate', 'chat_body_quality.review']],
  ]);
  assert.deepEqual(runs, ['chat_format_guardian', 'chat_body_quality_guardian']);
  assert.equal(message.meta, undefined);
});

test('dispatchAfterReceiveEffects respects skipScripts and logs async/sync failures', async () => {
  const warnings = [];
  dispatchAfterReceiveEffects({
    message: { id: 'm2', role: 'assistant' },
    sessionId: 's3',
    skipScripts: true,
    defaultSkipScripts: false,
    scriptRuntime: {
      dispatchEvent() {
        throw new Error('script should be skipped');
      },
    },
    pluginRuntime: {
      dispatchEvent() {
        return Promise.reject(new Error('plugin failed'));
      },
    },
    applyUpdateVariable() {
      throw new Error('update failed');
    },
    handleVariableRules() {
      return Promise.reject(new Error('rules failed'));
    },
    logger: {
      warn(message) {
        warnings.push(message);
      },
    },
  });
  await flushMicrotasks();
  assert.deepEqual(warnings, [
    'UpdateVariable parse failed',
    'plugin message.after_receive failed',
    'variable rules after_receive failed',
  ]);
});

let failed = 0;
for (const t of tests) {
  try {
    await t.fn();
    console.log(`ok - ${t.name}`);
  } catch (err) {
    failed += 1;
    console.error(`not ok - ${t.name}`);
    console.error(err);
  }
}

if (failed > 0) process.exit(1);
