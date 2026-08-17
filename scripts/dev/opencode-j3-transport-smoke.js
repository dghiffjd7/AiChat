// Stage J.3 OpenCode transport smoke. Run through app-eval in the Windows dev WebView.
// It performs two paid, zero-write calls and retains no model text or tool arguments.
(async () => {
  const bridge = window.appBridge;
  if (!bridge?.config) throw new Error('Stage J.3 transport smoke requires an initialized app bridge');
  const [
    { LLMClient },
    { buildProviderFcRequestPlan },
    { createProviderToolCallDeltaAccumulator },
  ] = await Promise.all([
    import('/scripts/api/client.js'),
    import('/scripts/agent/provider-fc-transport.js'),
    import('/scripts/agent/provider-tool-call-delta-adapter.js'),
  ]);

  const trim = value => String(value ?? '').trim();
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
    model: 'glm-5.3',
    baseUrl: 'https://opencode.ai/zen/go/v1',
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
  const safeNumber = value => Number.isFinite(Number(value)) ? Number(value) : null;
  const probes = [
    {
      id: 'named_stream',
      tools: [makeTool('emit_named', 'named-ok')],
      expectedTool: 'emit_named',
      stream: true,
      prompt: 'Call emit_named exactly once with value named-ok. Output no text.',
    },
    {
      id: 'required_nonstream',
      tools: [makeTool('emit_alpha', 'alpha-ok'), makeTool('emit_beta', 'beta-ok')],
      expectedTool: 'emit_beta',
      stream: false,
      prompt: 'Call emit_beta exactly once with value beta-ok. Do not call emit_alpha. Output no text.',
    },
  ];
  const rows = [];

  for (const probe of probes) {
    const plan = buildProviderFcRequestPlan({
      config: runtime,
      tools: probe.tools,
      thinkingEnabled: false,
      temperature: 0,
    });
    if (!plan.ok) throw new Error(`OpenCode plan failed: ${plan.reason}`);
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
    const args = call?.arguments;
    const expectedValue = probe.expectedTool === 'emit_beta' ? 'beta-ok' : 'named-ok';
    const pass = completed.length === 1
      && trim(call?.toolName) === probe.expectedTool
      && args?.value === expectedValue
      && responseChars === 0
      && (!probe.stream || argumentDeltaCount > 0);
    rows.push({
      id: probe.id,
      stream: probe.stream,
      planToolChoice: typeof plan.requestOptions.tool_choice === 'string'
        ? plan.requestOptions.tool_choice
        : trim(plan.requestOptions.tool_choice?.function?.name),
      parallelToolCalls: plan.requestOptions.parallel_tool_calls,
      usesResponsesApi: Object.hasOwn(plan.requestOptions, 'openaiApi'),
      completedToolCalls: completed.length,
      selectedExpectedTool: trim(call?.toolName) === probe.expectedTool,
      argumentsValid: args?.value === expectedValue,
      responseChars,
      argumentDeltaCount,
      promptTokens: safeNumber(usage?.promptTokens),
      completionTokens: safeNumber(usage?.completionTokens),
      totalTokens: safeNumber(usage?.totalTokens),
      finishReason: trim(usage?.finishReason),
      responseIdPresent: Boolean(trim(usage?.responseId)),
      latencyMs: Math.round(performance.now() - startedAt),
      pass,
    });
  }

  return {
    fixtureVersion: 'opencode-j3-transport-v1',
    configuredFrom: trim(profile.provider).toLowerCase(),
    provider: runtime.provider,
    model: runtime.model,
    paidCallUpperBound: probes.length,
    persistentWrites: 0,
    rawTextRetained: false,
    toolArgumentsRetained: false,
    passed: rows.filter(row => row.pass).length,
    total: rows.length,
    rows,
  };
})()
