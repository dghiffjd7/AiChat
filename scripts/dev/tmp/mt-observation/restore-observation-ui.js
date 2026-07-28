(async () => {
  const actions = window.appBridge?.debugUiRegistry?.actions || {};
  const closedLayers = [];
  for (let index = 0; index < 8; index += 1) {
    const closed = actions.closeTopAppLayer?.() === true;
    closedLayers.push(closed);
    if (!closed) break;
    await new Promise(resolve => setTimeout(resolve, 80));
  }
  const enterResult = await actions.enterChatRoom?.(
    '格式修复测试',
    '格式修复测试',
    'chat',
    { suppressInitialAutoScroll: true },
  );
  return {
    closedLayers,
    enterResult,
    state: {
      currentSessionId: window.appBridge?.debugUiRegistry?.stores?.chatStore?.getCurrent?.() || '',
      activePage: document.body?.dataset?.activePage || '',
      uiMode: document.body?.dataset?.uiMode || '',
    },
  };
})()
