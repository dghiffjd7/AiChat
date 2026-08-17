// Stage J.5 OpenRouter free-model transport probe. No business writes or retained content.
(async () => {
  const bridge = window.appBridge;
  const [
    { LLMClient },
    { buildProviderFcRequestPlan },
    { createProviderToolCallDeltaAccumulator },
    { buildPrivateReplyProviderToolDefinition },
    { buildPhoneReplyBatchProviderToolDefinition },
  ] = await Promise.all([
    import('/scripts/api/client.js'),
    import('/scripts/agent/provider-fc-transport.js'),
    import('/scripts/agent/provider-tool-call-delta-adapter.js'),
    import('/scripts/ui/chat/phone-reply-ir.js'),
    import('/scripts/ui/chat/phone-reply-batch-ir.js'),
  ]);
  const trim = value => String(value ?? '').trim();
  const profile = (bridge?.config?.getProfiles?.() || []).find(item => (
    trim(item?.provider).toLowerCase() === 'openrouter'
  ));
  if (!profile?.id) throw new Error('OpenRouter profile missing');
  const sourceRuntime = await bridge.config.getRuntimeConfigByProfileId(profile.id);
  const probeModel = trim(window.__stageJ5OpenRouterModel) || 'google/gemini-3.7-flash';
  const runtime = {
    ...sourceRuntime,
    provider: 'openrouter',
    model: probeModel,
    baseUrl: 'https://openrouter.ai/api/v1',
    connectionMode: 'direct',
    proxyBaseUrl: '',
    webSearchEnabled: false,
  };
  const client = new LLMClient(runtime);
  const capabilities = await client.prepareProviderFcCapabilities();
  const probeTool = {
    type: 'function',
    function: {
      name: 'emit_probe',
      description: 'Submit the exact probe value.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: { value: { type: 'string', enum: ['openrouter-ok'] } },
        required: ['value'],
      },
    },
  };
  const phoneSchema = window.__stageJ5OpenRouterPhoneSchema === true;
  const batchSchema = window.__stageJ5OpenRouterBatchSchema === true;
  const tool = batchSchema
    ? buildPhoneReplyBatchProviderToolDefinition({
        target: {
          mode: 'private_chat',
          sessionId: 'contact:j5',
          targetName: '测试甲',
          speakerId: 'contact:j5',
          speakerName: '测试甲',
          momentAuthors: [{ id: 'contact:j5', name: '测试甲' }],
        },
        capabilities: {},
        allowedItemTypes: ['text', 'sticker', 'voice', 'transfer', 'music', 'image'],
        allowedStickerKeywords: ['收到', '晚安抱抱'],
      })
    : (phoneSchema
    ? buildPrivateReplyProviderToolDefinition({
        allowedItemTypes: ['text', 'sticker', 'voice', 'transfer', 'music', 'image'],
        allowedStickerKeywords: ['收到', '晚安抱抱'],
      })
    : probeTool);
  const plan = buildProviderFcRequestPlan({
    config: runtime,
    tools: [tool],
    thinkingEnabled: false,
    temperature: 0,
  });
  if (!plan.ok) return { ok: false, phase: 'plan', reason: plan.reason, capabilities };
  const accumulator = createProviderToolCallDeltaAccumulator({
    provider: runtime.provider,
    model: runtime.model,
  });
  const completed = [];
  let responseChars = 0;
  let argumentDeltaCount = 0;
  let usage = null;
  const startedAt = performance.now();
  try {
    for await (const chunk of client.streamChat([
      { role: 'system', content: 'Call the requested function exactly once and output no text.' },
      {
        role: 'user',
        content: batchSchema
          ? 'Call emit_phone_batch with one chat item containing voice 马上到 then sticker 收到.'
          : phoneSchema
          ? 'Call emit_private_reply with two messages: voice content 马上到, then sticker content 收到.'
          : 'Call emit_probe with value openrouter-ok.',
      },
    ], {
      ...plan.generationOptions,
      ...plan.requestOptions,
      maxTokens: 256,
      max_tokens: 256,
      onProviderUsage: value => { usage = value; },
      onProviderToolCallDelta: (data, meta = {}) => {
        const next = accumulator.push(data, {
          provider: meta.provider || runtime.provider,
          model: meta.model || runtime.model,
        });
        argumentDeltaCount += next.deltas.filter(delta => trim(delta?.argumentsDelta)).length;
        completed.push(...next.completed);
      },
    })) {
      if (typeof chunk === 'string') responseChars += chunk.length;
    }
    const call = completed[0] || {};
    const expectedToolName = batchSchema
      ? 'emit_phone_batch'
      : (phoneSchema ? 'emit_private_reply' : 'emit_probe');
    const argumentsValid = batchSchema
      ? Array.isArray(call.arguments?.items) && call.arguments.items.length === 1
      : phoneSchema
      ? Array.isArray(call.arguments?.messages) && call.arguments.messages.length === 2
      : call.arguments?.value === 'openrouter-ok';
    return {
      ok: completed.length === 1
        && trim(call.toolName) === expectedToolName
        && argumentsValid
        && responseChars === 0,
      phase: 'request',
      provider: runtime.provider,
      model: runtime.model,
      requireParameters: plan.requestOptions.provider?.require_parameters === true,
      parallelToolCalls: plan.requestOptions.parallel_tool_calls,
      toolCallCount: completed.length,
      phoneSchema,
      batchSchema,
      expectedTool: trim(call.toolName) === expectedToolName,
      argumentsValid,
      responseChars,
      argumentDeltaCount,
      promptTokens: Number.isFinite(Number(usage?.promptTokens)) ? Number(usage.promptTokens) : null,
      completionTokens: Number.isFinite(Number(usage?.completionTokens)) ? Number(usage.completionTokens) : null,
      responseIdPresent: Boolean(trim(usage?.responseId)),
      routedProvider: trim(usage?.routedProvider),
      responseModel: trim(usage?.responseModel),
      latencyMs: Math.round(performance.now() - startedAt),
      persistentWrites: 0,
      rawContentRetained: false,
    };
  } catch (error) {
    let providerDetail = '';
    try {
      const payload = JSON.parse(String(error?.response || '{}'));
      providerDetail = trim(
        payload?.error?.metadata?.raw
        || payload?.error?.metadata?.error
        || payload?.error?.detail,
      ).replace(/\s+/gu, ' ').slice(0, 500);
    } catch {}
    return {
      ok: false,
      phase: 'request',
      provider: runtime.provider,
      model: runtime.model,
      status: Number.isFinite(Number(error?.status)) ? Number(error.status) : null,
      code: trim(error?.code || error?.name, 'request_failed').slice(0, 80),
      message: trim(error?.message || error).replace(/\s+/gu, ' ').slice(0, 500),
      providerDetail,
      persistentWrites: 0,
      rawContentRetained: false,
    };
  }
})()
