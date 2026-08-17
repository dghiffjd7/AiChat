// Stage K.5 OpenCode candidate APP-surface smoke. It runs the built-in
// private/group/moment zero-write fixtures once each and stops on first failure.
(async () => {
  const bridge = window.appBridge;
  if (!bridge?.config) throw new Error('Stage K.5 surface smoke requires an initialized app bridge');
  const [
    { LLMClient },
    { buildChatFcLocalRuleFromProfile },
    { runChatFcZeroWriteCompatibilityTest },
    { isOpenCodeGoChatCompletionsModel, OPENCODE_GO_BASE_URL },
  ] = await Promise.all([
    import('/scripts/api/client.js'),
    import('/scripts/agent/chat-fc-local-capability-rules.js'),
    import('/scripts/agent/chat-fc-zero-write-compat-test.js'),
    import('/scripts/api/providers/opencode.js'),
  ]);

  const DEFAULT_CANDIDATE = 'glm-5.2';
  const trim = value => String(value ?? '').trim();
  const candidateModel = trim(window.__opencodeK5CandidateModel || DEFAULT_CANDIDATE).toLowerCase();
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

  let catalogExactMatch = false;
  let catalogModelCount = 0;
  let catalogIssueCode = '';
  try {
    const data = await rawClient.provider.requestJson({
      url: `${rawClient.provider.baseUrl}/models`,
      method: 'GET',
      headers: rawClient.provider.getHeaders(),
    });
    const rows = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
    const ids = rows
      .map(item => trim(item?.id || item?.name || item).toLowerCase())
      .filter(Boolean);
    catalogModelCount = new Set(ids).size;
    catalogExactMatch = ids.includes(candidateModel);
  } catch (error) {
    const status = Number(error?.status);
    catalogIssueCode = Number.isFinite(status) && status > 0
      ? `http_${Math.trunc(status)}`
      : 'catalog_request_failed';
  }
  if (!catalogExactMatch) {
    return {
      fixtureVersion: 'opencode-k5-candidate-surface-v1',
      provider: runtime.provider,
      model: runtime.model,
      catalogExactMatch,
      catalogModelCount,
      catalogIssueCode,
      modelCallUpperBound: 3,
      modelCallsMade: 0,
      persistentWrites: 0,
      rawTextRetained: false,
      toolArgumentsRetained: false,
      ok: false,
      reason: catalogIssueCode || 'candidate_missing_from_catalog',
      results: [],
    };
  }

  const builtRule = buildChatFcLocalRuleFromProfile({
    id: profile.id,
    name: profile.name,
    provider: runtime.provider,
    baseUrl: runtime.baseUrl,
    model: runtime.model,
  }, {
    enabled: false,
    name: `OpenCode K.5 ${candidateModel}`,
  });
  if (!builtRule.ok) throw new Error(`OpenCode K.5 local rule invalid: ${builtRule.reason}`);
  const localRuleOverride = builtRule.rule;

  const usageEntries = [];
  const client = {
    chat(messages, options = {}) {
      const inheritedUsage = options.onProviderUsage;
      return rawClient.chat(messages, {
        ...options,
        onProviderUsage: (usage) => {
          usageEntries.push({
            promptTokens: Number.isFinite(Number(usage?.promptTokens)) ? Number(usage.promptTokens) : null,
            completionTokens: Number.isFinite(Number(usage?.completionTokens)) ? Number(usage.completionTokens) : null,
            totalTokens: Number.isFinite(Number(usage?.totalTokens)) ? Number(usage.totalTokens) : null,
            finishReason: trim(usage?.finishReason).slice(0, 40),
            responseIdPresent: Boolean(trim(usage?.responseId)),
          });
          try { inheritedUsage?.(usage); } catch {}
        },
      });
    },
  };
  const startedAt = new Map();
  const latencies = new Map();
  const result = await runChatFcZeroWriteCompatibilityTest({
    client,
    config: runtime,
    rule: localRuleOverride,
    onProgress: ({ phase, surface }) => {
      if (phase === 'request') startedAt.set(surface, performance.now());
      else if (startedAt.has(surface)) {
        latencies.set(surface, Math.round(performance.now() - startedAt.get(surface)));
      }
    },
  });
  const sanitizedResults = (result.results || []).map((row, index) => ({
    ...row,
    latencyMs: latencies.get(row.surface) ?? null,
    usage: usageEntries[index] || null,
  }));

  return {
    fixtureVersion: 'opencode-k5-candidate-surface-v1',
    configuredFrom: trim(profile.provider).toLowerCase(),
    provider: runtime.provider,
    model: runtime.model,
    catalogExactMatch,
    catalogModelCount,
    catalogIssueCode,
    modelCallUpperBound: 3,
    modelCallsMade: result.modelCallCount,
    persistentWrites: 0,
    rawTextRetained: false,
    toolArgumentsRetained: false,
    ok: result.ok === true,
    reason: trim(result.reason),
    passed: sanitizedResults.filter(row => row.ok).length,
    total: sanitizedResults.length,
    results: sanitizedResults,
  };
})()
