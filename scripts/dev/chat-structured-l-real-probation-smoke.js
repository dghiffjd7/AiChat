// Stage L one-call paid probation smoke for an official DeepSeek model that is
// not in the bundled FC catalog. It calls bridge.generate directly, intercepts
// history persistence, discards staged success evidence, and retains no output.
(async () => {
  const bridge = window.appBridge;
  const actions = bridge?.debugUiRegistry?.actions;
  if (!bridge?.generate || !bridge?.config || !actions?.setPrivateChatProviderFcExperimentEnabled) {
    throw new Error('Stage L real probation smoke dependencies unavailable');
  }

  const [
    { LLMClient },
    { appSettings },
    { chatStructuredRouteEvidenceStore },
    { CHAT_STRUCTURED_ROUTE_MODES },
    { buildChatStructuredRequestEvidenceIdentity },
  ] = await Promise.all([
    import('/scripts/api/client.js'),
    import('/scripts/storage/app-settings.js'),
    import('/scripts/storage/chat-structured-route-evidence-store.js'),
    import('/scripts/agent/chat-structured-route-evidence.js'),
    import('/scripts/agent/chat-structured-route-request.js'),
  ]);
  const profile = (bridge.config.getProfiles?.() || []).find(item => (
    String(item?.provider || '').trim().toLowerCase() === 'deepseek'
  ));
  if (!profile?.id) throw new Error('Stage L smoke requires an official DeepSeek profile');
  const sourceRuntime = await bridge.config.getRuntimeConfigByProfileId(profile.id);
  if (!sourceRuntime) throw new Error('Stage L smoke could not resolve the DeepSeek runtime');
  const runtime = {
    ...sourceRuntime,
    provider: 'deepseek',
    model: 'deepseek-v4-pro',
    baseUrl: 'https://api.deepseek.com/v1',
    connectionMode: 'direct',
    proxyBaseUrl: '',
    stream: false,
    webSearchEnabled: false,
    maxRetries: 0,
  };
  let endpointHost = '';
  try { endpointHost = new URL(String(runtime.baseUrl || '')).hostname.toLowerCase(); } catch {}
  if (endpointHost !== 'api.deepseek.com') {
    throw new Error(`Stage L smoke refuses non-official endpoint: ${endpointHost || 'invalid'}`);
  }
  const realClient = new LLMClient(runtime);
  const listedModels = await realClient.listModels();
  if (!Array.isArray(listedModels) || !listedModels.includes(runtime.model)) {
    throw new Error('Stage L smoke model is not present in the official model list');
  }

  const evidenceIdentity = buildChatStructuredRequestEvidenceIdentity({
    config: runtime,
    mode: CHAT_STRUCTURED_ROUTE_MODES.providerFc,
    adapter: 'private_reply',
    surface: 'private_chat',
    capabilities: {},
  });
  if (!evidenceIdentity.ok) throw new Error(`Stage L evidence identity unavailable: ${evidenceIdentity.reason}`);
  await chatStructuredRouteEvidenceStore.load();
  if (chatStructuredRouteEvidenceStore.get(
    evidenceIdentity.identity,
    CHAT_STRUCTURED_ROUTE_MODES.providerFc,
  )) {
    throw new Error('Stage L smoke refuses to overwrite existing deepseek-v4-pro private evidence');
  }

  const previousFlag = actions.getPrivateChatProviderFcExperimentStatus?.()?.enabled === true;
  const previousResolveRuntime = bridge.resolveRequestRuntimeConfig;
  const previousGetGenerationOptions = bridge.getGenerationOptions;
  const previousBuildMemoryPromptPlan = bridge.buildMemoryPromptPlan;
  const previousSaveToHistory = bridge.saveToHistory;
  const previousLastRequest = bridge.lastRequest;
  const previousLastMemoryPlan = bridge.lastMemoryPlan;
  const previousLastPhoneFormatTransportPlan = bridge.lastPhoneFormatTransportPlan;
  const previousUsage = bridge.lastGenerationUsage;
  const previousSources = bridge.lastGenerationSources;
  const previousSettingsGet = appSettings.get;
  const calls = [];
  let paidCalls = 0;
  let historyWritesIntercepted = 0;
  let transport = null;
  let finalizeResult = null;
  let error = null;
  let outputChars = 0;

  const instrumentedClient = {
    async prepareProviderFcCapabilities() {
      return realClient.prepareProviderFcCapabilities?.();
    },
    async chat(messages, options = {}) {
      const promptText = (Array.isArray(messages) ? messages : [])
        .map(message => typeof message?.content === 'string' ? message.content : '')
        .join('\n');
      const structured = Array.isArray(options?.tools) && options.tools.length > 0;
      calls.push({
        structured,
        openaiApi: String(options?.openaiApi || ''),
        hasTextProtocol: /MiPhone_|msg_(?:start|end)/u.test(promptText),
        hasInternalAnchor: /chat-semantic:/u.test(promptText),
      });
      if (!structured) {
        const blocked = new Error('Stage L smoke blocked a paid legacy fallback');
        blocked.code = 'stage_l_paid_fallback_blocked';
        throw blocked;
      }
      paidCalls += 1;
      return realClient.chat(messages, options);
    },
  };
  try {
    actions.setPrivateChatProviderFcExperimentEnabled(true);
    appSettings.get = (...args) => ({
      ...previousSettingsGet.apply(appSettings, args),
      traditionalModelOutputProtocolEnabled: false,
      memoryAutoExtract: false,
    });
    bridge.buildMemoryPromptPlan = async function buildMemoryPromptPlanWithoutTargets(nextContext) {
      const plan = await previousBuildMemoryPromptPlan.call(this, nextContext);
      return { ...plan, tableTargets: [] };
    };
    bridge.getGenerationOptions = function getGenerationOptionsWithoutReasoning(...args) {
      const options = { ...(previousGetGenerationOptions.apply(this, args) || {}) };
      delete options.reasoning;
      delete options.reasoning_effort;
      delete options.request_reasoning;
      delete options.thinking;
      return options;
    };
    bridge.resolveRequestRuntimeConfig = async () => ({ config: runtime, client: instrumentedClient });
    bridge.saveToHistory = async () => {
      historyWritesIntercepted += 1;
      return true;
    };
    const output = await bridge.generate('请只回复一句简短的测试完成消息。', {
      user: { name: '我' },
      character: { id: 'contact:stage-l-probation', name: '米娅' },
      session: { id: 'contact:stage-l-probation', name: '米娅', isGroup: false },
      history: [],
      meta: {
        uiMode: 'chat',
        rawUserMessage: '请只回复一句简短的测试完成消息。',
        appendUserToHistory: true,
        memoryStorageMode: 'none',
      },
    });
    outputChars = String(output || '').length;
    transport = JSON.parse(JSON.stringify(bridge.lastRequest?.phoneReplyTransport || {}));
    finalizeResult = await bridge.finalizeChatStructuredEvidence({
      requestId: bridge.lastRequest?.requestId,
      committed: false,
    });
  } catch (caught) {
    error = {
      name: String(caught?.name || ''),
      code: String(caught?.code || ''),
      status: Number(caught?.status || 0),
      message: String(caught?.message || caught || '').replace(/\s+/gu, ' ').slice(0, 240),
    };
  } finally {
    try {
      await chatStructuredRouteEvidenceStore.remove(
        evidenceIdentity.identity,
        CHAT_STRUCTURED_ROUTE_MODES.providerFc,
      );
    } catch {}
    bridge.resolveRequestRuntimeConfig = previousResolveRuntime;
    bridge.getGenerationOptions = previousGetGenerationOptions;
    bridge.buildMemoryPromptPlan = previousBuildMemoryPromptPlan;
    bridge.saveToHistory = previousSaveToHistory;
    bridge.lastRequest = previousLastRequest;
    bridge.lastMemoryPlan = previousLastMemoryPlan;
    bridge.lastPhoneFormatTransportPlan = previousLastPhoneFormatTransportPlan;
    bridge.lastGenerationUsage = previousUsage;
    bridge.lastGenerationSources = previousSources;
    appSettings.get = previousSettingsGet;
    actions.setPrivateChatProviderFcExperimentEnabled(previousFlag);
  }

  const evidenceCleaned = !chatStructuredRouteEvidenceStore.get(
    evidenceIdentity.identity,
    CHAT_STRUCTURED_ROUTE_MODES.providerFc,
  );
  const call = calls[0] || {};
  const checks = {
    noError: error === null,
    exactlyOneProviderCall: calls.length === 1 && paidCalls === 1,
    probationFcUsed: transport?.requestedMode === 'provider_fc'
      && transport?.effectiveMode === 'provider_fc'
      && transport?.routeLayer === 'fc_probation',
    forcedResponsesTransport: call.structured === true && call.openaiApi === 'responses',
    noLegacyProtocolInFcPrompt: call.hasTextProtocol === false && call.hasInternalAnchor === false,
    canonicalOutputProduced: outputChars > 0,
    noBusinessCommit: historyWritesIntercepted === 1
      && finalizeResult?.recorded === false
      && finalizeResult?.reason === 'transaction_not_committed',
    evidenceCleaned,
    stateRestored: bridge.resolveRequestRuntimeConfig === previousResolveRuntime
      && bridge.getGenerationOptions === previousGetGenerationOptions
      && bridge.buildMemoryPromptPlan === previousBuildMemoryPromptPlan
      && bridge.saveToHistory === previousSaveToHistory
      && appSettings.get === previousSettingsGet
      && actions.getPrivateChatProviderFcExperimentStatus?.()?.enabled === previousFlag,
  };
  return {
    fixtureVersion: 'chat-structured-l-real-probation-smoke-v1',
    provider: runtime.provider,
    model: runtime.model,
    endpointHost,
    networkRequests: paidCalls,
    observedProviderAttempts: calls.length,
    businessWrites: 0,
    historyWritesIntercepted,
    rawContentRetained: false,
    argumentContentRetained: false,
    outputChars,
    transport: transport ? {
      requestedMode: String(transport.requestedMode || ''),
      effectiveMode: String(transport.effectiveMode || ''),
      routeLayer: String(transport.routeLayer || ''),
      fallbackReason: String(transport.fallbackReason || ''),
    } : null,
    finalizeResult,
    error,
    checks,
    pass: Object.values(checks).every(value => value === true),
  };
})()
