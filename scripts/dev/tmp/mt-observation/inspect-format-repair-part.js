(async () => {
  const actions = window.appBridge?.debugUiRegistry?.actions || {};
  const runId = 'run:chat-format-guardian:protocol-format-repair-1785463652875-51c272';
  const run = actions.getAgentRun?.(runId) || null;
  const parts = actions.getAgentRunParts?.(runId) || [];
  return {
    run,
    parts,
    chatUiAvailable: Boolean(window.appBridge?.chatUI?.handleChatFormatGuardianAction),
  };
})()
