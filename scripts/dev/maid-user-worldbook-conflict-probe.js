// 在运行中的 dev APP 页面上下文执行；由 app-eval.mjs 载入。
// 只创建 __codex_conflict_probe_* 临时世界书，所有场景结束后会清理。
(async () => {
  const bridge = window.appBridge;
  const registry = bridge?.debugUiRegistry?.stores?.agentToolRegistry;
  const editor = bridge?.debugUiRegistry?.panels?.worldPanel?.editor;
  if (!bridge || !registry?.executeTool || !editor) {
    throw new Error('worldbook conflict probe dependencies unavailable');
  }

  const worldbookId = `__codex_conflict_probe_${Date.now()}`;
  const scopeWorldbookA = `${worldbookId}_scope_a`;
  const scopeWorldbookB = `${worldbookId}_scope_b`;
  const fixtureIds = [worldbookId, scopeWorldbookA, scopeWorldbookB];
  const clone = value => JSON.parse(JSON.stringify(value));
  const originalGetMethod = bridge.getWorldInfo;
  const originalGetSnapshotMethod = bridge.getWorldInfoSnapshot;
  const originalGetWorldIdsMethod = bridge.getWorldIdsForSession;
  const originalGet = originalGetMethod.bind(bridge);
  const originalGetSnapshot = originalGetSnapshotMethod.bind(bridge);
  const originalSave = bridge.saveWorldInfo.bind(bridge);
  const originalDelete = bridge.deleteWorldInfo.bind(bridge);
  const originalExists = bridge.worldInfoExists.bind(bridge);
  const initialBook = () => ({
    name: worldbookId,
    source: 'codex_conflict_probe',
    entries: [
      {
        id: 'entry-a',
        uid: 0,
        comment: 'Entry A',
        title: 'Entry A',
        key: ['entry-a'],
        content: 'initial-A',
        enabled: true,
        position: 0,
        order: 100,
      },
      {
        id: 'entry-b',
        uid: 1,
        comment: 'Entry B',
        title: 'Entry B',
        key: ['entry-b'],
        content: 'initial-B',
        enabled: true,
        position: 0,
        order: 100,
      },
    ],
  });
  const read = async () => clone(await originalGet(worldbookId));
  const entryContents = data => Object.fromEntries(
    (Array.isArray(data?.entries) ? data.entries : []).map(entry => [
      String(entry?.id ?? entry?.uid ?? ''),
      String(entry?.content ?? ''),
    ]),
  );
  const reset = async () => {
    await originalSave(worldbookId, initialBook());
  };
  const saveUserB = async (content) => {
    const payload = await read();
    const entry = payload.entries.find(item => String(item?.id) === 'entry-b');
    entry.content = content;
    payload.updatedBy = 'user-probe';
    await originalSave(worldbookId, payload);
  };
  const runMaidUpdateA = async (requestToolConfirmation = async () => ({ decision: 'allow' })) => {
    const output = await registry.executeTool('worldbook.update_entries', {
      worldbookId,
      updates: [{ entryId: 'entry-a', content: 'maid-A' }],
    }, {
      requestPermission: async () => ({ decision: 'allow' }),
      requestToolConfirmation,
    });
    return {
      status: output?.status,
      result: output?.result,
    };
  };

  const report = {
    worldbookId,
    preexisting: await originalExists(worldbookId),
    cases: {},
    cleanup: null,
  };

  try {
    await reset();
    await saveUserB('user-B-before-maid');
    const serialTool = await runMaidUpdateA();
    const serialFinal = await read();
    report.cases.user_then_maid_serial = {
      tool: serialTool,
      final: entryContents(serialFinal),
      preservedBoth: entryContents(serialFinal)['entry-a'] === 'maid-A'
        && entryContents(serialFinal)['entry-b'] === 'user-B-before-maid',
    };

    await reset();
    let confirmationCount = 0;
    const confirmationTool = await runMaidUpdateA(async () => {
      confirmationCount += 1;
      await saveUserB('user-B-during-confirmation');
      return { decision: 'allow' };
    });
    const confirmationFinal = await read();
    report.cases.user_during_maid_confirmation = {
      confirmationCount,
      tool: confirmationTool,
      final: entryContents(confirmationFinal),
      preservedBoth: entryContents(confirmationFinal)['entry-a'] === 'maid-A'
        && entryContents(confirmationFinal)['entry-b'] === 'user-B-during-confirmation',
    };

    await reset();
    await editor.show(worldbookId, await read());
    const editorOpenedWith = entryContents(editor.data);
    const maidBeforeEditorSave = await runMaidUpdateA();
    const editorEntryBIndex = editor.data.entries.findIndex(item => String(item?.id) === 'entry-b');
    editor.selectEntry(editorEntryBIndex);
    const editorTextarea = editor.editorEl?.querySelector('#we-block-content');
    if (!editorTextarea) throw new Error('worldbook editor content textarea unavailable');
    editorTextarea.value = 'user-B-from-open-editor';
    editorTextarea.dispatchEvent(new Event('input', { bubbles: true }));
    const editorDraftBeforeSave = entryContents(editor.data);
    const editorSaveOk = await editor.saveWorldSilently({ showToast: false });
    const editorFinal = await read();
    report.cases.maid_then_stale_open_editor_save = {
      editorOpenedWith,
      editorDraftBeforeSave,
      maidTool: maidBeforeEditorSave,
      editorSaveOk,
      final: entryContents(editorFinal),
      maidWriteLost: entryContents(editorFinal)['entry-a'] === 'initial-A',
    };
    editor.hide();

    await reset();
    let fixtureReadCount = 0;
    let releaseSecondRead;
    let markSecondReadReached;
    const secondReadRelease = new Promise(resolve => { releaseSecondRead = resolve; });
    const secondReadReached = new Promise(resolve => { markSecondReadReached = resolve; });
    bridge.getWorldInfoSnapshot = async function patchedGetWorldInfoSnapshot(id) {
      if (String(id) !== worldbookId) return originalGetSnapshot(id);
      fixtureReadCount += 1;
      const snapshot = clone(await originalGetSnapshot(id));
      // preflight、execute target refresh 后，第 3 次是最终 CAS 基线读取。
      if (fixtureReadCount === 3) {
        markSecondReadReached();
        await secondReadRelease;
      }
      return snapshot;
    };
    const pausedMaidToolPromise = runMaidUpdateA();
    await Promise.race([
      secondReadReached,
      new Promise((_, reject) => setTimeout(() => reject(new Error('maid final snapshot read was not reached')), 5000)),
    ]);
    const userPayloadDuringFinalWindow = clone(await originalGet(worldbookId));
    const finalWindowEntryB = userPayloadDuringFinalWindow.entries.find(item => String(item?.id) === 'entry-b');
    finalWindowEntryB.content = 'user-B-after-maid-read';
    userPayloadDuringFinalWindow.updatedBy = 'user-probe';
    await originalSave(worldbookId, userPayloadDuringFinalWindow);
    releaseSecondRead();
    const pausedMaidTool = await pausedMaidToolPromise;
    bridge.getWorldInfoSnapshot = originalGetSnapshotMethod;
    const finalWindowFinal = await read();
    report.cases.user_after_maid_final_read_before_save = {
      fixtureReadCount,
      tool: pausedMaidTool,
      final: entryContents(finalWindowFinal),
      userWriteLost: entryContents(finalWindowFinal)['entry-b'] === 'initial-B',
    };

    const scopeBook = id => ({
      ...initialBook(),
      name: id,
      entries: initialBook().entries.map(entry => ({ ...entry, content: `${id}:${entry.id}:initial` })),
    });
    await originalSave(scopeWorldbookA, scopeBook(scopeWorldbookA));
    await originalSave(scopeWorldbookB, scopeBook(scopeWorldbookB));
    const probeSessionId = `${worldbookId}_session`;
    let derivedWorldbookId = scopeWorldbookA;
    bridge.getWorldIdsForSession = async function patchedGetWorldIdsForSession(sessionId) {
      if (String(sessionId) === probeSessionId) return [derivedWorldbookId];
      return typeof originalGetWorldIdsMethod === 'function'
        ? originalGetWorldIdsMethod.call(bridge, sessionId)
        : [];
    };
    let confirmedWorldbookId = '';
    const scopeToolOutput = await registry.executeTool('worldbook.update_entries', {
      sessionId: probeSessionId,
      updates: [{ entryId: 'entry-a', content: 'maid-A-after-scope-switch' }],
    }, {
      requestPermission: async () => ({ decision: 'allow' }),
      requestToolConfirmation: async request => {
        confirmedWorldbookId = String(request?.details?.worldbookId || '');
        derivedWorldbookId = scopeWorldbookB;
        return { decision: 'allow' };
      },
    });
    bridge.getWorldIdsForSession = originalGetWorldIdsMethod;
    const scopeFinalA = clone(await originalGet(scopeWorldbookA));
    const scopeFinalB = clone(await originalGet(scopeWorldbookB));
    report.cases.derived_target_changes_during_confirmation = {
      confirmedWorldbookId,
      executedWorldbookId: String(scopeToolOutput?.result?.worldbookId || ''),
      toolStatus: scopeToolOutput?.status,
      finalA: entryContents(scopeFinalA),
      finalB: entryContents(scopeFinalB),
      wrongTargetWrite: confirmedWorldbookId === scopeWorldbookA
        && String(scopeToolOutput?.result?.worldbookId || '') === scopeWorldbookB,
    };
  } finally {
    bridge.getWorldInfo = originalGetMethod;
    bridge.getWorldInfoSnapshot = originalGetSnapshotMethod;
    bridge.getWorldIdsForSession = originalGetWorldIdsMethod;
    try { editor.hide(); } catch {}
    try {
      for (const fixtureId of fixtureIds) {
        if (await originalExists(fixtureId)) await originalDelete(fixtureId);
      }
      const remaining = [];
      for (const fixtureId of fixtureIds) {
        if (await originalExists(fixtureId)) remaining.push(fixtureId);
      }
      report.cleanup = { deleted: remaining.length === 0, remaining };
    } catch (error) {
      report.cleanup = { deleted: false, error: String(error?.message || error) };
    }
  }

  report.summary = {
    safeOrderingCasesPass: report.cases.user_then_maid_serial?.preservedBoth === true
      && report.cases.user_during_maid_confirmation?.preservedBoth === true,
    knownLostUpdateHazardsReproduced: report.cases.maid_then_stale_open_editor_save?.maidWriteLost === true
      && report.cases.user_after_maid_final_read_before_save?.userWriteLost === true,
    knownTargetDriftHazardReproduced: report.cases.derived_target_changes_during_confirmation?.wrongTargetWrite === true,
    cleanupPass: report.cleanup?.deleted === true,
  };
  report.summary.guardReady = report.summary.safeOrderingCasesPass
    && !report.summary.knownLostUpdateHazardsReproduced
    && !report.summary.knownTargetDriftHazardReproduced
    && report.summary.cleanupPass;
  report.summary.baselineMatched = report.summary.safeOrderingCasesPass
    && report.summary.knownLostUpdateHazardsReproduced
    && report.summary.knownTargetDriftHazardReproduced
    && report.summary.cleanupPass;

  return report;
})()
