// Manual real-model fixture. Run through app-eval against an already-open Windows dev WebView.
// It performs 60 paid requests, retains no raw content, and never changes the active profile.
(async () => {
  const bridge = window.appBridge;
  if (!bridge?.buildMessages || !bridge?.backgroundChat || !bridge?.config) {
    throw new Error('Stage B cohort requires an initialized app bridge');
  }

  const [{
    BUILTIN_PHONE_FORMAT_SURFACES,
    serializeBuiltinPhoneFormat,
    validateBuiltinPhoneFormat,
  }, { DialogueStreamParser }, {
    mergeDeepSeekPrefillResponse,
    resolveDeepSeekPhonePrefillPlan,
  }] = await Promise.all([
    import('/scripts/utils/builtin-phone-format-contract.js'),
    import('/scripts/ui/chat/dialogue-stream-parser.js'),
    import('/scripts/api/deepseek-phone-prefill-utils.js'),
  ]);
  const phonePrefillExperimentEnabled = (
    bridge.debugUiRegistry?.actions?.getDeepSeekPhonePrefillExperimentStatus?.()?.enabled === true
  );

  const profiles = bridge.config.getProfiles?.() || [];
  const activeProfileId = String(bridge.config.getActiveProfileId?.() || '').trim();
  const deepSeekProfile = profiles.find(profile => (
    String(profile?.id || '').trim() === activeProfileId
    && String(profile?.model || '').trim().toLowerCase() === 'deepseek-v4-flash'
  )) || profiles.find(profile => (
    String(profile?.model || '').trim().toLowerCase() === 'deepseek-v4-flash'
  ));
  const glmProfile = profiles.find(profile => (
    String(profile?.name || '').trim().toLowerCase() === 'open'
    && String(profile?.model || '').trim().toLowerCase() === 'glm-5.2'
  )) || profiles.find(profile => (
    String(profile?.model || '').trim().toLowerCase() === 'glm-5.2'
  ));
  if (!deepSeekProfile?.id || !glmProfile?.id) {
    throw new Error('Stage B cohort requires deepseek-v4-flash and open / glm-5.2 profiles');
  }

  const [deepSeekRuntime, glmRuntime] = await Promise.all([
    bridge.config.getRuntimeConfigByProfileId(deepSeekProfile.id),
    bridge.config.getRuntimeConfigByProfileId(glmProfile.id),
  ]);
  if (!deepSeekRuntime || !glmRuntime) {
    throw new Error('Stage B cohort could not resolve runtime profiles');
  }

  const prompts = [
    '我刚下班，有点累。请用一句简短的话回应我。',
    '外面开始下雨了，你会提醒我什么？请简短回应。',
    '我在犹豫晚餐吃面还是饭，你帮我选一个。',
    '明天要早起，但我还不想睡。请劝我一句。',
    '我刚把重要的工作做完了，想听你说一句话。',
    '今天心情有点低落，请简短陪我聊一句。',
    '我准备出门散步，你有什么简短建议？',
    '我泡了一杯热茶，想邀请你一起休息。',
    '我忘了带伞，现在在屋檐下等雨停。',
    '今晚的月亮很亮，我想把这件事告诉你。',
  ];
  const momentTexts = [
    '终于完成今天的工作，回家路上的风很舒服。',
    '雨停以后，窗边留下了很亮的水珠。',
    '晚餐第一次做咖喱，意外地成功了。',
    '为了明天早起，今晚决定早点休息。',
    '整理完房间，找到了很久以前的照片。',
    '心情不太好，但散步以后轻松了一点。',
    '公园里的树开始变色了。',
    '热茶和安静的音乐很适合今晚。',
    '忘记带伞，只好在屋檐下看雨。',
    '今晚月色很好，忍不住拍了一张。',
  ];

  const previousRaw = serializeBuiltinPhoneFormat(BUILTIN_PHONE_FORMAT_SURFACES.privateChat, {
    userName: '我',
    targetName: '雪乃',
    messages: [{ speaker: '雪乃', content: '那就慢一点，我在这里。', time: '20:10' }],
  });

  const presetStore = bridge.presets;
  const originalGetResolvedActive = presetStore.getResolvedActive;
  const originalGetState = presetStore.getState;
  const originalGetResolvedWorldState = bridge.getResolvedWorldState;
  const originalGetGenerationOptions = bridge.getGenerationOptions;
  const originalRegexApply = bridge.regex?.apply;
  const defaultOpenAi = (presetStore.list?.('openai') || []).find(preset => (
    String(preset?.id || '').trim() === 'default'
  )) || (presetStore.list?.('openai') || []).find(preset => (
    String(preset?.name || '').trim().toLowerCase() === 'default'
  ));
  let reasoningEnabled = false;

  const buildFixtureContext = ({ kind, index }) => {
    const common = {
      user: { name: '我' },
      character: {
        name: '雪乃',
        description: '雪乃说话冷静、克制但关心对方。每次只发送一条简短文字消息。',
        personality: '冷静、细心',
        scenario: '日常聊天',
      },
      history: [],
      meta: {
        uiMode: 'chat',
        memoryStorageMode: 'off',
        disableSummary: true,
        disableMomentSummary: true,
        skipInputRegex: true,
        includeTimeContext: false,
      },
    };
    if (kind === 'private_established') {
      return {
        ...common,
        session: { id: `stage-b-private-established-${index}`, name: '雪乃', isGroup: false },
        history: [
          { role: 'user', content: '今天有点累。' },
          { role: 'assistant', content: previousRaw },
        ],
      };
    }
    if (kind === 'group') {
      return {
        ...common,
        session: { id: `group:stage-b-${index}`, name: '调查组', isGroup: true },
        group: { name: '调查组', members: [], memberNames: ['我', '雪乃', '结衣'] },
      };
    }
    if (kind === 'moment_comment') {
      const momentId = `stage-b-moment-${index + 1}`;
      return {
        ...common,
        session: { id: 'moments', name: '动态', isGroup: false },
        task: {
          type: 'moment_comment',
          mode: 'published_moment',
          promptData: [
            '请针对下列用户动态生成一条简短评论。',
            `momentId: ${momentId}`,
            `作者: 我`,
            `内容: ${momentTexts[index]}`,
          ].join('\n'),
        },
      };
    }
    return {
      ...common,
      session: { id: `stage-b-private-first-${index}`, name: '雪乃', isGroup: false },
    };
  };

  const expectedForKind = kind => {
    if (kind === 'group') return { surface: 'group_chat', eventType: 'group_chat' };
    if (kind === 'moment_comment') return { surface: 'moment_comment', eventType: 'moment_reply' };
    return { surface: 'private_chat', eventType: 'private_chat' };
  };

  const safeFailureCode = error => String(
    error?.code || (Number.isFinite(Number(error?.status)) ? `http_${Number(error.status)}` : 'request_failed'),
  ).slice(0, 80);

  const runSample = async ({ runtime, kind, index, thinking }) => {
    reasoningEnabled = thinking === true;
    const context = buildFixtureContext({ kind, index });
    const userPrompt = kind === 'moment_comment'
      ? '请评论这条动态。'
      : kind === 'group'
        ? `请在调查组里简短回应：${prompts[index]}`
        : prompts[index];
    const expected = expectedForKind(kind);
    const phonePrefillPlan = resolveDeepSeekPhonePrefillPlan({
      experimentEnabled: phonePrefillExperimentEnabled,
      provider: runtime?.provider,
      model: runtime?.model,
      baseUrl: runtime?.baseUrl,
      uiMode: 'chat',
      surface: expected.surface,
      responseTarget: 'assistant',
      assistantContinuation: false,
      hasConfiguredPrefill: false,
      usesDefaultPreset: true,
      usesBuiltinContract: true,
      formatProfileEnabled: false,
      webSearchEnabled: false,
      hasProviderTools: false,
    });
    const startedAt = performance.now();
    try {
      const messages = bridge.buildMessages(userPrompt, context, { requestConfig: runtime });
      const providerResponse = String(await bridge.backgroundChat(messages, {
        runtimeConfigOverride: {
          ...runtime,
          webSearchEnabled: false,
        },
        presetContext: {
          sessionId: String(context?.session?.id || ''),
          uiMode: 'chat',
          taskType: String(context?.task?.type || ''),
        },
        ...(phonePrefillPlan.requestOptions || {}),
      }) || '');
      const raw = mergeDeepSeekPrefillResponse(phonePrefillPlan.prefix, providerResponse);
      const validation = validateBuiltinPhoneFormat(raw, { surface: expected.surface });
      const parser = new DialogueStreamParser({ userName: '我' });
      const events = [...parser.push(raw), ...parser.flush()];
      const parseSuccess = events.length > 0;
      const expectedSurfaceMatch = events.some(event => event?.type === expected.eventType);
      return {
        ok: true,
        structuralContractSuccess: validation.valid === true,
        parseSuccess,
        expectedSurfaceMatch,
        phonePrefillEnabled: phonePrefillPlan.enabled === true,
        duplicatePhoneStart: (raw.match(/MiPhone_start/g) || []).length > 1,
        issueCodes: Array.isArray(validation.issues) ? validation.issues.slice(0, 8) : [],
        latencyMs: Math.round(performance.now() - startedAt),
      };
    } catch (error) {
      return {
        ok: false,
        structuralContractSuccess: false,
        parseSuccess: false,
        expectedSurfaceMatch: false,
        phonePrefillEnabled: phonePrefillPlan.enabled === true,
        duplicatePhoneStart: false,
        issueCodes: [safeFailureCode(error)],
        latencyMs: Math.round(performance.now() - startedAt),
      };
    }
  };

  const summarizeCohort = (name, samples) => {
    const issueCounts = {};
    samples.forEach(sample => {
      sample.issueCodes.forEach(code => {
        issueCounts[code] = (issueCounts[code] || 0) + 1;
      });
    });
    const count = key => samples.filter(sample => sample[key] === true).length;
    return {
      name,
      total: samples.length,
      requestSuccess: count('ok'),
      structuralContractSuccess: count('structuralContractSuccess'),
      parseSuccess: count('parseSuccess'),
      expectedSurfaceMatch: count('expectedSurfaceMatch'),
      phonePrefillEnabled: count('phonePrefillEnabled'),
      duplicatePhoneStart: count('duplicatePhoneStart'),
      averageLatencyMs: Math.round(
        samples.reduce((sum, sample) => sum + sample.latencyMs, 0) / Math.max(1, samples.length),
      ),
      issueCounts,
    };
  };

  const runCohort = async ({ name, runtime, kind, thinking = false }) => {
    const samples = [];
    for (let index = 0; index < prompts.length; index += 1) {
      samples.push(await runSample({ runtime, kind, index, thinking }));
      console.info('[stage-b-cohort]', name, `${index + 1}/${prompts.length}`);
    }
    return summarizeCohort(name, samples);
  };

  try {
    presetStore.getState = function getFixturePresetState() {
      const state = originalGetState.call(this) || {};
      return {
        ...state,
        enabled: {
          ...(state.enabled || {}),
          sysprompt: true,
          context: true,
          openai: true,
        },
      };
    };
    presetStore.getResolvedActive = function getFixturePreset(type, context) {
      if (type === 'sysprompt') {
        return {
          presetId: 'stage-b-fixture-sysprompt',
          source: 'stage-b-fixture',
          preset: {
            name: 'Stage B Fixture',
            content: '你是雪乃。遵循本轮提供的 APP 聊天格式，只输出一条简短回应，不解释格式。',
          },
        };
      }
      if (type === 'context') {
        return {
          presetId: 'stage-b-fixture-context',
          source: 'stage-b-fixture',
          preset: { name: 'Stage B Empty Context' },
        };
      }
      if (type === 'openai') {
        const resolved = originalGetResolvedActive.call(this, type, context) || {};
        const preset = defaultOpenAi ? { ...defaultOpenAi } : { ...(resolved.preset || {}) };
        delete preset.id;
        return {
          ...resolved,
          presetId: 'default',
          source: 'stage-b-fixture',
          preset: { ...preset, name: 'Default' },
        };
      }
      return originalGetResolvedActive.call(this, type, context);
    };
    bridge.getResolvedWorldState = function getEmptyFixtureWorldState(sessionId, options = {}) {
      return {
        sessionId: String(sessionId || ''),
        uiMode: String(options?.uiMode || 'chat'),
        isGroupChat: options?.isGroupChat === true,
        groupMemberIds: Array.isArray(options?.groupMemberIds) ? options.groupMemberIds.slice() : [],
        globalWorldIds: [],
        roleWorldIds: [],
        sessionWorldIds: [],
        worldIds: [],
      };
    };
    bridge.getGenerationOptions = function getFixtureGenerationOptions(_presetContext = {}, runtimeConfig = {}) {
      return reasoningEnabled
        ? {
            max_tokens: 1400,
            thinking: { type: 'enabled' },
            reasoning_effort: 'high',
          }
        : {
            temperature: 0.7,
            top_p: 0.9,
            max_tokens: 700,
            ...(String(runtimeConfig?.provider || '').trim().toLowerCase() === 'deepseek'
              ? { thinking: { type: 'disabled' } }
              : {}),
          };
    };
    if (bridge.regex && typeof originalRegexApply === 'function') {
      bridge.regex.apply = value => value;
    }

    const cohorts = [];
    cohorts.push(await runCohort({
      name: 'deepseek_private_first_thinking_off',
      runtime: deepSeekRuntime,
      kind: 'private_first',
    }));
    cohorts.push(await runCohort({
      name: 'deepseek_private_established_thinking_off',
      runtime: deepSeekRuntime,
      kind: 'private_established',
    }));
    cohorts.push(await runCohort({
      name: 'deepseek_private_first_thinking_on',
      runtime: deepSeekRuntime,
      kind: 'private_first',
      thinking: true,
    }));
    cohorts.push(await runCohort({
      name: 'deepseek_group_first_thinking_off',
      runtime: deepSeekRuntime,
      kind: 'group',
    }));
    cohorts.push(await runCohort({
      name: 'glm_5_2_private_first_thinking_off',
      runtime: glmRuntime,
      kind: 'private_first',
    }));
    cohorts.push(await runCohort({
      name: 'deepseek_moment_comment_thinking_off',
      runtime: deepSeekRuntime,
      kind: 'moment_comment',
    }));

    const totals = cohorts.reduce((summary, cohort) => ({
      total: summary.total + cohort.total,
      requestSuccess: summary.requestSuccess + cohort.requestSuccess,
      structuralContractSuccess: summary.structuralContractSuccess + cohort.structuralContractSuccess,
      parseSuccess: summary.parseSuccess + cohort.parseSuccess,
      expectedSurfaceMatch: summary.expectedSurfaceMatch + cohort.expectedSurfaceMatch,
      phonePrefillEnabled: summary.phonePrefillEnabled + cohort.phonePrefillEnabled,
      duplicatePhoneStart: summary.duplicatePhoneStart + cohort.duplicatePhoneStart,
    }), {
      total: 0,
      requestSuccess: 0,
      structuralContractSuccess: 0,
      parseSuccess: 0,
      expectedSurfaceMatch: 0,
      phonePrefillEnabled: 0,
      duplicatePhoneStart: 0,
    });

    return {
      fixtureVersion: 'stage-b-controlled-v1',
      rawContentRetained: false,
      requestMode: 'non_stream_terminal',
      phonePrefillExperimentEnabled,
      cohorts,
      totals,
    };
  } finally {
    if (phonePrefillExperimentEnabled) {
      bridge.debugUiRegistry?.actions?.setDeepSeekPhonePrefillExperimentEnabled?.(false);
    }
    presetStore.getResolvedActive = originalGetResolvedActive;
    presetStore.getState = originalGetState;
    bridge.getResolvedWorldState = originalGetResolvedWorldState;
    bridge.getGenerationOptions = originalGetGenerationOptions;
    if (bridge.regex && typeof originalRegexApply === 'function') {
      bridge.regex.apply = originalRegexApply;
    }
  }
})()
