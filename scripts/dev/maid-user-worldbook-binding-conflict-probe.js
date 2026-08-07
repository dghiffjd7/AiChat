// 在运行中的 dev APP 页面上下文执行；由 app-eval.mjs 载入。
// 只创建 __codex_world_binding_* 临时聊天室，不调用模型、不写世界书正文，结束后自动清理。
(async () => {
  const bridge = window.appBridge;
  const debug = bridge?.debugUiRegistry;
  const registry = debug?.stores?.agentToolRegistry;
  const personaStore = debug?.stores?.personaStore;
  const chatStore = debug?.stores?.chatStore;
  const contactsStore = debug?.stores?.contactsStore;
  const sessionPanel = debug?.panels?.sessionPanel;
  if (
    !registry?.executeTool ||
    !personaStore?.getActive ||
    !chatStore?.getCurrent ||
    !contactsStore?.upsertContact ||
    !sessionPanel?.removeCore ||
    typeof bridge?.getWorldSessionBindingSnapshot !== 'function' ||
    typeof bridge?.updateWorldSessionBinding !== 'function'
  ) {
    throw new Error('worldbook binding conflict probe dependencies unavailable');
  }

  const prefix = `__codex_world_binding_${Date.now()}`;
  const roomA = `${prefix}_room_a`;
  const roomB = `${prefix}_room_b`;
  const fixtureSessions = [roomA, roomB];
  const fakeWorldIds = new Set([
    `${prefix}_concurrent_a`,
    `${prefix}_concurrent_b`,
    `${prefix}_active_pin`,
    `${prefix}_same_target`,
    `${prefix}_aba`,
    `${prefix}_batch_pin`,
    `${prefix}_rp_scope`,
  ]);
  const originalSessionId = String(chatStore.getCurrent?.() || '').trim();
  const originalGetWorldInfoSnapshot = bridge.getWorldInfoSnapshot;
  const originalGetWorldSessionBindingSnapshot = bridge.getWorldSessionBindingSnapshot;
  const originalWaitForWorldStoreReady = bridge.waitForWorldStoreReady;
  const snapshotCounts = new Map();
  const snapshotHooks = new Map();
  const generations = new Map(Array.from(fakeWorldIds, id => [id, 1]));
  let waitHook = null;
  const report = { prefix, cases: {}, cleanup: null };
  const allowContext = {
    operationIntentPolicy: { mode: 'write_allowed' },
    requestPermission: async () => ({ decision: 'allow' }),
  };
  const hasSession = sessionId => (
    Boolean(contactsStore.getContact?.(sessionId)) ||
    Boolean(chatStore.hasSession?.(sessionId)) ||
    (chatStore.listSessions?.() || []).some(id => String(id) === sessionId)
  );
  const createSession = async sessionId => {
    const output = await registry.executeTool('session.create', {
      name: sessionId,
      open: false,
    }, allowContext);
    if (output?.status !== 'succeeded' || output?.result?.ok === false) {
      throw new Error(`failed to create worldbook binding probe session: ${sessionId}`);
    }
  };
  const setCurrentSession = sessionId => {
    if (sessionId) chatStore.switchSession?.(sessionId);
    else chatStore.setCurrent?.('');
    bridge.setActiveSession?.(sessionId || '');
  };
  const clearBinding = sessionId => {
    bridge.setSessionWorldIds?.(sessionId, [], { silent: true });
  };

  bridge.getWorldInfoSnapshot = async worldbookId => {
    const id = String(worldbookId || '').trim();
    if (!fakeWorldIds.has(id)) {
      return await originalGetWorldInfoSnapshot.call(bridge, id);
    }
    const count = Number(snapshotCounts.get(id) || 0) + 1;
    snapshotCounts.set(id, count);
    await snapshotHooks.get(id)?.(count);
    const generation = Number(generations.get(id) || 1);
    return {
      worldbookId: id,
      exists: true,
      revision: generation,
      generation,
      data: { name: id, entries: [] },
    };
  };
  bridge.waitForWorldStoreReady = async () => {
    const hook = waitHook;
    waitHook = null;
    await hook?.();
    return true;
  };

  try {
    await createSession(roomA);
    await createSession(roomB);

    clearBinding(roomA);
    const concurrent = await Promise.all([
      registry.executeTool('worldbook.bind_session', {
        sessionId: roomA,
        worldbookId: `${prefix}_concurrent_a`,
      }, allowContext),
      registry.executeTool('worldbook.bind_session', {
        sessionId: roomA,
        worldbookId: `${prefix}_concurrent_b`,
      }, allowContext),
    ]);
    const concurrentIds = bridge.getWorldIdsForSession(roomA);
    report.cases.concurrent_append = {
      statuses: concurrent.map(item => item?.status),
      results: concurrent.map(item => item?.result),
      worldbookIds: concurrentIds,
      guarded: concurrent.every(item => item?.result?.ok === true)
        && concurrentIds.includes(`${prefix}_concurrent_a`)
        && concurrentIds.includes(`${prefix}_concurrent_b`),
    };

    clearBinding(roomA);
    clearBinding(roomB);
    setCurrentSession(roomA);
    waitHook = async () => setCurrentSession(roomB);
    const activePin = await registry.executeTool('worldbook.bind_session', {
      worldbookId: `${prefix}_active_pin`,
    }, allowContext);
    report.cases.active_session_pin = {
      status: activePin?.status,
      result: activePin?.result,
      roomAWorldbookIds: bridge.getWorldIdsForSession(roomA),
      roomBWorldbookIds: bridge.getWorldIdsForSession(roomB),
      guarded: activePin?.result?.ok === true
        && activePin?.result?.sessionId === roomA
        && bridge.getWorldIdsForSession(roomA).includes(`${prefix}_active_pin`)
        && !bridge.getWorldIdsForSession(roomB).includes(`${prefix}_active_pin`),
    };

    const sameTargetWorld = `${prefix}_same_target`;
    bridge.setSessionWorldIds(roomA, ['keep', sameTargetWorld], { silent: true });
    snapshotCounts.set(sameTargetWorld, 0);
    snapshotHooks.set(sameTargetWorld, async count => {
      if (count === 2) bridge.setSessionWorldIds(roomA, ['keep'], { silent: true });
    });
    const sameTarget = await registry.executeTool('worldbook.bind_session', {
      sessionId: roomA,
      worldbookId: sameTargetWorld,
    }, allowContext);
    snapshotHooks.delete(sameTargetWorld);
    report.cases.same_target_user_unbind = {
      status: sameTarget?.status,
      result: sameTarget?.result,
      worldbookIds: bridge.getWorldIdsForSession(roomA),
      guarded: sameTarget?.result?.ok === false
        && sameTarget?.result?.reason === 'binding_changed_during_operation'
        && !bridge.getWorldIdsForSession(roomA).includes(sameTargetWorld),
    };

    const abaWorld = `${prefix}_aba`;
    clearBinding(roomA);
    snapshotCounts.set(abaWorld, 0);
    generations.set(abaWorld, 1);
    snapshotHooks.set(abaWorld, async count => {
      if (count === 2) generations.set(abaWorld, 2);
    });
    const aba = await registry.executeTool('worldbook.bind_session', {
      sessionId: roomA,
      worldbookId: abaWorld,
    }, allowContext);
    snapshotHooks.delete(abaWorld);
    report.cases.worldbook_delete_recreate = {
      status: aba?.status,
      result: aba?.result,
      worldbookIds: bridge.getWorldIdsForSession(roomA),
      guarded: aba?.result?.ok === false
        && aba?.result?.reason === 'worldbook_recreated_during_operation'
        && !bridge.getWorldIdsForSession(roomA).includes(abaWorld),
    };

    clearBinding(roomA);
    clearBinding(roomB);
    const nameA = `${prefix}_same_name`;
    const nameB = `${prefix}_other_name`;
    contactsStore.upsertContact({ id: roomA, name: nameA });
    contactsStore.upsertContact({ id: roomB, name: nameB });
    const batchPin = await registry.executeTool('worldbook.bind_sessions', {
      worldbookId: `${prefix}_batch_pin`,
      sessions: [nameA],
    }, {
      ...allowContext,
      requestToolConfirmation: () => {
        contactsStore.upsertContact({ id: roomA, name: nameB });
        contactsStore.upsertContact({ id: roomB, name: nameA });
        return { decision: 'allow' };
      },
    });
    report.cases.confirmed_target_pin = {
      status: batchPin?.status,
      result: batchPin?.result,
      roomAWorldbookIds: bridge.getWorldIdsForSession(roomA),
      roomBWorldbookIds: bridge.getWorldIdsForSession(roomB),
      guarded: batchPin?.result?.ok === true
        && batchPin?.result?.results?.[0]?.sessionId === roomA
        && bridge.getWorldIdsForSession(roomA).includes(`${prefix}_batch_pin`)
        && !bridge.getWorldIdsForSession(roomB).includes(`${prefix}_batch_pin`),
    };

    bridge.setSessionWorldIds(roomA, ['scope-base'], { silent: true });
    const scopeSnapshot = bridge.getWorldSessionBindingSnapshot(roomA);
    const scopeGuard = bridge.updateWorldSessionBinding(roomA, {
      worldbookId: 'scope-write',
      mode: 'append',
      expectedWorldbookIds: scopeSnapshot.worldbookIds,
      expectedScopeId: `${scopeSnapshot.scopeId}__stale`,
      silent: true,
    });
    report.cases.scope_guard = {
      result: scopeGuard,
      worldbookIds: bridge.getWorldIdsForSession(roomA),
      guarded: scopeGuard?.ok === false
        && scopeGuard?.reason === 'target_scope_changed'
        && !bridge.getWorldIdsForSession(roomA).includes('scope-write'),
    };

    const activePersonaId = String(personaStore.getActive?.()?.id || '').trim();
    bridge.getWorldSessionBindingSnapshot = sessionId => ({
      ...originalGetWorldSessionBindingSnapshot.call(bridge, sessionId),
      scopeId: `${bridge.scopeId}__stale`,
    });
    const rpScopeGuard = await registry.executeTool('worldbook.bind_rp_session', {
      personaId: activePersonaId,
      worldbookId: `${prefix}_rp_scope`,
    }, allowContext);
    bridge.getWorldSessionBindingSnapshot = originalGetWorldSessionBindingSnapshot;
    report.cases.rp_scope_guard = {
      status: rpScopeGuard?.status,
      result: rpScopeGuard?.result,
      guarded: rpScopeGuard?.result?.ok === false
        && rpScopeGuard?.result?.reason === 'target_scope_changed',
    };
  } finally {
    bridge.getWorldInfoSnapshot = originalGetWorldInfoSnapshot;
    bridge.getWorldSessionBindingSnapshot = originalGetWorldSessionBindingSnapshot;
    bridge.waitForWorldStoreReady = originalWaitForWorldStoreReady;
    try { setCurrentSession(originalSessionId); } catch {}
    fixtureSessions.forEach(clearBinding);
    const remainingSessions = [];
    for (const sessionId of fixtureSessions) {
      try {
        if (hasSession(sessionId)) await sessionPanel.removeCore(sessionId);
      } catch {}
      if (hasSession(sessionId)) remainingSessions.push(sessionId);
    }
    report.cleanup = {
      deleted: remainingSessions.length === 0,
      remainingSessions,
      restoredSessionId: String(chatStore.getCurrent?.() || '').trim(),
      orphanBindings: fixtureSessions.filter(sessionId => bridge.getWorldIdsForSession(sessionId).length > 0),
    };
  }

  report.summary = {
    concurrentAppend: report.cases.concurrent_append?.guarded === true,
    activeSessionPin: report.cases.active_session_pin?.guarded === true,
    sameTargetUnbindGuard: report.cases.same_target_user_unbind?.guarded === true,
    worldbookAbaGuard: report.cases.worldbook_delete_recreate?.guarded === true,
    confirmedTargetPin: report.cases.confirmed_target_pin?.guarded === true,
    scopeGuard: report.cases.scope_guard?.guarded === true,
    rpScopeGuard: report.cases.rp_scope_guard?.guarded === true,
    cleanupPass: report.cleanup?.deleted === true && report.cleanup?.orphanBindings?.length === 0,
  };
  report.summary.guardReady = Object.values(report.summary).every(value => value === true);
  return report;
})()
