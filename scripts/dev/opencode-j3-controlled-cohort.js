// Stage J.3 OpenCode FC cohort. Run through app-eval in the Windows dev WebView.
// Eight paid calls, no stores or business tools, and no model text/arguments in the report.
(async () => {
  const bridge = window.appBridge;
  if (!bridge?.config) throw new Error('Stage J.3 cohort requires an initialized app bridge');
  const [
    { LLMClient },
    { createProviderToolCallDeltaAccumulator },
    { runPrivateChatProviderFcAttempt },
    { buildPhoneBatchStructuredTransportInstruction, runPhoneBatchProviderFcAttempt },
  ] = await Promise.all([
    import('/scripts/api/client.js'),
    import('/scripts/agent/provider-tool-call-delta-adapter.js'),
    import('/scripts/ui/chat/private-chat-provider-fc.js'),
    import('/scripts/ui/chat/phone-batch-provider-fc.js'),
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
  const realClient = new LLMClient(runtime);
  let lastToolArgumentShape = null;
  const captureArgumentShape = (args) => {
    const items = Array.isArray(args?.items) ? args.items : [];
    lastToolArgumentShape = {
      rootKeys: args && typeof args === 'object' ? Object.keys(args).sort() : [],
      items: items.slice(0, 12).map(item => ({
        kind: trim(item?.kind),
        keys: item && typeof item === 'object' ? Object.keys(item).sort() : [],
        messageKeys: (Array.isArray(item?.messages) ? item.messages : [])
          .slice(0, 12)
          .map(message => Object.keys(message || {}).sort()),
        postKeys: (Array.isArray(item?.posts) ? item.posts : [])
          .slice(0, 3)
          .map(post => Object.keys(post || {}).sort()),
      })),
    };
  };
  const wrapOptionsForShape = (options = {}) => {
    const accumulator = createProviderToolCallDeltaAccumulator({
      provider: runtime.provider,
      model: runtime.model,
    });
    const original = options.onProviderToolCallDelta;
    return {
      ...options,
      onProviderToolCallDelta: (data, meta = {}) => {
        const next = accumulator.push(data, {
          provider: meta.provider || runtime.provider,
          model: meta.model || runtime.model,
        });
        next.completed.forEach(call => captureArgumentShape(call?.arguments));
        original?.(data, meta);
      },
    };
  };
  const client = {
    chat: (messages, options) => realClient.chat(messages, wrapOptionsForShape(options)),
    streamChat: (messages, options) => realClient.streamChat(messages, wrapOptionsForShape(options)),
  };
  const contextFor = surface => ({
    uiMode: surface === 'moment_comment' ? 'moments' : 'chat',
    surface,
    responseTarget: 'assistant',
    usesBuiltinFormat: true,
    usesDefaultPreset: true,
    compatibilityModeEnabled: false,
    protocolParserEnabled: true,
    hasUnsupportedSideEffects: false,
    assistantContinuation: false,
    webSearchEnabled: false,
    hasProviderTools: false,
    hasAssistantPrefill: false,
    formatProfileEnabled: false,
  });
  const members = Object.freeze([
    { id: 'contact:j3-a', name: '测试甲' },
    { id: 'contact:j3-b', name: '测试乙' },
  ]);
  const privateTarget = Object.freeze({
    sessionId: 'contact:j3-a',
    targetName: '测试甲',
    speakerId: 'contact:j3-a',
    speakerName: '测试甲',
    userName: '我',
  });
  const groupTarget = Object.freeze({
    mode: 'group_chat',
    sessionId: 'group:j3',
    targetName: 'J3测试群',
    userName: '我',
    members,
    momentAuthors: members,
    tableTargets: [{ id: 'event', name: '事件', rowIds: [] }],
  });
  const momentTarget = Object.freeze({
    mode: 'moment_comment',
    sessionId: 'contact:j3-a',
    targetName: 'J3测试动态',
    userName: '我',
    momentId: 'moment:j3',
    momentAuthors: members,
    privateTargets: members,
    groupTargets: [{ id: 'group:j3', name: 'J3测试群', members }],
    tableTargets: [],
  });
  const fixtureFilter = trim(window.__opencodeJ3FixtureFilter).toLowerCase();
  const privateFixtures = [
    { id: 'private_short', marker: 'J3-甲', stream: false },
    { id: 'private_stream_a', marker: 'J3-乙', stream: true },
    { id: 'private_second', marker: 'J3-丙', stream: false },
    { id: 'private_stream_b', marker: 'J3-丁', stream: true },
  ].filter(fixture => !fixtureFilter || fixture.id === fixtureFilter);
  const batchFixtures = [
    {
      id: 'batch_group_one', stream: false, target: groupTarget, capabilities: {},
      expectedKinds: ['chat'], markers: ['J3-群甲'],
      prompt: '只提交一个 chat item，由测试甲发送一条 text，内容必须包含“J3-群甲”。',
    },
    {
      id: 'batch_group_two_stream', stream: true, target: groupTarget, capabilities: {},
      expectedKinds: ['chat'], markers: ['J3-群乙', 'J3-群丙'],
      prompt: '只提交一个 chat item：测试甲先说“J3-群乙”，测试乙再说“J3-群丙”，各一条 text。',
    },
    {
      id: 'batch_moment', stream: false, target: momentTarget, capabilities: {},
      expectedKinds: ['moment_comment'], markers: ['J3-动态'],
      prompt: '只提交一个 moment_comment item，由测试甲评论，内容必须包含“J3-动态”。',
    },
    {
      id: 'batch_ordered_stream', stream: true, target: groupTarget,
      capabilities: { momentPost: true, summary: true },
      expectedKinds: ['chat', 'moment_post', 'summary'], markers: ['J3-完成', 'J3-动态完成'],
      prompt: '严格依序提交：chat（测试甲说“J3-完成”）、moment_post（测试乙发布“J3-动态完成”）、summary（含“J3-完成”）。',
    },
  ].filter(fixture => !fixtureFilter || fixture.id === fixtureFilter);
  const rows = [];
  const semanticText = ir => (Array.isArray(ir?.items) ? ir.items : []).flatMap(item => [
    ...(Array.isArray(item?.messages) ? item.messages.map(message => message?.content) : []),
    ...(Array.isArray(item?.posts) ? item.posts.map(post => post?.content) : []),
    ...(Array.isArray(item?.comments) ? item.comments.map(comment => comment?.content) : []),
    item?.content,
  ]).map(value => String(value || '')).join('\n');
  const sameOrder = (actual, expected) => (
    actual.length === expected.length && actual.every((value, index) => value === expected[index])
  );
  const usageSummary = entries => {
    const last = entries.at(-1) || {};
    const number = value => Number.isFinite(Number(value)) ? Number(value) : null;
    return {
      promptTokens: number(last.promptTokens),
      completionTokens: number(last.completionTokens),
      totalTokens: number(last.totalTokens),
      provider: trim(last.provider),
      model: trim(last.model),
      finishReason: trim(last.finishReason),
      responseIdPresent: Boolean(trim(last.responseId)),
      latencyMs: number(last.latencyMs),
    };
  };
  const safeCode = error => trim(error?.code || error?.name, 'request_failed').slice(0, 80);

  for (const fixture of privateFixtures) {
    lastToolArgumentShape = null;
    const usage = [];
    const startedAt = performance.now();
    let firstDeltaAt = 0;
    try {
      const result = await runPrivateChatProviderFcAttempt({
        client,
        config: runtime,
        messages: [
          { role: 'system', content: '只通过唯一工具回复；不要输出额外正文。' },
          { role: 'user', content: `只发送一条 text 私聊消息，内容必须包含“${fixture.marker}”。` },
        ],
        context: contextFor('private_chat'),
        target: privateTarget,
        temperature: 0,
        maxTokens: 700,
        streamPreviewEnabled: fixture.stream,
        onStructuredPreview: () => {},
        onFirstProviderDelta: () => { if (!firstDeltaAt) firstDeltaAt = performance.now(); },
        onModelUsage: entry => usage.push(entry),
      });
      const text = semanticText(result?.ir);
      const pass = result?.ok === true
        && result?.ir?.target?.sessionId === privateTarget.sessionId
        && text.includes(fixture.marker)
        && Number(result?.diagnostics?.toolCallCount || 0) === 1
        && Number(result?.diagnostics?.responseChars || 0) === 0
        && (!fixture.stream || firstDeltaAt > 0);
      rows.push({
        id: fixture.id,
        surface: 'private_chat',
        stream: fixture.stream,
        pass,
        issueCodes: result?.ok
          ? []
          : [
              trim(result?.reason, 'provider_fc_failed'),
              ...(Array.isArray(result?.diagnostics?.validationErrorCodes)
                ? result.diagnostics.validationErrorCodes
                : []),
            ],
        exactOneToolCall: Number(result?.diagnostics?.toolCallCount || 0) === 1,
        noExtraText: Number(result?.diagnostics?.responseChars || 0) === 0,
        targetCorrect: result?.ir?.target?.sessionId === privateTarget.sessionId,
        markerPresent: text.includes(fixture.marker),
        firstMeaningfulDeltaLatencyMs: firstDeltaAt ? Math.round(firstDeltaAt - startedAt) : null,
        totalLatencyMs: Math.round(performance.now() - startedAt),
        usage: usageSummary(usage),
        ...(pass ? {} : { toolArgumentShape: lastToolArgumentShape }),
      });
    } catch (error) {
      rows.push({ id: fixture.id, surface: 'private_chat', stream: fixture.stream, pass: false, issueCodes: [safeCode(error)] });
    }
  }

  for (const fixture of batchFixtures) {
    lastToolArgumentShape = null;
    const usage = [];
    const startedAt = performance.now();
    let firstDeltaAt = 0;
    try {
      const instruction = buildPhoneBatchStructuredTransportInstruction({
        target: fixture.target,
        capabilities: fixture.capabilities,
      });
      const result = await runPhoneBatchProviderFcAttempt({
        client,
        config: runtime,
        messages: [
          { role: 'system', content: `只通过唯一工具回复；不要输出额外正文。\n\n${instruction}` },
          { role: 'user', content: fixture.prompt },
        ],
        context: contextFor(fixture.target.mode),
        target: fixture.target,
        capabilities: fixture.capabilities,
        temperature: 0,
        maxTokens: 1500,
        streamPreviewEnabled: fixture.stream,
        onStructuredPreview: () => {},
        onFirstProviderDelta: () => { if (!firstDeltaAt) firstDeltaAt = performance.now(); },
        onModelUsage: entry => usage.push(entry),
      });
      const kinds = (Array.isArray(result?.ir?.items) ? result.ir.items : []).map(item => trim(item?.kind));
      const text = semanticText(result?.ir);
      const pass = result?.ok === true
        && result?.ir?.context?.sessionId === fixture.target.sessionId
        && sameOrder(kinds, fixture.expectedKinds)
        && fixture.markers.every(marker => text.includes(marker))
        && Number(result?.diagnostics?.toolCallCount || 0) === 1
        && Number(result?.diagnostics?.responseChars || 0) === 0
        && (!fixture.stream || firstDeltaAt > 0);
      rows.push({
        id: fixture.id,
        surface: fixture.target.mode,
        stream: fixture.stream,
        pass,
        issueCodes: result?.ok
          ? []
          : [
              trim(result?.reason, 'provider_fc_failed'),
              ...(Array.isArray(result?.diagnostics?.validationErrorCodes)
                ? result.diagnostics.validationErrorCodes
                : []),
            ],
        exactKinds: sameOrder(kinds, fixture.expectedKinds),
        exactOneToolCall: Number(result?.diagnostics?.toolCallCount || 0) === 1,
        noExtraText: Number(result?.diagnostics?.responseChars || 0) === 0,
        targetCorrect: result?.ir?.context?.sessionId === fixture.target.sessionId,
        markersPresent: fixture.markers.every(marker => text.includes(marker)),
        firstMeaningfulDeltaLatencyMs: firstDeltaAt ? Math.round(firstDeltaAt - startedAt) : null,
        totalLatencyMs: Math.round(performance.now() - startedAt),
        usage: usageSummary(usage),
        ...(pass ? {} : { toolArgumentShape: lastToolArgumentShape }),
      });
    } catch (error) {
      rows.push({ id: fixture.id, surface: fixture.target.mode, stream: fixture.stream, pass: false, issueCodes: [safeCode(error)] });
    }
  }

  const result = {
    fixtureVersion: 'opencode-j3-controlled-cohort-v1',
    configuredFrom: trim(profile.provider).toLowerCase(),
    provider: runtime.provider,
    model: runtime.model,
    paidCallUpperBound: privateFixtures.length + batchFixtures.length,
    persistentWrites: 0,
    businessToolsExecuted: 0,
    rawContentRetained: false,
    toolArgumentsRetained: false,
    passed: rows.filter(row => row.pass).length,
    total: rows.length,
    rows,
  };
  window.__opencodeJ3CohortResult = result;
  return result;
})()
