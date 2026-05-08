import assert from 'node:assert/strict';

const {
  buildCustomBundleImportCancelledProgressDetail,
  buildCustomBundleImportCompletionPatch,
  buildCustomBundleImportDebugLogPayload,
  buildCustomBundleImportDiagnostics,
  buildCustomBundleImportDiagnosticsState,
  buildCustomBundleImportDoneProgressDetail,
  buildCustomBundleImportFailedProgressDetail,
  buildCustomBundleImportFailureDiagnostics,
  buildCustomBundleImportFileSelectedDebugLog,
  buildCustomBundleImportPreviewProgressDetail,
  buildCustomBundleImportProgressPayload,
  buildCustomBundleImportProgressTraceEvent,
  buildCustomBundleImportReadFileProgressDetail,
  buildCustomBundleImportReadZipProgressDetail,
  buildCustomBundleImportResultPayload,
  buildCustomBundleImportSwitchConfirmOptions,
  buildCustomBundleRoleImportDiagnostics,
  cloneCustomBundleImportDiagnosticsSnapshot,
  shouldPromptCustomBundleImportSwitch,
} = await import('../../src/scripts/ui/custom-bundle-import-diagnostics-utils.js');

{
  const preview = { chats: 2 };
  const diagnostics = buildCustomBundleImportDiagnostics({
    fileName: ' bundle.zip ',
    preview,
    sharedMode: true,
    startedAt: 123,
  });
  assert.deepEqual(diagnostics, {
    kind: 'custom-bundle-import',
    fileName: 'bundle.zip',
    phase: 'running',
    startedAt: 123,
    durationMs: 0,
    preview,
    sharedMode: true,
    roles: [],
    scopes: [],
    notes: [],
    importedTargetsCount: 0,
    error: '',
    phases: {},
  });
  assert.equal(diagnostics.preview, preview);
  console.log('ok - buildCustomBundleImportDiagnostics preserves initial import diagnostics shape');
}

{
  assert.deepEqual(
    buildCustomBundleRoleImportDiagnostics({
      importedPersona: { id: ' role:alice ', name: ' Alice ' },
      roleManifest: { name: 'Manifest Alice' },
      targetScopeId: 'scope:alice',
      chatScopeId: '',
    }),
    {
      personaId: 'role:alice',
      personaName: 'Alice',
      scopeId: 'scope:alice',
      chatScopeId: '',
      moments: null,
      chats: [],
      creativeWriting: null,
    },
  );
  assert.equal(
    buildCustomBundleRoleImportDiagnostics({
      importedPersona: { id: 'role:bob', name: '   ' },
      roleManifest: { name: ' Bob Manifest ' },
    }).personaName,
    '角色',
  );
  assert.equal(
    buildCustomBundleRoleImportDiagnostics({
      importedPersona: { id: 'role:bob' },
      roleManifest: { name: ' Bob Manifest ' },
    }).personaName,
    'Bob Manifest',
  );
  console.log('ok - buildCustomBundleRoleImportDiagnostics preserves role diagnostics defaults');
}

{
  const importedTargets = [{ sessionId: 's1' }, { sessionId: 's2' }];
  const result = buildCustomBundleImportResultPayload({ importedTargets });
  assert.equal(result.importedTargets, importedTargets);
  assert.equal(result.firstTarget, importedTargets[0]);
  assert.deepEqual(buildCustomBundleImportResultPayload({ importedTargets: [] }), {
    importedTargets: [],
    firstTarget: null,
  });

  const firstTarget = { nested: { id: 'target' } };
  const completion = buildCustomBundleImportCompletionPatch({
    importedTargets,
    firstTarget,
    durationMs: 12.6,
    finishedAt: 456,
  });
  assert.deepEqual(completion, {
    phase: 'done',
    importedTargetsCount: 2,
    durationMs: 13,
    finishedAt: 456,
    firstTarget: { nested: { id: 'target' } },
  });
  completion.firstTarget.nested.id = 'changed';
  assert.equal(firstTarget.nested.id, 'target');
  assert.deepEqual(
    buildCustomBundleImportDoneProgressDetail({
      importedTargets,
      fileName: 'bundle.zip',
    }),
    {
      phase: 'done',
      progress: 100,
      status: '导入完成：2 个会话',
      fileName: 'bundle.zip',
      done: true,
    },
  );
  console.log('ok - import result completion and done progress helpers preserve final payload contracts');
}

{
  const err = new Error('boom');
  assert.deepEqual(
    buildCustomBundleImportFailedProgressDetail({
      error: err,
      fileName: 'bundle.zip',
    }),
    {
      phase: 'failed',
      progress: 100,
      status: '导入失败：boom',
      fileName: 'bundle.zip',
      done: true,
      error: 'boom',
    },
  );
  assert.deepEqual(
    buildCustomBundleImportFailureDiagnostics({
      fileName: ' bundle.zip ',
      error: err,
      startedAt: 123,
      finishedAt: 456,
      durationMs: 12.6,
    }),
    {
      kind: 'custom-bundle-import',
      fileName: 'bundle.zip',
      phase: 'failed',
      startedAt: 123,
      finishedAt: 456,
      durationMs: 13,
      preview: {},
      roles: [],
      scopes: [],
      importedTargetsCount: 0,
      error: 'boom',
    },
  );
  assert.equal(buildCustomBundleImportFailedProgressDetail({ error: null }).error, '导入失败');
  console.log('ok - failed import diagnostics and progress helpers preserve catch payload contracts');
}

{
  assert.deepEqual(
    buildCustomBundleImportFileSelectedDebugLog({ fileName: ' bundle.zip ' }),
    {
      source: 'custom-bundle',
      message: 'import file selected bundle.zip',
    },
  );
  assert.equal(
    buildCustomBundleImportFileSelectedDebugLog({ fileName: '' }).message,
    'import file selected unknown',
  );
  assert.deepEqual(
    buildCustomBundleImportReadFileProgressDetail({ fileName: 'bundle.zip' }),
    {
      phase: 'read-file',
      progress: 4,
      status: '正在读取资料包文件...',
      fileName: 'bundle.zip',
    },
  );
  assert.deepEqual(
    buildCustomBundleImportReadZipProgressDetail({ fileName: 'bundle.zip' }),
    {
      phase: 'read-zip',
      progress: 10,
      status: '正在解析资料包索引...',
      fileName: 'bundle.zip',
    },
  );
  assert.deepEqual(
    buildCustomBundleImportReadZipProgressDetail({
      fileName: 'bundle.zip',
      reusedPrefetchedEntries: true,
    }),
    {
      phase: 'read-zip',
      progress: 10,
      status: '已复用预读取资料包索引',
      fileName: 'bundle.zip',
    },
  );
  assert.deepEqual(
    buildCustomBundleImportPreviewProgressDetail({ fileName: 'bundle.zip' }),
    {
      phase: 'preview',
      progress: 14,
      status: '资料包识别完成，等待确认导入...',
      fileName: 'bundle.zip',
    },
  );
  assert.deepEqual(
    buildCustomBundleImportCancelledProgressDetail({ fileName: 'bundle.zip' }),
    {
      phase: 'cancelled',
      progress: 0,
      status: '已取消导入',
      fileName: 'bundle.zip',
      done: true,
    },
  );
  console.log('ok - import file read preview and cancel helpers preserve progress payload contracts');
}

{
  assert.equal(shouldPromptCustomBundleImportSwitch({ personaId: 'role:a' }), true);
  assert.equal(shouldPromptCustomBundleImportSwitch({ sessionId: 'session:a' }), true);
  assert.equal(shouldPromptCustomBundleImportSwitch({ personaId: '', sessionId: '' }), false);
  assert.deepEqual(
    buildCustomBundleImportSwitchConfirmOptions({
      importedTargets: [{ sessionId: 'a' }, { sessionId: 'b' }],
    }),
    {
      title: '导入完成',
      message: '已导入 2 个会话。是否切换到第一个导入结果？',
      confirmText: '切换',
      cancelText: '稍后',
    },
  );
  assert.equal(
    buildCustomBundleImportSwitchConfirmOptions({ importedTargets: null }).message,
    '已导入 0 个会话。是否切换到第一个导入结果？',
  );
  console.log('ok - import switch prompt helpers preserve confirm copy and target policy');
}

{
  const source = {
    phase: 'done',
    nested: { value: 1 },
  };
  const clone = cloneCustomBundleImportDiagnosticsSnapshot(source);
  assert.deepEqual(clone, source);
  assert.notEqual(clone, source);
  assert.equal(cloneCustomBundleImportDiagnosticsSnapshot(null), null);
  console.log('ok - cloneCustomBundleImportDiagnosticsSnapshot clones object snapshots only');
}

{
  const snapshot = { phase: 'done', durationMs: 12 };
  const state = buildCustomBundleImportDiagnosticsState({
    currentState: { history: [{ phase: 'old-1' }, { phase: 'old-2' }] },
    snapshot,
    historyLimit: 2,
  });
  assert.deepEqual(state, {
    lastImport: snapshot,
    history: [snapshot, { phase: 'old-1' }],
  });
  assert.equal(buildCustomBundleImportDiagnosticsState({ snapshot: null }), null);
  console.log('ok - buildCustomBundleImportDiagnosticsState prepends latest snapshot and caps history');
}

{
  assert.deepEqual(
    buildCustomBundleImportDebugLogPayload({
      phase: ' failed ',
      durationMs: 12.6,
      preview: { chats: 2, archives: 3 },
      error: 'boom',
    }),
    {
      source: 'custom-bundle',
      type: 'error',
      message: 'import failed rooms=2 archives=3 duration=13ms error=boom',
    },
  );
  assert.deepEqual(
    buildCustomBundleImportDebugLogPayload({
      phase: '',
      durationMs: -5,
      preview: {},
    }),
    {
      source: 'custom-bundle',
      type: 'info',
      message: 'import done rooms=0 archives=0 duration=0ms',
    },
  );
  console.log('ok - buildCustomBundleImportDebugLogPayload preserves import diagnostics log format');
}

{
  assert.deepEqual(
    buildCustomBundleImportProgressPayload({
      detail: {
        phase: ' rooms ',
        progress: 120,
        status: ' restoring ',
        fileName: ' bundle.zip ',
        done: true,
        error: ' warn ',
      },
      at: 123,
    }),
    {
      kind: 'custom-bundle-import',
      phase: 'rooms',
      progress: 100,
      status: 'restoring',
      fileName: 'bundle.zip',
      done: true,
      error: 'warn',
      at: 123,
    },
  );
  assert.equal(
    buildCustomBundleImportProgressPayload({
      detail: { progress: -10 },
      at: 456,
    }).progress,
    0,
  );
  console.log('ok - buildCustomBundleImportProgressPayload normalizes progress event detail');
}

{
  assert.deepEqual(
    buildCustomBundleImportProgressTraceEvent({
      phase: ' rooms ',
      progress: 64,
      status: '正在恢复聊天室 1/2：Alice Chat',
      fileName: ' bundle.zip ',
      done: false,
      at: 789,
    }),
    {
      category: 'import-export',
      phase: 'custom-bundle.import.rooms',
      sessionId: '',
      source: 'custom-bundle-import',
      status: 'progress',
      startedAt: 789,
      summary: '自定义资料包导入：rooms 64%',
      details: {
        progress: 64,
        done: false,
        fileName: 'bundle.zip',
      },
    },
  );
  assert.equal(
    buildCustomBundleImportProgressTraceEvent({ phase: 'done', done: true }).status,
    'success',
  );
  assert.equal(
    buildCustomBundleImportProgressTraceEvent({ phase: 'cancelled', done: true }).status,
    'cancelled',
  );
  assert.deepEqual(
    buildCustomBundleImportProgressTraceEvent({
      phase: 'failed',
      error: 'boom',
    }).details,
    {
      progress: 0,
      done: false,
      error: 'boom',
    },
  );
  console.log('ok - buildCustomBundleImportProgressTraceEvent maps progress payloads to metadata-only trace events');
}
