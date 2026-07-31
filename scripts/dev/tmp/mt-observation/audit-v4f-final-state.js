(async () => {
  const registry = window.appBridge?.debugUiRegistry || {};
  const stores = registry.stores || {};
  const tools = stores.agentToolRegistry;
  if (!tools?.executeTool) {
    return { ok: false, reason: 'agent_tool_registry_missing' };
  }
  const context = {
    operationIntentPolicy: { mode: 'read_only' },
    requestPermission: async () => ({ decision: 'allow' }),
  };
  const [chat, image] = await Promise.all([
    tools.executeTool('config.list_profiles', { scope: 'chat' }, context),
    tools.executeTool('config.list_profiles', { scope: 'image' }, context),
  ]);
  const chatActive = chat?.result?.profiles?.find(profile => profile.active) || null;
  const imageActive = image?.result?.profiles?.find(profile => profile.active) || null;
  const maidConversation = stores.maidConversationStore?.exportState?.() || {};
  const maidProfileId = stores.maidSettingsStore?.getBoundProfileId?.() || '';
  return {
    ok: maidProfileId === 'profile-1769099653885-3faa87'
      && chatActive?.provider === 'deepseek'
      && chatActive?.model === 'deepseek-v4-flash'
      && imageActive?.provider === 'novelai',
    maid: {
      profileId: maidProfileId,
      modelOverride: stores.maidSettingsStore?.getBoundModelOverride?.() || '',
    },
    chat: chatActive,
    image: imageActive,
    maidConversation: {
      threadId: String(maidConversation?.threadId || ''),
      turns: maidConversation?.turns?.length || 0,
      memoryRows: maidConversation?.memoryRows?.length || 0,
      contextTokens: stores.maidConversationStore?.getContextSnapshot?.()?.tokenCount || 0,
    },
    activePersona: stores.personaStore?.getActive?.()?.name || '',
    currentSessionId: stores.chatStore?.getCurrent?.() || '',
  };
})()
