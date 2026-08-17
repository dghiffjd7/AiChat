// One-request transport diagnostic. It retains no model output or content values.
(async () => {
  const bridge = window.appBridge;
  const [
    { LLMClient },
    { buildProviderFcRequestPlan },
    { createProviderToolCallDeltaAccumulator },
    { buildPhoneReplyBatchProviderToolDefinition },
    { buildPhoneBatchStructuredTransportInstruction },
  ] = await Promise.all([
    import('/scripts/api/client.js'),
    import('/scripts/agent/provider-fc-transport.js'),
    import('/scripts/agent/provider-tool-call-delta-adapter.js'),
    import('/scripts/ui/chat/phone-reply-batch-ir.js'),
    import('/scripts/ui/chat/phone-batch-provider-fc.js'),
  ]);
  const profiles = bridge?.config?.getProfiles?.() || [];
  const scenario = String(window.__stageJ4SchemaScenario || 'base').trim().toLowerCase();
  const profile = profiles.find(item => (
    String(item?.name || '').trim() === '默认'
    && ['makersuite', 'gemini'].includes(String(item?.provider || '').trim().toLowerCase())
  ));
  if (!profile?.id) throw new Error('Gemini profile missing');
  const runtime = await bridge.config.getRuntimeConfigByProfileId(profile.id);
  const client = new LLMClient({ ...runtime, webSearchEnabled: false });
  const members = [{ id: 'contact:h4-a', name: '测试甲' }, { id: 'contact:h4-b', name: '测试乙' }];
  const target = {
    mode: 'group_chat',
    sessionId: 'group:h4-diagnostic',
    targetName: 'H4测试群',
    userName: '我',
    members,
    momentAuthors: members,
    tableTargets: [{ id: 'event', name: '事件', rowIds: ['event-row-h4'] }],
  };
  const capabilities = {
    momentPost: scenario === 'moment' || scenario === 'all',
    imagePrompt: scenario === 'image' || scenario === 'all',
    tableEdit: scenario === 'table' || scenario === 'all',
    variableUpdate: scenario === 'variable',
    summary: scenario === 'summary' || scenario === 'all',
  };
  const prompts = {
    base: '只提交一个 chat item：测试甲发送 text，内容含“基础通过”。',
    moment: '依序提交 chat 与 moment_post；chat 由测试甲说“动态准备”，动态由测试乙发布“动态通过”。',
    image: '依序提交 chat 与 image_prompt；chat 由测试甲说“图片准备”，图片提示词含“车站合照”。',
    table: '依序提交 chat 与 table_edit；chat 由测试甲说“表格准备”，向 event 表 insert，data.note 为“表格通过”。',
    variable: '依序提交 chat 与 variable_update；chat 由测试甲说“变量准备”，变量操作为 replace，path 为 /status，value 为 ready。',
    summary: '依序提交 chat 与 summary；chat 由测试甲说“摘要准备”，摘要内容含“摘要通过”。',
    all: '依序提交 chat、moment_post、image_prompt、table_edit、summary；分别包含“全量聊天”“全量动态”“全量图片”“全量表格”“全量摘要”。',
  };
  const requestPlan = buildProviderFcRequestPlan({
    config: runtime,
    tools: [buildPhoneReplyBatchProviderToolDefinition({
      target,
      capabilities,
      allowedItemTypes: ['text', 'sticker', 'voice', 'transfer', 'music', 'image'],
      allowedStickerKeywords: ['收到', '晚安抱抱'],
    })],
  });
  const instruction = buildPhoneBatchStructuredTransportInstruction({
    target,
    capabilities,
    allowedItemTypes: ['text', 'sticker', 'voice', 'transfer', 'music', 'image'],
    allowedStickerKeywords: ['收到', '晚安抱抱'],
  });
  let chunkCount = 0;
  let providerEventCount = 0;
  const accumulator = createProviderToolCallDeltaAccumulator({
    provider: runtime.provider,
    model: runtime.model,
  });
  const completedToolCalls = [];
  try {
    for await (const chunk of client.streamChat([
      {
        role: 'system',
        content: [
          '这是零写入 APP 手机协议受控测试。严格按用户指定的 item、顺序、身份和关键词提交，不要输出工具调用以外正文。',
          instruction,
        ].join('\n\n'),
      },
      {
        role: 'user',
        content: prompts[scenario] || prompts.base,
      },
    ], {
      ...requestPlan.generationOptions,
      ...requestPlan.requestOptions,
      maxTokens: 1400,
      max_tokens: 1400,
      onProviderToolCallDelta: (data, meta = {}) => {
        providerEventCount += 1;
        const next = accumulator.push(data, {
          provider: meta.provider || runtime.provider,
          model: meta.model || runtime.model,
        });
        completedToolCalls.push(...next.completed);
      },
    })) {
      if (typeof chunk === 'string' && chunk) chunkCount += 1;
    }
    const structures = completedToolCalls.map((call) => {
      const args = call?.arguments && typeof call.arguments === 'object' ? call.arguments : {};
      const items = Array.isArray(args.items) ? args.items : [];
      return {
        toolName: String(call?.toolName || '').slice(0, 80),
        topLevelKeys: Object.keys(args).sort(),
        itemsIsArray: Array.isArray(args.items),
        itemCount: items.length,
        items: items.slice(0, 8).map((item) => ({
          keys: item && typeof item === 'object' ? Object.keys(item).sort() : [],
          kindType: typeof item?.kind,
          kind: typeof item?.kind === 'string' ? item.kind.slice(0, 40) : null,
          messagesIsArray: Array.isArray(item?.messages),
          messageCount: Array.isArray(item?.messages) ? item.messages.length : 0,
          messages: Array.isArray(item?.messages)
            ? item.messages.slice(0, 8).map(message => ({
                keys: message && typeof message === 'object' ? Object.keys(message).sort() : [],
                type: typeof message?.type === 'string' ? message.type.slice(0, 40) : null,
              }))
            : [],
        })),
      };
    });
    accumulator.clear();
    completedToolCalls.length = 0;
    return {
      ok: true,
      scenario,
      provider: String(runtime?.provider || ''),
      model: String(runtime?.model || ''),
      chunkCount,
      providerEventCount,
      toolCallCount: structures.length,
      structures,
      rawContentRetained: false,
    };
  } catch (error) {
    accumulator.clear();
    completedToolCalls.length = 0;
    return {
      ok: false,
      scenario,
      provider: String(runtime?.provider || ''),
      model: String(runtime?.model || ''),
      code: String(error?.code || error?.name || 'request_failed').slice(0, 80),
      status: Number.isFinite(Number(error?.status)) ? Number(error.status) : null,
      message: String(error?.message || error || '').replace(/\s+/gu, ' ').slice(0, 300),
      rawContentRetained: false,
    };
  }
})()
