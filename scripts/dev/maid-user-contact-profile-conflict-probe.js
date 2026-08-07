// 在运行中的 dev APP 页面上下文执行；由 app-eval.mjs 载入。
// 使用唯一临时画像，不调用模型；结束后删除临时画像、候选与 revision 记录。
(async () => {
  const bridge = window.appBridge;
  const debug = bridge?.debugUiRegistry;
  const registry = debug?.stores?.agentToolRegistry;
  const store = debug?.stores?.contactProfileStore || bridge?.getContactProfileStore?.();
  const profiler = debug?.stores?.contactProfilerAgent;
  if (
    !registry?.executeTool ||
    !store?.getProfileSnapshot ||
    !store?.upsertProfileIfUnchanged ||
    !store?.approvePendingUpdate ||
    !profiler?.runProfileUpdate
  ) {
    throw new Error('contact profile conflict probe dependencies unavailable');
  }

  const prefix = `__codex_contact_profile_${Date.now()}`;
  const ids = {
    userEdit: `${prefix}_user_edit`,
    recreate: `${prefix}_recreate`,
    scope: `${prefix}_scope`,
    concurrent: `${prefix}_concurrent`,
    autosave: `${prefix}_autosave`,
    pending: `${prefix}_pending`,
  };
  const profileIds = Object.values(ids);
  const pendingIds = [];
  const originalScope = String(store.scopeId || '').trim();
  const alternateScope = `__codex_cp_scope_${Date.now().toString(36)}`;
  const originalSettings = store.getSettings?.() || {};
  const originalConditionalUpsert = store.upsertProfileIfUnchanged;
  const report = { prefix, originalScope, cases: {}, cleanup: null };
  const baseContext = {
    operationIntentPolicy: { mode: 'write_allowed' },
    requestPermission: async () => ({ decision: 'allow' }),
  };
  const runUpsert = async (contactId, displayName, onConfirm = null) => (
    await registry.executeTool('contact_profile.upsert', {
      profile: { contactId, displayName, trigger_keywords: [displayName] },
    }, {
      ...baseContext,
      requestToolConfirmation: async () => {
        await onConfirm?.();
        return { confirmed: true };
      },
    })
  );

  try {
    store.upsertProfile({ contactId: ids.userEdit, displayName: 'Base user edit' });
    const userEditResult = await runUpsert(ids.userEdit, 'Maid user edit', () => {
      store.upsertProfile({ contactId: ids.userEdit, displayName: 'User edit wins' });
    });
    report.cases.user_edit = {
      status: userEditResult?.status,
      result: userEditResult?.result,
      finalProfile: store.getProfile(ids.userEdit),
      guarded: userEditResult?.result?.saved === false &&
        userEditResult?.result?.reason === 'profile_changed_during_operation' &&
        store.getProfile(ids.userEdit)?.displayName === 'User edit wins',
    };

    store.upsertProfile({ contactId: ids.recreate, displayName: 'Original profile' });
    const recreateResult = await runUpsert(ids.recreate, 'Stale profile', () => {
      store.deleteProfile(ids.recreate);
      store.upsertProfile({ contactId: ids.recreate, displayName: 'Recreated profile' });
    });
    report.cases.delete_recreate = {
      status: recreateResult?.status,
      result: recreateResult?.result,
      finalProfile: store.getProfile(ids.recreate),
      guarded: recreateResult?.result?.saved === false &&
        recreateResult?.result?.reason === 'profile_changed_during_operation' &&
        store.getProfile(ids.recreate)?.displayName === 'Recreated profile',
    };

    store.upsertProfile({ contactId: ids.scope, displayName: 'Original scope profile' });
    const scopeResult = await runUpsert(ids.scope, 'Wrong scope profile', async () => {
      await store.setScope(alternateScope);
    });
    await store.setScope(originalScope);
    report.cases.scope_switch = {
      status: scopeResult?.status,
      result: scopeResult?.result,
      finalProfile: store.getProfile(ids.scope),
      guarded: scopeResult?.result?.saved === false &&
        scopeResult?.result?.reason === 'target_scope_changed' &&
        store.getProfile(ids.scope)?.displayName === 'Original scope profile',
    };

    store.upsertProfile({ contactId: ids.concurrent, displayName: 'Concurrent base' });
    let confirmationCount = 0;
    let releaseConfirmations = () => {};
    const confirmationGate = new Promise(resolve => { releaseConfirmations = resolve; });
    const concurrentConfirm = async () => {
      confirmationCount += 1;
      if (confirmationCount === 2) releaseConfirmations();
      await confirmationGate;
    };
    const concurrentResults = await Promise.all([
      runUpsert(ids.concurrent, 'Concurrent A', concurrentConfirm),
      runUpsert(ids.concurrent, 'Concurrent B', concurrentConfirm),
    ]);
    const savedCount = concurrentResults.filter(item => item?.result?.saved === true).length;
    const conflictCount = concurrentResults.filter(item => (
      item?.result?.reason === 'profile_changed_during_operation'
    )).length;
    report.cases.concurrent_writers = {
      statuses: concurrentResults.map(item => item?.status),
      results: concurrentResults.map(item => item?.result),
      finalProfile: store.getProfile(ids.concurrent),
      guarded: savedCount === 1 && conflictCount === 1 &&
        ['Concurrent A', 'Concurrent B'].includes(store.getProfile(ids.concurrent)?.displayName),
    };

    store.updateSettings({
      backgroundUpdateEnabled: true,
      backgroundAutoSave: true,
      backgroundRequireConfirm: false,
    });
    store.upsertProfile({ contactId: ids.autosave, displayName: 'Autosave base' });
    let injectedAutosaveEdit = false;
    store.upsertProfileIfUnchanged = (profile, expected = {}) => {
      if (!injectedAutosaveEdit && String(profile?.contactId || '') === ids.autosave) {
        injectedAutosaveEdit = true;
        store.upsertProfile({ contactId: ids.autosave, displayName: 'Autosave user edit' });
      }
      return originalConditionalUpsert.call(store, profile, expected);
    };
    const autosaveResult = await profiler.runProfileUpdate({
      contactId: ids.autosave,
      sessionId: ids.autosave,
      reason: 'dev_conflict_probe',
      force: true,
      maxAttempts: 1,
    });
    store.upsertProfileIfUnchanged = originalConditionalUpsert;
    report.cases.background_autosave = {
      result: autosaveResult,
      finalProfile: store.getProfile(ids.autosave),
      guarded: autosaveResult?.status === 'conflict' &&
        autosaveResult?.reason === 'profile_changed_during_operation' &&
        store.getProfile(ids.autosave)?.displayName === 'Autosave user edit',
    };

    store.upsertProfile({ contactId: ids.pending, displayName: 'Pending base' });
    const pendingSnapshot = store.getProfileSnapshot(ids.pending);
    const pending = store.addPendingUpdate({
      id: `${prefix}_pending_update`,
      contactId: ids.pending,
      profile: { contactId: ids.pending, displayName: 'Pending candidate' },
      scopeId: pendingSnapshot.scopeId,
      baseRevision: pendingSnapshot.revision,
      baseExists: pendingSnapshot.exists,
    });
    pendingIds.push(pending.id);
    store.upsertProfile({ contactId: ids.pending, displayName: 'Pending user edit' });
    const pendingResult = bridge.approveContactProfilePendingUpdate({ id: pending.id });
    report.cases.pending_approval = {
      result: pendingResult,
      finalProfile: store.getProfile(ids.pending),
      pendingRetained: store.listPendingUpdates().some(item => item.id === pending.id),
      guarded: pendingResult?.ok === false &&
        pendingResult?.reason === 'profile_changed_during_operation' &&
        store.getProfile(ids.pending)?.displayName === 'Pending user edit' &&
        store.listPendingUpdates().some(item => item.id === pending.id),
    };
  } finally {
    store.upsertProfileIfUnchanged = originalConditionalUpsert;
    if (String(store.scopeId || '').trim() !== originalScope) {
      await store.setScope(originalScope);
    }
    store.updateSettings(originalSettings);
    pendingIds.forEach(id => store.clearPendingUpdate(id));
    profileIds.forEach(id => store.deleteProfile(id));
    profileIds.forEach(id => {
      if (store.state?.profileRevisions) delete store.state.profileRevisions[id];
    });
    await store._persist?.();
    await store.whenPersisted?.();
    report.cleanup = {
      restoredScope: String(store.scopeId || '').trim(),
      remainingProfiles: profileIds.filter(id => Boolean(store.getProfile(id))),
      remainingPending: (store.listPendingUpdates?.() || [])
        .filter(item => pendingIds.includes(String(item?.id || '')))
        .map(item => item.id),
      remainingRevisionArtifacts: profileIds.filter(id => (
        Object.prototype.hasOwnProperty.call(store.state?.profileRevisions || {}, id)
      )),
      settingsRestored: JSON.stringify(store.getSettings?.() || {}) === JSON.stringify(originalSettings),
    };
  }

  report.summary = {
    userEditGuard: report.cases.user_edit?.guarded === true,
    deleteRecreateGuard: report.cases.delete_recreate?.guarded === true,
    scopeSwitchGuard: report.cases.scope_switch?.guarded === true,
    concurrentWritersGuard: report.cases.concurrent_writers?.guarded === true,
    backgroundAutosaveGuard: report.cases.background_autosave?.guarded === true,
    pendingApprovalGuard: report.cases.pending_approval?.guarded === true,
    cleanupPass: report.cleanup?.restoredScope === originalScope &&
      report.cleanup?.remainingProfiles?.length === 0 &&
      report.cleanup?.remainingPending?.length === 0 &&
      report.cleanup?.remainingRevisionArtifacts?.length === 0 &&
      report.cleanup?.settingsRestored === true,
  };
  report.summary.guardReady = Object.values(report.summary).every(value => value === true);
  return report;
})()
