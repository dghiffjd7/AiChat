// P2 冲突交互烟测：格式 revision、群成员确认基线、记忆任务×会话删除。
// 只使用临时会话/联系人和本地假响应，不调用模型或网络；结束后清理所有临时资料。
(async () => {
  const debug = window.appBridge?.debugUiRegistry;
  const registry = debug?.stores?.agentToolRegistry;
  const chatStore = debug?.stores?.chatStore;
  const contactsStore = debug?.stores?.contactsStore;
  const sessionAsyncWorkRuntime = debug?.stores?.sessionAsyncWorkRuntime;
  const sessionPanel = debug?.panels?.sessionPanel;
  if (
    !registry?.executeTool ||
    !chatStore?.appendMessage ||
    !contactsStore?.upsertContact ||
    !sessionAsyncWorkRuntime?.cancelAndWait ||
    !sessionPanel?.removeCore
  ) {
    throw new Error('P2 conflict smoke dependencies unavailable');
  }

  const [{ validateFormatPatchRevision }, { createMemoryUpdateRuntime }] = await Promise.all([
    import('/scripts/ui/chat/format-patch-transaction-utils.js'),
    import('/scripts/ui/chat/memory-update-runtime.js'),
  ]);
  const prefix = `__codex_p2_${Date.now()}`;
  const ids = {
    formatSession: `${prefix}_format`,
    memorySession: `${prefix}_memory`,
    group: `group:${prefix}_group`,
    memberA: `${prefix}_member_a`,
    memberB: `${prefix}_member_b`,
    memberC: `${prefix}_member_c`,
  };
  const contactIds = [
    ids.formatSession,
    ids.memorySession,
    ids.group,
    ids.memberA,
    ids.memberB,
    ids.memberC,
  ];
  const sessionIds = [ids.formatSession, ids.memorySession, ids.group];
  const report = { prefix, cases: {}, cleanup: null };
  const baseContext = {
    operationIntentPolicy: { mode: 'write_allowed' },
    requestPermission: async () => ({ decision: 'allow' }),
  };

  try {
    contactsStore.upsertContact({ id: ids.formatSession, name: ids.formatSession, isGroup: false });
    const formatMessage = chatStore.appendMessage({
      id: `${prefix}_format_message`,
      role: 'assistant',
      content: 'format base text',
      rawOriginal: 'format base text',
      time: '00:00',
    }, ids.formatSession);
    const formatSnapshot = String(formatMessage?.rawOriginal || formatMessage?.content || '');
    chatStore.updateMessage(formatMessage.id, {
      content: 'user edited format text',
      rawOriginal: 'user edited format text',
    }, ids.formatSession);
    const currentFormatMessage = chatStore.findMessage(formatMessage.id, ids.formatSession);
    const formatRevision = validateFormatPatchRevision({
      snapshotText: formatSnapshot,
      currentText: String(currentFormatMessage?.rawOriginal || currentFormatMessage?.content || ''),
    });
    report.cases.format_revision = {
      messageId: formatMessage.id,
      snapshotText: formatSnapshot,
      currentText: String(currentFormatMessage?.rawOriginal || currentFormatMessage?.content || ''),
      result: formatRevision,
      guarded: formatRevision?.ok === false && formatRevision?.reason === 'revision_expired' &&
        currentFormatMessage?.content === 'user edited format text',
    };

    contactsStore.upsertContact({ id: ids.memberA, name: `${prefix} A`, isGroup: false });
    contactsStore.upsertContact({ id: ids.memberB, name: `${prefix} B`, isGroup: false });
    contactsStore.upsertContact({ id: ids.memberC, name: `${prefix} C`, isGroup: false });
    contactsStore.upsertContact({
      id: ids.group,
      name: `${prefix} group`,
      isGroup: true,
      members: [ids.memberA, ids.memberB],
    });
    const groupResult = await registry.executeTool('group.update_members', {
      groupId: ids.group,
      addMembers: [ids.memberC],
    }, {
      ...baseContext,
      requestToolConfirmation: () => {
        const current = contactsStore.getContact(ids.group);
        contactsStore.upsertContact({
          ...current,
          members: [ids.memberA],
        });
        return { confirmed: true };
      },
    });
    report.cases.group_members = {
      status: groupResult?.status,
      result: groupResult?.result,
      finalMembers: contactsStore.getContact(ids.group)?.members || [],
      guarded: groupResult?.result?.ok === false &&
        groupResult?.result?.reason === 'group_members_changed_during_confirmation' &&
        JSON.stringify(contactsStore.getContact(ids.group)?.members || []) === JSON.stringify([ids.memberA]),
    };

    contactsStore.upsertContact({ id: ids.memorySession, name: ids.memorySession, isGroup: false });
    const checkpoint = chatStore.appendMessage({
      id: `${prefix}_memory_checkpoint`,
      role: 'assistant',
      content: 'memory checkpoint',
      time: '00:00',
    }, ids.memorySession);
    const traces = [];
    const edits = [];
    let notifyChatStarted = null;
    const chatStarted = new Promise(resolve => { notifyChatStarted = resolve; });
    const fakeBridge = {
      config: {
        load: async () => ({ apiKey: 'local-probe' }),
        get: () => ({ apiKey: 'local-probe' }),
      },
    };
    const memoryRuntime = createMemoryUpdateRuntime({
      appBridge: fakeBridge,
      appSettings: {
        get: () => ({ memoryFillEveryN: 1, memoryUpdateApiMode: 'chat' }),
      },
      buildMemoryUpdateHistoryText: () => 'assistant: memory checkpoint',
      buildMemoryUpdatePlan: async () => ({ enabled: true, promptText: 'local probe prompt' }),
      canInitClient: config => Boolean(config?.apiKey),
      createClient: () => ({
        chat: async (_messages, { signal } = {}) => {
          notifyChatStarted();
          return new Promise((resolve, reject) => {
            signal?.addEventListener?.('abort', () => {
              const error = new Error('session deleted');
              error.name = 'AbortError';
              reject(error);
            }, { once: true });
          });
        },
      }),
      handleMemoryEditsFromRaw: async (...args) => { edits.push(args); },
      isMemoryAutoExtractSeparate: () => true,
      isMemoryUpdateTargetCurrent: (sessionId, messageId) => Boolean(
        chatStore.findMessage(messageId, sessionId),
      ),
      isOnline: () => true,
      logger: { info() {}, warn() {}, debug() {} },
      memoryUpdateConfigManager: {
        load: async () => {},
        getActiveProfileId: () => '',
        getRuntimeConfigByProfileId: async () => null,
      },
      recordTraceEvent: event => traces.push(event),
      sessionAsyncWorkRuntime,
      syncTurnCheckpointForMessage: async () => {},
    });
    const memoryTask = memoryRuntime.runMemoryUpdateAfterChat(
      ids.memorySession,
      false,
      {},
      { checkpointMessageId: checkpoint.id },
    );
    await chatStarted;
    const workCountBeforeDelete = sessionAsyncWorkRuntime.count(ids.memorySession);
    const deleteResult = await sessionPanel.removeCore(ids.memorySession);
    await memoryTask;
    report.cases.memory_session_delete = {
      workCountBeforeDelete,
      deleteResult,
      trace: traces.at(-1) || null,
      editCount: edits.length,
      sessionExists: chatStore.listSessions().includes(ids.memorySession),
      contactExists: Boolean(contactsStore.getContact(ids.memorySession)),
      workCountAfterDelete: sessionAsyncWorkRuntime.count(ids.memorySession),
      guarded: workCountBeforeDelete === 1 &&
        deleteResult?.deleted === true &&
        traces.at(-1)?.status === 'cancelled' &&
        traces.at(-1)?.details?.reason === 'aborted' &&
        edits.length === 0 &&
        !chatStore.listSessions().includes(ids.memorySession) &&
        !contactsStore.getContact(ids.memorySession) &&
        sessionAsyncWorkRuntime.count(ids.memorySession) === 0,
    };
  } finally {
    sessionIds.forEach(id => {
      if (chatStore.listSessions().includes(id)) chatStore.delete(id);
    });
    contactIds.forEach(id => {
      if (contactsStore.getContact(id)) contactsStore.removeContact(id);
    });
    report.cleanup = {
      remainingSessions: sessionIds.filter(id => chatStore.listSessions().includes(id)),
      remainingContacts: contactIds.filter(id => Boolean(contactsStore.getContact(id))),
      remainingWork: sessionIds.reduce((sum, id) => sum + sessionAsyncWorkRuntime.count(id), 0),
    };
  }

  report.summary = {
    formatRevisionGuard: report.cases.format_revision?.guarded === true,
    groupMembersGuard: report.cases.group_members?.guarded === true,
    memorySessionDeleteGuard: report.cases.memory_session_delete?.guarded === true,
    cleanupPass: report.cleanup?.remainingSessions?.length === 0 &&
      report.cleanup?.remainingContacts?.length === 0 &&
      report.cleanup?.remainingWork === 0,
  };
  report.summary.guardReady = Object.values(report.summary).every(value => value === true);
  return report;
})()
