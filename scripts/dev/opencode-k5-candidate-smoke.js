// Stage K.5 OpenCode candidate preflight and transport probe.
// Run through app-eval in the Windows dev WebView. The catalog is checked first;
// only an exact match may make at most two paid, zero-write model calls.
(async () => {
  const bridge = window.appBridge;
  if (!bridge?.config) throw new Error('Stage K.5 candidate smoke requires an initialized app bridge');
  const [
    { LLMClient },
    { buildProviderFcRequestPlan },
    { createProviderToolCallDeltaAccumulator },
    { buildChatFcLocalRuleFromProfile },
    { isOpenCodeGoChatCompletionsModel, OPENCODE_GO_BASE_URL },
  ] = await Promise.all([
    import('/scripts/api/client.js'),
    import('/scripts/agent/provider-fc-transport.js'),
    import('/scripts/agent/provider-tool-call-delta-adapter.js'),
    import('/scripts/agent/chat-fc-local-capability-rules.js'),
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
  };
  const client = new LLMClient(runtime);
  const makeTool = (name, value) => ({
    type: 'function',
    function: {
      name,
      description: `Submit the exact value ${value}.`,
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: { value: { type: 'string', enum: [value] } },
        required: ['value'],
      },
    },
  });
  const probes = [
    {
      id: 'named_stream',
      tools: [makeTool('emit_named', 'named-ok')],
      expectedTool: 'emit_named',
      expectedValue: 'named-ok',
      stream: true,
      prompt: 'Call emit_named exactly once with value named-ok. Output no text.',
    },
    {
      id: 'required_nonstream',
      tools: [makeTool('emit_alpha', 'alpha-ok'), makeTool('emit_beta', 'beta-ok')],
      expectedTool: 'emit_beta',
      expectedValue: 'beta-ok',
      stream: false,
      prompt: 'Call emit_beta exactly once with value beta-ok. Do not call emit_alpha. Output no text.',
    },
  ];
  const rows = [];
  let paidCallsMade = 0;
  let catalogStatus = 'available';
  let catalogExactMatch = false;
  let catalogModelCount = 0;
  let catalogIssueCode = '';

  const safeNumber = value => Number.isFinite(Number(value)) ? Number(value) : null;
  const safeIssueCode = (error, fallback = 'request_failed') => {
    const status = Number(error?.status);
    if (Number.isFinite(status) && status > 0) return `http_${Math.trunc(status)}`;
    const code = trim(error?.code || error?.name).toLowerCase();
    return /^[a-z0-9_.:-]{1,80}$/u.test(code) ? code : fallback;
  };
  const buildResult = (extra = {}) => ({
    fixtureVersion: 'opencode-k5-candidate-transport-v1',
    configuredFrom: trim(profile.provider).toLowerCase(),
    provider: runtime.provider,
    model: runtime.model,
    catalogStatus,
    catalogExactMatch,
    catalogModelCount,
    catalogIssueCode,
    paidCallUpperBound: probes.length,
    paidCallsMade,
    persistentWrites: 0,
    rawTextRetained: false,
    toolArgumentsRetained: false,
    passed: rows.filter(row => row.pass).length,
    total: rows.length,
    stoppedEarly: rows.length < probes.length,
    ok: catalogExactMatch
      && rows.length === probes.length
      && rows.every(row => row.pass === true),
    rows,
    ...extra,
  });

  const matrixCatalogModels = Array.isArray(window.__opencodeK5MatrixCatalogModels)
    ? [...new Set(window.__opencodeK5MatrixCatalogModels.map(item => trim(item).toLowerCase()).filter(Boolean))]
    : [];
  if (matrixCatalogModels.length) {
    catalogStatus = 'matrix_snapshot';
    catalogModelCount = matrixCatalogModels.length;
    catalogExactMatch = matrixCatalogModels.includes(candidateModel);
  } else {
    try {
      const data = await client.provider.requestJson({
        url: `${client.provider.baseUrl}/models`,
        method: 'GET',
        headers: client.provider.getHeaders(),
      });
      const catalog = Array.isArray(data?.data)
        ? data.data
        : Array.isArray(data)
          ? data
          : [];
      const modelIds = catalog
        .map(item => trim(item?.id || item?.name || item).toLowerCase())
        .filter(Boolean);
      catalogModelCount = new Set(modelIds).size;
      catalogExactMatch = modelIds.includes(candidateModel);
    } catch (error) {
      catalogStatus = 'unavailable';
      catalogIssueCode = safeIssueCode(error, 'catalog_request_failed');
    }
  }
  if (!catalogExactMatch) return buildResult({ eligibleForPaidProbe: false });

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
  if (!builtRule.ok) {
    return buildResult({
      eligibleForPaidProbe: false,
      ruleIssueCode: trim(builtRule.reason).slice(0, 80),
    });
  }
  const localRule = builtRule.rule;

  for (const probe of probes) {
    const plan = buildProviderFcRequestPlan({
      config: runtime,
      tools: probe.tools,
      thinkingEnabled: false,
      temperature: 0,
      localRuleOverride: localRule,
    });
    let row;
    if (!plan.ok) {
      row = {
        id: probe.id,
        stream: probe.stream,
        requestMade: false,
        issueCodes: [trim(plan.reason, 'provider_fc_plan_failed').slice(0, 80)],
        pass: false,
      };
    } else {
      const accumulator = createProviderToolCallDeltaAccumulator({
        provider: runtime.provider,
        model: runtime.model,
      });
      const completed = [];
      let responseChars = 0;
      let argumentDeltaCount = 0;
      let usage = null;
      const options = {
        ...plan.generationOptions,
        ...plan.requestOptions,
        maxTokens: 512,
        max_tokens: 512,
        onProviderUsage: value => { usage = value; },
        onProviderToolCallDelta: (data, meta = {}) => {
          const next = accumulator.push(data, {
            provider: meta.provider || runtime.provider,
            model: meta.model || runtime.model,
          });
          argumentDeltaCount += next.deltas.filter(delta => trim(delta?.argumentsDelta)).length;
          completed.push(...next.completed);
        },
      };
      const startedAt = performance.now();
      paidCallsMade += 1;
      try {
        if (probe.stream) {
          for await (const chunk of client.streamChat([
            { role: 'system', content: 'This is a protocol smoke. Obey the requested tool call exactly.' },
            { role: 'user', content: probe.prompt },
          ], options)) {
            if (typeof chunk === 'string') responseChars += chunk.length;
          }
        } else {
          const text = await client.chat([
            { role: 'system', content: 'This is a protocol smoke. Obey the requested tool call exactly.' },
            { role: 'user', content: probe.prompt },
          ], options);
          responseChars = String(text || '').length;
        }
        const call = completed[0] || null;
        const selectedExpectedTool = trim(call?.toolName) === probe.expectedTool;
        const argumentsValid = call?.arguments?.value === probe.expectedValue;
        const pass = completed.length === 1
          && selectedExpectedTool
          && argumentsValid
          && responseChars === 0
          && (!probe.stream || argumentDeltaCount > 0);
        row = {
          id: probe.id,
          stream: probe.stream,
          requestMade: true,
          planToolChoice: typeof plan.requestOptions.tool_choice === 'string'
            ? plan.requestOptions.tool_choice
            : trim(plan.requestOptions.tool_choice?.function?.name),
          parallelToolCalls: plan.requestOptions.parallel_tool_calls,
          usesResponsesApi: Object.hasOwn(plan.requestOptions, 'openaiApi'),
          completedToolCalls: completed.length,
          selectedExpectedTool,
          argumentsValid,
          responseChars,
          argumentDeltaCount,
          promptTokens: safeNumber(usage?.promptTokens),
          completionTokens: safeNumber(usage?.completionTokens),
          totalTokens: safeNumber(usage?.totalTokens),
          finishReason: trim(usage?.finishReason).slice(0, 40),
          responseIdPresent: Boolean(trim(usage?.responseId)),
          latencyMs: Math.round(performance.now() - startedAt),
          issueCodes: pass ? [] : ['transport_contract_failed'],
          pass,
        };
      } catch (error) {
        row = {
          id: probe.id,
          stream: probe.stream,
          requestMade: true,
          issueCodes: [safeIssueCode(error)],
          latencyMs: Math.round(performance.now() - startedAt),
          pass: false,
        };
      }
    }
    rows.push(row);
    if (!row.pass) break;
  }

  return buildResult({ eligibleForPaidProbe: true });
})()
