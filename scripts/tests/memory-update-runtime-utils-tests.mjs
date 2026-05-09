import assert from 'node:assert/strict';

import {
  buildMemoryUpdateHistoryTextForSession,
  buildMemoryUpdateHistoryTextFromSettings,
  buildMemoryUpdatePlanForSession,
  buildMemoryUpdateTraceEvent,
  buildMemoryPromptPlan,
  confirmMemoryEditsWithUi,
  createMemoryEditUiRuntime,
  buildMemoryUpdateLastEntry,
  buildMemoryUpdatePlanInput,
  buildMemoryUpdateRequest,
  buildMemoryRollbackFinishTraceEvent,
  buildMemoryRollbackStartTraceEvent,
  buildMemoryUpdateTaskFinishTraceEvent,
  buildMemoryUpdateTaskSkippedTraceEvent,
  buildMemoryUpdateTaskStartTraceEvent,
  getLastMemoryPlan,
  getLastMemoryUpdate,
  handleMemoryEditsFromRawWithUi,
  resolveMemoryUpdatePlanForSession,
  resolveMemoryUpdateHistoryLimit,
  resolveMemoryUpdateTrigger,
  setLastMemoryPlan,
  setLastMemoryUpdate,
} from '../../src/scripts/ui/chat/memory-update-runtime-utils.js';

{
  assert.deepEqual(buildMemoryUpdateTraceEvent({
    phase: ' edit.apply ',
    sessionId: ' s1 ',
    status: ' started ',
    summary: ' started ',
    details: {
      actionCount: 0,
      force: false,
      dropped: undefined,
    },
  }), {
    category: 'memory',
    source: 'memory-update-runtime-utils',
    phase: 'edit.apply',
    sessionId: 's1',
    status: 'started',
    summary: 'started',
    details: {
      actionCount: 0,
      force: false,
    },
  });
  assert.deepEqual(buildMemoryUpdateTraceEvent({
    phase: ' edit.skip ',
    sessionId: ' s2 ',
    status: ' skipped ',
    summary: ' skipped ',
  }), {
    category: 'memory',
    source: 'memory-update-runtime-utils',
    phase: 'edit.skip',
    sessionId: 's2',
    status: 'skipped',
    summary: 'skipped',
  });
  console.log('ok - buildMemoryUpdateTraceEvent normalizes memory trace metadata while preserving optional details');
}

{
  assert.deepEqual(buildMemoryUpdateTaskStartTraceEvent({
    sessionId: ' s1 ',
    isGroup: 1,
    checkpointMessageId: ' m1 ',
  }), {
    phase: 'update.start',
    sessionId: 's1',
    status: 'started',
    summary: 'memory update task started',
    details: {
      isGroup: true,
      checkpointMessageId: 'm1',
    },
  });
  assert.deepEqual(buildMemoryUpdateTaskSkippedTraceEvent({
    sessionId: ' s1 ',
    reason: ' cadence ',
    nextCounter: 1,
    everyN: 3,
  }), {
    phase: 'update.skip',
    sessionId: 's1',
    status: 'skipped',
    summary: 'memory update skipped',
    details: {
      reason: 'cadence',
      nextCounter: 1,
      everyN: 3,
    },
  });
  assert.deepEqual(buildMemoryUpdateTaskFinishTraceEvent({
    sessionId: ' s1 ',
    status: ' error ',
    reason: ' exception ',
    checkpointMessageId: ' m1 ',
    errorMessage: ' boom ',
  }), {
    phase: 'update.finish',
    sessionId: 's1',
    status: 'error',
    summary: 'memory update task failed',
    details: {
      reason: 'exception',
      checkpointMessageId: 'm1',
      errorMessage: 'boom',
    },
  });
  console.log('ok - memory update task trace patch builders preserve task lifecycle contracts');
}

{
  assert.deepEqual(buildMemoryRollbackStartTraceEvent({
    sessionId: ' s1 ',
    mode: ' actions ',
    actionCount: '2',
  }), {
    phase: 'rollback.start',
    sessionId: 's1',
    status: 'started',
    summary: 'memory rollback started',
    details: {
      mode: 'actions',
      actionCount: 2,
      tableCount: 0,
    },
  });
  assert.deepEqual(buildMemoryRollbackFinishTraceEvent({
    sessionId: ' s1 ',
    status: ' skipped ',
    mode: ' snapshot ',
    changed: 0,
    reason: ' no-changes ',
  }), {
    phase: 'rollback.finish',
    sessionId: 's1',
    status: 'skipped',
    summary: 'memory rollback skipped',
    details: {
      mode: 'snapshot',
      changed: 0,
      reason: 'no-changes',
      errorMessage: undefined,
    },
  });
  console.log('ok - memory rollback trace patch builders preserve rollback lifecycle contracts');
}

{
  assert.equal(resolveMemoryUpdateHistoryLimit({ memoryUpdateContextRounds: '8' }), 8);
  assert.equal(resolveMemoryUpdateHistoryLimit({ memoryUpdateContextRounds: '-2' }), 0);
  assert.equal(resolveMemoryUpdateHistoryLimit({ memoryUpdateContextRounds: 'oops' }), 6);
  console.log('ok - resolveMemoryUpdateHistoryLimit normalizes configured rounds');
}

{
  const baseContext = {
    foo: 'bar',
    session: { id: 'old', isGroup: false },
    meta: { keep: true, memoryAutoExtract: false },
    history: [{ role: 'assistant', content: 'old' }],
  };
  const next = buildMemoryUpdatePlanInput(baseContext, { sessionId: 's1', isGroup: true });
  assert.deepEqual(next, {
    foo: 'bar',
    session: { id: 's1', isGroup: true },
    meta: {
      keep: true,
      memoryAutoExtract: true,
      memoryStorageMode: 'table',
    },
    history: [],
  });
  assert.deepEqual(baseContext.history, [{ role: 'assistant', content: 'old' }]);
  console.log('ok - buildMemoryUpdatePlanInput resets session/meta/history without mutating source');
}

{
  const history = buildMemoryUpdateHistoryTextFromSettings({
    messages: [
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: '<tableEdit>x</tableEdit>reply' },
    ],
    settings: { memoryUpdateContextRounds: '1' },
    stripAssistantText: text => String(text || '').replace('<tableEdit>x</tableEdit>', ''),
  });
  assert.equal(history, '用户: hello\n助手: reply');
  console.log('ok - buildMemoryUpdateHistoryTextFromSettings applies configured limit and strip hook');
}

{
  assert.deepEqual(resolveMemoryUpdatePlanForSession({ rawPlan: null, sessionId: 's1' }), {
    planTargetId: '',
    currentSessionId: 's1',
    isStaleTarget: false,
    plan: null,
  });
  const rawPlan = { targetId: 's2', tableOrder: ['a'] };
  assert.deepEqual(resolveMemoryUpdatePlanForSession({ rawPlan, sessionId: 's1' }), {
    planTargetId: 's2',
    currentSessionId: 's1',
    isStaleTarget: true,
    plan: null,
  });
  assert.deepEqual(resolveMemoryUpdatePlanForSession({ rawPlan: { targetId: 's1', foo: true }, sessionId: 's1' }), {
    planTargetId: 's1',
    currentSessionId: 's1',
    isStaleTarget: false,
    plan: { targetId: 's1', foo: true },
  });
  console.log('ok - resolveMemoryUpdatePlanForSession keeps matching plans and flags stale targets');
}

{
  const bridge = {
    updateBySession: {},
    plan: null,
    getLastMemoryUpdate: sessionId => bridge.updateBySession[sessionId] || null,
    setLastMemoryUpdate: (sessionId, entry) => {
      bridge.updateBySession[sessionId] = entry;
    },
    getLastMemoryPlan: () => bridge.plan,
    setLastMemoryPlan: plan => {
      bridge.plan = plan;
    },
    buildMemoryPromptPlan: async context => ({ targetId: context.sessionId }),
  };
  assert.equal(setLastMemoryUpdate(bridge, 's1', { ok: true }), true);
  assert.deepEqual(getLastMemoryUpdate(bridge, 's1'), { ok: true });
  assert.equal(setLastMemoryPlan(bridge, { enabled: true }), true);
  assert.deepEqual(getLastMemoryPlan(bridge), { enabled: true });
  assert.deepEqual(await buildMemoryPromptPlan(bridge, { sessionId: 's2' }), { targetId: 's2' });
  assert.equal(setLastMemoryUpdate(null, 's1', {}), false);
  console.log('ok - memory update bridge helpers prefer explicit contract methods');
}

{
  const request = buildMemoryUpdateRequest({
    promptText: '  system prompt  ',
    historyText: 'A: hi\nB: hello',
  });
  assert.equal(request.systemText, 'system prompt');
  assert.match(request.userText, /<chat_history>\nA: hi\nB: hello\n<\/chat_history>/);
  assert.match(request.requestPrompt, /^system:\nsystem prompt\n\nuser:\n/);
  assert.deepEqual(request.messages, [
    { role: 'system', content: 'system prompt' },
    { role: 'user', content: request.userText },
  ]);
  console.log('ok - buildMemoryUpdateRequest composes system user and preview payloads');
}

{
  const entry = buildMemoryUpdateLastEntry({
    at: 123,
    raw: '  raw text  ',
    parsed: {
      blocks: ['<tableEdit>a</tableEdit>', '<tableEdit>b</tableEdit>'],
      actions: [{ action: 'insert' }],
    },
    force: true,
    requestPrompt: '',
    lastRequestMessages: [{ role: 'user', content: 'hello' }],
    lastEntryRequestPrompt: 'fallback prompt',
    buildRequestPrompt: messages => `built:${messages[0].content}`,
  });
  assert.deepEqual(entry, {
    at: 123,
    mode: 'separate',
    raw: '  raw text  ',
    tableEditRaw: '<tableEdit>a</tableEdit>\n\n<tableEdit>b</tableEdit>',
    actions: [{ action: 'insert' }],
    requestPrompt: 'built:hello',
  });
  console.log('ok - buildMemoryUpdateLastEntry composes persisted parse metadata and request prompt');
}

{
  assert.deepEqual(resolveMemoryUpdateTrigger({ memoryFillEveryN: '3' }, 0), {
    shouldRun: false,
    nextCounter: 1,
    everyN: 3,
  });
  assert.deepEqual(resolveMemoryUpdateTrigger({ memoryFillEveryN: '3' }, 2), {
    shouldRun: true,
    nextCounter: 0,
    everyN: 3,
  });
  assert.deepEqual(resolveMemoryUpdateTrigger({ memoryFillEveryN: '0' }, -5), {
    shouldRun: true,
    nextCounter: 0,
    everyN: 1,
  });
  console.log('ok - resolveMemoryUpdateTrigger normalizes cadence and reset behavior');
}

{
  const confirmed = await confirmMemoryEditsWithUi({
    actions: [{ action: 'insert' }],
    settings: { memoryAutoConfirm: false, memoryAutoStepByStep: false },
  });
  assert.deepEqual(confirmed, [{ action: 'insert' }]);
  console.log('ok - confirmMemoryEditsWithUi returns actions directly when confirmation is disabled');
}

{
  const prompts = [];
  const infos = [];
  const confirmed = await confirmMemoryEditsWithUi({
    actions: [{ action: 'insert', tableId: 'profile', data: { title: 'A' } }],
    settings: { memoryAutoConfirm: true, memoryAutoStepByStep: false },
    loadMemoryTemplateContext: async () => ({
      tableById: new Map([['profile', { id: 'profile', name: '角色表' }]]),
    }),
    rawPlan: { tableOrder: ['profile'] },
    appConfirm: async (payload) => {
      prompts.push(payload);
      return false;
    },
    toastr: { info: message => infos.push(message) },
  });
  assert.deepEqual(confirmed, []);
  assert.equal(prompts.length, 1);
  assert.deepEqual(infos, ['已取消写表执行']);
  console.log('ok - confirmMemoryEditsWithUi cancels batch confirmation and reports toast');
}

{
  const prompts = [];
  const infos = [];
  const confirmed = await confirmMemoryEditsWithUi({
    actions: [
      { action: 'insert', tableId: 'profile', data: { title: 'A' } },
      { action: 'update', tableId: 'profile', rowId: 'row-1', data: { title: 'B' } },
    ],
    settings: { memoryAutoConfirm: false, memoryAutoStepByStep: true },
    loadMemoryTemplateContext: async () => ({
      tableById: new Map([['profile', { id: 'profile', name: '角色表' }]]),
    }),
    rawPlan: { tableOrder: ['profile'] },
    appConfirm: async (payload) => {
      prompts.push(payload);
      return prompts.length === 1;
    },
    toastr: { info: message => infos.push(message) },
  });
  assert.deepEqual(confirmed, [
    { action: 'insert', tableId: 'profile', data: { title: 'A' } },
  ]);
  assert.equal(prompts.length, 2);
  assert.deepEqual(infos, ['已停止后续写表执行']);
  console.log('ok - confirmMemoryEditsWithUi supports step-by-step partial confirmation');
}

{
  const history = buildMemoryUpdateHistoryTextForSession({
    sessionId: 's1',
    chatStore: {
      getMessages: () => [
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: 'reply' },
      ],
    },
    settings: { memoryUpdateContextRounds: '2' },
    stripAssistantText: text => text,
  });
  assert.equal(history, '用户: hello\n助手: reply');
  console.log('ok - buildMemoryUpdateHistoryTextForSession reads session messages from chat store');
}

{
  const plan = await buildMemoryUpdatePlanForSession({
    sessionId: 's1',
    isGroup: true,
    baseContext: { meta: { keep: true } },
    buildPlan: async next => next,
  });
  assert.deepEqual(plan, {
    session: { id: 's1', isGroup: true },
    meta: {
      keep: true,
      memoryAutoExtract: true,
      memoryStorageMode: 'table',
    },
    history: [],
  });
  console.log('ok - buildMemoryUpdatePlanForSession composes plan input before delegating to builder');
}

{
  const result = await handleMemoryEditsFromRawWithUi({
    raw: 'raw text',
    isMemoryAutoExtractInline: () => false,
  });
  assert.deepEqual(result, { text: 'raw text', blocks: [], actions: [] });
  console.log('ok - handleMemoryEditsFromRawWithUi returns passthrough shape when inline extraction is disabled');
}

{
  const applied = [];
  const stored = [];
  const traces = [];
  const parsed = await handleMemoryEditsFromRawWithUi({
    raw: '<tableEdit>x</tableEdit>',
    sessionId: 's1',
    isGroup: true,
    timelineTurnNumber: 42,
    timelineMessageId: 'assistant-42',
    force: true,
    requestPrompt: 'prompt',
    isMemoryAutoExtractInline: () => false,
    extractTableEditBlocks: () => ({
      text: 'clean',
      blocks: ['<tableEdit>x</tableEdit>'],
      actions: [{ action: 'insert' }],
    }),
    appBridge: {
      lastRequest: { messages: [{ role: 'user', content: 'hello' }] },
      getLastMemoryUpdate: () => ({ requestPrompt: 'prev prompt' }),
      setLastMemoryUpdate: (sessionId, entry) => stored.push([sessionId, entry]),
    },
    buildRequestPrompt: messages => `built:${messages[0].content}`,
    confirmMemoryEdits: async actions => actions,
    applyMemoryEdits: async payload => applied.push(payload),
    logger: { warn: () => {} },
    recordTraceEvent: event => traces.push(event),
  });
  assert.deepEqual(parsed, {
    text: 'clean',
    blocks: ['<tableEdit>x</tableEdit>'],
    actions: [{ action: 'insert' }],
  });
  assert.equal(stored.length, 1);
  assert.equal(stored[0][0], 's1');
  assert.deepEqual(applied, [{
    actions: [{ action: 'insert' }],
    sessionId: 's1',
    isGroup: true,
    timelineTurnNumber: 42,
    timelineMessageId: 'assistant-42',
  }]);
  assert.deepEqual(traces, [
    {
      category: 'memory',
      source: 'memory-update-runtime-utils',
      phase: 'edit.apply',
      sessionId: 's1',
      status: 'started',
      summary: 'memory edit apply started',
      details: {
        actionCount: 1,
        force: true,
        isGroup: true,
      },
    },
    {
      category: 'memory',
      source: 'memory-update-runtime-utils',
      phase: 'edit.apply',
      sessionId: 's1',
      status: 'success',
      summary: 'memory edit apply completed',
      details: {
        actionCount: 1,
      },
    },
  ]);
  console.log('ok - handleMemoryEditsFromRawWithUi records last entry and forwards confirmed edits');
}

{
  const traces = [];
  const result = await handleMemoryEditsFromRawWithUi({
    raw: 'raw text',
    sessionId: 's-skip',
    isMemoryAutoExtractInline: () => false,
    recordTraceEvent: event => traces.push(event),
  });
  assert.deepEqual(result, { text: 'raw text', blocks: [], actions: [] });
  assert.deepEqual(traces, [{
    category: 'memory',
    source: 'memory-update-runtime-utils',
    phase: 'edit.skip',
    sessionId: 's-skip',
    status: 'skipped',
    summary: 'memory inline extraction disabled',
  }]);
  console.log('ok - handleMemoryEditsFromRawWithUi emits optional skip trace without changing passthrough result');
}

{
  const applied = [];
  const buildPlanCalls = [];
  const runtime = createMemoryEditUiRuntime({
    appSettings: {
      get: () => ({
        memoryAutoConfirm: true,
        memoryAutoStepByStep: false,
        memoryUpdateContextRounds: '3',
      }),
    },
    chatStore: {
      getMessages: () => [
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: '<tableEdit>x</tableEdit>reply' },
      ],
    },
    loadMemoryTemplateContext: async () => ({
      tableById: new Map([['profile', { id: 'profile', name: '角色表' }]]),
    }),
    rawPlan: () => ({ tableOrder: ['profile'] }),
    appConfirm: async () => true,
    toastr: { info: () => {} },
    isMemoryAutoExtractInline: () => true,
    extractTableEditBlocks: () => ({
      text: 'clean',
      blocks: ['<tableEdit>x</tableEdit>'],
      actions: [{ action: 'insert', tableId: 'profile', data: { title: 'A' } }],
    }),
    appBridge: {
      lastRequest: { messages: [{ role: 'user', content: 'hello' }] },
      getLastMemoryUpdate: () => null,
      setLastMemoryUpdate: () => {},
    },
    buildRequestPrompt: messages => `built:${messages[0].content}`,
    applyMemoryEdits: async payload => applied.push(payload),
    logger: { warn: () => {} },
    stripAssistantText: text => String(text || '').replace('<tableEdit>x</tableEdit>', ''),
    buildPlan: async next => {
      buildPlanCalls.push(next);
      return { ok: true, next };
    },
  });
  const confirmed = await runtime.confirmMemoryEditsIfNeeded([
    { action: 'insert', tableId: 'profile', data: { title: 'A' } },
  ]);
  assert.equal(confirmed.length, 1);
  const parsed = await runtime.handleMemoryEditsFromRaw('<tableEdit>x</tableEdit>', {
    sessionId: 's1',
    isGroup: false,
    requestPrompt: 'prompt',
  });
  assert.deepEqual(parsed, {
    text: 'clean',
    blocks: ['<tableEdit>x</tableEdit>'],
    actions: [{ action: 'insert', tableId: 'profile', data: { title: 'A' } }],
  });
  assert.deepEqual(applied, [{
    actions: [{ action: 'insert', tableId: 'profile', data: { title: 'A' } }],
    sessionId: 's1',
    isGroup: false,
  }]);
  assert.equal(runtime.buildMemoryUpdateHistoryText('s1'), '用户: hello\n助手: reply');
  const plan = await runtime.buildMemoryUpdatePlan('s1', true, { meta: { keep: true } });
  assert.equal(buildPlanCalls.length, 1);
  assert.deepEqual(buildPlanCalls[0], {
    session: { id: 's1', isGroup: true },
    meta: {
      keep: true,
      memoryAutoExtract: true,
      memoryStorageMode: 'table',
    },
    history: [],
  });
  assert.deepEqual(plan, { ok: true, next: buildPlanCalls[0] });
  console.log('ok - createMemoryEditUiRuntime wires confirm raw history and plan helpers together');
}
