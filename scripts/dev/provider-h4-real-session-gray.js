// Stage H.4 one-provider real-session gray smoke. It uses the production send
// transaction on a unique temporary contact, then removes all temporary data.
(async () => {
  const bridge = window.appBridge;
  const debug = bridge?.debugUiRegistry;
  const actions = debug?.actions;
  const registry = debug?.stores?.agentToolRegistry;
  const chatStore = debug?.stores?.chatStore;
  const contactsStore = debug?.stores?.contactsStore;
  const memoryTableStore = debug?.stores?.memoryTableStore;
  const sessionPanel = debug?.panels?.sessionPanel;
  if (
    !bridge?.config
    || !actions?.enterChatRoom
    || !actions?.setPrivateChatProviderFcExperimentEnabled
    || !registry?.executeTool
    || !chatStore?.getMessages
    || !contactsStore?.upsertContact
    || !sessionPanel?.removeCore
  ) {
    throw new Error('Stage H.4 real-session gray dependencies unavailable');
  }

  const [
    { LLMClient },
    { appSettings },
    { validateBuiltinPhoneFormat },
    {
      buildChatFcLocalRuleFromProfile,
      getChatFcLocalCapabilityRules,
      getChatFcLocalRuleIdentityKey,
      replaceChatFcLocalCapabilityRules,
    },
    { resolveChatProviderFcRelease },
    { isOpenCodeGoChatCompletionsModel },
  ] = await Promise.all([
    import('/scripts/api/client.js'),
    import('/scripts/storage/app-settings.js'),
    import('/scripts/utils/builtin-phone-format-contract.js'),
    import('/scripts/agent/chat-fc-local-capability-rules.js'),
    import('/scripts/agent/provider-fc-transport.js'),
    import('/scripts/api/providers/opencode.js'),
  ]);
  const trim = (value, fallback = '') => String(value ?? '').trim() || fallback;
  const providerFilter = trim(window.__stageH4ProviderFilter).toLowerCase();
  const openCodeModel = trim(window.__stageH4OpenCodeModelOverride, 'glm-5.3').toLowerCase();
  if (providerFilter === 'opencode' && !isOpenCodeGoChatCompletionsModel(openCodeModel)) {
    throw new Error('Stage H.4 OpenCode model is not a Chat Completions candidate');
  }
  const targets = {
    deepseek: { profileName: 'Deepseek', providers: ['deepseek'] },
    anthropic: { profileName: 'Claude', providers: ['anthropic'] },
    openai: { profileName: 'oai', providers: ['openai'] },
    gemini: { profileName: '默认', providers: ['makersuite', 'gemini'] },
    opencode: { profileName: 'open', providers: ['opencode', 'custom'] },
    openrouter: { profileName: 'openrouter', providers: ['openrouter'] },
    zhipu: { profileName: '', providers: ['zhipu'] },
  };
  const targetProvider = targets[providerFilter];
  if (!targetProvider) throw new Error('Set __stageH4ProviderFilter to one supported provider');
  const profiles = bridge.config.getProfiles?.() || [];
  const profile = profiles.find(item => (
    (!targetProvider.profileName || trim(item?.name) === targetProvider.profileName)
    && targetProvider.providers.includes(trim(item?.provider).toLowerCase())
  ));
  if (!profile?.id) throw new Error(`Stage H.4 ${providerFilter} profile missing`);
  const resolvedRuntime = await bridge.config.getRuntimeConfigByProfileId(profile.id);
  if (!resolvedRuntime) throw new Error(`Stage H.4 ${providerFilter} runtime missing`);
  const runtime = {
    ...resolvedRuntime,
    ...(providerFilter === 'opencode' ? {
      provider: 'opencode',
      model: openCodeModel,
      baseUrl: 'https://opencode.ai/zen/go/v1',
      connectionMode: 'direct',
      proxyBaseUrl: '',
    } : {}),
    ...(providerFilter === 'openrouter' ? {
      provider: 'openrouter',
      model: 'google/gemini-3.7-flash',
      baseUrl: 'https://openrouter.ai/api/v1',
      connectionMode: 'direct',
      proxyBaseUrl: '',
    } : {}),
    ...(providerFilter === 'zhipu' ? {
      provider: 'zhipu',
      model: 'glm-5.2',
      baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
      connectionMode: 'direct',
      proxyBaseUrl: '',
    } : {}),
    stream: true,
    webSearchEnabled: false,
  };
  const releaseBeforeOverride = resolveChatProviderFcRelease(runtime);
  const usesCandidateLocalRule = providerFilter === 'opencode'
    && releaseBeforeOverride.enabled !== true;
  const candidateCapabilitySource = usesCandidateLocalRule ? 'local_advanced' : 'verified_seed';
  const candidateLocalRuleScope = 'in_memory_only';

  const prefix = `__codex_h4_gray_${providerFilter}_${Date.now()}`;
  const contactId = `${prefix}_contact`;
  const contactName = `${prefix} 测试联系人`;
  const userMarker = `${prefix}_user`;
  const previousSessionId = trim(chatStore.getCurrent?.());
  const previousSessionContact = previousSessionId
    ? contactsStore.getContact?.(previousSessionId) || null
    : null;
  const previousSessionRestorable = Boolean(
    previousSessionId
    && (!previousSessionId.startsWith('group:') || previousSessionContact),
  );
  const previousRoomVisible = !document.getElementById('chat-room')?.classList?.contains?.('hidden');
  const previousPersona = debug?.stores?.personaStore?.getActive?.() || null;
  const previousSessionName = trim(
    previousSessionContact?.name
    || (previousSessionId.startsWith('rp:') ? previousPersona?.name : '')
    || previousSessionId,
  );
  const previousFlag = actions.getPrivateChatProviderFcExperimentStatus?.()?.enabled === true;
  const previousResolveRuntime = bridge.resolveRequestRuntimeConfig;
  const previousSaveToHistory = bridge.saveToHistory;
  const previousLastRequest = bridge.lastRequest;
  const previousLastMemoryPlan = bridge.lastMemoryPlan;
  const previousLastPhoneFormatTransportPlan = bridge.lastPhoneFormatTransportPlan;
  const previousUsage = bridge.lastGenerationUsage;
  const previousSources = bridge.lastGenerationSources;
  const previousSettingsGet = appSettings.get;
  const previousTypingDots = document.body?.dataset?.typingDots;
  const previousLocalRules = getChatFcLocalCapabilityRules();
  const startedAt = performance.now();
  let observer = null;
  let previewFirstAt = 0;
  let previewMaxCount = 0;
  let candidateRuleInjected = false;
  let localRulesRestored = true;
  const report = {
    fixtureVersion: 'stage-h4-real-session-gray-v1',
    provider: providerFilter,
    configuredProvider: trim(runtime.provider),
    model: trim(runtime.model),
    localRuleScope: usesCandidateLocalRule ? candidateLocalRuleScope : 'none',
    releaseBeforeOverride: {
      enabled: releaseBeforeOverride.enabled === true,
      reason: trim(releaseBeforeOverride.reason),
      capabilitySource: trim(releaseBeforeOverride.capabilitySource),
      capabilityRuleId: trim(releaseBeforeOverride.capabilityRuleId),
    },
    persistentScope: 'temporary_only',
    providerRequests: 0,
    structuredRequests: 0,
    fallbackRequests: 0,
    historyWritesIntercepted: 0,
    session: null,
    cleanup: null,
    rawContentRetained: false,
    argumentContentRetained: false,
    transportErrors: [],
    structuredOptionKeys: [],
    fcPromptContainsTextProtocol: false,
    fcPromptContainsInternalAnchor: false,
  };

  const recordTransportError = (error) => {
    let providerDetail = '';
    try {
      const payload = JSON.parse(String(error?.response || '{}'));
      providerDetail = trim(
        payload?.error?.metadata?.raw
        || payload?.error?.metadata?.error
        || payload?.error?.detail,
      ).replace(/\s+/gu, ' ').slice(0, 300);
    } catch {}
    report.transportErrors.push({
      status: Number.isFinite(Number(error?.status)) ? Number(error.status) : null,
      code: trim(error?.code || error?.name, 'request_failed').slice(0, 80),
      providerDetail: providerDetail || trim(error?.response).replace(/\s+/gu, ' ').slice(0, 300),
      message: trim(error?.message || error).replace(/\s+/gu, ' ').slice(0, 300),
    });
  };

  const listTempMemoryRows = async () => {
    if (!memoryTableStore?.getMemories) return [];
    try {
      const rows = await memoryTableStore.getMemories({
        scope: 'contact',
        contact_id: contactId,
      });
      return Array.isArray(rows) ? rows : [];
    } catch {
      return [];
    }
  };
  const removeTempMemoryRows = async () => {
    const rows = await listTempMemoryRows();
    const ids = rows.map(row => trim(row?.id)).filter(Boolean);
    if (ids.length && memoryTableStore?.batchDeleteMemories) {
      await memoryTableStore.batchDeleteMemories(ids);
    }
    return ids;
  };
  const recordRequest = (messages = [], options = {}) => {
    report.providerRequests += 1;
    const toolName = trim(
      options?.tools?.[0]?.function?.name
      || options?.tools?.[0]?.name
      || options?.tools?.[0]?.functionDeclarations?.[0]?.name,
    );
    if (toolName === 'emit_phone_batch' || toolName === 'emit_private_reply') {
      report.structuredRequests += 1;
      report.structuredOptionKeys = Object.keys(options || {}).sort();
      const promptText = (Array.isArray(messages) ? messages : [])
        .map(message => typeof message?.content === 'string' ? message.content : '')
        .join('\n');
      report.fcPromptContainsTextProtocol ||= /MiPhone_|msg_(?:start|end)|moment_(?:start|end|reply_start|reply_end)/u.test(promptText);
      report.fcPromptContainsInternalAnchor ||= /chat-semantic:/u.test(promptText);
    } else {
      report.fallbackRequests += 1;
    }
  };

  try {
    if (usesCandidateLocalRule) {
      const builtRule = buildChatFcLocalRuleFromProfile({
        id: profile.id,
        name: profile.name,
        provider: runtime.provider,
        baseUrl: runtime.baseUrl,
        model: runtime.model,
      }, {
        enabled: true,
        ruleId: `local.chat-fc.h4.${Date.now().toString(36)}`,
        name: `Stage H.4 ${runtime.model}`,
      });
      if (!builtRule.ok) throw new Error(`Stage H.4 candidate rule invalid: ${builtRule.reason}`);
      const candidateKey = getChatFcLocalRuleIdentityKey(builtRule.rule);
      replaceChatFcLocalCapabilityRules([
        ...previousLocalRules.filter(rule => getChatFcLocalRuleIdentityKey(rule) !== candidateKey),
        builtRule.rule,
      ]);
      candidateRuleInjected = true;
    }
    contactsStore.upsertContact({
      id: contactId,
      name: contactName,
      isGroup: false,
      description: '这是临时灰度测试联系人，只需给出一句简短自然的文字回复。',
    });
    appSettings.get = (...args) => ({
      ...previousSettingsGet.apply(appSettings, args),
      traditionalModelOutputProtocolEnabled: false,
      memoryAutoExtract: false,
    });
    if (document.body?.dataset) document.body.dataset.typingDots = 'off';
    actions.setPrivateChatProviderFcExperimentEnabled(true);

    const realClient = new LLMClient(runtime);
    const instrumentedClient = {
      async prepareProviderFcCapabilities() {
        return realClient.prepareProviderFcCapabilities?.();
      },
      async chat(messages, options = {}) {
        recordRequest(messages, options);
        try {
          return await realClient.chat(messages, options);
        } catch (error) {
          recordTransportError(error);
          throw error;
        }
      },
      async *streamChat(messages, options = {}) {
        recordRequest(messages, options);
        try {
          yield* realClient.streamChat(messages, options);
        } catch (error) {
          recordTransportError(error);
          throw error;
        }
      },
    };
    bridge.resolveRequestRuntimeConfig = async () => ({
      config: runtime,
      client: instrumentedClient,
    });
    bridge.saveToHistory = async () => {
      report.historyWritesIntercepted += 1;
      return true;
    };

    await actions.enterChatRoom(contactId, contactName, 'chat', {
      suppressInitialAutoScroll: true,
    });
    const beforeMessages = chatStore.getMessages(contactId) || [];
    const beforeAssistantCount = beforeMessages.filter(message => message?.role === 'assistant').length;
    const observePreview = () => {
      const count = document.querySelectorAll(
        '.QQ_chat_charmsg[data-disposable-preview="1"]',
      ).length;
      if (count > 0 && !previewFirstAt) previewFirstAt = performance.now();
      previewMaxCount = Math.max(previewMaxCount, count);
    };
    observer = new MutationObserver(observePreview);
    observer.observe(document.getElementById('chat-room') || document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    let toolResult = null;
    let sendError = null;
    try {
      toolResult = await registry.executeTool('chat.send_message', {
        sessionId: contactId,
        content: `${userMarker}。请只用一条简短文字回复。`,
        role: 'user',
        open: true,
        triggerReply: true,
        waitForReply: true,
      }, {
        source: 'stage_h4_real_session_gray',
        sessionId: contactId,
        operationIntentPolicy: { mode: 'write_allowed' },
        requestPermission: async () => ({ decision: 'allow' }),
        requestToolConfirmation: async () => ({ decision: 'allow_once' }),
      });
    } catch (error) {
      sendError = trim(error?.code || error?.name, 'send_failed').slice(0, 80);
    }
    observePreview();
    observer.disconnect();
    observer = null;

    const messages = chatStore.getMessages(contactId) || [];
    const assistantCount = messages.filter(message => message?.role === 'assistant').length;
    const userMarkerCount = messages.filter(message => trim(message?.content).includes(userMarker)).length;
    const transport = bridge.lastRequest?.phoneReplyTransport || {};
    const responseDiagnostics = bridge.lastRequest?.responseDiagnostics || {};
    const providerCalls = Array.isArray(responseDiagnostics?.providerCalls)
      ? responseDiagnostics.providerCalls
      : [];
    const providerCall = providerCalls[0] || {};
    const hasFiniteMetric = value => value !== null
      && value !== undefined
      && Number.isFinite(Number(value));
    const hasPositiveMetric = value => hasFiniteMetric(value) && Number(value) > 0;
    const streamMetricsPresent = hasFiniteMetric(providerCall.firstMeaningfulDeltaLatencyMs)
      && hasFiniteMetric(providerCall.outputDurationMs)
      && hasPositiveMetric(providerCall.tokensPerSecond);
    const nonStreamMetricsAbsent = providerCall.firstMeaningfulDeltaLatencyMs == null
      && providerCall.outputDurationMs == null
      && providerCall.tokensPerSecond == null;
    const providerTelemetry = {
      exactOneCall: providerCalls.length === 1,
      stream: providerCall.stream === true,
      promptTokensPresent: hasFiniteMetric(providerCall.promptTokens),
      completionTokensPresent: hasFiniteMetric(providerCall.completionTokens),
      firstMeaningfulDeltaPresent: hasFiniteMetric(providerCall.firstMeaningfulDeltaLatencyMs),
      outputDurationPresent: hasFiniteMetric(providerCall.outputDurationMs),
      tokensPerSecondPresent: hasPositiveMetric(providerCall.tokensPerSecond),
      streamMetricsPolicyCorrect: providerCall.stream === true
        ? streamMetricsPresent
        : nonStreamMetricsAbsent,
      responseIdPresent: Boolean(trim(providerCall.responseId)),
    };
    providerTelemetry.pass = providerTelemetry.exactOneCall
      && providerTelemetry.promptTokensPresent
      && providerTelemetry.completionTokensPresent
      && providerTelemetry.streamMetricsPolicyCorrect
      && providerTelemetry.responseIdPresent;
    const raw = trim(chatStore.getLastRawResponse?.(contactId));
    const tempMemoryRows = await listTempMemoryRows();
    const checks = {
      noSendError: !sendError,
      toolSucceeded: toolResult?.status === 'succeeded' && toolResult?.result?.ok === true,
      assistantDelivered: toolResult?.result?.completionOutcome === 'assistant_delivered',
      providerFcUsed: transport.effectiveMode === 'provider_fc' && transport.attempted === true,
      fcPromptTransportFree: report.fcPromptContainsTextProtocol === false
        && report.fcPromptContainsInternalAnchor === false,
      semanticSnapshotCaptured: /^chat-semantic-v1:/u.test(trim(transport.snapshotFingerprint)),
      capabilitySourceMatched: trim(transport.capabilitySource) === candidateCapabilitySource,
      terminalSchemaRedacted: transport.terminalToolSchema?.redacted === true,
      exactOneProviderRequest: report.providerRequests === 1 && report.structuredRequests === 1,
      noFallback: report.fallbackRequests === 0 && trim(transport.fallbackReason) === '',
      exactOneToolCall: Number(transport.toolCallCount || 0) === 1,
      providerTelemetryComplete: providerTelemetry.pass,
      userCommittedOnce: userMarkerCount === 1,
      assistantCommitted: assistantCount > beforeAssistantCount,
      canonicalRawValid: validateBuiltinPhoneFormat(raw, { surface: 'private_chat' }).valid === true,
      noDisposablePreviewLeak: document.querySelectorAll(
        '.QQ_chat_charmsg[data-disposable-preview="1"]',
      ).length === 0,
      noUnexpectedMemoryWrite: tempMemoryRows.length === 0,
    };
    report.session = {
      ...checks,
      issueCode: sendError || trim(transport.fallbackReason),
      requestedMode: trim(transport.requestedMode),
      effectiveMode: trim(transport.effectiveMode),
      adapter: trim(transport.adapter),
      capabilitySource: trim(transport.capabilitySource),
      assistantMessagesAdded: Math.max(0, assistantCount - beforeAssistantCount),
      previewMaxCount,
      firstPreviewLatencyMs: previewFirstAt ? Math.round(previewFirstAt - startedAt) : null,
      totalLatencyMs: Math.round(performance.now() - startedAt),
      temporaryMemoryRowCount: tempMemoryRows.length,
      providerTelemetry,
      pass: Object.values(checks).every(value => value === true),
    };
  } finally {
    observer?.disconnect?.();
    bridge.resolveRequestRuntimeConfig = previousResolveRuntime;
    bridge.saveToHistory = previousSaveToHistory;
    bridge.lastRequest = previousLastRequest;
    bridge.lastMemoryPlan = previousLastMemoryPlan;
    bridge.lastPhoneFormatTransportPlan = previousLastPhoneFormatTransportPlan;
    bridge.lastGenerationUsage = previousUsage;
    bridge.lastGenerationSources = previousSources;
    appSettings.get = previousSettingsGet;
    actions.setPrivateChatProviderFcExperimentEnabled(previousFlag);
    if (candidateRuleInjected) {
      try {
        replaceChatFcLocalCapabilityRules(previousLocalRules);
        localRulesRestored = JSON.stringify(getChatFcLocalCapabilityRules())
          === JSON.stringify(previousLocalRules);
      } catch {
        localRulesRestored = false;
      }
    }
    if (document.body?.dataset) {
      if (previousTypingDots === undefined) delete document.body.dataset.typingDots;
      else document.body.dataset.typingDots = previousTypingDots;
    }

    const removedMemoryRowIds = await removeTempMemoryRows();
    try {
      if (chatStore.listSessions?.().includes(contactId)) {
        await sessionPanel.removeCore(contactId);
      }
    } catch {
      try { chatStore.delete?.(contactId); } catch {}
    }
    if (contactsStore.getContact?.(contactId)) contactsStore.removeContact?.(contactId);

    if (previousSessionRestorable && previousRoomVisible) {
      try {
        await actions.enterChatRoom(previousSessionId, previousSessionName, 'chat', {
          suppressInitialAutoScroll: true,
        });
      } catch {}
      if (trim(chatStore.getCurrent?.()) !== previousSessionId) {
        chatStore.switchSession?.(previousSessionId);
        bridge.setActiveSession?.(previousSessionId);
      }
    } else {
      if (previousSessionRestorable) {
        chatStore.setCurrent?.(previousSessionId);
        bridge.setActiveSession?.(previousSessionId);
      }
      try { actions.exitChatRoom?.(); } catch {}
    }

    const remainingMemoryRows = await listTempMemoryRows();
    report.cleanup = {
      removedMemoryRowCount: removedMemoryRowIds.length,
      remainingSessions: chatStore.listSessions?.().filter(id => id === contactId) || [],
      remainingContacts: contactsStore.getContact?.(contactId) ? [contactId] : [],
      remainingMemoryRows: remainingMemoryRows.length,
      internalFlagRestored: actions.getPrivateChatProviderFcExperimentStatus?.()?.enabled === previousFlag,
      localRulesRestored,
      runtimeRestored: bridge.resolveRequestRuntimeConfig === previousResolveRuntime
        && bridge.saveToHistory === previousSaveToHistory
        && appSettings.get === previousSettingsGet,
      activeSessionRestored: previousSessionRestorable
        ? trim(chatStore.getCurrent?.()) === previousSessionId
        : !trim(chatStore.getCurrent?.()).startsWith('__codex_h4_gray_'),
    };
    report.cleanup.pass = report.cleanup.remainingSessions.length === 0
      && report.cleanup.remainingContacts.length === 0
      && report.cleanup.remainingMemoryRows === 0
      && report.cleanup.internalFlagRestored
      && report.cleanup.localRulesRestored
      && report.cleanup.runtimeRestored
      && report.cleanup.activeSessionRestored;
  }

  report.pass = report.session?.pass === true && report.cleanup?.pass === true;
  return report;
})()
