(async () => {
  const registry = window.appBridge?.debugUiRegistry || {};
  const stores = registry.stores || {};
  const messages = stores.chatStore?.getMessages?.('娜美') || [];
  const prompt = '那就听你的。出发前你能按优先顺序告诉我三样必须准备的东西吗？';
  const replyPrefix = '第一，饮用水。';
  const profiles = await stores.agentToolRegistry?.executeTool?.(
    'config.list_profiles',
    { scope: 'chat' },
    {
      operationIntentPolicy: { mode: 'read_only' },
      requestPermission: async () => ({ decision: 'allow' }),
    },
  );
  const activeProfile = profiles?.result?.profiles?.find(profile => profile.active) || null;
  const last = messages.slice(-3).map(message => ({
    id: String(message?.id || ''),
    role: String(message?.role || message?.type || ''),
    content: String(message?.content || message?.text || '').slice(0, 1000),
    formatRepairTurn: message?.meta?.formatRepairTurn || null,
  }));
  return {
    ok: activeProfile?.provider === 'deepseek'
      && activeProfile?.model === 'deepseek-v4-flash'
      && stores.maidSettingsStore?.getBoundProfileId?.() === activeProfile.id
      && messages.filter(message => String(message?.content || '') === prompt).length === 1
      && messages.filter(message => String(message?.content || '').startsWith(replyPrefix)).length === 1,
    chatProfile: activeProfile,
    maid: {
      profileId: stores.maidSettingsStore?.getBoundProfileId?.() || '',
      modelOverride: stores.maidSettingsStore?.getBoundModelOverride?.() || '',
    },
    promptCount: messages.filter(message => String(message?.content || '') === prompt).length,
    repairedReplyCount: messages.filter(message => (
      String(message?.content || '').startsWith(replyPrefix)
    )).length,
    messageCount: messages.length,
    last,
    rawEnvelope: {
      ...(stores.chatStore?.getLastRawResponseEnvelope?.('娜美') || {}),
      text: undefined,
    },
    repairRun: registry.actions?.getAgentRun?.(
      'run:chat-format-guardian:protocol-format-repair-1785463652875-51c272',
    )?.status || '',
  };
})()
