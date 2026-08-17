// Bounded real-provider cohort for the released APP phone FC transports.
// Run through app-eval in the Windows dev WebView after setting:
//   window.__chatFcBatchProvider = 'deepseek';
//   window.__chatFcBatchRepetitions = 10;
// Each repetition performs one private-chat, one group-chat and one moment request.
// No business tool is executed, no store is written, and model text/tool arguments
// are reduced to aggregate checks before the result is retained.
(async () => {
  const bridge = window.appBridge;
  if (!bridge?.config) throw new Error('Chat FC batch cohort requires an initialized app bridge');

  const [
    { LLMClient },
    { resolveChatProviderFcRelease },
    {
      buildPhoneBatchStructuredTransportInstruction,
      runPhoneBatchProviderFcAttempt,
    },
  ] = await Promise.all([
    import('/scripts/api/client.js'),
    import('/scripts/agent/provider-fc-transport.js'),
    import('/scripts/ui/chat/phone-batch-provider-fc.js'),
  ]);

  const trim = (value, fallback = '') => {
    const text = String(value ?? '').trim();
    return text || fallback;
  };
  const providerId = trim(window.__chatFcBatchProvider).toLowerCase();
  const configuredRepetitions = Math.trunc(Number(window.__chatFcBatchRepetitions));
  const repetitions = Number.isFinite(configuredRepetitions)
    ? Math.min(20, Math.max(1, configuredRepetitions))
    : (providerId === 'deepseek' ? 10 : 2);
  const targets = {
    deepseek: {
      profileName: 'Deepseek',
      profileProviders: ['deepseek'],
      runtime: {
        provider: 'deepseek',
        model: 'deepseek-v4-flash',
        baseUrl: 'https://api.deepseek.com/v1',
        connectionMode: 'direct',
        proxyBaseUrl: '',
      },
    },
    openai: {
      profileName: 'oai',
      profileProviders: ['openai'],
      runtime: {
        provider: 'openai',
        model: 'gpt-5.6-sol',
        baseUrl: 'https://api.openai.com/v1',
        connectionMode: 'direct',
        proxyBaseUrl: '',
      },
    },
    anthropic: {
      profileName: 'Claude',
      profileProviders: ['anthropic'],
      runtime: {
        provider: 'anthropic',
        model: 'claude-opus-4-8',
        baseUrl: 'https://api.anthropic.com/v1',
      },
    },
    opencode: {
      profileName: 'open',
      profileProviders: ['opencode', 'custom'],
      runtime: {
        provider: 'opencode',
        model: 'glm-5.3',
        baseUrl: 'https://opencode.ai/zen/go/v1',
        connectionMode: 'direct',
        proxyBaseUrl: '',
      },
    },
    gemini: {
      profileName: '默认',
      profileProviders: ['makersuite', 'gemini'],
      runtime: {
        provider: 'makersuite',
        model: 'gemini-3.7-flash',
        connectionMode: 'direct',
        proxyBaseUrl: '',
      },
    },
    openrouter: {
      profileName: 'openrouter',
      profileProviders: ['openrouter'],
      runtime: {
        provider: 'openrouter',
        model: 'google/gemini-3.7-flash',
        baseUrl: 'https://openrouter.ai/api/v1',
        connectionMode: 'direct',
        proxyBaseUrl: '',
      },
    },
  };
  const target = targets[providerId];
  if (!target) throw new Error('Set __chatFcBatchProvider to one released non-Ollama provider');

  const profiles = bridge.config.getProfiles?.() || [];
  const profile = profiles.find(item => (
    trim(item?.name) === target.profileName
    && target.profileProviders.includes(trim(item?.provider).toLowerCase())
  ));
  if (!profile?.id) throw new Error(`Chat FC batch ${providerId} profile missing`);
  const storedRuntime = await bridge.config.getRuntimeConfigByProfileId(profile.id);
  if (!storedRuntime) throw new Error(`Chat FC batch ${providerId} runtime missing`);
  const runtime = {
    ...storedRuntime,
    ...target.runtime,
    stream: false,
    webSearchEnabled: false,
  };
  const client = new LLMClient(runtime);
  await client.prepareProviderFcCapabilities?.();
  const release = resolveChatProviderFcRelease(runtime);
  if (!release.enabled) {
    throw new Error(`Chat FC batch ${providerId} release unavailable: ${release.reason}`);
  }

  const members = Object.freeze([
    { id: 'contact:fc-batch-a', name: '测试甲' },
    { id: 'contact:fc-batch-b', name: '测试乙' },
  ]);
  const groupTargets = Object.freeze([{
    id: 'group:fc-batch',
    name: 'FC测试群',
    members,
  }]);
  const privateTarget = Object.freeze({
    mode: 'private_chat',
    sessionId: 'contact:fc-batch-a',
    targetName: '测试甲',
    speakerId: 'contact:fc-batch-a',
    speakerName: '测试甲',
    userName: '我',
    momentAuthors: [members[0]],
    tableTargets: [],
  });
  const groupTarget = Object.freeze({
    mode: 'group_chat',
    sessionId: 'group:fc-batch',
    targetName: 'FC测试群',
    userName: '我',
    members,
    momentAuthors: members,
    tableTargets: [],
  });
  const momentTarget = Object.freeze({
    mode: 'moment_comment',
    sessionId: 'contact:fc-batch-a',
    targetName: 'FC测试动态',
    userName: '我',
    momentId: 'moment:fc-batch',
    momentAuthors: members,
    privateTargets: members,
    groupTargets,
    tableTargets: [],
  });
  const allowedItemTypes = Object.freeze(['text', 'sticker', 'voice', 'transfer', 'music', 'image']);
  const allowedStickerKeywords = Object.freeze(['收到', '晚安抱抱']);
  const baseContext = Object.freeze({
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
  const fixtures = [
    {
      id: 'private_chat',
      target: privateTarget,
      expectedKinds: ['chat'],
      expectedTypes: ['text'],
      expectedSpeakers: [],
      buildPrompt: token => `只提交一个 chat item，只发送一条 text 消息，内容必须包含“私聊校验 ${token}”。`,
      buildSignals: token => [`私聊校验 ${token}`],
    },
    {
      id: 'group_chat',
      target: groupTarget,
      expectedKinds: ['chat'],
      expectedTypes: ['text', 'text'],
      expectedSpeakers: ['contact:fc-batch-a', 'contact:fc-batch-b'],
      buildPrompt: token => (
        `只提交一个 chat item：测试甲先发送“群聊甲 ${token}”，测试乙再发送“群聊乙 ${token}”，两条都是 text。`
      ),
      buildSignals: token => [`群聊甲 ${token}`, `群聊乙 ${token}`],
    },
    {
      id: 'moment_comment',
      target: momentTarget,
      expectedKinds: ['moment_comment'],
      expectedTypes: [],
      expectedSpeakers: [],
      expectedCommentAuthors: ['contact:fc-batch-a'],
      buildPrompt: token => (
        `只提交一个 moment_comment item，由测试甲评论，内容必须包含“动态校验 ${token}”。`
      ),
      buildSignals: token => [`动态校验 ${token}`],
    },
  ];

  const sameOrder = (actual, expected) => (
    actual.length === expected.length && actual.every((value, index) => value === expected[index])
  );
  const percentile = (values, ratio) => {
    const sorted = values.filter(Number.isFinite).slice().sort((a, b) => a - b);
    return sorted.length
      ? sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1))]
      : null;
  };
  const collectSemanticText = ir => (Array.isArray(ir?.items) ? ir.items : [])
    .flatMap(item => [
      ...(Array.isArray(item?.messages) ? item.messages.map(message => message?.content) : []),
      ...(Array.isArray(item?.comments) ? item.comments.map(comment => comment?.content) : []),
      ...(Array.isArray(item?.posts) ? item.posts.map(post => post?.content) : []),
      item?.prompt,
      item?.content,
    ])
    .map(value => String(value || ''))
    .join('\n');
  const safeIssueCodes = result => {
    const codes = [
      trim(result?.reason),
      trim(result?.diagnostics?.errorCode),
      ...(Array.isArray(result?.diagnostics?.validationErrorCodes)
        ? result.diagnostics.validationErrorCodes
        : []),
    ].filter(Boolean);
    return [...new Set(codes)].slice(0, 8);
  };
  const sumUsage = (entries, key) => {
    const values = entries
      .map(entry => entry?.[key])
      .filter(value => value !== null && value !== undefined)
      .map(Number)
      .filter(Number.isFinite);
    return values.length ? values.reduce((sum, value) => sum + value, 0) : null;
  };
  const inspect = (fixture, result, signals, thinkingRequested) => {
    const items = Array.isArray(result?.ir?.items) ? result.ir.items : [];
    const kinds = items.map(item => trim(item?.kind));
    const messages = items.flatMap(item => Array.isArray(item?.messages) ? item.messages : []);
    const types = messages.map(message => trim(message?.type, 'text'));
    const speakerIds = [...new Set(messages.map(message => trim(message?.speaker?.id)).filter(Boolean))];
    const comments = items.flatMap(item => Array.isArray(item?.comments) ? item.comments : []);
    const commentAuthors = [...new Set(comments.map(comment => trim(comment?.author?.id)).filter(Boolean))];
    const semanticText = collectSemanticText(result?.ir);
    const expectedSpeakers = fixture.expectedSpeakers || [];
    const expectedCommentAuthors = fixture.expectedCommentAuthors || [];
    const thinkingPolicyCorrect = providerId !== 'deepseek'
      || (thinkingRequested
        ? (
            result?.diagnostics?.thinkingEnabled === false
            && result?.diagnostics?.thinkingOverrideReason === 'deepseek_forced_tool_choice_incompatible'
          )
        : result?.diagnostics?.thinkingEnabled === false);
    const checks = {
      providerFcAccepted: result?.ok === true,
      exactKinds: sameOrder(kinds, fixture.expectedKinds),
      targetCorrect: result?.ir?.context?.sessionId === fixture.target.sessionId,
      typesCorrect: sameOrder(types, fixture.expectedTypes),
      speakersCorrect: !expectedSpeakers.length || (
        speakerIds.length === expectedSpeakers.length
        && expectedSpeakers.every(id => speakerIds.includes(id))
      ),
      commentAuthorsCorrect: !expectedCommentAuthors.length || (
        commentAuthors.length === expectedCommentAuthors.length
        && expectedCommentAuthors.every(id => commentAuthors.includes(id))
      ),
      signalsCorrect: signals.every(signal => semanticText.includes(signal)),
      oneToolCall: Number(result?.diagnostics?.toolCallCount || 0) === 1,
      noLeakedText: Number(result?.diagnostics?.responseChars || 0) === 0,
      thinkingPolicyCorrect,
    };
    return {
      ...checks,
      strictSemanticPass: Object.values(checks).every(Boolean),
    };
  };

  const samples = [];
  const total = repetitions * fixtures.length;
  window.__chatFcBatchProgress = {
    provider: providerId,
    completed: 0,
    expected: total,
  };
  window.__chatFcBatchResult = null;
  for (let repetition = 0; repetition < repetitions; repetition += 1) {
    for (const fixture of fixtures) {
      const token = `${providerId.toUpperCase()}-${fixture.id.toUpperCase()}-${String(repetition + 1).padStart(2, '0')}`;
      const signals = fixture.buildSignals(token);
      const thinkingRequested = providerId === 'deepseek' && repetition % 2 === 1;
      const usage = [];
      const startedAt = performance.now();
      let row;
      try {
        const instruction = buildPhoneBatchStructuredTransportInstruction({
          target: fixture.target,
          capabilities: {},
          allowedItemTypes,
          allowedStickerKeywords,
        });
        const result = await runPhoneBatchProviderFcAttempt({
          client,
          config: runtime,
          messages: [
            {
              role: 'system',
              content: [
                '这是零写入 APP 手机协议受控测试。严格按指定的 item、顺序、身份和校验词提交；不要输出工具调用以外正文。',
                instruction,
              ].join('\n\n'),
            },
            { role: 'user', content: fixture.buildPrompt(token) },
          ],
          context: {
            ...baseContext,
            uiMode: fixture.target.mode === 'moment_comment' ? 'moments' : 'chat',
            surface: fixture.target.mode,
          },
          target: fixture.target,
          capabilities: {},
          allowedItemTypes,
          allowedStickerKeywords,
          thinkingEnabled: thinkingRequested,
          temperature: 0.7,
          maxTokens: 1200,
          streamPreviewEnabled: false,
          onModelUsage: entry => usage.push(entry),
        });
        const checks = inspect(fixture, result, signals, thinkingRequested);
        row = {
          surface: fixture.id,
          repetition: repetition + 1,
          thinkingRequested,
          attempted: result?.attempted === true,
          wouldFallback: result?.ok !== true,
          ...checks,
          issueCodes: result?.ok ? [] : safeIssueCodes(result),
          latencyMs: Math.round(performance.now() - startedAt),
          promptTokens: sumUsage(usage, 'promptTokens'),
          completionTokens: sumUsage(usage, 'completionTokens'),
          totalTokens: sumUsage(usage, 'totalTokens'),
        };
      } catch (error) {
        row = {
          surface: fixture.id,
          repetition: repetition + 1,
          thinkingRequested,
          attempted: false,
          wouldFallback: true,
          providerFcAccepted: false,
          strictSemanticPass: false,
          issueCodes: [trim(
            error?.code || (Number.isFinite(Number(error?.status)) ? `http_${Number(error.status)}` : error?.name),
            'request_failed',
          ).slice(0, 80)],
          latencyMs: Math.round(performance.now() - startedAt),
          promptTokens: null,
          completionTokens: null,
          totalTokens: null,
        };
      }
      samples.push(row);
      window.__chatFcBatchProgress = {
        provider: providerId,
        completed: samples.length,
        expected: total,
        surface: fixture.id,
        repetition: repetition + 1,
      };
      console.info(
        '[chat-fc-batch]',
        `${samples.length}/${total}`,
        providerId,
        fixture.id,
        row.strictSemanticPass ? 'pass' : 'fail',
      );
    }
  }

  const summarize = (rows) => {
    const count = key => rows.filter(row => row[key] === true).length;
    const sum = key => {
      const values = rows
        .map(row => row[key])
        .filter(value => value !== null && value !== undefined)
        .map(Number)
        .filter(Number.isFinite);
      return values.length ? values.reduce((totalValue, value) => totalValue + value, 0) : null;
    };
    const issueCounts = {};
    rows.forEach(row => row.issueCodes.forEach(code => {
      issueCounts[code] = (issueCounts[code] || 0) + 1;
    }));
    const latencies = rows.map(row => Number(row.latencyMs)).filter(Number.isFinite);
    return {
      total: rows.length,
      attempted: count('attempted'),
      providerFcAccepted: count('providerFcAccepted'),
      strictSemanticPassed: count('strictSemanticPass'),
      wouldFallback: count('wouldFallback'),
      fallbackRate: rows.length
        ? Number((count('wouldFallback') / rows.length).toFixed(4))
        : null,
      fcAcceptanceRate: rows.length
        ? Number((count('providerFcAccepted') / rows.length).toFixed(4))
        : null,
      strictSemanticAccuracy: rows.length
        ? Number((count('strictSemanticPass') / rows.length).toFixed(4))
        : null,
      averageLatencyMs: latencies.length
        ? Math.round(latencies.reduce((total, value) => total + value, 0) / latencies.length)
        : null,
      p50LatencyMs: percentile(latencies, 0.5),
      p95LatencyMs: percentile(latencies, 0.95),
      promptTokens: sum('promptTokens'),
      completionTokens: sum('completionTokens'),
      totalTokens: sum('totalTokens'),
      issueCounts,
    };
  };
  const result = {
    fixtureVersion: 'released-chat-fc-batch-v1',
    provider: providerId,
    configuredProvider: trim(runtime.provider),
    model: trim(runtime.model),
    releaseSource: trim(release.capabilitySource),
    schemaSubsets: Array.isArray(release.capabilities?.schemaSubsets)
      ? release.capabilities.schemaSubsets.slice(0, 8)
      : [],
    repetitionsPerSurface: repetitions,
    persistentWrites: 0,
    businessToolsExecuted: 0,
    rawContentRetained: false,
    argumentContentRetained: false,
    overall: summarize(samples),
    surfaces: fixtures.map(fixture => ({
      surface: fixture.id,
      ...summarize(samples.filter(sample => sample.surface === fixture.id)),
    })),
    thinkingModes: providerId === 'deepseek'
      ? [false, true].map(thinkingRequested => ({
          thinkingRequested,
          ...summarize(samples.filter(sample => sample.thinkingRequested === thinkingRequested)),
        }))
      : [],
    failures: samples.filter(sample => !sample.strictSemanticPass).map(sample => ({
      surface: sample.surface,
      repetition: sample.repetition,
      thinkingRequested: sample.thinkingRequested,
      wouldFallback: sample.wouldFallback,
      issueCodes: sample.issueCodes.slice(0, 8),
      checks: {
        attempted: sample.attempted,
        providerFcAccepted: sample.providerFcAccepted,
        exactKinds: sample.exactKinds,
        targetCorrect: sample.targetCorrect,
        typesCorrect: sample.typesCorrect,
        speakersCorrect: sample.speakersCorrect,
        commentAuthorsCorrect: sample.commentAuthorsCorrect,
        signalsCorrect: sample.signalsCorrect,
        oneToolCall: sample.oneToolCall,
        noLeakedText: sample.noLeakedText,
        thinkingPolicyCorrect: sample.thinkingPolicyCorrect,
      },
    })),
  };
  window.__chatFcBatchProgress = {
    provider: providerId,
    completed: samples.length,
    expected: total,
    finished: true,
  };
  window.__chatFcBatchResults = {
    ...(window.__chatFcBatchResults && typeof window.__chatFcBatchResults === 'object'
      ? window.__chatFcBatchResults
      : {}),
    [providerId]: result,
  };
  window.__chatFcBatchResult = result;
  return result;
})()
