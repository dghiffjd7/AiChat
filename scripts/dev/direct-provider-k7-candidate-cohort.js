// Stage K.7 direct-provider candidate release cohort.
// Set window.__directK7Provider to kimi/zhipu and optionally
// window.__directK7CohortRepetitions (1..10) / __directK7CohortStartRepetition.
// Each repetition runs private/group/moment zero-write fixtures and stops on failure.
(async () => {
  const bridge = window.appBridge;
  if (!bridge?.config) throw new Error('Stage K.7 candidate cohort requires an initialized app bridge');
  const [
    { LLMClient },
    { buildChatFcLocalRuleFromProfile },
    { runChatFcZeroWriteCompatibilityTest },
  ] = await Promise.all([
    import('/scripts/api/client.js'),
    import('/scripts/agent/chat-fc-local-capability-rules.js'),
    import('/scripts/agent/chat-fc-zero-write-compat-test.js'),
  ]);

  const trim = value => String(value ?? '').trim();
  const targets = {
    kimi: { model: 'kimi-k3', baseUrl: 'https://api.moonshot.ai/v1', marker: 'KIMI-K3' },
    zhipu: { model: 'glm-5.2', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', marker: 'GLM-52' },
  };
  const providerId = trim(window.__directK7Provider).toLowerCase();
  const target = targets[providerId];
  if (!target) throw new Error('Set __directK7Provider to kimi or zhipu');
  const maxRepetitions = 10;
  const startRepetition = Math.max(0, Math.min(
    maxRepetitions - 1,
    Math.trunc(Number(window.__directK7CohortStartRepetition) || 0),
  ));
  const repetitions = Math.max(1, Math.min(
    maxRepetitions - startRepetition,
    Math.trunc(Number(window.__directK7CohortRepetitions) || maxRepetitions),
  ));
  const expectedSamples = repetitions * 3;

  const profiles = bridge.config.getProfiles?.() || [];
  const profile = profiles.find(item => trim(item?.provider).toLowerCase() === providerId);
  if (!profile?.id) throw new Error(`Stage K.7 ${providerId} profile missing`);
  const sourceRuntime = await bridge.config.getRuntimeConfigByProfileId(profile.id);
  if (!trim(sourceRuntime?.apiKey)) throw new Error(`Stage K.7 ${providerId} API key missing`);
  if (trim(sourceRuntime?.baseUrl).replace(/\/+$/u, '') !== target.baseUrl) {
    throw new Error(`Stage K.7 ${providerId} profile endpoint mismatch`);
  }
  const runtime = {
    ...sourceRuntime,
    provider: providerId,
    model: target.model,
    baseUrl: target.baseUrl,
    connectionMode: 'direct',
    proxyBaseUrl: '',
    webSearchEnabled: false,
    stream: false,
  };
  const rawClient = new LLMClient(runtime);
  const builtRule = buildChatFcLocalRuleFromProfile({
    ...profile,
    provider: runtime.provider,
    baseUrl: runtime.baseUrl,
    model: runtime.model,
  }, {
    enabled: false,
    name: `Stage K.7 ${providerId} ${runtime.model}`,
  });
  if (!builtRule.ok) throw new Error(`Stage K.7 local rule invalid: ${builtRule.reason}`);

  const usageEntries = [];
  const requestErrors = [];
  const client = {
    async chat(messages, options = {}) {
      const inheritedUsage = options.onProviderUsage;
      try {
        const result = await rawClient.chat(messages, {
          ...options,
          onProviderUsage: usage => {
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
        requestErrors.push(null);
        return result;
      } catch (error) {
        requestErrors.push({
          name: trim(error?.name, 'Error').slice(0, 40),
          code: trim(error?.code).slice(0, 80),
          status: Number.isFinite(Number(error?.status)) ? Number(error.status) : null,
        });
        throw error;
      }
    },
  };
  const samples = [];
  let modelCallsMade = 0;
  window.__directK7CohortProgress = {
    provider: providerId,
    model: runtime.model,
    completed: 0,
    expected: expectedSamples,
    startRepetition,
  };

  for (let repetition = 0; repetition < repetitions; repetition += 1) {
    const absoluteRepetition = startRepetition + repetition + 1;
    const usageOffset = usageEntries.length;
    const requestErrorOffset = requestErrors.length;
    const startedAt = new Map();
    const latencies = new Map();
    const round = await runChatFcZeroWriteCompatibilityTest({
      client,
      config: runtime,
      rule: builtRule.rule,
      fixtureToken: `K7-${target.marker}-${String(absoluteRepetition).padStart(2, '0')}`,
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
        validationErrorCodes: Array.isArray(row.validationErrorCodes) ? row.validationErrorCodes.slice(0, 8) : [],
        checks: row.checks && typeof row.checks === 'object' ? { ...row.checks } : {},
        latencyMs: latencies.get(row.surface) ?? null,
        usage: usageEntries[usageOffset + index] || null,
        requestError: requestErrors[requestErrorOffset + index] || null,
      });
    });
    window.__directK7CohortProgress = {
      provider: providerId,
      model: runtime.model,
      completed: samples.length,
      expected: expectedSamples,
      startRepetition,
      repetition: absoluteRepetition,
      ok: round.ok === true,
    };
    console.info('[direct-k7-cohort]', providerId, `${samples.length}/${expectedSamples}`, round.ok ? 'pass' : 'fail');
    if (!round.ok) break;
  }

  const percentile = (values, ratio) => {
    const sorted = values.filter(Number.isFinite).slice().sort((a, b) => a - b);
    if (!sorted.length) return null;
    return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1))];
  };
  const summarize = rows => {
    const count = key => rows.filter(row => row[key] === true).length;
    const latencies = rows.map(row => Number(row.latencyMs)).filter(Number.isFinite);
    const sumUsage = key => {
      const values = rows.map(row => row.usage?.[key])
        .filter(value => value !== null && value !== undefined)
        .map(Number).filter(Number.isFinite);
      return values.length ? values.reduce((sum, value) => sum + value, 0) : null;
    };
    return {
      total: rows.length,
      attempted: count('attempted'),
      providerFcAccepted: count('providerFcAccepted'),
      strictSemanticPassed: count('strictSemanticPass'),
      wouldFallback: rows.filter(row => !row.ok).length,
      strictSemanticAccuracy: rows.length ? Number((count('strictSemanticPass') / rows.length).toFixed(4)) : null,
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
    fixtureVersion: 'direct-provider-k7-candidate-cohort-v1',
    provider: providerId,
    model: runtime.model,
    endpoint: runtime.baseUrl,
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
      requestError: row.requestError,
      validationErrorCodes: row.validationErrorCodes,
      checks: row.checks,
    })),
  };
  window.__directK7CohortProgress = {
    provider: providerId,
    model: runtime.model,
    completed: samples.length,
    expected: expectedSamples,
    startRepetition,
    finished: true,
    ok: result.ok,
  };
  window.__directK7CohortResult = result;
  return result;
})()
