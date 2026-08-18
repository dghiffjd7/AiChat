(async () => {
  const registry = window.appBridge?.debugUiRegistry || {};
  const panel = registry.panels?.presetPanel;
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const invoke = window.__TAURI__?.core?.invoke
    || window.__TAURI__?.invoke
    || window.__TAURI_INVOKE__
    || window.__TAURI_INTERNALS__?.invoke;
  if (!invoke) return { error: 'tauri invoke unavailable' };

  const KEY = 'agent_center_settings_v1';
  const readLocal = () => {
    try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; }
  };
  const readDialogueDepth = state => (
    state?.profiles?.['sysprompt:Neutral - Chat']?.agents?.dialogue_agent?.prompts?.dialogue?.depth ?? null
  );

  // 用 action 存一次 depth=9
  await registry.actions.setAgentPromptConfig({
    profileType: 'sysprompt',
    presetId: 'Neutral - Chat',
    agentId: 'dialogue_agent',
    promptId: 'dialogue',
    config: { depth: 9 },
  });
  await wait(600);
  const local = readLocal();
  let kv = null;
  try { kv = await invoke('load_kv', { name: KEY }); } catch (error) { kv = { error: String(error) }; }
  const result = {
    localDepth: readDialogueDepth(local),
    kvDepth: readDialogueDepth(kv),
    kvError: kv?.error || null,
    localProfileUpdatedAt: local?.profiles?.['sysprompt:Neutral - Chat']?.updatedAt ?? null,
    kvProfileUpdatedAt: kv?.profiles?.['sysprompt:Neutral - Chat']?.updatedAt ?? null,
  };
  // 还原 depth=1
  await registry.actions.setAgentPromptConfig({
    profileType: 'sysprompt',
    presetId: 'Neutral - Chat',
    agentId: 'dialogue_agent',
    promptId: 'dialogue',
    config: { depth: 1 },
  });
  await wait(400);
  return result;
})()
