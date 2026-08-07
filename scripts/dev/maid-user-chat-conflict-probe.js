// 在运行中的 dev APP 页面上下文执行；由 app-eval.mjs 载入。
// 只创建 __codex_chat_conflict_* 临时聊天室，不调用模型，结束后自动清理。
(async () => {
  const bridge = window.appBridge;
  const debug = bridge?.debugUiRegistry;
  const registry = debug?.stores?.agentToolRegistry;
  const chatStore = debug?.stores?.chatStore;
  const contactsStore = debug?.stores?.contactsStore;
  const sessionPanel = debug?.panels?.sessionPanel;
  const workRuntime = debug?.stores?.sessionAsyncWorkRuntime;
  if (!registry?.executeTool || !chatStore || !contactsStore || !sessionPanel?.removeCore || !workRuntime?.register) {
    throw new Error('chat conflict probe dependencies unavailable');
  }

  const optimizeUtils = await import('/scripts/ui/chat/chat-body-optimize-utils.js');
  const prefix = `__codex_chat_conflict_${Date.now()}`;
  const changedSessionId = `${prefix}_changed`;
  const busySessionId = `${prefix}_busy`;
  const pinnedSessionId = `${prefix}_pinned`;
  const fixtureIds = [changedSessionId, busySessionId, pinnedSessionId];
  const originalCurrent = String(chatStore.getCurrent?.() || '').trim();
  const allowContext = {
    operationIntentPolicy: { mode: 'write_allowed' },
    requestPermission: async () => ({ decision: 'allow' }),
  };
  const createFixture = async (sessionId) => {
    const output = await registry.executeTool('session.create', {
      name: sessionId,
      open: false,
    }, allowContext);
    if (output?.status !== 'succeeded' || output?.result?.ok === false) {
      throw new Error(`failed to create probe session: ${sessionId}`);
    }
  };
  const hasSession = sessionId => (
    Boolean(contactsStore.getContact?.(sessionId)) ||
    Boolean(chatStore.hasSession?.(sessionId)) ||
    (chatStore.listSessions?.() || []).some(id => String(id) === sessionId)
  );
  const messages = sessionId => chatStore.getMessages?.(sessionId) || [];
  const report = {
    prefix,
    cases: {},
    cleanup: null,
  };

  try {
    await createFixture(changedSessionId);
    const deleteDuringChange = await registry.executeTool('session.delete_many', {
      sessions: [changedSessionId],
    }, {
      ...allowContext,
      requestToolConfirmation: async () => {
        chatStore.appendMessage({
          id: `${changedSessionId}_during_confirm`,
          role: 'assistant',
          type: 'text',
          content: '确认期间的新消息',
          timestamp: Date.now(),
        }, changedSessionId);
        return { decision: 'allow' };
      },
    });
    const changedResult = deleteDuringChange?.result?.results?.find(item => item.sessionId === changedSessionId);
    report.cases.delete_confirmation_content_changed = {
      status: deleteDuringChange?.status,
      result: changedResult || null,
      preserved: hasSession(changedSessionId),
      messageCount: messages(changedSessionId).length,
      guarded: changedResult?.reason === 'session_changed_during_confirmation' && hasSession(changedSessionId),
    };

    await createFixture(busySessionId);
    let fakeWorkLease = null;
    let cancelReason = '';
    fakeWorkLease = workRuntime.register({
      sessionId: busySessionId,
      kind: 'probe_generation',
      cancel: (reason) => {
        cancelReason = String(reason || '');
        setTimeout(() => fakeWorkLease?.settle?.(), 20);
      },
    });
    const busyDelete = await sessionPanel.removeCore(busySessionId);
    report.cases.delete_cancels_and_waits_session_work = {
      cancelReason,
      result: busyDelete,
      remainingWork: workRuntime.count(busySessionId),
      deleted: !hasSession(busySessionId),
      guarded: cancelReason === 'session_deleted'
        && busyDelete?.deleted === true
        && workRuntime.count(busySessionId) === 0
        && !hasSession(busySessionId),
    };

    await createFixture(pinnedSessionId);
    const beforeCurrent = String(chatStore.getCurrent?.() || '').trim();
    const pinnedSend = await registry.executeTool('chat.send_message', {
      sessionId: pinnedSessionId,
      role: 'assistant',
      content: '固定目标追加测试',
      triggerReply: false,
      open: false,
    }, allowContext);
    const afterCurrent = String(chatStore.getCurrent?.() || '').trim();
    const targetHasMessage = messages(pinnedSessionId)
      .some(message => String(message?.content || '') === '固定目标追加测试');
    const originalHasMessage = originalCurrent
      ? messages(originalCurrent).some(message => String(message?.content || '') === '固定目标追加测试')
      : false;
    report.cases.explicit_send_target_is_pinned = {
      status: pinnedSend?.status,
      result: pinnedSend?.result,
      beforeCurrent,
      afterCurrent,
      targetHasMessage,
      originalHasMessage,
      guarded: pinnedSend?.result?.sent === true
        && targetHasMessage
        && !originalHasMessage
        && beforeCurrent === afterCurrent,
    };

    const staleOptimize = optimizeUtils.resolveChatBodyOptimizeWritebackTarget({
      snapshotText: '模型读取时的原文',
      currentMessage: {
        id: 'assistant-probe',
        role: 'assistant',
        rawOriginal: '用户后来修改的正文',
      },
      resolveInputText: message => ({ text: message.rawOriginal }),
    });
    const deletedOptimize = optimizeUtils.resolveChatBodyOptimizeWritebackTarget({
      snapshotText: '模型读取时的原文',
      currentMessage: null,
    });
    report.cases.optimize_stale_writeback = {
      editedReason: staleOptimize.reason,
      deletedReason: deletedOptimize.reason,
      guarded: staleOptimize.ok === false
        && staleOptimize.reason === 'revision_expired'
        && deletedOptimize.ok === false
        && deletedOptimize.reason === 'message_not_found',
    };
  } finally {
    try {
      if (originalCurrent && hasSession(originalCurrent)) {
        chatStore.switchSession?.(originalCurrent);
        bridge?.setActiveSession?.(originalCurrent);
      }
    } catch {}
    const remaining = [];
    for (const sessionId of fixtureIds) {
      try {
        if (hasSession(sessionId)) await sessionPanel.removeCore(sessionId);
      } catch {}
      if (hasSession(sessionId)) remaining.push(sessionId);
    }
    report.cleanup = {
      deleted: remaining.length === 0,
      remaining,
      restoredSessionId: String(chatStore.getCurrent?.() || '').trim(),
    };
  }

  report.summary = {
    deleteRevisionGuard: report.cases.delete_confirmation_content_changed?.guarded === true,
    deleteWorkGuard: report.cases.delete_cancels_and_waits_session_work?.guarded === true,
    sendTargetGuard: report.cases.explicit_send_target_is_pinned?.guarded === true,
    optimizeRevisionGuard: report.cases.optimize_stale_writeback?.guarded === true,
    cleanupPass: report.cleanup?.deleted === true,
  };
  report.summary.guardReady = Object.values(report.summary).every(value => value === true);
  return report;
})()
