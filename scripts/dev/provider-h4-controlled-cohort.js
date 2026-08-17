// Stage H.4 bounded real-provider cohort. Run through app-eval in the Windows dev WebView.
// Eight calls per provider: four maid planner cases and four APP phone-batch cases.
// It executes no business tool, writes no chat data, and retains no model text/tool arguments.
(async () => {
  const bridge = window.appBridge;
  if (!bridge?.config) throw new Error('Stage H.4 cohort requires an initialized app bridge');
  const [
    { LLMClient },
    { runMaidProviderFcAttempt },
    {
      buildPhoneBatchStructuredTransportInstruction,
      runPhoneBatchProviderFcAttempt,
    },
  ] = await Promise.all([
    import('/scripts/api/client.js'),
    import('/scripts/agent/maid-provider-fc-planner.js'),
    import('/scripts/ui/chat/phone-batch-provider-fc.js'),
  ]);

  const trim = value => String(value ?? '').trim();
  const profiles = bridge.config.getProfiles?.() || [];
  const providerFilter = trim(window.__stageH4ProviderFilter).toLowerCase();
  const fixtureFilter = trim(window.__stageH4FixtureFilter).toLowerCase();
  const targets = [
    { id: 'gemini', profileName: '默认', providers: ['makersuite', 'gemini'] },
    { id: 'anthropic', profileName: 'Claude', providers: ['anthropic'] },
    { id: 'openai', profileName: 'oai', providers: ['openai'] },
    {
      id: 'openrouter',
      profileName: 'openrouter',
      providers: ['openrouter'],
      phoneOnly: true,
      runtime: {
        model: 'google/gemini-3.7-flash',
        baseUrl: 'https://openrouter.ai/api/v1',
        connectionMode: 'direct',
        proxyBaseUrl: '',
      },
    },
  ].filter(target => !providerFilter || target.id === providerFilter);

  const feature = Object.freeze({
    id: 'stage-h4.synthetic-management',
    title: 'Synthetic management operations',
    summary: 'Select one synthetic APP operation. The cohort never executes it.',
    tools: ['session.list', 'worldbook.update_entries', 'session.delete_many'],
    toolSchemas: {
      'session.list': {
        type: 'object',
        additionalProperties: false,
        properties: { includeGroups: { type: 'boolean' } },
        required: ['includeGroups'],
      },
      'worldbook.update_entries': {
        type: 'object',
        additionalProperties: false,
        properties: {
          worldbookId: { type: 'string', minLength: 1 },
          updates: {
            type: 'array',
            minItems: 1,
            maxItems: 1,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                entryId: { type: 'string', minLength: 1 },
                content: { type: 'string', minLength: 1 },
              },
              required: ['entryId', 'content'],
            },
          },
        },
        required: ['worldbookId', 'updates'],
      },
      'session.delete_many': {
        type: 'object',
        additionalProperties: false,
        properties: {
          sessionIds: {
            type: 'array',
            minItems: 2,
            maxItems: 2,
            items: { type: 'string', minLength: 1 },
          },
        },
        required: ['sessionIds'],
      },
    },
  });
  const maidFixtures = [
    {
      id: 'maid_read',
      input: '只选择 session.list，并传 includeGroups=true。不要选择修改或删除工具。',
      kind: 'tool',
      expectedTool: 'session.list',
      checkArgs: args => args?.includeGroups === true,
    },
    {
      id: 'maid_nested_write',
      input: '选择 worldbook.update_entries：worldbookId="wb:h4"，updates 只有一项，entryId="entry:h4"，content="H4已更新"。只规划，不执行。',
      kind: 'tool',
      expectedTool: 'worldbook.update_entries',
      checkArgs: args => (
        args?.worldbookId === 'wb:h4'
        && args?.updates?.length === 1
        && args.updates[0]?.entryId === 'entry:h4'
        && args.updates[0]?.content === 'H4已更新'
      ),
    },
    {
      id: 'maid_dangerous',
      input: '目标已经明确：只选择 session.delete_many，sessionIds 必须依序为 "session:h4-a"、"session:h4-b"。只规划，不执行。',
      kind: 'tool',
      expectedTool: 'session.delete_many',
      checkArgs: args => (
        args?.sessionIds?.length === 2
        && args.sessionIds[0] === 'session:h4-a'
        && args.sessionIds[1] === 'session:h4-b'
      ),
    },
    {
      id: 'maid_clarify',
      input: '我想删除聊天室但没有提供任何目标。不要猜测，也不要调用业务工具；请使用澄清控制出口。',
      kind: 'control',
      expectedControl: 'clarify',
    },
  ].filter(fixture => !fixtureFilter || fixture.id === fixtureFilter);

  const members = Object.freeze([
    { id: 'contact:h4-a', name: '测试甲' },
    { id: 'contact:h4-b', name: '测试乙' },
  ]);
  const groupTargets = Object.freeze([{ id: 'group:h4', name: 'H4测试群', members }]);
  const tableTargets = Object.freeze([{ id: 'event', name: '事件', rowIds: ['event-row-h4'] }]);
  const privateTarget = Object.freeze({
    mode: 'private_chat',
    sessionId: 'contact:h4-a',
    targetName: '测试甲',
    speakerId: 'contact:h4-a',
    speakerName: '测试甲',
    userName: '我',
    momentAuthors: [members[0]],
    tableTargets,
  });
  const groupTarget = Object.freeze({
    mode: 'group_chat',
    sessionId: 'group:h4',
    targetName: 'H4测试群',
    userName: '我',
    members,
    momentAuthors: members,
    tableTargets,
  });
  const momentTarget = Object.freeze({
    mode: 'moment_comment',
    sessionId: 'contact:h4-a',
    targetName: 'H4测试动态',
    userName: '我',
    momentId: 'moment:h4',
    momentAuthors: members,
    privateTargets: members,
    groupTargets,
    tableTargets,
  });
  const phoneFixtures = [
    {
      id: 'phone_private_special',
      target: privateTarget,
      capabilities: {},
      expectedKinds: ['chat'],
      expectedTypes: ['voice', 'sticker'],
      signals: ['马上到', '收到'],
      prompt: '只提交一个 chat item，依序发送 voice（content 必须含“马上到”）和 sticker（content 必须精确为“收到”）。',
    },
    {
      id: 'phone_group_speakers',
      target: groupTarget,
      capabilities: {},
      expectedKinds: ['chat'],
      expectedSpeakers: ['contact:h4-a', 'contact:h4-b'],
      signals: ['地图', '装备'],
      prompt: '只提交一个 chat item：测试甲先说“我负责地图”，测试乙再说“我负责装备”，两条都是 text。',
    },
    {
      id: 'phone_moment_side_chat',
      target: momentTarget,
      capabilities: { momentCommentSideChats: true },
      expectedKinds: ['moment_comment', 'private_chat'],
      expectedPrivateTarget: 'contact:h4-b',
      signals: ['公开收到', '晚点细说'],
      prompt: '先由测试甲提交 moment_comment，正文含“公开收到”；再向测试乙提交 private_chat，消息含“晚点细说”。不要增加其他 item。',
    },
    {
      id: 'phone_ordered_effects',
      target: groupTarget,
      capabilities: { momentPost: true, imagePrompt: true, tableEdit: true, summary: true },
      expectedKinds: ['chat', 'moment_post', 'image_prompt', 'table_edit', 'summary'],
      signals: ['任务完成', '庆祝合照'],
      expectedTable: true,
      prompt: [
        '严格依序提交五个 item：',
        '1 chat：测试甲说“任务完成”；',
        '2 moment_post：测试乙发布正文含“庆祝合照”；',
        '3 image_prompt：描述两人在车站合照；',
        '4 table_edit：向 event 表 insert，data.note 含“任务完成”；',
        '5 summary：内容含“任务完成”。',
      ].join('\n'),
    },
  ].filter(fixture => !fixtureFilter || fixture.id === fixtureFilter);
  const allowedItemTypes = ['text', 'sticker', 'voice', 'transfer', 'music', 'image'];
  const allowedStickerKeywords = ['收到', '晚安抱抱'];
  const rows = [];
  const percentile = (values, ratio) => {
    const sorted = values.filter(Number.isFinite).slice().sort((a, b) => a - b);
    return sorted.length
      ? sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1))]
      : null;
  };
  const safeCode = error => trim(
    error?.code || (Number.isFinite(Number(error?.status)) ? `http_${Number(error.status)}` : error?.name),
  ).slice(0, 80) || 'request_failed';
  const usageValue = (entries, key) => {
    const values = entries
      .map(entry => entry?.[key])
      .filter(value => value !== null && value !== undefined)
      .map(Number)
      .filter(Number.isFinite);
    return values.length ? values.reduce((sum, value) => sum + value, 0) : null;
  };
  const collectSemanticText = ir => (Array.isArray(ir?.items) ? ir.items : [])
    .flatMap(item => [
      ...(Array.isArray(item?.messages) ? item.messages.map(message => message?.content) : []),
      ...(Array.isArray(item?.posts) ? item.posts.map(post => post?.content) : []),
      ...(Array.isArray(item?.comments) ? item.comments.map(comment => comment?.content) : []),
      item?.prompt,
      item?.content,
      ...(Array.isArray(item?.actions) ? item.actions.map(action => JSON.stringify(action?.data || {})) : []),
    ])
    .map(value => String(value || ''))
    .join('\n');
  const sameOrder = (actual, expected) => (
    actual.length === expected.length && actual.every((value, index) => value === expected[index])
  );

  const total = targets.reduce((sum, target) => (
    sum + phoneFixtures.length + (target.phoneOnly ? 0 : maidFixtures.length)
  ), 0);
  window.__stageH4CohortProgress = { completed: 0, expected: total };
  window.__stageH4CohortResult = null;

  for (const target of targets) {
    const profile = profiles.find(item => (
      trim(item?.name) === target.profileName
      && target.providers.includes(trim(item?.provider).toLowerCase())
    ));
    if (!profile?.id) {
      rows.push({ provider: target.id, surface: 'profile', fixtureId: 'profile', pass: false, issueCodes: ['profile_missing'] });
      continue;
    }
    const storedRuntime = await bridge.config.getRuntimeConfigByProfileId(profile.id);
    if (!storedRuntime) {
      rows.push({ provider: target.id, surface: 'profile', fixtureId: 'profile', pass: false, issueCodes: ['runtime_missing'] });
      continue;
    }
    const runtime = { ...storedRuntime, ...(target.runtime || {}), webSearchEnabled: false };
    const client = new LLMClient({ ...runtime, webSearchEnabled: false });
    await client.prepareProviderFcCapabilities?.();

    for (const fixture of (target.phoneOnly ? [] : maidFixtures)) {
      const usage = [];
      const startedAt = performance.now();
      let row;
      try {
        const result = await runMaidProviderFcAttempt({
          client,
          config: runtime,
          messages: [
            {
              role: 'system',
              content: '这是零写入 FC 受控测试。严格选择最符合用户要求的唯一工具；资料不足时使用 maid_planner_control。不要输出工具调用以外正文。',
            },
            { role: 'user', content: fixture.input },
          ],
          capabilitySnapshot: {
            id: `stage-h4-${target.id}-${fixture.id}`,
            useCandidates: true,
            candidateFeatures: [feature],
          },
          experimentStatus: { enabled: true, thinkingEnabled: false },
          maxTokens: 480,
          onModelUsage: entry => usage.push(entry),
        });
        const kindCorrect = result?.ok === true && result?.kind === fixture.kind;
        const selectionCorrect = fixture.kind === 'tool'
          ? result?.selection?.toolName === fixture.expectedTool
          : result?.control?.action === fixture.expectedControl;
        const argsCorrect = fixture.kind !== 'tool' || fixture.checkArgs?.(result?.selection?.args) === true;
        const noLeakedText = Number(result?.diagnostics?.responseChars || 0) === 0;
        const oneCall = Number(result?.diagnostics?.completedToolCallCount || 0) === 1;
        row = {
          provider: target.id,
          configuredProvider: trim(runtime.provider),
          model: trim(runtime.model),
          surface: 'maid',
          fixtureId: fixture.id,
          requestOk: result?.attempted === true,
          kindCorrect,
          selectionCorrect,
          argsCorrect,
          noLeakedText,
          oneCall,
          pass: kindCorrect && selectionCorrect && argsCorrect && noLeakedText && oneCall,
          issueCodes: result?.ok
            ? []
            : [
                trim(result?.reason, 'provider_fc_failed'),
                ...(trim(result?.diagnostics?.errorCode) ? [trim(result.diagnostics.errorCode)] : []),
                ...(Array.isArray(result?.validationErrors) ? result.validationErrors.slice(0, 8) : []),
              ],
          latencyMs: Math.round(performance.now() - startedAt),
          promptTokens: usageValue(usage, 'promptTokens'),
          completionTokens: usageValue(usage, 'completionTokens'),
          totalTokens: usageValue(usage, 'totalTokens'),
        };
      } catch (error) {
        row = {
          provider: target.id,
          configuredProvider: trim(runtime.provider),
          model: trim(runtime.model),
          surface: 'maid',
          fixtureId: fixture.id,
          requestOk: false,
          pass: false,
          issueCodes: [safeCode(error)],
          latencyMs: Math.round(performance.now() - startedAt),
          promptTokens: null,
          completionTokens: null,
          totalTokens: null,
        };
      }
      rows.push(row);
      window.__stageH4CohortProgress = { completed: rows.length, expected: total, provider: target.id, fixtureId: fixture.id };
      console.info('[stage-h4]', `${rows.length}/${total}`, target.id, fixture.id, row.pass ? 'pass' : 'fail');
    }

    for (const fixture of phoneFixtures) {
      const usage = [];
      const preview = { updateCount: 0, firstAt: 0, disposed: false, outcome: '' };
      const startedAt = performance.now();
      let row;
      try {
        const instruction = buildPhoneBatchStructuredTransportInstruction({
          target: fixture.target,
          capabilities: fixture.capabilities,
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
                '这是零写入 APP 手机协议受控测试。严格按用户指定的 item、顺序、身份和关键词提交，不要输出工具调用以外正文。',
                instruction,
              ].join('\n\n'),
            },
            { role: 'user', content: fixture.prompt },
          ],
          context: {
            uiMode: fixture.target.mode === 'moment_comment' ? 'moments' : 'chat',
            surface: fixture.target.mode,
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
          },
          target: fixture.target,
          capabilities: fixture.capabilities,
          allowedItemTypes,
          allowedStickerKeywords,
          thinkingEnabled: false,
          maxTokens: 1400,
          streamPreviewEnabled: true,
          onStructuredPreview: event => {
            if (event?.phase === 'update') {
              preview.updateCount += 1;
              if (!preview.firstAt) preview.firstAt = performance.now();
            } else if (event?.phase === 'dispose') {
              preview.disposed = true;
              preview.outcome = trim(event?.outcome);
            }
          },
          onModelUsage: entry => usage.push(entry),
        });
        const items = Array.isArray(result?.ir?.items) ? result.ir.items : [];
        const kinds = items.map(item => trim(item?.kind));
        const messages = items.flatMap(item => Array.isArray(item?.messages) ? item.messages : []);
        const types = messages.map(message => trim(message?.type, 'text'));
        const speakers = [...new Set(messages.map(message => trim(message?.speaker?.id)).filter(Boolean))];
        const privateItem = items.find(item => item?.kind === 'private_chat') || null;
        const tableAction = items.find(item => item?.kind === 'table_edit')?.actions?.[0] || null;
        const semanticText = collectSemanticText(result?.ir);
        const exactKinds = sameOrder(kinds, fixture.expectedKinds);
        const typesCorrect = !fixture.expectedTypes || sameOrder(types, fixture.expectedTypes);
        const speakersCorrect = !fixture.expectedSpeakers || (
          speakers.length === fixture.expectedSpeakers.length
          && fixture.expectedSpeakers.every(id => speakers.includes(id))
        );
        const privateTargetCorrect = !fixture.expectedPrivateTarget
          || privateItem?.target?.id === fixture.expectedPrivateTarget;
        const tableCorrect = !fixture.expectedTable || Boolean(
          tableAction?.action === 'insert' && tableAction?.tableId === 'event',
        );
        const signalsCorrect = fixture.signals.every(signal => semanticText.includes(signal));
        const oneCall = Number(result?.diagnostics?.toolCallCount || 0) === 1;
        const noLeakedText = Number(result?.diagnostics?.responseChars || 0) === 0;
        const previewUsed = result?.diagnostics?.streamPreviewUsed === true
          && preview.updateCount > 0
          && preview.disposed
          && preview.outcome === 'accepted';
        row = {
          provider: target.id,
          configuredProvider: trim(runtime.provider),
          model: trim(runtime.model),
          surface: 'phone',
          fixtureId: fixture.id,
          requestOk: result?.attempted === true,
          providerFcSuccess: result?.ok === true,
          exactKinds,
          targetCorrect: result?.ir?.context?.sessionId === fixture.target.sessionId,
          typesCorrect,
          speakersCorrect,
          privateTargetCorrect,
          tableCorrect,
          signalsCorrect,
          oneCall,
          noLeakedText,
          previewUsed,
          previewUpdateCount: preview.updateCount,
          firstPreviewLatencyMs: preview.firstAt ? Math.round(preview.firstAt - startedAt) : null,
          pass: Boolean(
            result?.ok
            && exactKinds
            && result?.ir?.context?.sessionId === fixture.target.sessionId
            && typesCorrect
            && speakersCorrect
            && privateTargetCorrect
            && tableCorrect
            && signalsCorrect
            && oneCall
            && noLeakedText
            && previewUsed
          ),
          issueCodes: result?.ok
            ? []
            : [
                trim(result?.reason, 'provider_fc_failed'),
                ...(trim(result?.diagnostics?.errorCode) ? [trim(result.diagnostics.errorCode)] : []),
                ...(Array.isArray(result?.validationErrors) ? result.validationErrors.slice(0, 8) : []),
              ],
          latencyMs: Math.round(performance.now() - startedAt),
          promptTokens: usageValue(usage, 'promptTokens'),
          completionTokens: usageValue(usage, 'completionTokens'),
          totalTokens: usageValue(usage, 'totalTokens'),
        };
      } catch (error) {
        row = {
          provider: target.id,
          configuredProvider: trim(runtime.provider),
          model: trim(runtime.model),
          surface: 'phone',
          fixtureId: fixture.id,
          requestOk: false,
          pass: false,
          issueCodes: [safeCode(error)],
          latencyMs: Math.round(performance.now() - startedAt),
          promptTokens: null,
          completionTokens: null,
          totalTokens: null,
        };
      }
      rows.push(row);
      window.__stageH4CohortProgress = { completed: rows.length, expected: total, provider: target.id, fixtureId: fixture.id };
      console.info('[stage-h4]', `${rows.length}/${total}`, target.id, fixture.id, row.pass ? 'pass' : 'fail');
    }
  }

  const summarize = (providerRows) => {
    const latencies = providerRows.map(row => Number(row.latencyMs)).filter(Number.isFinite);
    const previewLatencies = providerRows
      .map(row => row.firstPreviewLatencyMs)
      .filter(value => value !== null && value !== undefined)
      .map(Number)
      .filter(Number.isFinite);
    const sum = key => {
      const values = providerRows
        .map(row => row[key])
        .filter(value => value !== null && value !== undefined)
        .map(Number)
        .filter(Number.isFinite);
      return values.length ? values.reduce((totalValue, value) => totalValue + value, 0) : null;
    };
    return {
      total: providerRows.length,
      passed: providerRows.filter(row => row.pass).length,
      maidPassed: providerRows.filter(row => row.surface === 'maid' && row.pass).length,
      phonePassed: providerRows.filter(row => row.surface === 'phone' && row.pass).length,
      previewPassed: providerRows.filter(row => row.surface === 'phone' && row.previewUsed).length,
      averageLatencyMs: latencies.length
        ? Math.round(latencies.reduce((sumValue, value) => sumValue + value, 0) / latencies.length)
        : null,
      p95LatencyMs: percentile(latencies, 0.95),
      firstPreviewP50Ms: percentile(previewLatencies, 0.5),
      firstPreviewP95Ms: percentile(previewLatencies, 0.95),
      promptTokens: sum('promptTokens'),
      completionTokens: sum('completionTokens'),
      totalTokens: sum('totalTokens'),
    };
  };
  const result = {
    fixtureVersion: 'stage-h4-provider-cohort-v1',
    providers: targets.map(target => target.id),
    callsPerProvider: Math.max(0, ...targets.map(target => (
      phoneFixtures.length + (target.phoneOnly ? 0 : maidFixtures.length)
    ))),
    callUpperBound: total,
    persistentWrites: 0,
    businessToolsExecuted: 0,
    rawContentRetained: false,
    argumentContentRetained: false,
    overall: summarize(rows),
    cohorts: targets.map(target => ({
      provider: target.id,
      ...summarize(rows.filter(row => row.provider === target.id)),
    })),
    failures: rows.filter(row => !row.pass).map(row => ({
      provider: row.provider,
      surface: row.surface,
      fixtureId: row.fixtureId,
      issueCodes: row.issueCodes.slice(0, 6),
      checks: {
        requestOk: row.requestOk,
        providerFcSuccess: row.providerFcSuccess,
        kindCorrect: row.kindCorrect,
        selectionCorrect: row.selectionCorrect,
        argsCorrect: row.argsCorrect,
        exactKinds: row.exactKinds,
        targetCorrect: row.targetCorrect,
        signalsCorrect: row.signalsCorrect,
        oneCall: row.oneCall,
        noLeakedText: row.noLeakedText,
        previewUsed: row.previewUsed,
      },
    })),
  };
  window.__stageH4CohortProgress = { completed: rows.length, expected: total, finished: true };
  window.__stageH4CohortResult = result;
  return result;
})()
