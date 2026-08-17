// Manual real-model Stage F fixture. Run through app-eval against an open Windows dev WebView.
// By default it performs 90 paid, non-streaming, no-write requests
// (10 prompts x 3 repetitions x 3 transports). A window transport filter can narrow the cohort.
// It retains aggregate metrics and failure codes only; model text, tool arguments, and IR content are discarded.
(async () => {
  const bridge = window.appBridge;
  if (!bridge?.backgroundChat || !bridge?.config) {
    throw new Error('Stage F controlled cohort requires an initialized app bridge');
  }

  const [{
    BUILTIN_PHONE_FORMAT_SURFACES,
    buildBuiltinPhoneFormatReminder,
    validateBuiltinPhoneFormat,
  }, { DialogueStreamParser }, {
    DEEPSEEK_PHONE_PREFILL_PREFIX,
    mergeDeepSeekPrefillResponse,
  }, {
    buildPrivateChatPhoneReplyIr,
    serializePhoneReplyIr,
  }, {
    runPrivateChatProviderFcAttempt,
  }] = await Promise.all([
    import('/scripts/utils/builtin-phone-format-contract.js'),
    import('/scripts/ui/chat/dialogue-stream-parser.js'),
    import('/scripts/api/deepseek-phone-prefill-utils.js'),
    import('/scripts/ui/chat/phone-reply-ir.js'),
    import('/scripts/ui/chat/private-chat-provider-fc.js'),
  ]);

  const profiles = bridge.config.getProfiles?.() || [];
  const activeProfileId = String(bridge.config.getActiveProfileId?.() || '').trim();
  const profile = profiles.find(item => (
    String(item?.id || '').trim() === activeProfileId
    && String(item?.provider || '').trim().toLowerCase() === 'deepseek'
    && String(item?.model || '').trim().toLowerCase() === 'deepseek-v4-flash'
  )) || profiles.find(item => (
    String(item?.provider || '').trim().toLowerCase() === 'deepseek'
    && String(item?.model || '').trim().toLowerCase() === 'deepseek-v4-flash'
  ));
  if (!profile?.id) throw new Error('Stage F requires an official deepseek-v4-flash profile');
  const runtime = await bridge.config.getRuntimeConfigByProfileId(profile.id);
  if (!runtime) throw new Error('Stage F could not resolve the DeepSeek runtime profile');

  const prompts = [
    { text: '我刚下班，有点累。请用一句简短的话回应我。', semanticSignals: ['累', '辛苦', '休息'] },
    { text: '外面开始下雨了，你会提醒我什么？请简短回应。', semanticSignals: ['雨', '伞', '淋', '小心'] },
    { text: '我在犹豫晚餐吃面还是饭，你帮我选一个。', semanticSignals: ['面', '饭'] },
    { text: '明天要早起，但我还不想睡。请劝我一句。', semanticSignals: ['睡', '休息', '早'] },
    { text: '我刚把重要的工作做完了，想听你说一句话。', semanticSignals: ['棒', '厉害', '辛苦', '完成', '做完', '休息'] },
    { text: '今天心情有点低落，请简短陪我聊一句。', semanticSignals: ['陪', '在这', '抱', '听'] },
    { text: '我准备出门散步，你有什么简短建议？', semanticSignals: ['安全', '小心', '外套', '慢', '散步'] },
    { text: '我泡了一杯热茶，想邀请你一起休息。', semanticSignals: ['茶', '一起', '陪', '休息'] },
    { text: '我忘了带伞，现在在屋檐下等雨停。', semanticSignals: ['伞', '雨', '淋', '接', '等'] },
    { text: '今晚的月亮很亮，我想把这件事告诉你。', semanticSignals: ['月', '亮', '美', '一起', '分享', '看'] },
  ];
  const repetitions = 3;
  const target = Object.freeze({
    sessionId: 'stage-f-private-mia',
    targetName: '米娅',
    speakerId: 'stage-f-contact-mia',
    speakerName: '米娅',
    userName: '我',
  });
  const structuredContext = Object.freeze({
    uiMode: 'chat',
    surface: 'private_chat',
    responseTarget: 'assistant',
    usesBuiltinFormat: true,
    usesDefaultPreset: true,
    compatibilityModeEnabled: false,
    assistantContinuation: false,
    webSearchEnabled: false,
    hasProviderTools: false,
    formatProfileEnabled: false,
  });
  const semanticSystem = [
    '你是米娅，一位温柔、细心、说话简洁的女仆朋友。',
    '根据用户的最后一句话自然回应；每轮生成一到两条纯文字私聊消息。',
    '不要解释任务、协议或格式，不要生成图片、动态、变量、记忆表格或其他副作用。',
  ].join('\n');
  const textTransportSystem = buildBuiltinPhoneFormatReminder({
    surface: BUILTIN_PHONE_FORMAT_SURFACES.privateChat,
    userName: '我',
    targetName: '米娅',
  });
  const jsonTransportSystem = [
    '本轮使用 JSON Output。只输出一个 JSON object，不要 Markdown 代码块或包装文字。',
    '对象格式：{"messages":[{"content":"非空纯文字消息","time":"可选 HH:mm"}]}。',
    'messages 必须有 1 到 12 项；不要输出 target、speaker、MiPhone 标签或其他字段。',
  ].join('\n');
  const fcTransportSystem = '本轮必须通过提供的唯一函数交付完整回复，不要输出包装文字。';
  const allTransportIds = ['legacy_text', 'json_output', 'provider_fc'];
  const requestedTransportIds = Array.isArray(window.__stageFPrivateTransportFilter)
    ? window.__stageFPrivateTransportFilter.map(item => String(item || '').trim())
    : [];
  const transportIds = requestedTransportIds.length
    ? allTransportIds.filter(id => requestedTransportIds.includes(id))
    : allTransportIds;
  if (!transportIds.length) throw new Error('Stage F transport filter selected no supported transports');
  const samples = [];

  const safeCode = (error) => String(
    error?.code || (Number.isFinite(Number(error?.status)) ? `http_${Number(error.status)}` : error?.name || 'request_failed'),
  ).slice(0, 80);
  const parseEvents = (raw) => {
    const parser = new DialogueStreamParser({ userName: '我' });
    return [...parser.push(String(raw || '')), ...parser.flush()];
  };
  const sumUsage = (entries, key) => {
    const values = entries.map(entry => Number(entry?.[key])).filter(Number.isFinite);
    return values.length ? values.reduce((sum, value) => sum + value, 0) : null;
  };
  const buildMessages = (prompt, transport) => [
    { role: 'system', content: semanticSystem },
    {
      role: 'system',
      content: transport === 'legacy_text'
        ? textTransportSystem
        : (transport === 'json_output' ? jsonTransportSystem : fcTransportSystem),
    },
    { role: 'user', content: prompt },
  ];
  const inspectRaw = (raw, semanticSignals = []) => {
    const validation = validateBuiltinPhoneFormat(raw, { surface: 'private_chat' });
    const events = parseEvents(raw);
    const privateEvents = events.filter(event => event?.type === 'private_chat');
    const messages = privateEvents.flatMap(event => Array.isArray(event?.messages) ? event.messages : []);
    const semanticText = messages.map(message => String(message?.content || '')).join('\n');
    const semanticNonEmpty = messages.length > 0 && messages.every(message => String(message?.content || '').trim());
    return {
      structuralContractSuccess: validation.valid === true,
      parseSuccess: events.length > 0,
      expectedSurfaceMatch: privateEvents.length === 1,
      targetCorrect: privateEvents.length === 1 && privateEvents[0]?.otherName === target.targetName,
      semanticNonEmpty,
      semanticSignalMatch: semanticNonEmpty
        && semanticSignals.some(signal => semanticText.includes(signal)),
      itemCount: messages.length,
      issueCodes: Array.isArray(validation.issues) ? validation.issues.slice(0, 8) : [],
    };
  };
  const requestOptions = (usageEntries, extra = {}) => ({
    runtimeConfigOverride: { ...runtime, webSearchEnabled: false },
    presetContext: {
      sessionId: target.sessionId,
      uiMode: 'chat',
      taskType: 'stage_f_private_structured',
    },
    thinking: { type: 'disabled' },
    temperature: 0.7,
    top_p: 0.9,
    max_tokens: 700,
    onProviderUsage: usage => usageEntries.push(usage),
    ...extra,
  });

  const runLegacy = async (prompt, semanticSignals) => {
    const usage = [];
    const startedAt = performance.now();
    const response = await bridge.backgroundChat(
      buildMessages(prompt, 'legacy_text'),
      requestOptions(usage, {
        deepseekPrefix: { prefix: DEEPSEEK_PHONE_PREFILL_PREFIX, mode: 'stage_f_control' },
      }),
    );
    const raw = mergeDeepSeekPrefillResponse(DEEPSEEK_PHONE_PREFILL_PREFIX, response);
    return {
      ...inspectRaw(raw, semanticSignals),
      effectiveMode: 'legacy_text',
      fallback: false,
      latencyMs: Math.round(performance.now() - startedAt),
      usage,
    };
  };

  const runJsonOutput = async (prompt, semanticSignals) => {
    const usage = [];
    const startedAt = performance.now();
    const response = await bridge.backgroundChat(
      buildMessages(prompt, 'json_output'),
      requestOptions(usage, { response_format: { type: 'json_object' } }),
    );
    let args = null;
    try {
      args = JSON.parse(String(response || ''));
    } catch {
      return {
        structuralContractSuccess: false,
        parseSuccess: false,
        expectedSurfaceMatch: false,
        targetCorrect: false,
        semanticNonEmpty: false,
        semanticSignalMatch: false,
        itemCount: 0,
        issueCodes: ['invalid_json_output'],
        effectiveMode: 'json_output',
        fallback: false,
        latencyMs: Math.round(performance.now() - startedAt),
        usage,
      };
    }
    const built = buildPrivateChatPhoneReplyIr({
      args,
      target,
      source: { transport: 'json_output', provider: runtime.provider, model: runtime.model },
    });
    if (!built.ok) {
      return {
        structuralContractSuccess: false,
        parseSuccess: false,
        expectedSurfaceMatch: false,
        targetCorrect: false,
        semanticNonEmpty: false,
        semanticSignalMatch: false,
        itemCount: 0,
        issueCodes: ['invalid_phone_reply_ir', ...(built.errors || []).slice(0, 7)],
        effectiveMode: 'json_output',
        fallback: false,
        latencyMs: Math.round(performance.now() - startedAt),
        usage,
      };
    }
    const serialized = serializePhoneReplyIr(built.ir, {
      userName: target.userName,
      expectedSessionId: target.sessionId,
    });
    const inspected = serialized.ok
      ? inspectRaw(serialized.raw, semanticSignals)
      : {
          structuralContractSuccess: false,
          parseSuccess: false,
          expectedSurfaceMatch: false,
          targetCorrect: false,
          semanticNonEmpty: false,
          semanticSignalMatch: false,
          itemCount: 0,
          issueCodes: ['canonical_serialization_failed'],
        };
    return {
      ...inspected,
      effectiveMode: 'json_output',
      fallback: false,
      latencyMs: Math.round(performance.now() - startedAt),
      usage,
    };
  };

  const runProviderFc = async (prompt, semanticSignals) => {
    const usage = [];
    const startedAt = performance.now();
    const result = await runPrivateChatProviderFcAttempt({
      client: {
        chat: (messages, options) => bridge.backgroundChat(messages, requestOptions(usage, options)),
      },
      config: runtime,
      messages: buildMessages(prompt, 'provider_fc'),
      context: structuredContext,
      target,
      thinkingEnabled: false,
      onModelUsage: entry => usage.push(entry),
    });
    const inspected = result.ok
      ? inspectRaw(result.raw, semanticSignals)
      : {
          structuralContractSuccess: false,
          parseSuccess: false,
          expectedSurfaceMatch: false,
          targetCorrect: false,
          semanticNonEmpty: false,
          semanticSignalMatch: false,
          itemCount: 0,
          issueCodes: [String(result.reason || 'provider_fc_failed')],
        };
    return {
      ...inspected,
      effectiveMode: String(result.effectiveMode || ''),
      fallback: result.effectiveMode !== 'provider_fc',
      toolCallCount: Number(result.diagnostics?.toolCallCount || 0),
      responseChars: Number(result.diagnostics?.responseChars || 0),
      latencyMs: Math.round(performance.now() - startedAt),
      usage,
    };
  };

  const runners = {
    legacy_text: runLegacy,
    json_output: runJsonOutput,
    provider_fc: runProviderFc,
  };
  const expectedRequests = prompts.length * repetitions * transportIds.length;
  window.__stageFPrivateCohortProgress = { completed: 0, expected: expectedRequests };
  window.__stageFPrivateCohortSamples = [];
  window.__stageFPrivateCohortResult = null;
  for (let repetition = 1; repetition <= repetitions; repetition += 1) {
    for (let promptIndex = 0; promptIndex < prompts.length; promptIndex += 1) {
      const offset = (repetition + promptIndex) % transportIds.length;
      const ordered = [...transportIds.slice(offset), ...transportIds.slice(0, offset)];
      for (const transport of ordered) {
        const startedAt = performance.now();
        try {
          const prompt = prompts[promptIndex];
          const result = await runners[transport](prompt.text, prompt.semanticSignals);
          const usage = Array.isArray(result.usage) ? result.usage : [];
          samples.push({
            transport,
            repetition,
            promptIndex,
            requestOk: true,
            structuralContractSuccess: result.structuralContractSuccess === true,
            parseSuccess: result.parseSuccess === true,
            expectedSurfaceMatch: result.expectedSurfaceMatch === true,
            targetCorrect: result.targetCorrect === true,
            semanticNonEmpty: result.semanticNonEmpty === true,
            semanticSignalMatch: result.semanticSignalMatch === true,
            itemCount: Number(result.itemCount || 0),
            fallback: result.fallback === true,
            toolCallCount: Number(result.toolCallCount || 0),
            responseChars: Number(result.responseChars || 0),
            latencyMs: Number(result.latencyMs || Math.round(performance.now() - startedAt)),
            promptTokens: sumUsage(usage, 'promptTokens'),
            completionTokens: sumUsage(usage, 'completionTokens'),
            totalTokens: sumUsage(usage, 'totalTokens'),
            issueCodes: Array.isArray(result.issueCodes) ? result.issueCodes : [],
          });
        } catch (error) {
          samples.push({
            transport,
            repetition,
            promptIndex,
            requestOk: false,
            structuralContractSuccess: false,
            parseSuccess: false,
            expectedSurfaceMatch: false,
            targetCorrect: false,
            semanticNonEmpty: false,
            semanticSignalMatch: false,
            itemCount: 0,
            fallback: false,
            toolCallCount: 0,
            responseChars: 0,
            latencyMs: Math.round(performance.now() - startedAt),
            promptTokens: null,
            completionTokens: null,
            totalTokens: null,
            issueCodes: [safeCode(error)],
          });
        }
        window.__stageFPrivateCohortProgress = {
          completed: samples.length,
          expected: expectedRequests,
          lastTransport: transport,
        };
        window.__stageFPrivateCohortSamples = samples.map(sample => ({ ...sample }));
        console.info('[stage-f-private]', `${samples.length}/${expectedRequests}`, transport);
      }
    }
  }

  const percentile = (values, ratio) => {
    const sorted = values.filter(Number.isFinite).slice().sort((a, b) => a - b);
    if (!sorted.length) return null;
    return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1))];
  };
  const summarize = (transport) => {
    const rows = samples.filter(sample => sample.transport === transport);
    const count = key => rows.filter(row => row[key] === true).length;
    const sum = key => {
      const values = rows.map(row => Number(row[key])).filter(Number.isFinite);
      return values.length ? values.reduce((total, value) => total + value, 0) : null;
    };
    const issueCounts = {};
    rows.forEach(row => row.issueCodes.forEach(code => {
      issueCounts[code] = (issueCounts[code] || 0) + 1;
    }));
    const latencies = rows.map(row => Number(row.latencyMs)).filter(Number.isFinite);
    return {
      transport,
      total: rows.length,
      requestSuccess: count('requestOk'),
      structuralContractSuccess: count('structuralContractSuccess'),
      parseSuccess: count('parseSuccess'),
      expectedSurfaceMatch: count('expectedSurfaceMatch'),
      targetCorrect: count('targetCorrect'),
      semanticNonEmpty: count('semanticNonEmpty'),
      semanticSignalMatch: count('semanticSignalMatch'),
      fallbackCount: count('fallback'),
      exactOneToolCall: rows.filter(row => row.toolCallCount === 1).length,
      leakedResponseTextCount: rows.filter(row => row.responseChars > 0).length,
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
    fixtureVersion: 'stage-f-private-structured-v1',
    provider: String(runtime.provider || ''),
    model: String(runtime.model || ''),
    requestMode: 'non_stream_terminal',
    persistentWrites: 0,
    rawContentRetained: false,
    argumentContentRetained: false,
    semanticSignalDefinition: 'one_or_more_prompt_specific_terms',
    sampleCount: samples.length,
    transportFilter: transportIds.slice(),
    cohorts: transportIds.map(summarize),
  };
  window.__stageFPrivateCohortResult = result;
  return result;
})()
