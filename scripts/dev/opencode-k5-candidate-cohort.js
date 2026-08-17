// Stage K.5 OpenCode candidate release cohort. It runs ten private/group/moment
// zero-write rounds with unique semantic markers and stops after the first failure.
(async () => {
  const bridge = window.appBridge;
  if (!bridge?.config) throw new Error('Stage K.5 candidate cohort requires an initialized app bridge');
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
  const MAX_REPETITIONS = 10;
  const trim = value => String(value ?? '').trim();
  const candidateModel = trim(window.__opencodeK5CandidateModel || DEFAULT_CANDIDATE).toLowerCase();
  if (!candidateModel || candidateModel.length > 120 || !isOpenCodeGoChatCompletionsModel(candidateModel)) {
    throw new Error('OpenCode K.5 candidate is not an admitted Chat Completions model id');
  }
  const requestedStart = Math.trunc(Number(window.__opencodeK5CohortStartRepetition) || 0);
  const startRepetition = Math.max(0, Math.min(MAX_REPETITIONS - 1, requestedStart));
  const requestedRepetitions = Math.trunc(Number(window.__opencodeK5CohortRepetitions) || MAX_REPETITIONS);
  const repetitions = Math.max(
    1,
    Math.min(MAX_REPETITIONS - startRepetition, requestedRepetitions),
  );
  const expectedSamples = repetitions * 3;
  const fixtureModelToken = candidateModel
    .toUpperCase()
    .replace(/[^A-Z0-9_-]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 32);

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
  const matrixCatalogModels = Array.isArray(window.__opencodeK5MatrixCatalogModels)
    ? [...new Set(window.__opencodeK5MatrixCatalogModels.map(item => trim(item).toLowerCase()).filter(Boolean))]
    : [];
  if (matrixCatalogModels.length) {
    catalogModelCount = matrixCatalogModels.length;
    catalogExactMatch = matrixCatalogModels.includes(candidateModel);
  } else {
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
  }
  if (!catalogExactMatch) {
    return {
      fixtureVersion: 'opencode-k5-candidate-cohort-v1',
      provider: runtime.provider,
      model: runtime.model,
      catalogExactMatch,
      catalogModelCount,
      catalogIssueCode,
      startRepetition,
      repetitionsPerSurface: repetitions,
      modelCallUpperBound: expectedSamples,
      modelCallsMade: 0,
      persistentWrites: 0,
      rawTextRetained: false,
      toolArgumentsRetained: false,
      ok: false,
      reason: catalogIssueCode || 'candidate_missing_from_catalog',
      overall: null,
      surfaces: [],
      failures: [],
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
  const samples = [];
  let modelCallsMade = 0;
  window.__opencodeK5CohortProgress = {
    model: candidateModel,
    completed: 0,
    expected: expectedSamples,
    startRepetition,
  };

  for (let repetition = 0; repetition < repetitions; repetition += 1) {
    const absoluteRepetition = startRepetition + repetition + 1;
    const usageOffset = usageEntries.length;
    const startedAt = new Map();
    const latencies = new Map();
    const round = await runChatFcZeroWriteCompatibilityTest({
      client,
      config: runtime,
      rule: localRuleOverride,
      fixtureToken: `K5-${fixtureModelToken}-${String(absoluteRepetition).padStart(2, '0')}`,
      onProgress: ({ phase, surface }) => {
        if (phase === 'request') startedAt.set(surface, performance.now());
        else if (startedAt.has(surface)) {
          latencies.set(surface, Math.round(performance.now() - startedAt.get(surface)));
        }
      },
    });
    modelCallsMade += Number(round.modelCallCount || 0);
    (round.results || []).forEach((row, index) => {
      samples.push({
        repetition: absoluteRepetition,
        surface: row.surface,
        ok: row.ok === true,
        providerFcAccepted: row.providerFcAccepted === true,
        strictSemanticPass: row.strictSemanticPass === true,
        attempted: row.attempted === true,
        reason: trim(row.reason).slice(0, 80),
        toolCallCount: Number(row.toolCallCount || 0),
        responseChars: Number(row.responseChars || 0),
        validationErrorCodes: Array.isArray(row.validationErrorCodes)
          ? row.validationErrorCodes.slice(0, 8)
          : [],
        checks: row.checks && typeof row.checks === 'object' ? { ...row.checks } : {},
        latencyMs: latencies.get(row.surface) ?? null,
        usage: usageEntries[usageOffset + index] || null,
      });
    });
    window.__opencodeK5CohortProgress = {
      model: candidateModel,
      completed: samples.length,
      expected: expectedSamples,
      startRepetition,
      repetition: absoluteRepetition,
      ok: round.ok === true,
    };
    console.info(
      '[opencode-k5-cohort]',
      `${samples.length}/${expectedSamples}`,
      round.ok ? 'pass' : 'fail',
    );
    if (!round.ok) break;
  }

  const percentile = (values, ratio) => {
    const sorted = values.filter(Number.isFinite).slice().sort((a, b) => a - b);
    if (!sorted.length) return null;
    return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1))];
  };
  const summarize = (rows) => {
    const count = key => rows.filter(row => row[key] === true).length;
    const latencies = rows.map(row => Number(row.latencyMs)).filter(Number.isFinite);
    const sumUsage = key => {
      const values = rows
        .map(row => row.usage?.[key])
        .filter(value => value !== null && value !== undefined)
        .map(Number)
        .filter(Number.isFinite);
      return values.length ? values.reduce((sum, value) => sum + value, 0) : null;
    };
    return {
      total: rows.length,
      attempted: count('attempted'),
      providerFcAccepted: count('providerFcAccepted'),
      strictSemanticPassed: count('strictSemanticPass'),
      wouldFallback: rows.filter(row => !row.ok).length,
      strictSemanticAccuracy: rows.length
        ? Number((count('strictSemanticPass') / rows.length).toFixed(4))
        : null,
      averageLatencyMs: latencies.length
        ? Math.round(latencies.reduce((sum, value) => sum + value, 0) / latencies.length)
        : null,
      p50LatencyMs: percentile(latencies, 0.5),
      p95LatencyMs: percentile(latencies, 0.95),
      promptTokens: sumUsage('promptTokens'),
      completionTokens: sumUsage('completionTokens'),
      totalTokens: sumUsage('totalTokens'),
    };
  };
  const surfaces = ['private_chat', 'group_chat', 'moment_comment'];
  const result = {
    fixtureVersion: 'opencode-k5-candidate-cohort-v1',
    configuredFrom: trim(profile.provider).toLowerCase(),
    provider: runtime.provider,
    model: runtime.model,
    catalogExactMatch,
    catalogModelCount,
    catalogIssueCode,
    startRepetition,
    repetitionsPerSurface: repetitions,
    modelCallUpperBound: expectedSamples,
    modelCallsMade,
    persistentWrites: 0,
    rawTextRetained: false,
    toolArgumentsRetained: false,
    ok: samples.length === expectedSamples && samples.every(row => row.strictSemanticPass),
    overall: summarize(samples),
    surfaces: surfaces.map(surface => ({
      surface,
      ...summarize(samples.filter(row => row.surface === surface)),
    })),
    failures: samples.filter(row => !row.strictSemanticPass).map(row => ({
      repetition: row.repetition,
      surface: row.surface,
      reason: row.reason,
      validationErrorCodes: row.validationErrorCodes,
      checks: row.checks,
    })),
  };
  window.__opencodeK5CohortProgress = {
    model: candidateModel,
    completed: samples.length,
    expected: expectedSamples,
    startRepetition,
    finished: true,
    ok: result.ok,
  };
  window.__opencodeK5CohortResult = result;
  return result;
})()
