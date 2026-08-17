// Stage K.5 OpenCode candidate cancellation and fallback boundary smoke.
// It makes at most one real request, then uses deterministic in-memory clients.
(async () => {
  const bridge = window.appBridge;
  if (!bridge?.config) throw new Error('Stage K.5 boundary smoke requires an initialized app bridge');
  const [
    { LLMClient },
    { buildChatFcLocalRuleFromProfile },
    {
      buildPrivateChatStructuredTransportInstruction,
      runPrivateChatGenerationWithFallback,
    },
    { isOpenCodeGoChatCompletionsModel, OPENCODE_GO_BASE_URL },
    { safeInvoke },
  ] = await Promise.all([
    import('/scripts/api/client.js'),
    import('/scripts/agent/chat-fc-local-capability-rules.js'),
    import('/scripts/ui/chat/private-chat-provider-fc.js'),
    import('/scripts/api/providers/opencode.js'),
    import('/scripts/utils/tauri.js'),
  ]);

  const trim = value => String(value ?? '').trim();
  const candidateModel = trim(window.__opencodeK5CandidateModel || 'glm-5.2').toLowerCase();
  if (!candidateModel || candidateModel.length > 120 || !isOpenCodeGoChatCompletionsModel(candidateModel)) {
    throw new Error('OpenCode K.5 candidate is not an admitted Chat Completions model id');
  }
  const profiles = bridge.config.getProfiles?.() || [];
  const profile = profiles.find(item => trim(item?.provider).toLowerCase() === 'opencode')
    || profiles.find(item => (
      trim(item?.provider).toLowerCase() === 'custom'
      && trim(item?.name).toLowerCase() === 'open'
    ));
  if (!profile?.id) throw new Error('OpenCode or legacy open profile missing');
  const sourceRuntime = await bridge.config.getRuntimeConfigByProfileId(profile.id);
  if (!trim(sourceRuntime?.apiKey)) throw new Error('OpenCode API key missing');
  const runtime = {
    ...sourceRuntime,
    provider: 'opencode',
    model: candidateModel,
    baseUrl: OPENCODE_GO_BASE_URL,
    connectionMode: 'direct',
    proxyBaseUrl: '',
    webSearchEnabled: false,
    stream: false,
  };
  const rawClient = new LLMClient(runtime);
  const matrixCatalogModels = Array.isArray(window.__opencodeK5MatrixCatalogModels)
    ? [...new Set(window.__opencodeK5MatrixCatalogModels.map(item => trim(item).toLowerCase()).filter(Boolean))]
    : [];
  let catalogExactMatch = matrixCatalogModels.includes(runtime.model);
  if (!matrixCatalogModels.length) {
    const catalog = await rawClient.provider.requestJson({
      url: `${rawClient.provider.baseUrl}/models`,
      method: 'GET',
      headers: rawClient.provider.getHeaders(),
    });
    const catalogRows = Array.isArray(catalog?.data) ? catalog.data : Array.isArray(catalog) ? catalog : [];
    catalogExactMatch = catalogRows.some(item => (
      trim(item?.id || item?.name || item).toLowerCase() === runtime.model
    ));
  }
  if (!catalogExactMatch) {
    return {
      fixtureVersion: 'opencode-k5-candidate-boundary-v1',
      provider: runtime.provider,
      model: runtime.model,
      catalogExactMatch,
      realPaidCallUpperBound: 1,
      realCallsMade: 0,
      persistentWrites: 0,
      rawTextRetained: false,
      ok: false,
      reason: 'candidate_missing_from_catalog',
    };
  }

  const builtRule = buildChatFcLocalRuleFromProfile({
    id: profile.id,
    name: profile.name,
    provider: runtime.provider,
    baseUrl: runtime.baseUrl,
    model: runtime.model,
  }, { enabled: false, name: `OpenCode K.5 ${candidateModel}` });
  if (!builtRule.ok) throw new Error(`OpenCode K.5 local rule invalid: ${builtRule.reason}`);
  const localRuleOverride = builtRule.rule;
  const target = {
    sessionId: '__fc-k5-boundary-private__',
    targetName: '边界测试角色',
    speakerName: '边界测试角色',
    userName: '测试用户',
  };
  const context = {
    uiMode: 'chat',
    surface: 'private_chat',
    isGroupChat: false,
    responseTarget: 'character',
    assistantContinuation: false,
    webSearchEnabled: false,
    hasProviderTools: false,
    hasAssistantPrefill: false,
    usesDefaultPreset: true,
    usesBuiltinFormat: true,
    protocolParserEnabled: true,
    hasUnsupportedSideEffects: false,
    formatProfileEnabled: false,
    compatibilityModeEnabled: false,
  };
  const messages = [
    {
      role: 'system',
      content: buildPrivateChatStructuredTransportInstruction({ allowedItemTypes: ['text'] }),
    },
    { role: 'user', content: '这是取消边界测试。请只提交一句简短回复。' },
  ];
  const common = {
    enabled: true,
    config: runtime,
    messages,
    context,
    target,
    thinkingEnabled: false,
    temperature: 0,
    maxTokens: 512,
    allowedItemTypes: ['text'],
    allowedStickerKeywords: [],
    streamPreviewEnabled: false,
    localRuleOverride,
  };

  let realCallsMade = 0;
  let cancelFallbackCalls = 0;
  let cancelAborted = false;
  let cancelIssueCode = '';
  let nativeAbortRequested = false;
  let nativeAbortAcknowledged = false;
  let nativeAbortPromise = Promise.resolve();
  const nativeRequestId = `opencode_k5_cancel_${Date.now().toString(36)}`;
  const controller = new AbortController();
  const abortNative = () => {
    nativeAbortRequested = true;
    nativeAbortPromise = safeInvoke('http_abort_request', { requestId: nativeRequestId })
      .then(result => { nativeAbortAcknowledged = result === true; })
      .catch(() => {});
  };
  controller.signal.addEventListener('abort', abortNative, { once: true });
  const timer = setTimeout(() => controller.abort(), 80);
  try {
    await runPrivateChatGenerationWithFallback({
      ...common,
      signal: controller.signal,
      requestOptions: { nativeRequestId },
      client: {
        chat(requestMessages, options) {
          realCallsMade += 1;
          return rawClient.chat(requestMessages, options);
        },
      },
      runTextFallback: async () => {
        cancelFallbackCalls += 1;
        return { ok: true, raw: 'not-retained' };
      },
    });
  } catch (error) {
    cancelAborted = error?.name === 'AbortError' || controller.signal.aborted === true;
    if (!cancelAborted) cancelIssueCode = trim(error?.code || error?.name, 'request_failed').slice(0, 80);
  } finally {
    clearTimeout(timer);
    controller.signal.removeEventListener('abort', abortNative);
    await nativeAbortPromise;
  }

  let deterministicCalls = 0;
  let fallbackCalls = 0;
  const fallbackResult = await runPrivateChatGenerationWithFallback({
    ...common,
    client: {
      async chat() {
        deterministicCalls += 1;
        return '';
      },
    },
    runTextFallback: async ({ reason }) => {
      fallbackCalls += 1;
      return { ok: true, reason: '', observedReason: reason, raw: 'not-retained' };
    },
  });

  let postCommitFallbackCalls = 0;
  const postCommitResult = await runPrivateChatGenerationWithFallback({
    ...common,
    client: { async chat() { return ''; } },
    persistentCommitStarted: true,
    runTextFallback: async () => {
      postCommitFallbackCalls += 1;
      return { ok: true, raw: 'not-retained' };
    },
  });

  const cancellation = {
    realCallsMade,
    aborted: cancelAborted,
    nativeAbortRequested,
    nativeAbortAcknowledged,
    fallbackCalls: cancelFallbackCalls,
    issueCode: cancelIssueCode,
    pass: realCallsMade === 1
      && cancelAborted
      && nativeAbortRequested
      && nativeAbortAcknowledged
      && cancelFallbackCalls === 0
      && !cancelIssueCode,
  };
  const preCommitFallback = {
    deterministicCalls,
    fallbackCalls,
    effectiveMode: trim(fallbackResult?.effectiveMode),
    fallbackReason: trim(fallbackResult?.fallbackReason),
    pass: deterministicCalls === 1
      && fallbackCalls === 1
      && fallbackResult?.ok === true
      && fallbackResult?.effectiveMode === 'legacy_text'
      && fallbackResult?.fallbackReason === 'no_tool_call',
  };
  const postCommitGuard = {
    fallbackCalls: postCommitFallbackCalls,
    reason: trim(postCommitResult?.reason),
    fallbackReason: trim(postCommitResult?.fallbackReason),
    pass: postCommitFallbackCalls === 0
      && postCommitResult?.ok === false
      && postCommitResult?.reason === 'fallback_after_commit_forbidden'
      && postCommitResult?.fallbackReason === 'no_tool_call',
  };
  return {
    fixtureVersion: 'opencode-k5-candidate-boundary-v1',
    configuredFrom: trim(profile.provider).toLowerCase(),
    provider: runtime.provider,
    model: runtime.model,
    catalogExactMatch,
    realPaidCallUpperBound: 1,
    realCallsMade,
    persistentWrites: 0,
    rawTextRetained: false,
    toolArgumentsRetained: false,
    cancellation,
    preCommitFallback,
    postCommitGuard,
    ok: cancellation.pass && preCommitFallback.pass && postCommitGuard.pass,
  };
})()
