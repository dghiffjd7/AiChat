// Eight-call, zero-write regression for the maid's DeepSeek Responses FC path.
// Run through app-eval against an open Windows dev WebView. It selects tools
// through the preview runtime only; no business tool is executed.
(async () => {
  const actions = window.appBridge?.debugUiRegistry?.actions || {};
  if (
    typeof actions.runMaidPlannerDecisionPreview !== 'function'
    || typeof actions.setMaidDeepSeekProviderFcExperiment !== 'function'
  ) {
    throw new Error('maid planner preview runtime unavailable');
  }

  const fixtures = [
    {
      id: 'session-list',
      input: '只查询：列出当前角色卡下的聊天室，包含群聊，不要打开或修改任何内容。',
      expectedTool: 'session.list',
      thinkingRequested: false,
    },
    {
      id: 'session-delete-many',
      input: '请永久删除「FC废弃房-A」和「FC废弃房-B」两个聊天室；这是明确的批量删除请求。',
      expectedTool: 'session.delete_many',
      thinkingRequested: false,
    },
    {
      id: 'persona-create',
      input: '创建一张名为「FC测试角色」的角色卡，描述是「严谨的验收助手」，不要切换过去。',
      expectedTool: 'persona.create',
      thinkingRequested: false,
    },
    {
      id: 'worldbook-update-entries',
      input: '把世界书「FC验收书」中标题为「港口」的条目正文更新为「港口位于北岸。」；只改这一条。',
      expectedTool: 'worldbook.update_entries',
      thinkingRequested: false,
    },
    {
      id: 'chat-send-message',
      input: '给聊天室「米娅」发送用户消息「晚安」，需要正常触发她回复并等待回复完成。',
      expectedTool: 'chat.send_message',
      thinkingRequested: true,
    },
    {
      id: 'moments-publish',
      input: '替我发布一条动态「今天完成了 FC 验收。」，发布后不要自动生成角色评论。',
      expectedTool: 'moments.publish',
      thinkingRequested: true,
    },
    {
      id: 'control-clarify',
      input: '请删除一个聊天室，但我还没告诉你是哪一个；目标不明确时只向我澄清，不要猜测。',
      expectedControls: ['clarify'],
      thinkingRequested: true,
    },
    {
      id: 'control-unsupported',
      input: '请用当前聊天室功能替我向现实银行账户转账；APP 没有这项能力就直接说明不支持，不要调用其他工具。',
      expectedControls: ['unsupported', 'no_tool'],
      thinkingRequested: true,
    },
  ];

  const previousExperiment = actions.getMaidDeepSeekProviderFcExperimentStatus?.() || {
    overrideActive: false,
  };
  const samples = [];
  try {
    for (const fixture of fixtures) {
      actions.setMaidDeepSeekProviderFcExperiment({
        enabled: true,
        thinkingEnabled: fixture.thinkingRequested,
      });
      const result = await actions.runMaidPlannerDecisionPreview({ input: fixture.input });
      const decision = result?.decision || {};
      const transport = decision?.plannerTransport || {};
      const selectedTool = String(decision?.toolName || '').trim();
      const selectedControl = String(decision?.providerFcControl || '').trim();
      const isControl = Array.isArray(fixture.expectedControls);
      const semanticSuccess = isControl
        ? !selectedTool && fixture.expectedControls.includes(selectedControl)
        : selectedTool === fixture.expectedTool && result?.argumentValidation?.ok === true;
      const expectedOverride = fixture.thinkingRequested
        ? 'deepseek_forced_tool_choice_incompatible'
        : '';
      const transportSuccess = (
        transport.effectiveMode === 'provider_fc'
        && transport.primaryProvider === 'deepseek'
        && transport.providerEndpoint === 'official_deepseek_responses'
        && transport.toolCallCount === 1
        && transport.thinkingRequested === fixture.thinkingRequested
        && transport.thinkingEnabled === false
        && String(transport.thinkingOverrideReason || '') === expectedOverride
      );
      samples.push({
        fixtureId: fixture.id,
        requestOk: result?.decision?.ok === true,
        semanticSuccess,
        transportSuccess,
        effectiveMode: String(transport.effectiveMode || ''),
        provider: String(transport.primaryProvider || ''),
        model: String(transport.primaryModel || ''),
        providerEndpoint: String(transport.providerEndpoint || ''),
        thinkingRequested: transport.thinkingRequested === true,
        thinkingEnabled: transport.thinkingEnabled === true,
        thinkingOverrideReason: String(transport.thinkingOverrideReason || ''),
        toolCallCount: Number(transport.toolCallCount || 0),
        selectedTool,
        selectedControl,
        fallbackReason: String(transport.fallbackReason || ''),
        modelCallCount: (Array.isArray(result?.modelUsage) ? result.modelUsage : [])
          .reduce((sum, usage) => sum + (Number(usage?.modelCallCount) || 0), 0),
      });
    }
  } finally {
    actions.setMaidDeepSeekProviderFcExperiment(previousExperiment);
  }

  const failures = samples.filter(sample => (
    !sample.requestOk
    || !sample.semanticSuccess
    || !sample.transportSuccess
    || sample.fallbackReason
  ));
  return {
    fixtureVersion: 'maid-responses-fc-regression-v1',
    requestCount: samples.length,
    requestSuccess: samples.filter(sample => sample.requestOk).length,
    semanticSuccess: samples.filter(sample => sample.semanticSuccess).length,
    transportSuccess: samples.filter(sample => sample.transportSuccess).length,
    fallbackCount: samples.filter(sample => sample.fallbackReason).length,
    businessToolsExecuted: 0,
    experimentRestored: actions.getMaidDeepSeekProviderFcExperimentStatus?.(),
    providers: [...new Set(samples.map(sample => sample.provider).filter(Boolean))],
    models: [...new Set(samples.map(sample => sample.model).filter(Boolean))],
    failures,
  };
})()
