(async () => {
  const registry = window.appBridge?.debugUiRegistry || {};
  const actions = registry.actions || {};
  if (typeof actions.handleAndroidBack !== 'function' || typeof actions.enterChatRoom !== 'function') {
    return { ok: false, reason: 'required_runtime_actions_missing' };
  }

  const backResults = [];
  for (let index = 0; index < 3; index += 1) {
    const result = actions.handleAndroidBack();
    backResults.push(result);
    if (result?.action === 'exit-chat-room') break;
    await new Promise(resolve => setTimeout(resolve, 80));
  }
  if (!backResults.some(item => item?.action === 'exit-chat-room')) {
    return { ok: false, reason: 'rp_exit_not_reached', backResults };
  }

  await new Promise(resolve => setTimeout(resolve, 250));
  const enterResult = await actions.enterChatRoom(
    '格式修复测试',
    '格式修复测试',
    'chat',
    { suppressInitialAutoScroll: true },
  );
  await new Promise(resolve => setTimeout(resolve, 80));

  const stores = registry.stores || {};
  const toolRegistry = stores.agentToolRegistry;
  const currentState = await toolRegistry?.executeTool?.('app.get_current_state', {}, {
    operationIntentPolicy: { mode: 'read_only' },
    requestPermission: async () => ({ decision: 'allow' }),
  });
  const state = currentState?.result || null;
  return {
    ok: state?.uiMode === 'chat' && state?.sessionId === '格式修复测试',
    backResults,
    enterResult,
    state,
  };
})()
