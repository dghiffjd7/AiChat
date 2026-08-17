// Manual Stage H.3 smoke. Run through app-eval against an open Windows dev WebView.
// It performs two tiny paid calls per official provider, executes no business tool,
// writes no chat data, and returns only protocol/usage metadata (never model text or arguments).
(async () => {
  const bridge = window.appBridge;
  if (!bridge?.config) throw new Error('Stage H.3 smoke requires an initialized app bridge');
  const [
    { LLMClient },
    { buildProviderToolRequestSchema },
    { createProviderToolCallDeltaAccumulator },
    { buildProviderToolResultRequestPreview },
    { buildProviderToolRunnerHandoff },
    { buildProviderToolRunnerRequestDraft },
    { createProviderToolLlmClientNativeRunner },
    { runProviderToolRealRunnerAdapter },
  ] = await Promise.all([
    import('/scripts/api/client.js'),
    import('/scripts/agent/provider-tool-request-schema.js'),
    import('/scripts/agent/provider-tool-call-delta-adapter.js'),
    import('/scripts/agent/provider-tool-result-request-preview.js'),
    import('/scripts/agent/provider-tool-runner-handoff.js'),
    import('/scripts/agent/provider-tool-runner-request-draft.js'),
    import('/scripts/agent/provider-tool-llmclient-native-runner.js'),
    import('/scripts/agent/provider-tool-real-runner-adapter.js'),
  ]);

  const profiles = bridge.config.getProfiles?.() || [];
  const providerFilter = String(window.__stageH3ProviderFilter || '').trim().toLowerCase();
  const targets = [
    { id: 'openai', profileName: 'oai', expectedProvider: 'openai' },
    { id: 'anthropic', profileName: 'Claude', expectedProvider: 'anthropic' },
    { id: 'gemini', profileName: '默认', expectedProvider: 'makersuite' },
  ].filter(target => !providerFilter || target.id === providerFilter);
  const tool = {
    name: 'contact_profile.list',
    title: 'Protocol probe',
    description: 'Return a short synthetic contact list for protocol verification.',
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        limit: { type: 'integer', minimum: 1, maximum: 1 },
      },
      required: ['limit'],
    },
  };
  const registry = {
    actions: {
      getProviderToolSessionGate: () => ({
        enabled: true,
        allowedTools: [tool.name],
        source: 'stage-h3-smoke',
      }),
      getAgentTool: name => (name === tool.name ? tool : null),
      listAgentTools: () => [tool],
    },
  };
  const messages = [
    {
      role: 'system',
      content: 'Protocol test. On the first turn call contact_profile_list exactly once with limit 1. After its result, reply exactly OK and do not call a tool again.',
    },
    { role: 'user', content: 'Run the protocol test.' },
  ];
  const tokenCount = value => (
    value !== null && value !== undefined && Number.isFinite(Number(value))
      ? Number(value)
      : null
  );
  const safeUsage = usage => ({
    promptTokens: tokenCount(usage?.promptTokens),
    completionTokens: tokenCount(usage?.completionTokens),
    totalTokens: tokenCount(usage?.totalTokens),
  });
  const safeFailure = error => ({
    code: String(error?.code || error?.name || 'request_failed').slice(0, 80),
    status: Number.isFinite(Number(error?.status)) ? Number(error.status) : null,
    message: String(error?.message || error || 'request failed').slice(0, 180),
  });
  const rows = [];

  for (const target of targets) {
    const startedAt = performance.now();
    try {
      const profile = profiles.find(item => (
        String(item?.name || '').trim() === target.profileName
        && String(item?.provider || '').trim().toLowerCase() === target.expectedProvider
      ));
      if (!profile?.id) throw new Error(`missing ${target.profileName} profile`);
      const runtime = await bridge.config.getRuntimeConfigByProfileId(profile.id);
      if (!runtime) throw new Error(`cannot resolve ${target.profileName} runtime config`);
      const schema = buildProviderToolRequestSchema({
        debugUiRegistry: registry,
        provider: runtime.provider,
        baseUrl: runtime.baseUrl,
        model: runtime.model,
        sessionId: `stage-h3-${target.id}`,
      });
      if (!schema.enabled) throw new Error(`provider schema unavailable: ${schema.diagnostics?.reason || 'unknown'}`);

      const client = new LLMClient({ ...runtime, webSearchEnabled: false });
      const accumulator = createProviderToolCallDeltaAccumulator({
        provider: runtime.provider,
        model: runtime.model,
      });
      const completedToolCalls = [];
      let initialUsage = null;
      const initialOptions = {
        ...schema.requestOptions,
        maxTokens: 96,
        max_tokens: 96,
        onProviderUsage: usage => { initialUsage = safeUsage(usage); },
        onProviderToolCallDelta: (data, meta = {}) => {
          const next = accumulator.push(data, {
            provider: meta.provider || runtime.provider,
            model: meta.model || runtime.model,
          });
          completedToolCalls.push(...next.completed);
        },
      };
      if (target.id === 'openai') {
        initialOptions.temperature = 0;
        initialOptions.tool_choice = 'required';
        initialOptions.reasoning_effort = 'none';
      } else if (target.id === 'anthropic') {
        initialOptions.tool_choice = {
          type: 'tool',
          name: 'contact_profile_list',
          disable_parallel_tool_use: true,
        };
      } else {
        initialOptions.temperature = 0;
        initialOptions.toolConfig = {
          functionCallingConfig: {
            mode: 'ANY',
            allowedFunctionNames: ['contact_profile_list'],
          },
        };
      }
      const initialText = await client.chat(messages, initialOptions);
      if (completedToolCalls.length !== 1) {
        throw new Error(`expected one tool call, received ${completedToolCalls.length}`);
      }

      const toolCall = completedToolCalls[0];
      const requestPreview = buildProviderToolResultRequestPreview({
        provider: runtime.provider,
        model: runtime.model,
        sessionId: `stage-h3-${target.id}`,
        assistantToolCalls: [toolCall],
        toolResults: [{
          toolCallId: toolCall.toolCallId,
          status: 'succeeded',
          resultForModel: { summary: 'synthetic protocol result ready' },
        }],
        historyMessages: messages,
        providerRequestOptions: schema.requestOptions,
      });
      const loopState = {
        status: 'succeeded',
        phase: 'completed',
        phaseCount: 1,
        provider: runtime.provider,
        model: runtime.model,
        sessionId: `stage-h3-${target.id}`,
        shouldContinue: true,
      };
      const runnerHandoff = buildProviderToolRunnerHandoff({ requestPreview, loopState });
      const runnerRequestDraft = buildProviderToolRunnerRequestDraft({
        runnerHandoff,
        requestPreview,
        loopState,
      });
      const nativeRunner = createProviderToolLlmClientNativeRunner({ llmClient: client });
      const continuation = await runProviderToolRealRunnerAdapter({
        runnerRequestDraft,
        providerClient: nativeRunner,
        enabled: true,
        allowNetwork: true,
        requestOptions: { maxTokens: 96, max_tokens: 96 },
      });
      const finalText = String(continuation.finalText || '').trim();
      const assistantContent = toolCall.providerContinuation?.assistantContent;
      const signaturePresent = target.id === 'gemini'
        ? Boolean(assistantContent?.parts?.some(part => String(part?.thoughtSignature || '').trim()))
        : null;
      const signaturePreserved = target.id === 'gemini'
        ? Boolean(requestPreview?.contents?.[0]?.parts?.some(part => String(part?.thoughtSignature || '').trim()))
        : null;
      rows.push({
        provider: target.id,
        configuredProvider: String(runtime.provider || ''),
        model: String(runtime.model || ''),
        requestFormat: String(schema.diagnostics?.format || ''),
        initialCallCount: completedToolCalls.length,
        initialTextEmpty: String(initialText || '').length === 0,
        initialUsage,
        continuationContract: String(
          continuation.runnerBoundary?.nativeRunnerContract?.contractKind || '',
        ),
        continuationOk: continuation.ok === true,
        continuationStatus: String(continuation.status || ''),
        continuationReason: String(continuation.reason || '').slice(0, 180),
        finalTextExact: /^OK[.!]?$/iu.test(finalText),
        finalTextChars: finalText.length,
        signaturePresent,
        signaturePreserved,
        historyTurns: messages.length,
        persistentWrites: 0,
        latencyMs: Math.round(performance.now() - startedAt),
      });
    } catch (error) {
      rows.push({
        provider: target.id,
        requestOk: false,
        error: safeFailure(error),
        persistentWrites: 0,
        latencyMs: Math.round(performance.now() - startedAt),
      });
    }
  }

  return {
    fixtureVersion: 'stage-h3-provider-native-continuation-v1',
    paidCallUpperBound: targets.length * 2,
    persistentWrites: 0,
    rawTextRetained: false,
    toolArgumentsRetained: false,
    passed: rows.filter(row => (
      row.initialCallCount === 1
      && row.initialTextEmpty === true
      && row.continuationOk === true
      && row.finalTextExact === true
      && (row.provider !== 'gemini' || row.signaturePresent !== true || row.signaturePreserved === true)
    )).length,
    total: rows.length,
    rows,
  };
})()
