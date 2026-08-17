// Stage L official-channel candidate release cohort.
// Tests an UNSEEDED model on an already-verified official transport before
// promoting it into the bundled FC catalog. Run through app-eval after setting:
//   window.__lCandidateProvider = 'deepseek' | 'openai' | 'anthropic' | 'makersuite';
//   window.__lCandidateModel = 'deepseek-v4-pro';
//   window.__lCandidateRepetitions = 10;           // 1..10, x3 surfaces per repetition
//   window.__lCandidateStartRepetition = 0;        // optional resume offset
// Each repetition runs private/group/moment zero-write fixtures and stops on failure.
// No business tool is executed, no store is written, and model text/tool arguments
// are reduced to aggregate checks before the result is retained.
(async () => {
  const bridge = window.appBridge;
  if (!bridge?.config) throw new Error('Stage L candidate cohort requires an initialized app bridge');
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
    deepseek: {
      profileProviders: ['deepseek'],
      officialBaseUrls: ['https://api.deepseek.com/v1', 'https://api.deepseek.com'],
    },
    openai: {
      profileProviders: ['openai'],
      officialBaseUrls: ['https://api.openai.com/v1'],
    },
    anthropic: {
      profileProviders: ['anthropic'],
      officialBaseUrls: ['https://api.anthropic.com/v1', 'https://api.anthropic.com'],
    },
    makersuite: {
      profileProviders: ['makersuite', 'gemini'],
      officialBaseUrls: ['', 'https://generativelanguage.googleapis.com'],
    },
  };
  const providerId = trim(window.__lCandidateProvider).toLowerCase();
  const target = targets[providerId];
  if (!target) throw new Error('Set __lCandidateProvider to deepseek/openai/anthropic/makersuite');
  const model = trim(window.__lCandidateModel);
  if (!model) throw new Error('Set __lCandidateModel to the candidate model id');

  const maxRepetitions = 10;
  const startRepetition = Math.max(0, Math.min(
    maxRepetitions - 1,
    Math.trunc(Number(window.__lCandidateStartRepetition) || 0),
  ));
  const repetitions = Math.max(1, Math.min(
    maxRepetitions - startRepetition,
    Math.trunc(Number(window.__lCandidateRepetitions) || maxRepetitions),
  ));
  const expectedSamples = repetitions * 3;

  const profiles = bridge.config.getProfiles?.() || [];
  const profile = profiles.find(item => target.profileProviders.includes(trim(item?.provider).toLowerCase()));
  if (!profile?.id) throw new Error(`Stage L ${providerId} profile missing`);
  const sourceRuntime = await bridge.config.getRuntimeConfigByProfileId(profile.id);
  if (!trim(sourceRuntime?.apiKey)) throw new Error(`Stage L ${providerId} API key missing`);
  const normalizedBaseUrl = trim(sourceRuntime?.baseUrl).replace(/\/+$/u, '');
  if (!target.officialBaseUrls.includes(normalizedBaseUrl)) {
    throw new Error(`Stage L ${providerId} profile endpoint is not the expected official base URL`);
  }
  // 保留原档的 connectionMode/proxyBaseUrl（J.7 教训：Claude 档强改 direct 会在模型前失败）。
  const runtime = {
    ...sourceRuntime,
    provider: providerId,
    model,
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
    name: `Stage L ${providerId} ${runtime.model}`,
  });
  if (!builtRule.ok) throw new Error(`Stage L local rule invalid: ${builtRule.reason}`);

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
          name: trim(error?.name || 'Error').slice(0, 40),
          code: trim(error?.code).slice(0, 80),
          status: Number.isFinite(Number(error?.status)) ? Number(error.status) : null,
        });
        throw error;
      }
    },
  };

  const marker = model.toUpperCase().replace(/[^A-Z0-9]+/gu, '-').slice(0, 24);
  const samples = [];
  let modelCallsMade = 0;
  window.__lCandidateCohortProgress = {
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
      fixtureToken: `L-${marker}-${String(absoluteRepetition).padStart(2, '0')}`,
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
    window.__lCandidateCohortProgress = {
      provider: providerId,
      model: runtime.model,
      completed: samples.length,
      expected: expectedSamples,
      startRepetition,
      repetition: absoluteRepetition,
      ok: round.ok === true,
    };
    console.info('[stage-l-candidate]', providerId, runtime.model, `${samples.length}/${expectedSamples}`, round.ok ? 'pass' : 'fail');
    if (!round.ok) break;
  }

  const percentile = (values, ratio) => {
    const sorted = values.filter(Number.isFinite).slice().sort((a, b) => a - b);
    if (!sorted.length) return null;
    return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1))];
  };
  const summarize = rows => {
    const count = key => rows.filter(row => row[key] === true).length;
    const rowLatencies = rows.map(row => Number(row.latencyMs)).filter(Number.isFinite);
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
      averageLatencyMs: rowLatencies.length
        ? Math.round(rowLatencies.reduce((sum, value) => sum + value, 0) / rowLatencies.length)
        : null,
      p50LatencyMs: percentile(rowLatencies, 0.5),
      p95LatencyMs: percentile(rowLatencies, 0.95),
      promptTokens: sumUsage('promptTokens'),
      completionTokens: sumUsage('completionTokens'),
      totalTokens: sumUsage('totalTokens'),
    };
  };
  const surfaces = ['private_chat', 'group_chat', 'moment_comment'];
  const result = {
    fixtureVersion: 'provider-l-official-candidate-cohort-v1',
    provider: providerId,
    model: runtime.model,
    endpoint: normalizedBaseUrl || '(provider default)',
    startRepetition,
    repetitionsPerSurface: repetitions,
    modelCallUpperBound: expectedSamples,
    modelCallsMade,
    persistentWrites: 0,
    rawTextRetained: false,
    overall: summarize(samples),
    bySurface: Object.fromEntries(
      surfaces.map(surface => [surface, summarize(samples.filter(row => row.surface === surface))]),
    ),
    samples,
  };
  window.__lCandidateCohortResult = result;
  console.info('[stage-l-candidate] done', JSON.stringify(result.overall));
  return result;
})()
