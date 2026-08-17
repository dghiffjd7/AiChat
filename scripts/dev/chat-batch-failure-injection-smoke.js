// Stage G.5 deterministic failure/rollback smoke for the ordered phone batch route.
// Uses local fake providers only, performs no network requests, and restores all bridge state.
(async () => {
  const bridge = window.appBridge;
  if (!bridge?.debugUiRegistry?.actions) {
    throw new Error('Stage G.5 failure smoke requires an initialized app bridge');
  }
  const [{
    runPhoneBatchGenerationWithFallback,
  }] = await Promise.all([
    import('/scripts/ui/chat/phone-batch-provider-fc.js'),
  ]);

  const config = {
    provider: 'deepseek',
    model: 'deepseek-v4-flash',
    baseUrl: 'https://api.deepseek.com/v1',
    webSearchEnabled: false,
  };
  const target = {
    mode: 'group_chat',
    sessionId: 'group:g5-failure',
    targetName: 'G5失败注入群',
    userName: '我',
    members: [{ id: 'contact:g5-a', name: '测试甲' }],
    momentAuthors: [{ id: 'contact:g5-a', name: '测试甲' }],
    tableTargets: [{ id: 'event', name: '事件', rowIds: ['event-row-1'] }],
  };
  const context = {
    uiMode: 'chat',
    surface: 'group_chat',
    responseTarget: 'assistant',
    usesBuiltinFormat: true,
    usesDefaultPreset: true,
    compatibilityModeEnabled: false,
    protocolParserEnabled: true,
    hasUnsupportedSideEffects: false,
    assistantContinuation: false,
    webSearchEnabled: false,
    hasProviderTools: false,
    hasAssistantPrefill: false,
    formatProfileEnabled: false,
  };
  const messages = [{ role: 'user', content: '失败注入测试' }];
  const capabilities = { tableEdit: true };
  const validArgs = {
    items: [{
      kind: 'chat',
      messages: [{ speakerId: 'contact:g5-a', content: '测试通过' }],
    }],
  };
  const emitCalls = (options, calls) => options.onProviderToolCallDelta?.({
    choices: [{
      message: {
        tool_calls: calls.map((args, index) => ({
          id: `call-g5-${index}`,
          type: 'function',
          function: { name: 'emit_phone_batch', arguments: JSON.stringify(args) },
        })),
      },
      finish_reason: 'tool_calls',
    }],
  }, { provider: 'deepseek', model: 'deepseek-v4-flash' });
  const runFallbackCase = async ({ id, chat, persistentCommitStarted = false }) => {
    let fallbackCalls = 0;
    const result = await runPhoneBatchGenerationWithFallback({
      client: { chat },
      config,
      messages,
      context,
      target,
      capabilities,
      persistentCommitStarted,
      runTextFallback: async ({ reason }) => {
        fallbackCalls += 1;
        return { ok: true, raw: `legacy:${reason}` };
      },
    });
    return {
      id,
      reason: String(result?.fallbackReason || result?.reason || ''),
      effectiveMode: String(result?.effectiveMode || ''),
      fallbackCalls,
    };
  };

  const cases = [];
  const noTool = await runFallbackCase({
    id: 'no_tool_call',
    chat: async () => '没有工具调用',
  });
  noTool.pass = noTool.reason === 'no_tool_call'
    && noTool.effectiveMode === 'legacy_text'
    && noTool.fallbackCalls === 1;
  cases.push(noTool);

  const unknownTable = await runFallbackCase({
    id: 'unknown_table',
    chat: async (_messages, options) => {
      emitCalls(options, [{
        items: [
          ...validArgs.items,
          { kind: 'table_edit', actions: [{ action: 'insert', tableId: 'invented', data: { note: '越权' } }] },
        ],
      }]);
      return '';
    },
  });
  unknownTable.pass = unknownTable.reason === 'invalid_phone_reply_ir'
    && unknownTable.effectiveMode === 'legacy_text'
    && unknownTable.fallbackCalls === 1;
  cases.push(unknownTable);

  const extraText = await runFallbackCase({
    id: 'extra_response_text',
    chat: async (_messages, options) => {
      emitCalls(options, [validArgs]);
      return '不应出现的额外正文';
    },
  });
  extraText.pass = extraText.reason === 'unexpected_response_text'
    && extraText.effectiveMode === 'legacy_text'
    && extraText.fallbackCalls === 1;
  cases.push(extraText);

  const multipleCalls = await runFallbackCase({
    id: 'multiple_tool_calls',
    chat: async (_messages, options) => {
      emitCalls(options, [validArgs, validArgs]);
      return '';
    },
  });
  multipleCalls.pass = multipleCalls.reason === 'multiple_tool_calls'
    && multipleCalls.effectiveMode === 'legacy_text'
    && multipleCalls.fallbackCalls === 1;
  cases.push(multipleCalls);

  const afterCommit = await runFallbackCase({
    id: 'fallback_after_commit_forbidden',
    chat: async () => '',
    persistentCommitStarted: true,
  });
  afterCommit.pass = afterCommit.reason === 'no_tool_call'
    && afterCommit.effectiveMode === ''
    && afterCommit.fallbackCalls === 0;
  cases.push(afterCommit);

  let abortFallbackCalls = 0;
  const controller = new AbortController();
  let abortErrorName = '';
  try {
    await runPhoneBatchGenerationWithFallback({
      client: {
        async chat() {
          controller.abort();
          const error = new Error('cancelled');
          error.name = 'AbortError';
          throw error;
        },
      },
      config,
      messages,
      context,
      target,
      capabilities,
      signal: controller.signal,
      runTextFallback: async () => { abortFallbackCalls += 1; },
    });
  } catch (error) {
    abortErrorName = String(error?.name || '');
  }
  cases.push({
    id: 'abort_without_fallback',
    reason: abortErrorName,
    effectiveMode: '',
    fallbackCalls: abortFallbackCalls,
    pass: abortErrorName === 'AbortError' && abortFallbackCalls === 0,
  });

  const actions = bridge.debugUiRegistry.actions;
  const previousFlag = actions.getPrivateChatProviderFcExperimentStatus().enabled === true;
  const previousResolveRuntime = bridge.resolveRequestRuntimeConfig;
  const previousBuildMemoryPromptPlan = bridge.buildMemoryPromptPlan;
  const previousSaveToHistory = bridge.saveToHistory;
  const previousLastRequest = bridge.lastRequest;
  const previousLastMemoryPlan = bridge.lastMemoryPlan;
  const previousLastPhoneFormatTransportPlan = bridge.lastPhoneFormatTransportPlan;
  const previousUsage = bridge.lastGenerationUsage;
  const previousSources = bridge.lastGenerationSources;
  let bridgeRequestCount = 0;
  let bridgeToolRequestCount = 0;
  try {
    actions.setPrivateChatProviderFcExperimentEnabled(true);
    bridge.buildMemoryPromptPlan = async function buildMemoryPromptPlanWithoutTargets(nextContext) {
      const plan = await previousBuildMemoryPromptPlan.call(this, nextContext);
      return { ...plan, tableTargets: [] };
    };
    bridge.resolveRequestRuntimeConfig = async () => ({
      config: { ...config, stream: false },
      client: {
        async chat(_requestMessages, options = {}) {
          bridgeRequestCount += 1;
          if (Array.isArray(options.tools) && options.tools.length) bridgeToolRequestCount += 1;
          return [
            'MiPhone_start',
            'msg_start',
            '<群聊:G5失败注入群>',
            '<成员>测试甲</成员>',
            '<聊天内容>',
            '测试甲--安全回退--09:20',
            '</聊天内容>',
            '</群聊:G5失败注入群>',
            'msg_end',
            'MiPhone_end',
            '<tableEdit></tableEdit>',
          ].join('\n');
        },
      },
    });
    bridge.saveToHistory = async () => true;
    await bridge.generate('测试缺失表目标时回退', {
      user: { name: '我' },
      character: { name: 'G5失败注入群' },
      session: { id: 'group:g5-failure', name: 'G5失败注入群', isGroup: true },
      group: {
        id: 'group:g5-failure',
        name: 'G5失败注入群',
        members: ['contact:g5-a'],
        memberNames: ['测试甲'],
      },
      history: [],
      meta: {
        uiMode: 'chat',
        rawUserMessage: '测试缺失表目标时回退',
        appendUserToHistory: true,
        memoryStorageMode: 'table',
        memoryAutoExtract: true,
      },
    });
    const transport = bridge.lastRequest?.phoneReplyTransport || {};
    cases.push({
      id: 'bridge_missing_table_targets',
      reason: String(transport.eligibilityReason || ''),
      effectiveMode: String(transport.effectiveMode || ''),
      fallbackCalls: bridgeRequestCount,
      pass: transport.eligibilityReason === 'unsupported_side_effects'
        && transport.effectiveMode === 'legacy_text'
        && bridgeRequestCount === 1
        && bridgeToolRequestCount === 0,
    });
  } finally {
    actions.setPrivateChatProviderFcExperimentEnabled(previousFlag);
    bridge.resolveRequestRuntimeConfig = previousResolveRuntime;
    bridge.buildMemoryPromptPlan = previousBuildMemoryPromptPlan;
    bridge.saveToHistory = previousSaveToHistory;
    bridge.lastRequest = previousLastRequest;
    bridge.lastMemoryPlan = previousLastMemoryPlan;
    bridge.lastPhoneFormatTransportPlan = previousLastPhoneFormatTransportPlan;
    bridge.lastGenerationUsage = previousUsage;
    bridge.lastGenerationSources = previousSources;
  }

  return {
    fixtureVersion: 'stage-g5-phone-batch-failure-v1',
    networkRequests: 0,
    persistentWrites: 0,
    total: cases.length,
    passed: cases.filter(item => item.pass).length,
    cases,
    stateRestored: actions.getPrivateChatProviderFcExperimentStatus().enabled === previousFlag,
  };
})()
