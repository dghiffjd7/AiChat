// Manual real-model Stage E fixture. Run through app-eval against an already-open Windows dev WebView.
// It performs 162 paid planner-only requests (27 cases x 3 repetitions x 2 transports),
// retains no model text or arguments, and never executes a business tool.
(async () => {
  const actions = window.appBridge?.debugUiRegistry?.actions || {};
  if (
    typeof actions.runMaidPlannerDecisionPreview !== 'function' ||
    typeof actions.setMaidDeepSeekProviderFcExperiment !== 'function'
  ) {
    throw new Error('Stage E controlled cohort requires the maid planner preview runtime');
  }

  const fixtureVersion = 'stage-e-maid-fc-v1.1';
  const repetitions = 3;
  const fixtures = [
    {
      id: 'session-list',
      input: '只查询：列出当前角色卡下的聊天室，包含群聊，不要打开或修改任何内容。',
      expectedTool: 'session.list',
      readOnly: true,
    },
    {
      id: 'session-create',
      input: '新建一个名为「FC验收房」的私聊，保持在后台，不要自动打开。',
      expectedTool: 'session.create',
    },
    {
      id: 'session-open',
      input: '请直接打开 sessionId 为「maid-fc-session-id」的聊天室；这个值就是内部 ID，不需要先查列表。',
      expectedTool: 'session.open',
    },
    {
      id: 'session-delete-many',
      input: '请永久删除「FC废弃房-A」和「FC废弃房-B」两个聊天室；这是明确的批量删除请求。',
      expectedTool: 'session.delete_many',
      dangerous: true,
    },
    {
      id: 'session-open-config',
      input: '打开当前聊天室的会话配置界面，但不要修改或保存任何设置。',
      expectedTool: 'session.open_config',
    },
    {
      id: 'group-create',
      input: '创建群聊「FC小组」，成员是「米娅」和「莉莉」，创建后不要打开。',
      expectedTool: 'group.create',
    },
    {
      id: 'group-update-members',
      input: '把「莉莉」加入群聊「FC小组」，保留原有成员，完成后不要打开群聊。',
      expectedTool: 'group.update_members',
    },
    {
      id: 'persona-create',
      input: '创建一张名为「FC测试角色」的角色卡，描述是「严谨的验收助手」，不要切换过去。',
      expectedTool: 'persona.create',
    },
    {
      id: 'persona-switch',
      input: '把当前角色卡切换成「米娅」，不要删除其他角色卡。',
      expectedTool: 'persona.switch',
    },
    {
      id: 'persona-delete-many',
      input: '永久删除角色卡「FC废弃角色-A」和「FC废弃角色-B」，其他角色卡全部保留。',
      expectedTool: 'persona.delete_many',
      dangerous: true,
    },
    {
      id: 'user-create',
      input: '创建用户名称「FC测试用户」，描述为「验收专用」，但不要设为当前用户。',
      expectedTool: 'user.create',
    },
    {
      id: 'user-switch',
      input: '把当前用户身份切换为「Alan」，不要修改该用户资料。',
      expectedTool: 'user.switch',
    },
    {
      id: 'worldbook-create',
      input: '新建世界书「FC验收书」，加入一个标题为「港口」且正文为「这是一座港口城市。」的条目。',
      expectedTool: 'worldbook.create',
    },
    {
      id: 'worldbook-update-entries',
      input: '把世界书「FC验收书」中标题为「港口」的条目正文更新为「港口位于北岸。」；只改这一条。',
      expectedTool: 'worldbook.update_entries',
    },
    {
      id: 'worldbook-delete-entries',
      input: '删除世界书「FC验收书」中标题为「废弃规则」的条目；这是明确删除，仅限这一条。',
      expectedTool: 'worldbook.delete_entries',
      dangerous: true,
    },
    {
      id: 'worldbook-list',
      input: '只读列出目前保存的世界书名称和数量，不要打开或修改世界书。',
      expectedTool: 'worldbook.list',
      readOnly: true,
    },
    {
      id: 'worldbook-delete-many',
      input: '永久删除世界书「FC废弃书-A」和「FC废弃书-B」，其他世界书全部保留。',
      expectedTool: 'worldbook.delete_many',
      dangerous: true,
    },
    {
      id: 'worldbook-bind-session',
      input: '把世界书「FC验收书」附加绑定到聊天室「米娅」，保留该聊天室原有世界书。',
      expectedTool: 'worldbook.bind_session',
    },
    {
      id: 'worldbook-read',
      input: '只读取世界书「FC验收书」的目录，最多十条，不要返回正文也不要打开界面。',
      expectedTool: 'worldbook.read',
      readOnly: true,
    },
    {
      id: 'chat-send-message',
      input: '给聊天室「米娅」发送用户消息「晚安」，需要正常触发她回复并等待回复完成。',
      expectedTool: 'chat.send_message',
    },
    {
      id: 'moments-publish',
      input: '替我发布一条动态「今天完成了 FC 验收。」，发布后不要自动生成角色评论。',
      expectedTool: 'moments.publish',
    },
    {
      id: 'config-list-profiles',
      input: '只读列出聊天范围的模型连线配置，并指出当前启用档；绝对不要切换。',
      expectedTool: 'config.list_profiles',
      readOnly: true,
    },
    {
      id: 'app-current-state',
      input: '只用状态接口读取我目前所在页面、模式和当前会话，不要导航或修改。',
      expectedTool: 'app.get_current_state',
      readOnly: true,
    },
    {
      id: 'app-recent-errors',
      input: '只读取最近五条女仆或工具错误，按 failureCode 查看；没有就说没有。',
      expectedTool: 'app.read_recent_errors',
      readOnly: true,
    },
    {
      id: 'control-direct-answer',
      input: '我只是确认：APP 里是否有世界书功能？请直接回答，不要打开界面、不要读取或修改数据。',
      expectedControls: ['final', 'no_tool'],
      readOnly: true,
    },
    {
      id: 'control-clarify',
      input: '请删除一个聊天室，但我还没告诉你是哪一个；目标不明确时只向我澄清，不要猜测。',
      expectedControls: ['clarify'],
      readOnly: true,
    },
    {
      id: 'control-unsupported',
      input: '请用当前聊天室功能替我向现实银行账户转账；APP 没有这项能力就直接说明不支持，不要调用其他工具。',
      expectedControls: ['unsupported', 'no_tool'],
      readOnly: true,
    },
  ];

  const transports = [
    { id: 'prompted_json', enabled: false, thinkingEnabled: false },
    { id: 'provider_fc', enabled: true, thinkingEnabled: false },
  ];
  const writeTools = new Set([
    'session.create', 'session.delete_many', 'group.create', 'group.update_members',
    'persona.create', 'persona.switch', 'persona.delete_many', 'user.create', 'user.switch',
    'worldbook.create', 'worldbook.update_entries', 'worldbook.delete_entries',
    'worldbook.delete_many', 'worldbook.bind_session', 'chat.send_message', 'moments.publish',
  ]);
  const dangerousTools = new Set([
    'session.delete_many', 'persona.delete_many', 'worldbook.delete_entries', 'worldbook.delete_many',
  ]);
  const previousExperiment = actions.getMaidDeepSeekProviderFcExperimentStatus?.() || {
    enabled: false,
    thinkingEnabled: false,
  };
  const samples = [];
  const expectedRequestCount = fixtures.length * repetitions * transports.length;

  const safeFailureCode = (error) => {
    const status = Number(error?.status);
    if (Number.isFinite(status) && status > 0) return `http_${Math.trunc(status)}`;
    return String(error?.code || error?.name || 'request_failed').slice(0, 80);
  };
  const percentile = (values, ratio) => {
    const sorted = values.filter(Number.isFinite).slice().sort((a, b) => a - b);
    if (!sorted.length) return null;
    return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1))];
  };
  const sumToken = (usage, key) => {
    const values = usage.map(entry => Number(entry?.[key])).filter(Number.isFinite);
    return values.length ? values.reduce((sum, value) => sum + value, 0) : null;
  };

  window.__maidProviderFcCohortProgress = {
    fixtureVersion,
    completed: 0,
    expected: expectedRequestCount,
  };
  try {
    for (let fixtureIndex = 0; fixtureIndex < fixtures.length; fixtureIndex += 1) {
      const fixture = fixtures[fixtureIndex];
      for (let repetition = 1; repetition <= repetitions; repetition += 1) {
        const orderedTransports = (fixtureIndex + repetition) % 2 === 0
          ? transports
          : transports.slice().reverse();
        for (const transport of orderedTransports) {
          actions.setMaidDeepSeekProviderFcExperiment(transport);
          const startedAt = performance.now();
          try {
            const result = await actions.runMaidPlannerDecisionPreview({ input: fixture.input });
            const decision = result?.decision || {};
            const toolName = String(decision?.toolName || '').trim();
            const control = String(decision?.providerFcControl || '').trim();
            const isControlFixture = Array.isArray(fixture.expectedControls);
            const noBusinessTool = !toolName;
            const controlActionCorrect = isControlFixture && (
              transport.id === 'prompted_json'
                ? noBusinessTool
                : noBusinessTool && fixture.expectedControls.includes(control)
            );
            const argumentValid = result?.argumentValidation?.ok === true;
            const exactTool = !isControlFixture && toolName === fixture.expectedTool;
            const taskSuccess = isControlFixture
              ? controlActionCorrect
              : exactTool && argumentValid;
            const effectiveMode = String(decision?.plannerTransport?.effectiveMode || '').trim();
            const fallback = transport.id === 'provider_fc' && effectiveMode !== 'provider_fc';
            const usage = Array.isArray(result?.modelUsage) ? result.modelUsage : [];
            samples.push({
              fixtureId: fixture.id,
              repetition,
              transport: transport.id,
              requestOk: true,
              taskSuccess,
              isControlFixture,
              noOpCorrect: isControlFixture && controlActionCorrect,
              exactTool,
              argumentValid,
              selectedTool: toolName,
              selectedControl: control,
              candidateOutside: Boolean(toolName) && decision?.candidateHit !== true,
              correction: Boolean(decision?.capabilityCorrection),
              fallback,
              fallbackReason: String(decision?.plannerTransport?.fallbackReason || '').slice(0, 80),
              nativeFcSuccess: transport.id === 'provider_fc' && !fallback && taskSuccess,
              unexpectedWriteSelection: fixture.readOnly === true && writeTools.has(toolName),
              wrongDangerousSelection: dangerousTools.has(toolName) && toolName !== fixture.expectedTool,
              promptTokens: sumToken(usage, 'promptTokens'),
              completionTokens: sumToken(usage, 'completionTokens'),
              totalTokens: sumToken(usage, 'totalTokens'),
              modelCallCount: usage.reduce((sum, entry) => sum + (Number(entry?.modelCallCount) || 0), 0),
              provider: String(usage.find(entry => entry?.provider)?.provider || ''),
              model: String(usage.find(entry => entry?.model)?.model || ''),
              latencyMs: Number(result?.latencyMs) || Math.round(performance.now() - startedAt),
            });
          } catch (error) {
            samples.push({
              fixtureId: fixture.id,
              repetition,
              transport: transport.id,
              requestOk: false,
              taskSuccess: false,
              isControlFixture: Array.isArray(fixture.expectedControls),
              noOpCorrect: false,
              exactTool: false,
              argumentValid: false,
              selectedTool: '',
              selectedControl: '',
              candidateOutside: false,
              correction: false,
              fallback: false,
              fallbackReason: safeFailureCode(error),
              nativeFcSuccess: false,
              unexpectedWriteSelection: false,
              wrongDangerousSelection: false,
              promptTokens: null,
              completionTokens: null,
              totalTokens: null,
              modelCallCount: 0,
              provider: '',
              model: '',
              latencyMs: Math.round(performance.now() - startedAt),
            });
          }
          window.__maidProviderFcCohortProgress = {
            fixtureVersion,
            completed: samples.length,
            expected: expectedRequestCount,
            fixtureId: fixture.id,
            repetition,
            transport: transport.id,
          };
        }
      }
    }
  } finally {
    actions.setMaidDeepSeekProviderFcExperiment(previousExperiment);
  }

  const summarize = (transport) => {
    const group = samples.filter(sample => sample.transport === transport);
    const business = group.filter(sample => !sample.isControlFixture);
    const controls = group.filter(sample => sample.isControlFixture);
    const latencies = group.map(sample => sample.latencyMs);
    const tokenValues = group.map(sample => sample.totalTokens).filter(Number.isFinite);
    const count = key => group.filter(sample => sample[key] === true).length;
    const businessCount = key => business.filter(sample => sample[key] === true).length;
    const controlCount = key => controls.filter(sample => sample[key] === true).length;
    return {
      transport,
      total: group.length,
      requestSuccess: count('requestOk'),
      taskSuccess: count('taskSuccess'),
      businessTotal: business.length,
      correctToolAndValidArgs: businessCount('taskSuccess'),
      controlTotal: controls.length,
      noOpCorrect: controlCount('noOpCorrect'),
      nativeFcSuccess: count('nativeFcSuccess'),
      fallbackCount: count('fallback'),
      correctionCount: count('correction'),
      candidateOutsideCount: count('candidateOutside'),
      unexpectedWriteSelectionCount: count('unexpectedWriteSelection'),
      wrongDangerousSelectionCount: count('wrongDangerousSelection'),
      modelCallCount: group.reduce((sum, sample) => sum + sample.modelCallCount, 0),
      promptTokens: group.reduce((sum, sample) => sum + (sample.promptTokens || 0), 0),
      completionTokens: group.reduce((sum, sample) => sum + (sample.completionTokens || 0), 0),
      totalTokens: tokenValues.length ? tokenValues.reduce((sum, value) => sum + value, 0) : null,
      averageLatencyMs: Math.round(latencies.reduce((sum, value) => sum + value, 0) / Math.max(1, latencies.length)),
      p50LatencyMs: percentile(latencies, 0.5),
      p95LatencyMs: percentile(latencies, 0.95),
      providers: Array.from(new Set(group.map(sample => sample.provider).filter(Boolean))),
      models: Array.from(new Set(group.map(sample => sample.model).filter(Boolean))),
      fallbackReasons: group.reduce((counts, sample) => {
        if (sample.fallbackReason) counts[sample.fallbackReason] = (counts[sample.fallbackReason] || 0) + 1;
        return counts;
      }, {}),
    };
  };
  const failures = samples
    .filter(sample => !sample.taskSuccess || sample.fallback || sample.candidateOutside || sample.unexpectedWriteSelection || sample.wrongDangerousSelection)
    .map(sample => ({
      fixtureId: sample.fixtureId,
      repetition: sample.repetition,
      transport: sample.transport,
      selectedTool: sample.selectedTool,
      selectedControl: sample.selectedControl,
      argumentValid: sample.argumentValid,
      fallback: sample.fallback,
      fallbackReason: sample.fallbackReason,
      candidateOutside: sample.candidateOutside,
      unexpectedWriteSelection: sample.unexpectedWriteSelection,
      wrongDangerousSelection: sample.wrongDangerousSelection,
    }));
  window.__maidProviderFcCohortProgress = {
    fixtureVersion,
    completed: samples.length,
    expected: expectedRequestCount,
    finished: true,
  };
  return {
    fixtureVersion,
    generatedAt: new Date().toISOString(),
    fixtureCount: fixtures.length,
    businessFixtureCount: fixtures.filter(fixture => !fixture.expectedControls).length,
    controlFixtureCount: fixtures.filter(fixture => fixture.expectedControls).length,
    repetitions,
    requestCount: samples.length,
    businessToolsExecuted: 0,
    experimentRestored: actions.getMaidDeepSeekProviderFcExperimentStatus?.(),
    summaries: transports.map(transport => summarize(transport.id)),
    failures,
  };
})()
