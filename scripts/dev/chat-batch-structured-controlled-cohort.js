// Stage G.5 real-model gray cohort for the APP-owned phone batch protocol.
// Run through app-eval against an open Windows dev WebView with CDP 9222.
// Performs 24 paid, non-streaming, zero-write requests (12 fixtures x thinking off/on).
// Only aggregate metrics and bounded failure codes are retained; no response text or tool args persist.
(async () => {
  const bridge = window.appBridge;
  if (!bridge?.backgroundChat || !bridge?.config) {
    throw new Error('Stage G.5 batch cohort requires an initialized app bridge');
  }

  const [{
    buildPhoneBatchStructuredTransportInstruction,
    runPhoneBatchProviderFcAttempt,
  }] = await Promise.all([
    import('/scripts/ui/chat/phone-batch-provider-fc.js'),
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
  if (!profile?.id) throw new Error('Stage G.5 requires an official deepseek-v4-flash profile');
  const runtime = await bridge.config.getRuntimeConfigByProfileId(profile.id);
  if (!runtime) throw new Error('Stage G.5 could not resolve the DeepSeek runtime profile');

  const members = Object.freeze([
    { id: 'contact:g5-a', name: '测试甲' },
    { id: 'contact:g5-b', name: '测试乙' },
  ]);
  const groupTargets = Object.freeze([{
    id: 'group:g5-team',
    name: 'G5测试群',
    members,
  }]);
  const tableTargets = Object.freeze([{
    id: 'event',
    name: '事件',
    rowIds: ['event-row-1'],
  }]);
  const baseGroupTarget = Object.freeze({
    mode: 'group_chat',
    sessionId: 'group:g5-team',
    targetName: 'G5测试群',
    userName: '我',
    members,
    momentAuthors: members,
    tableTargets,
  });
  const basePrivateTarget = Object.freeze({
    mode: 'private_chat',
    sessionId: 'contact:g5-a',
    targetName: '测试甲',
    speakerId: 'contact:g5-a',
    speakerName: '测试甲',
    userName: '我',
    momentAuthors: [members[0]],
    tableTargets,
  });
  const baseMomentTarget = Object.freeze({
    mode: 'moment_comment',
    sessionId: 'contact:g5-a',
    targetName: '测试动态',
    userName: '我',
    momentId: 'moment:g5-1',
    momentAuthors: members,
    privateTargets: members,
    groupTargets,
    tableTargets,
  });
  const allowedItemTypes = Object.freeze(['text', 'sticker', 'voice', 'transfer', 'music', 'image']);
  const allowedStickerKeywords = Object.freeze(['收到', '晚安抱抱']);
  const noCapabilities = Object.freeze({});

  const fixtures = [
    {
      id: 'group_single_text',
      target: baseGroupTarget,
      capabilities: noCapabilities,
      expectedKinds: ['chat'],
      expectedMessageTypes: ['text'],
      prompt: '只提交一个 chat item，让测试甲发送一条 text 消息，内容必须包含“准备出发”。',
      signals: ['准备出发'],
    },
    {
      id: 'group_two_speakers',
      target: baseGroupTarget,
      capabilities: noCapabilities,
      expectedKinds: ['chat'],
      expectedSpeakerIds: ['contact:g5-a', 'contact:g5-b'],
      prompt: '只提交一个 chat item，依序让测试甲说“我负责地图”，测试乙说“我负责装备”，各一条 text 消息。',
      signals: ['地图', '装备'],
    },
    {
      id: 'group_sticker',
      target: baseGroupTarget,
      capabilities: noCapabilities,
      expectedKinds: ['chat'],
      expectedMessageTypes: ['sticker'],
      prompt: '只提交一个 chat item，让测试乙只发送一条 sticker 消息，content 必须是“收到”。',
      signals: ['收到'],
    },
    {
      id: 'private_moment_post',
      target: basePrivateTarget,
      capabilities: { momentPost: true },
      expectedKinds: ['chat', 'moment_post'],
      prompt: '先用 chat 回复一句包含“拍好了”的文字，再提交一个 moment_post，动态正文必须包含“清晨车站”。不要提交其他 item。',
      signals: ['拍好了', '清晨车站'],
    },
    {
      id: 'private_image_summary',
      target: basePrivateTarget,
      capabilities: { imagePrompt: true, summary: true },
      expectedKinds: ['chat', 'image_prompt', 'summary'],
      prompt: '先用 chat 回复一句包含“我看见了”的文字，再提交 image_prompt 描述月光窗台，最后提交包含“月光窗台”的简短 summary。',
      signals: ['我看见了', '月光', '窗台'],
    },
    {
      id: 'group_table_insert',
      target: baseGroupTarget,
      capabilities: { tableEdit: true },
      expectedKinds: ['chat', 'table_edit'],
      expectedTable: { action: 'insert', tableId: 'event', rowId: '' },
      prompt: '先让测试甲用 chat 说“已登记”，再提交 table_edit：向 event 表 insert，data.note 必须包含“抵达车站”。',
      signals: ['已登记', '抵达车站'],
    },
    {
      id: 'group_table_update',
      target: baseGroupTarget,
      capabilities: { tableEdit: true },
      expectedKinds: ['chat', 'table_edit'],
      expectedTable: { action: 'update', tableId: 'event', rowId: 'event-row-1' },
      prompt: '先让测试乙用 chat 说“状态更新”，再提交 table_edit：update event 表的 rowIndex 0，data.note 必须包含“调查完成”。',
      signals: ['状态更新', '调查完成'],
    },
    {
      id: 'group_all_ordered_effects',
      target: baseGroupTarget,
      capabilities: {
        momentPost: true,
        imagePrompt: true,
        tableEdit: true,
        summary: true,
      },
      expectedKinds: ['chat', 'moment_post', 'image_prompt', 'table_edit', 'summary'],
      expectedTable: { action: 'insert', tableId: 'event', rowId: '' },
      prompt: [
        '严格提交五个 item：',
        '1 chat：测试甲说“任务完成”；',
        '2 moment_post：测试乙发布正文含“庆祝合照”；',
        '3 image_prompt：描述两人在车站合照；',
        '4 table_edit：向 event 表 insert，data.note 含“任务完成”；',
        '5 summary：内容含“任务完成”。',
      ].join('\n'),
      signals: ['任务完成', '庆祝合照'],
    },
    {
      id: 'moment_single_comment',
      target: baseMomentTarget,
      capabilities: noCapabilities,
      expectedKinds: ['moment_comment'],
      expectedCommentAuthors: ['contact:g5-a'],
      prompt: '只提交一个 moment_comment item，由测试甲评论，内容必须包含“一起散步”。',
      signals: ['一起散步'],
    },
    {
      id: 'moment_two_authors',
      target: baseMomentTarget,
      capabilities: noCapabilities,
      expectedKinds: ['moment_comment'],
      expectedCommentAuthors: ['contact:g5-a', 'contact:g5-b'],
      prompt: '只提交一个 moment_comment item，依序由测试甲评论“我也去”，测试乙评论“算我一个”。',
      signals: ['我也去', '算我一个'],
    },
    {
      id: 'moment_private_side_chat',
      target: baseMomentTarget,
      capabilities: { momentCommentSideChats: true },
      expectedKinds: ['moment_comment', 'private_chat'],
      expectedPrivateTargetId: 'contact:g5-b',
      prompt: '先由测试甲提交公开 moment_comment，内容含“公开收到”；再向测试乙提交 private_chat，消息含“晚点细说”。不要提交群聊。',
      signals: ['公开收到', '晚点细说'],
    },
    {
      id: 'moment_group_side_chat',
      target: baseMomentTarget,
      capabilities: { momentCommentSideChats: true },
      expectedKinds: ['moment_comment', 'group_chat'],
      expectedGroupTargetId: 'group:g5-team',
      prompt: '先由测试乙提交公开 moment_comment，内容含“公开回应”；再向 G5测试群提交 group_chat，由测试甲发送“群里继续”。不要提交私聊。',
      signals: ['公开回应', '群里继续'],
    },
  ];
  const modes = Object.freeze([
    { id: 'thinking_off', thinkingEnabled: false },
    { id: 'thinking_on', thinkingEnabled: true },
  ]);
  const samples = [];

  const safeCode = error => String(
    error?.code
    || (Number.isFinite(Number(error?.status)) ? `http_${Number(error.status)}` : error?.name || 'request_failed'),
  ).slice(0, 80);
  const percentile = (values, ratio) => {
    const sorted = values.filter(Number.isFinite).slice().sort((a, b) => a - b);
    if (!sorted.length) return null;
    return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1))];
  };
  const sumUsage = (entries, key) => {
    const values = entries.map(entry => Number(entry?.[key])).filter(Number.isFinite);
    return values.length ? values.reduce((sum, value) => sum + value, 0) : null;
  };
  const sameOrder = (actual, expected) => (
    actual.length === expected.length && actual.every((item, index) => item === expected[index])
  );
  const collectSemanticText = (ir) => (Array.isArray(ir?.items) ? ir.items : [])
    .flatMap((item) => [
      ...(Array.isArray(item?.messages) ? item.messages.map(message => message?.content) : []),
      ...(Array.isArray(item?.posts) ? item.posts.map(post => post?.content) : []),
      ...(Array.isArray(item?.comments) ? item.comments.map(comment => comment?.content) : []),
      item?.prompt,
      item?.content,
      ...(Array.isArray(item?.actions) ? item.actions.map(action => JSON.stringify(action?.data || {})) : []),
    ])
    .map(value => String(value || ''))
    .join('\n');
  const inspect = (fixture, result) => {
    const items = Array.isArray(result?.ir?.items) ? result.ir.items : [];
    const kinds = items.map(item => String(item?.kind || ''));
    const messages = items.flatMap(item => Array.isArray(item?.messages) ? item.messages : []);
    const actualSpeakerIds = [...new Set(messages.map(message => String(message?.speaker?.id || '')).filter(Boolean))];
    const expectedSpeakerIds = Array.isArray(fixture.expectedSpeakerIds) ? fixture.expectedSpeakerIds : [];
    const actualTypes = messages.map(message => String(message?.type || 'text'));
    const expectedTypes = Array.isArray(fixture.expectedMessageTypes) ? fixture.expectedMessageTypes : [];
    const comments = items.flatMap(item => Array.isArray(item?.comments) ? item.comments : []);
    const actualCommentAuthors = [...new Set(comments.map(comment => String(comment?.author?.id || '')).filter(Boolean))];
    const expectedCommentAuthors = Array.isArray(fixture.expectedCommentAuthors)
      ? fixture.expectedCommentAuthors
      : [];
    const privateItem = items.find(item => item?.kind === 'private_chat') || null;
    const groupItem = items.find(item => item?.kind === 'group_chat') || null;
    const tableAction = items.find(item => item?.kind === 'table_edit')?.actions?.[0] || null;
    const tableCorrect = !fixture.expectedTable || Boolean(
      tableAction
      && tableAction.action === fixture.expectedTable.action
      && tableAction.tableId === fixture.expectedTable.tableId
      && String(tableAction.rowId || '') === fixture.expectedTable.rowId,
    );
    const semanticText = collectSemanticText(result?.ir);
    return {
      requestOk: true,
      providerFcSuccess: result?.ok === true,
      exactKinds: sameOrder(kinds, fixture.expectedKinds),
      targetCorrect: result?.ir?.context?.sessionId === fixture.target.sessionId,
      speakerSetCorrect: !expectedSpeakerIds.length || (
        expectedSpeakerIds.length === actualSpeakerIds.length
        && expectedSpeakerIds.every(id => actualSpeakerIds.includes(id))
      ),
      messageTypesCorrect: !expectedTypes.length || sameOrder(actualTypes, expectedTypes),
      commentAuthorsCorrect: !expectedCommentAuthors.length || (
        expectedCommentAuthors.length === actualCommentAuthors.length
        && expectedCommentAuthors.every(id => actualCommentAuthors.includes(id))
      ),
      privateTargetCorrect: !fixture.expectedPrivateTargetId
        || privateItem?.target?.id === fixture.expectedPrivateTargetId,
      groupTargetCorrect: !fixture.expectedGroupTargetId
        || groupItem?.target?.id === fixture.expectedGroupTargetId,
      tableCorrect,
      semanticSignalMatch: fixture.signals.every(signal => semanticText.includes(signal)),
      exactOneToolCall: Number(result?.diagnostics?.toolCallCount || 0) === 1,
      noLeakedResponseText: Number(result?.diagnostics?.responseChars || 0) === 0,
      issueCodes: result?.ok
        ? []
        : [String(result?.reason || 'provider_fc_failed'), ...(result?.validationErrors || []).slice(0, 6)],
    };
  };

  const total = fixtures.length * modes.length;
  window.__stageG5BatchCohortProgress = { completed: 0, expected: total };
  window.__stageG5BatchCohortResult = null;
  for (const mode of modes) {
    for (const fixture of fixtures) {
      const usage = [];
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
          client: {
            chat: (messages, options) => bridge.backgroundChat(messages, {
              ...options,
              runtimeConfigOverride: { ...runtime, webSearchEnabled: false, stream: false },
              presetContext: {
                sessionId: fixture.target.sessionId,
                uiMode: fixture.target.mode === 'moment_comment' ? 'moments' : 'chat',
                taskType: 'stage_g5_batch_cohort',
              },
            }),
          },
          config: runtime,
          messages: [
            {
              role: 'system',
              content: [
                '你正在执行 APP 内建手机协议的受控测试。严格按用户列出的 item、顺序、身份和关键词提交；不要增加未要求的 item。',
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
          thinkingEnabled: mode.thinkingEnabled,
          maxTokens: 2200,
          onProviderUsage: entry => usage.push(entry),
        });
        row = {
          fixtureId: fixture.id,
          mode: mode.id,
          ...inspect(fixture, result),
          latencyMs: Math.round(performance.now() - startedAt),
          promptTokens: sumUsage(usage, 'promptTokens'),
          completionTokens: sumUsage(usage, 'completionTokens'),
          totalTokens: sumUsage(usage, 'totalTokens'),
        };
      } catch (error) {
        row = {
          fixtureId: fixture.id,
          mode: mode.id,
          requestOk: false,
          providerFcSuccess: false,
          exactKinds: false,
          targetCorrect: false,
          speakerSetCorrect: false,
          messageTypesCorrect: false,
          commentAuthorsCorrect: false,
          privateTargetCorrect: false,
          groupTargetCorrect: false,
          tableCorrect: false,
          semanticSignalMatch: false,
          exactOneToolCall: false,
          noLeakedResponseText: false,
          issueCodes: [safeCode(error)],
          latencyMs: Math.round(performance.now() - startedAt),
          promptTokens: null,
          completionTokens: null,
          totalTokens: null,
        };
      }
      row.pass = [
        'requestOk',
        'providerFcSuccess',
        'exactKinds',
        'targetCorrect',
        'speakerSetCorrect',
        'messageTypesCorrect',
        'commentAuthorsCorrect',
        'privateTargetCorrect',
        'groupTargetCorrect',
        'tableCorrect',
        'semanticSignalMatch',
        'exactOneToolCall',
        'noLeakedResponseText',
      ].every(key => row[key] === true);
      samples.push(row);
      window.__stageG5BatchCohortProgress = {
        completed: samples.length,
        expected: total,
        lastFixture: fixture.id,
        lastMode: mode.id,
      };
      console.info('[stage-g5-batch]', `${samples.length}/${total}`, mode.id, fixture.id, row.pass ? 'pass' : 'fail');
    }
  }

  const summarize = (rows) => {
    const count = key => rows.filter(row => row[key] === true).length;
    const sum = key => {
      const values = rows.map(row => Number(row[key])).filter(Number.isFinite);
      return values.length ? values.reduce((totalValue, value) => totalValue + value, 0) : null;
    };
    const issueCounts = {};
    rows.forEach(row => row.issueCodes.forEach(code => {
      issueCounts[code] = (issueCounts[code] || 0) + 1;
    }));
    const latencies = rows.map(row => Number(row.latencyMs)).filter(Number.isFinite);
    return {
      total: rows.length,
      passed: count('pass'),
      requestSuccess: count('requestOk'),
      providerFcSuccess: count('providerFcSuccess'),
      exactKinds: count('exactKinds'),
      targetCorrect: count('targetCorrect'),
      semanticSignalMatch: count('semanticSignalMatch'),
      exactOneToolCall: count('exactOneToolCall'),
      noLeakedResponseText: count('noLeakedResponseText'),
      averageLatencyMs: latencies.length
        ? Math.round(latencies.reduce((totalValue, value) => totalValue + value, 0) / latencies.length)
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
    fixtureVersion: 'stage-g5-phone-batch-v1',
    provider: String(runtime.provider || ''),
    model: String(runtime.model || ''),
    requestMode: 'non_stream_terminal',
    persistentWrites: 0,
    rawContentRetained: false,
    argumentContentRetained: false,
    sampleCount: samples.length,
    overall: summarize(samples),
    cohorts: modes.map(mode => ({
      mode: mode.id,
      ...summarize(samples.filter(sample => sample.mode === mode.id)),
    })),
    failures: samples.filter(sample => !sample.pass).map(sample => ({
      fixtureId: sample.fixtureId,
      mode: sample.mode,
      issueCodes: sample.issueCodes.slice(0, 8),
      checks: {
        requestOk: sample.requestOk,
        providerFcSuccess: sample.providerFcSuccess,
        exactKinds: sample.exactKinds,
        targetCorrect: sample.targetCorrect,
        semanticSignalMatch: sample.semanticSignalMatch,
        exactOneToolCall: sample.exactOneToolCall,
        noLeakedResponseText: sample.noLeakedResponseText,
      },
    })),
  };
  window.__stageG5BatchCohortResult = result;
  return result;
})()
