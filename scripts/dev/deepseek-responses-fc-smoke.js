// Manual DeepSeek Responses FC smoke. Run through app-eval against an open Windows dev WebView.
// It performs two paid, non-streaming, no-write calls (thinking disabled/enabled).
// Model text, tool arguments, IR content, and secrets are never returned.
(async () => {
  const bridge = window.appBridge;
  if (!bridge?.backgroundChat || !bridge?.config) {
    throw new Error('DeepSeek Responses FC smoke requires an initialized app bridge');
  }

  const { runPrivateChatProviderFcAttempt } = await import('/scripts/ui/chat/private-chat-provider-fc.js');
  const profiles = bridge.config.getProfiles?.() || [];
  const activeId = String(bridge.config.getActiveProfileId?.() || '').trim();
  const matches = profile => (
    String(profile?.provider || '').trim().toLowerCase() === 'deepseek'
    && String(profile?.model || '').trim().toLowerCase() === 'deepseek-v4-flash'
  );
  const profile = profiles.find(item => String(item?.id || '').trim() === activeId && matches(item))
    || profiles.find(matches);
  if (!profile?.id) throw new Error('Smoke requires an official deepseek-v4-flash profile');

  const runtime = await bridge.config.getRuntimeConfigByProfileId(profile.id);
  if (!runtime) throw new Error('Smoke could not resolve the DeepSeek runtime profile');
  let endpointHost = '';
  try {
    endpointHost = new URL(String(runtime.baseUrl || '')).hostname.toLowerCase();
  } catch {}
  if (endpointHost && endpointHost !== 'api.deepseek.com') {
    throw new Error(`Smoke refuses a non-official DeepSeek endpoint: ${endpointHost}`);
  }

  const target = Object.freeze({
    sessionId: 'codex-deepseek-responses-fc-smoke',
    targetName: '米娅',
    speakerId: 'codex-smoke-contact-mia',
    speakerName: '米娅',
    userName: '我',
  });
  const context = Object.freeze({
    uiMode: 'chat',
    surface: 'private_chat',
    responseTarget: 'assistant',
    usesBuiltinFormat: true,
    usesDefaultPreset: true,
    compatibilityModeEnabled: false,
    protocolParserEnabled: true,
    assistantContinuation: false,
    webSearchEnabled: false,
    hasProviderTools: false,
    hasUnsupportedSideEffects: false,
    hasAssistantPrefill: false,
    formatProfileEnabled: false,
  });
  const messages = [
    {
      role: 'system',
      content: '你是米娅。通过唯一函数回复一条简短、自然的私聊文字，不要输出包装文字。',
    },
    { role: 'user', content: '请只回复一句：测试完成。' },
  ];
  const rows = [];
  const requestedThinkingModes = Array.isArray(window.__deepseekResponsesFcSmokeThinkingFilter)
    ? window.__deepseekResponsesFcSmokeThinkingFilter.filter(value => typeof value === 'boolean')
    : [];
  const thinkingModes = requestedThinkingModes.length ? [...new Set(requestedThinkingModes)] : [false, true];

  for (const thinkingEnabled of thinkingModes) {
    const usage = [];
    const observed = {};
    const startedAt = performance.now();
    const result = await runPrivateChatProviderFcAttempt({
      client: {
        chat: (requestMessages, options = {}) => {
          observed.openaiApi = String(options.openaiApi || '');
          observed.toolChoice = typeof options.tool_choice === 'string'
            ? options.tool_choice
            : {
                type: String(options.tool_choice?.type || ''),
                name: String(options.tool_choice?.name || options.tool_choice?.function?.name || ''),
              };
          observed.reasoningEffort = String(options.reasoning?.effort || '');
          observed.parallelToolCalls = options.parallel_tool_calls;
          observed.chatThinkingType = String(options.thinking?.type || '');
          return bridge.backgroundChat(requestMessages, {
            ...options,
            runtimeConfigOverride: { ...runtime, webSearchEnabled: false },
            presetContext: {
              sessionId: target.sessionId,
              uiMode: 'chat',
              taskType: 'deepseek_responses_fc_smoke',
            },
            onProviderUsage: item => usage.push(item),
          }).catch(error => {
            observed.requestError = {
              name: String(error?.name || ''),
              code: String(error?.code || ''),
              status: Number(error?.status || 0),
              message: String(error?.message || '').slice(0, 500),
            };
            throw error;
          });
        },
      },
      config: runtime,
      messages,
      context,
      target,
      thinkingEnabled,
      requestOptions: thinkingEnabled
        ? { thinking: { type: 'enabled' }, reasoning_effort: 'high' }
        : { thinking: { type: 'disabled' } },
      allowedItemTypes: ['text'],
      maxTokens: 180,
    });
    const normalizedUsage = usage.at(-1) || {};
    rows.push({
      thinkingEnabled,
      thinkingRequested: result.diagnostics?.thinkingRequested === true,
      thinkingApplied: result.diagnostics?.thinkingEnabled === true,
      thinkingOverrideReason: String(result.diagnostics?.thinkingOverrideReason || ''),
      ok: result.ok === true,
      reason: String(result.reason || ''),
      effectiveMode: String(result.effectiveMode || ''),
      providerEndpoint: String(result.diagnostics?.providerEndpoint || ''),
      toolCallCount: Number(result.diagnostics?.toolCallCount || 0),
      responseChars: Number(result.diagnostics?.responseChars || 0),
      errorCode: String(result.diagnostics?.errorCode || ''),
      observed,
      usage: {
        inputTokens: Number(normalizedUsage.inputTokens || normalizedUsage.promptTokens || 0),
        outputTokens: Number(normalizedUsage.outputTokens || normalizedUsage.completionTokens || 0),
        totalTokens: Number(normalizedUsage.totalTokens || 0),
      },
      latencyMs: Math.round(performance.now() - startedAt),
    });
  }

  return {
    fixtureVersion: 'deepseek-responses-fc-smoke-v1',
    provider: String(runtime.provider || ''),
    model: String(runtime.model || ''),
    endpointHost: endpointHost || 'api.deepseek.com',
    persistentWrites: 0,
    rawContentRetained: false,
    argumentContentRetained: false,
    total: rows.length,
    passed: rows.filter(row => row.ok).length,
    rows,
  };
})()
