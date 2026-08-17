// Stage L deterministic production-bridge smoke.
// Exercises FC probation -> breaker -> JSON terminal with local fake providers,
// intercepts history writes, and removes the temporary diagnostic evidence.
(async () => {
  const bridge = window.appBridge;
  const actions = bridge?.debugUiRegistry?.actions;
  if (!bridge?.generate || !actions?.setPrivateChatProviderFcExperimentEnabled) {
    throw new Error('Stage L routing smoke dependencies unavailable');
  }

  const [
    { appSettings },
    { chatStructuredRouteEvidenceStore },
    { CHAT_STRUCTURED_ROUTE_MODES },
    { buildChatStructuredRequestEvidenceIdentity },
  ] = await Promise.all([
    import('/scripts/storage/app-settings.js'),
    import('/scripts/storage/chat-structured-route-evidence-store.js'),
    import('/scripts/agent/chat-structured-route-evidence.js'),
    import('/scripts/agent/chat-structured-route-request.js'),
  ]);

  const config = {
    provider: 'deepseek',
    model: 'deepseek-v4-pro',
    baseUrl: 'https://api.deepseek.com/v1',
    stream: false,
    webSearchEnabled: false,
    maxRetries: 0,
  };
  const target = {
    sessionId: 'contact:stage-l-routing-smoke',
    targetName: '米娅',
    userName: '我',
  };
  const evidenceInput = {
    config,
    adapter: 'private_reply',
    surface: 'private_chat',
    capabilities: {},
  };
  const fcIdentity = buildChatStructuredRequestEvidenceIdentity({
    ...evidenceInput,
    mode: CHAT_STRUCTURED_ROUTE_MODES.providerFc,
  });
  const jsonIdentity = buildChatStructuredRequestEvidenceIdentity({
    ...evidenceInput,
    mode: CHAT_STRUCTURED_ROUTE_MODES.jsonTerminal,
  });
  if (!fcIdentity.ok || !jsonIdentity.ok) {
    throw new Error(`Stage L evidence identity unavailable: ${fcIdentity.reason || jsonIdentity.reason}`);
  }
  await chatStructuredRouteEvidenceStore.load();
  if (
    chatStructuredRouteEvidenceStore.get(fcIdentity.identity, CHAT_STRUCTURED_ROUTE_MODES.providerFc)
    || chatStructuredRouteEvidenceStore.get(jsonIdentity.identity, CHAT_STRUCTURED_ROUTE_MODES.jsonTerminal)
  ) {
    throw new Error('Stage L smoke refuses to overwrite existing deepseek-v4-pro private evidence');
  }

  const legacyRaw = [
    'MiPhone_start',
    'msg_start',
    '<我和米娅的私聊>',
    '米娅--传统协议回退成功--09:30',
    '</我和米娅的私聊>',
    'msg_end',
    'MiPhone_end',
  ].join('\n');
  const jsonRaw = JSON.stringify({
    version: 'phone.reply.ir.v1',
    payload: {
      messages: [{ type: 'text', content: 'JSON 降级成功' }],
    },
  });
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
  const providerCalls = [];
  const rounds = [];
  let historyWritesIntercepted = 0;
  let finalizeResult = null;
  let errorCode = '';

  const textOf = messages => (Array.isArray(messages) ? messages : [])
    .map(message => typeof message?.content === 'string' ? message.content : '')
    .join('\n');
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
    bridge.resolveRequestRuntimeConfig = async () => ({
      config,
      client: {
        async chat(messages, options = {}) {
          const promptText = textOf(messages);
          const kind = Array.isArray(options?.tools) && options.tools.length
            ? 'fc'
            : (
                options?.response_format?.type === 'json_object'
                || promptText.includes('本轮使用 JSON 结构化终态')
                  ? 'json'
                  : 'legacy'
              );
          providerCalls.push({
            kind,
            hasTextProtocol: /MiPhone_|msg_(?:start|end)/u.test(promptText),
            hasInternalAnchor: /chat-semantic:/u.test(promptText),
          });
          if (kind === 'fc') return '';
          if (kind === 'json') return jsonRaw;
          return legacyRaw;
        },
      },
    });
    bridge.saveToHistory = async () => {
      historyWritesIntercepted += 1;
      return true;
    };

    for (let index = 0; index < 3; index += 1) {
      await bridge.generate(`Stage L 路由失败注入 ${index + 1}`, {
        user: { name: '我' },
        character: { id: target.sessionId, name: target.targetName },
        session: { id: target.sessionId, name: target.targetName, isGroup: false },
        history: [],
        meta: {
          uiMode: 'chat',
          rawUserMessage: `Stage L 路由失败注入 ${index + 1}`,
          appendUserToHistory: true,
          memoryStorageMode: 'none',
        },
      });
      const transport = JSON.parse(JSON.stringify(bridge.lastRequest?.phoneReplyTransport || {}));
      rounds.push({
        requestedMode: String(transport.requestedMode || ''),
        effectiveMode: String(transport.effectiveMode || ''),
        routeLayer: String(transport.routeLayer || ''),
        fallbackFrom: String(transport.fallbackFrom || ''),
        fallbackReason: String(transport.fallbackReason || ''),
        evidenceStatus: String(transport.evidenceStatus || ''),
        evidenceAction: String(transport.evidenceAction || ''),
        circuitOpen: transport.circuitOpen === true,
      });
    }
    finalizeResult = await bridge.finalizeChatStructuredEvidence({
      requestId: bridge.lastRequest?.requestId,
      committed: false,
    });
  } catch (error) {
    errorCode = String(error?.code || error?.name || error?.message || 'failed').slice(0, 160);
  } finally {
    try {
      await chatStructuredRouteEvidenceStore.remove(
        fcIdentity.identity,
        CHAT_STRUCTURED_ROUTE_MODES.providerFc,
      );
      await chatStructuredRouteEvidenceStore.remove(
        jsonIdentity.identity,
        CHAT_STRUCTURED_ROUTE_MODES.jsonTerminal,
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
    fcIdentity.identity,
    CHAT_STRUCTURED_ROUTE_MODES.providerFc,
  ) && !chatStructuredRouteEvidenceStore.get(
    jsonIdentity.identity,
    CHAT_STRUCTURED_ROUTE_MODES.jsonTerminal,
  );
  const kinds = providerCalls.map(call => call.kind);
  const checks = {
    noError: !errorCode,
    exactCallSequence: JSON.stringify(kinds) === JSON.stringify(['fc', 'legacy', 'fc', 'legacy', 'json']),
    structuredPromptsHaveNoLegacyProtocol: providerCalls
      .filter(call => call.kind !== 'legacy')
      .every(call => call.hasTextProtocol === false && call.hasInternalAnchor === false),
    legacyPromptsRestoreProtocol: providerCalls
      .filter(call => call.kind === 'legacy')
      .every(call => call.hasTextProtocol === true && call.hasInternalAnchor === false),
    firstFailureRecorded: rounds[0]?.effectiveMode === 'fc_fallback'
      && rounds[0]?.evidenceStatus === 'contract_failure',
    secondFailureOpenedCircuit: rounds[1]?.effectiveMode === 'fc_fallback'
      && rounds[1]?.circuitOpen === true
      && rounds[1]?.evidenceAction === 'circuit_opened',
    thirdRoundUsedJson: rounds[2]?.requestedMode === 'json_terminal'
      && rounds[2]?.effectiveMode === 'json_terminal'
      && rounds[2]?.routeLayer === 'json_after_fc_circuit'
      && rounds[2]?.fallbackFrom === 'provider_fc',
    noFakeBusinessCommit: historyWritesIntercepted === 3
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
    fixtureVersion: 'chat-structured-l-routing-smoke-v1',
    networkRequests: 0,
    businessWrites: 0,
    providerCallKinds: kinds,
    historyWritesIntercepted,
    rounds,
    finalizeResult,
    checks,
    pass: Object.values(checks).every(value => value === true),
  };
})()
