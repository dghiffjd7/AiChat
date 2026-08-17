// Stage K.7 direct-provider candidate transport probe.
// Run through app-eval after setting window.__directK7Provider to kimi or zhipu.
// It checks the exact official endpoint/catalog first, then makes at most two
// paid zero-write calls (streaming single tool + non-streaming tool selection).
(async () => {
  const bridge = window.appBridge;
  if (!bridge?.config) throw new Error('Stage K.7 candidate smoke requires an initialized app bridge');
  const [
    { LLMClient },
    { buildProviderFcRequestPlan },
    { createProviderToolCallDeltaAccumulator },
    { buildChatFcLocalRuleFromProfile },
  ] = await Promise.all([
    import('/scripts/api/client.js'),
    import('/scripts/agent/provider-fc-transport.js'),
    import('/scripts/agent/provider-tool-call-delta-adapter.js'),
    import('/scripts/agent/chat-fc-local-capability-rules.js'),
  ]);

  const trim = value => String(value ?? '').trim();
  const targets = {
    kimi: {
      model: 'kimi-k3',
      baseUrl: 'https://api.moonshot.ai/v1',
    },
    zhipu: {
      model: 'glm-5.2',
      baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    },
  };
  const providerId = trim(window.__directK7Provider).toLowerCase();
  const target = targets[providerId];
  if (!target) throw new Error('Set __directK7Provider to kimi or zhipu');

  const profiles = bridge.config.getProfiles?.() || [];
  const profile = profiles.find(item => trim(item?.provider).toLowerCase() === providerId);
  if (!profile?.id) throw new Error(`Stage K.7 ${providerId} profile missing`);
  const sourceRuntime = await bridge.config.getRuntimeConfigByProfileId(profile.id);
  if (!trim(sourceRuntime?.apiKey)) throw new Error(`Stage K.7 ${providerId} API key missing`);
  const runtime = {
    ...sourceRuntime,
    provider: providerId,
    model: target.model,
    baseUrl: target.baseUrl,
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
      id: 'single_stream',
      tools: [makeTool('emit_named', 'named-ok')],
      expectedTool: 'emit_named',
      expectedValue: 'named-ok',
      stream: true,
      prompt: 'Call emit_named exactly once with value named-ok. Output no text.',
    },
    {
      id: 'multi_auto_nonstream',
      tools: [makeTool('emit_alpha', 'alpha-ok'), makeTool('emit_beta', 'beta-ok')],
      expectedTool: 'emit_beta',
      expectedValue: 'beta-ok',
      stream: false,
      prompt: 'Call emit_beta exactly once with value beta-ok. Do not call emit_alpha. Output no text.',
    },
  ];
  const rows = [];
  let paidCallsMade = 0;
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
    fixtureVersion: 'direct-provider-k7-transport-v1',
    provider: providerId,
    model: runtime.model,
    endpointExactMatch: trim(sourceRuntime?.baseUrl).replace(/\/+$/u, '') === target.baseUrl,
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
    ok: catalogExactMatch && rows.length === probes.length && rows.every(row => row.pass === true),
    rows,
    ...extra,
  });

  if (trim(sourceRuntime?.baseUrl).replace(/\/+$/u, '') !== target.baseUrl) {
    return buildResult({ eligibleForPaidProbe: false, reason: 'profile_endpoint_mismatch' });
  }
  try {
    const data = await client.provider.requestJson({
      url: `${client.provider.baseUrl}/models`,
      method: 'GET',
      headers: client.provider.getHeaders(),
    });
    const catalog = Array.isArray(data?.data) ? data.data : (Array.isArray(data) ? data : []);
    const ids = catalog.map(item => trim(item?.id || item?.name || item).toLowerCase()).filter(Boolean);
    catalogModelCount = new Set(ids).size;
    catalogExactMatch = ids.includes(target.model);
  } catch (error) {
    catalogIssueCode = safeIssueCode(error, 'catalog_request_failed');
  }
  if (!catalogExactMatch) return buildResult({ eligibleForPaidProbe: false });

  const builtRule = buildChatFcLocalRuleFromProfile({
    ...profile,
    provider: runtime.provider,
    baseUrl: runtime.baseUrl,
    model: runtime.model,
  }, {
    enabled: false,
    name: `Stage K.7 ${providerId} ${runtime.model}`,
  });
  if (!builtRule.ok) {
    return buildResult({ eligibleForPaidProbe: false, ruleIssueCode: trim(builtRule.reason).slice(0, 80) });
  }

  for (const probe of probes) {
    const plan = buildProviderFcRequestPlan({
      config: runtime,
      tools: probe.tools,
      thinkingEnabled: false,
      temperature: 0,
      localRuleOverride: builtRule.rule,
    });
    if (!plan.ok) {
      rows.push({
        id: probe.id,
        stream: probe.stream,
        requestMade: false,
        issueCodes: [trim(plan.reason || 'provider_fc_plan_failed').slice(0, 80)],
        pass: false,
      });
      break;
    }
    const accumulator = createProviderToolCallDeltaAccumulator({ provider: providerId, model: runtime.model });
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
          provider: meta.provider || providerId,
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
      rows.push({
        id: probe.id,
        stream: probe.stream,
        requestMade: true,
        planToolChoice: plan.requestOptions.tool_choice,
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
      });
    } catch (error) {
      rows.push({
        id: probe.id,
        stream: probe.stream,
        requestMade: true,
        issueCodes: [safeIssueCode(error)],
        latencyMs: Math.round(performance.now() - startedAt),
        pass: false,
      });
    }
    if (!rows.at(-1)?.pass) break;
  }
  return buildResult({ eligibleForPaidProbe: true });
})()
