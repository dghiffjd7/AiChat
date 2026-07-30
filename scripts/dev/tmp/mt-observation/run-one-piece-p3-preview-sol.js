(async () => {
  const registry = window.appBridge?.debugUiRegistry || {};
  const stores = registry.stores || {};
  const actions = registry.actions || {};
  await Promise.all([
    stores.personaStore?.ready,
    stores.contactsStore?.ready,
    stores.chatStore?.ready,
    stores.agentRunStore?.ready,
  ].filter(Boolean));

  const runsBefore = stores.agentRunStore?.listRuns?.({ limit: 500 }) || [];
  const stalePending = runsBefore.filter(item => (
    item?.status === 'waiting_permission' &&
    item?.metadata?.pendingWorkflow?.kind === 'imported_card_session_setup' &&
    item?.metadata?.pendingWorkflow?.state === 'awaiting_confirmation'
  ));
  if (stalePending.length) {
    return {
      ok: false,
      reason: 'stale_pending_workflow',
      runIds: stalePending.map(item => item.id),
    };
  }
  if (typeof actions.runMaidAssistantPrompt !== 'function') {
    return { ok: false, reason: 'maid_action_missing' };
  }

  const prompt = [
    '我现在就在「海贼王」这张导入角色卡里。',
    '你帮我从它自带的世界书里挑出适合长期聊天的草帽一伙主要成员，',
    '准备给每个人各建一个私聊，再建一个「草帽一伙」群聊。',
    '先把候选名单、会创建的内容和世界书处理方式列给我确认；这一步先不要真的创建。',
    '直接共用这张卡自带的世界书，不要新建或给聊天室额外绑定人物世界书，头像壁纸也先别做。',
  ].join('');
  const startedAt = Date.now();
  const beforeRunIds = new Set(runsBefore.map(item => item.id));
  const beforeContacts = (stores.contactsStore?.listContacts?.() || []).map(item => ({
    id: String(item?.id || ''),
    name: String(item?.name || ''),
    isGroup: item?.isGroup === true,
  }));
  const beforeSessionIds = (stores.chatStore?.listSessions?.() || []).map(String);
  const result = await actions.runMaidAssistantPrompt({ input: prompt });
  const runsAfter = stores.agentRunStore?.listRuns?.({ limit: 500 }) || [];
  const newRuns = runsAfter
    .filter(item => !beforeRunIds.has(item.id))
    .map(item => ({
      id: item.id,
      kind: item.kind,
      status: item.status,
      summary: item.summary,
      errorMessage: item.errorMessage,
      usage: item.usage || null,
      metadata: {
        maidStatus: item.metadata?.maidStatus || '',
        model: item.metadata?.model || '',
        provider: item.metadata?.provider || '',
        pendingWorkflow: item.metadata?.pendingWorkflow || null,
      },
    }));
  const afterContacts = (stores.contactsStore?.listContacts?.() || []).map(item => ({
    id: String(item?.id || ''),
    name: String(item?.name || ''),
    isGroup: item?.isGroup === true,
  }));
  const afterSessionIds = (stores.chatStore?.listSessions?.() || []).map(String);
  const pending = result?.pendingWorkflow || newRuns[0]?.metadata?.pendingWorkflow || null;
  return {
    ok: result?.ok !== false,
    prompt,
    durationMs: Date.now() - startedAt,
    model: {
      profileId: stores.maidSettingsStore?.getBoundProfileId?.() || '',
      modelOverride: stores.maidSettingsStore?.getBoundModelOverride?.() || '',
    },
    result: {
      ok: result?.ok !== false,
      status: result?.status || '',
      reason: result?.reason || '',
      responseType: result?.responseType || '',
      message: String(result?.message || ''),
      usage: result?.usage || null,
      steps: (result?.steps || []).map(step => ({
        toolName: step?.toolName || '',
        featureId: step?.featureId || '',
        status: step?.status || '',
        summary: String(step?.summary || ''),
        args: step?.args || {},
      })),
      pendingWorkflow: pending
        ? {
            kind: pending.kind,
            state: pending.state,
            persona: pending.persona,
            worldbook: pending.worldbook,
            strategy: pending.strategy,
            classificationCounts: pending.classificationCounts,
            candidates: pending.candidates,
            privateSessions: pending.privateSessions,
            group: pending.group,
            revealRequested: pending.revealRequested,
            expiresAt: pending.expiresAt,
          }
        : null,
    },
    persistence: { newRuns },
    zeroWriteCheck: {
      beforeContacts,
      afterContacts,
      beforeSessionIds,
      afterSessionIds,
      contactsUnchanged: JSON.stringify(beforeContacts) === JSON.stringify(afterContacts),
      sessionsUnchanged: JSON.stringify(beforeSessionIds) === JSON.stringify(afterSessionIds),
    },
  };
})()
