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
  if (typeof actions.runMaidAssistantPrompt !== 'function') {
    return { ok: false, reason: 'maid_action_missing' };
  }

  const visible = (node) => {
    if (!node || !node.isConnected) return false;
    const style = getComputedStyle(node);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    const rect = node.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };
  if (window.__onePieceP3PermissionTimer) {
    clearInterval(window.__onePieceP3PermissionTimer);
  }
  const permissionEvents = [];
  const clicked = new WeakSet();
  window.__onePieceP3PermissionTimer = setInterval(() => {
    const button = [...document.querySelectorAll('button')]
      .find(item => (
        visible(item) &&
        !clicked.has(item) &&
        ['允许一次', '确认创建'].includes(String(item.textContent || '').trim())
      ));
    if (!button) return;
    clicked.add(button);
    const dialog = button.closest('[role="dialog"], .app-modal, .modal, .overlay') || button.parentElement;
    permissionEvents.push({
      at: Date.now(),
      button: String(button.textContent || '').trim(),
      title: String(
        dialog?.querySelector?.('h1, h2, h3, .app-confirm-title, .modal-title')?.textContent || '',
      ).trim(),
    });
    button.click();
  }, 250);

  const runsBefore = stores.agentRunStore?.listRuns?.({ limit: 500 }) || [];
  const beforeRunIds = new Set(runsBefore.map(item => item.id));
  const prompt = '确认，就按这份清单来。';
  const startedAt = Date.now();
  let result;
  try {
    result = await actions.runMaidAssistantPrompt({ input: prompt });
  } finally {
    clearInterval(window.__onePieceP3PermissionTimer);
    window.__onePieceP3PermissionTimer = null;
  }

  const read = async (toolName, args) => {
    const output = await stores.agentToolRegistry?.executeTool?.(toolName, args, {
      operationIntentPolicy: { mode: 'read_only' },
      requestPermission: async () => ({ decision: 'allow' }),
    });
    return output?.result || output || {};
  };
  const sessionEvidence = await read('app.read_resource', {
    resource: 'session',
    include: ['members', 'worldbooks'],
  });
  const worldbooks = await read('worldbook.list', {});
  const runsAfter = stores.agentRunStore?.listRuns?.({ limit: 500 }) || [];
  const relevantRuns = runsAfter
    .filter(item => (
      !beforeRunIds.has(item.id) ||
      item?.metadata?.pendingWorkflow?.kind === 'imported_card_session_setup'
    ))
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
      failureCode: result?.failureCode || '',
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
    },
    permissionEvents,
    persistence: { relevantRuns },
    audit: {
      currentPersona: {
        id: String(stores.personaStore?.getActive?.()?.id || ''),
        name: String(stores.personaStore?.getActive?.()?.name || ''),
      },
      currentSessionId: String(stores.chatStore?.getCurrent?.() || ''),
      contacts: (stores.contactsStore?.listContacts?.() || []).map(item => ({
        id: String(item?.id || ''),
        name: String(item?.name || ''),
        isGroup: item?.isGroup === true,
        members: Array.isArray(item?.members) ? item.members.map(String) : [],
      })),
      rawSessionIds: (stores.chatStore?.listSessions?.() || []).map(String),
      sessionEvidence,
      worldbookCount: Number(worldbooks?.count || 0),
    },
  };
})()
