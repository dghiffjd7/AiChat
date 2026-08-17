// Manual Claude adaptive-thinking forced-FC smoke. Run through app-eval in an open Windows dev WebView.
// It performs one paid, non-streaming, no-write call and never returns model text or tool arguments.
(async () => {
  const bridge = window.appBridge;
  if (!bridge?.config) throw new Error('Claude adaptive FC smoke requires an initialized app bridge');
  const [{ LLMClient }, { runPrivateChatProviderFcAttempt }] = await Promise.all([
    import('/scripts/api/client.js'),
    import('/scripts/ui/chat/private-chat-provider-fc.js'),
  ]);
  const profiles = bridge.config.getProfiles?.() || [];
  const profile = profiles.find(item => (
    String(item?.provider || '').trim().toLowerCase() === 'anthropic'
    && String(item?.model || '').trim().toLowerCase() === 'claude-opus-4-8'
  ));
  if (!profile?.id) throw new Error('Smoke requires an official claude-opus-4-8 profile');
  const runtime = await bridge.config.getRuntimeConfigByProfileId(profile.id);
  if (!runtime) throw new Error('Smoke could not resolve the Claude runtime profile');
  let endpointHost = '';
  try {
    endpointHost = new URL(String(runtime.baseUrl || '')).hostname.toLowerCase();
  } catch {}
  if (endpointHost && endpointHost !== 'api.anthropic.com') {
    throw new Error(`Smoke refuses a non-official Anthropic endpoint: ${endpointHost}`);
  }

  const providerClient = new LLMClient({ ...runtime, webSearchEnabled: false });
  const observed = {};
  const usage = [];
  const startedAt = performance.now();
  const result = await runPrivateChatProviderFcAttempt({
    client: {
      chat: (messages, options = {}) => {
        observed.toolChoice = {
          type: String(options.tool_choice?.type || ''),
          name: String(options.tool_choice?.name || ''),
          disableParallelToolUse: options.tool_choice?.disable_parallel_tool_use === true,
        };
        observed.thinking = {
          type: String(options.thinking?.type || ''),
          display: String(options.thinking?.display || ''),
        };
        observed.effort = String(options.output_config?.effort || '');
        return providerClient.chat(messages, {
          ...options,
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
    messages: [
      { role: 'system', content: '通过唯一函数回复一条简短私聊文字，不要输出包装文字。' },
      { role: 'user', content: '请只回复一句：测试完成。' },
    ],
    context: {
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
    },
    target: {
      sessionId: 'codex-claude-adaptive-fc-smoke',
      targetName: '米娅',
      speakerId: 'codex-smoke-contact-mia',
      speakerName: '米娅',
      userName: '我',
    },
    thinkingEnabled: true,
    requestOptions: {
      thinking: { type: 'adaptive', display: 'summarized' },
      output_config: { effort: 'high' },
    },
    allowedItemTypes: ['text'],
    maxTokens: 180,
  });
  const normalizedUsage = usage.at(-1) || {};
  return {
    fixtureVersion: 'anthropic-adaptive-forced-fc-smoke-v1',
    provider: String(runtime.provider || ''),
    model: String(runtime.model || ''),
    endpointHost: endpointHost || 'api.anthropic.com',
    persistentWrites: 0,
    rawContentRetained: false,
    argumentContentRetained: false,
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
  };
})()
