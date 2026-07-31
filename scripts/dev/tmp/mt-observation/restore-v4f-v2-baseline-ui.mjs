import { evaluateInApp } from '../../cdp-client.mjs';

const expected = {
  personaId: 'persona_1783693152632_sunpt',
  personaName: '海贼王',
  userId: 'user_1780931233613_88lsr',
  userName: '我',
  sessionId: '娜美',
};

const result = await evaluateInApp(`(async () => {
  const expected = ${JSON.stringify(expected)};
  const registry = window.appBridge?.debugUiRegistry || {};
  const stores = registry.stores || {};
  await Promise.all([
    stores.personaStore?.ready,
    stores.userStore?.ready,
    stores.contactsStore?.ready,
    stores.chatStore?.ready,
  ].filter(Boolean));

  const persona = stores.personaStore?.get?.(expected.personaId)
    || (stores.personaStore?.getAll?.() || []).find(item => item?.name === expected.personaName)
    || null;
  const user = stores.userStore?.get?.(expected.userId)
    || (stores.userStore?.getAll?.() || []).find(item => item?.name === expected.userName)
    || null;
  if (!persona) return { ok: false, reason: 'baseline_persona_missing' };
  if (!user) return { ok: false, reason: 'baseline_user_missing' };

  const personaSwitched = await window.appBridge?.switchPersona?.(persona.id);
  if (!personaSwitched) return { ok: false, reason: 'baseline_persona_switch_failed' };
  const userSwitched = await window.appBridge?.switchUserProfile?.(user.id);
  if (!userSwitched) return { ok: false, reason: 'baseline_user_switch_failed' };

  const refreshedRegistry = window.appBridge?.debugUiRegistry || {};
  const refreshedStores = refreshedRegistry.stores || {};
  const targetContact = (refreshedStores.contactsStore?.listContacts?.() || [])
    .find(item => String(item?.id || '') === expected.sessionId
      || String(item?.name || '') === expected.sessionId) || null;
  if (!targetContact) return { ok: false, reason: 'baseline_session_missing' };

  for (let index = 0; index < 8; index += 1) {
    if (refreshedRegistry.actions?.closeTopAppLayer?.() !== true) break;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  const entered = await refreshedRegistry.actions?.enterChatRoom?.(
    targetContact.id,
    targetContact.name || expected.sessionId,
    'chat',
    { suppressInitialAutoScroll: true },
  );

  const profiles = await refreshedRegistry.actions?.listAgentModelProfiles?.() || [];
  const maid = refreshedStores.maidSettingsStore;
  const maidProfileId = maid?.getBoundProfileId?.() || '';
  const maidProfile = profiles.find(profile => profile.id === maidProfileId) || null;
  const readContext = {
    operationIntentPolicy: { mode: 'read_only' },
    requestPermission: async () => ({ decision: 'allow' }),
  };
  const chatProfilesOutput = await refreshedStores.agentToolRegistry?.executeTool?.(
    'config.list_profiles',
    { scope: 'chat' },
    readContext,
  );
  const imageProfilesOutput = await refreshedStores.agentToolRegistry?.executeTool?.(
    'config.list_profiles',
    { scope: 'image' },
    readContext,
  );
  const chatProfiles = chatProfilesOutput?.result || chatProfilesOutput || {};
  const imageProfiles = imageProfilesOutput?.result || imageProfilesOutput || {};
  const conversation = refreshedStores.maidConversationStore?.exportState?.() || {};
  const context = refreshedStores.maidConversationStore?.getContextSnapshot?.() || {};
  const finalState = {
    persona: refreshedStores.personaStore?.getActive?.() || null,
    user: refreshedStores.userStore?.getActive?.() || null,
    currentSessionId: String(refreshedStores.chatStore?.getCurrent?.() || ''),
  };
  return {
    ok: finalState.persona?.id === expected.personaId
      && finalState.user?.id === expected.userId
      && finalState.currentSessionId === targetContact.id
      && conversation.threadId === 'maid_default',
    entered,
    finalState: {
      persona: finalState.persona
        ? { id: finalState.persona.id, name: finalState.persona.name }
        : null,
      user: finalState.user
        ? { id: finalState.user.id, name: finalState.user.name }
        : null,
      currentSessionId: finalState.currentSessionId,
    },
    models: {
      maid: {
        profileId: maidProfileId,
        profileName: maidProfile?.name || '',
        provider: maidProfile?.provider || '',
        model: maid?.getBoundModelOverride?.() || maidProfile?.model || '',
      },
      chat: (chatProfiles.profiles || []).find(profile => profile.active) || null,
      image: (imageProfiles.profiles || []).find(profile => profile.active) || null,
    },
    conversation: {
      threadId: conversation.threadId || '',
      turns: conversation.turns?.length || 0,
      memoryRows: conversation.memoryRows?.length || 0,
      contextTokens: context.tokenCount || 0,
    },
  };
})()`, { timeoutMs: 120_000 });

console.log(JSON.stringify(result, null, 2));
if (!result?.ok) process.exitCode = 1;
