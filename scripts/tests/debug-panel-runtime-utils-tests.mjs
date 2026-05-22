import assert from 'node:assert/strict';

import {
  handleAgentRunDiagnosticsLoadError,
  handleBridgeContractDiagnosticsLoadError,
  copyVisibleDebugLogsFlow,
  copyDebugTextFlow,
  createDebugViewerTextBindings,
  createDetachedTextareaCopyFallback,
  createSelectedTextareaCopyFallback,
  exportDebugTextFlow,
  handleCustomBundleDiagnosticsLoadError,
  handleDebugTraceTimelineLoadError,
  handleStorageMigrationDiagnosticsLoadError,
  handleViewportKeyboardDiagnosticsLoadError,
  refreshAgentRunDiagnosticsView,
  refreshBridgeContractDiagnosticsView,
  refreshCustomBundleDiagnosticsView,
  refreshDebugTraceTimelineView,
  refreshErrorLogView,
  refreshStorageMigrationDiagnosticsView,
  refreshViewportKeyboardDiagnosticsView,
} from '../../src/scripts/ui/debug-panel-runtime-utils.js';

{
  let meta = '';
  let text = '';
  const result = refreshCustomBundleDiagnosticsView({
    snapshot: { lastImport: { phase: 'done', durationMs: 12, fileName: 'pack.zip' }, history: [{}] },
    setMeta: (value) => { meta = value; },
    setText: (value) => { text = value; },
  });
  assert.equal(meta, 'phase=done · duration=12ms · history=1 · file=pack.zip');
  assert.equal(result.meta, meta);
  assert.equal(text.includes('"lastImport"'), true);
  console.log('ok - refreshCustomBundleDiagnosticsView writes formatted meta and text payload');
}

{
  let meta = '';
  let text = '';
  const warnings = [];
  const result = handleCustomBundleDiagnosticsLoadError({
    error: new Error('boom'),
    setMeta: (value) => { meta = value; },
    setText: (value) => { text = value; },
    logWarn: (message) => warnings.push(message),
  });
  assert.equal(result, 'boom');
  assert.equal(meta, '加载失败: boom');
  assert.equal(text, '资料包导入诊断加载失败\n\nboom');
  assert.deepEqual(warnings, ['资料包导入诊断加载失败: boom']);
  console.log('ok - handleCustomBundleDiagnosticsLoadError writes fallback text and warning log');
}

{
  let meta = '';
  let text = '';
  const result = refreshStorageMigrationDiagnosticsView({
    buildChecklist: () => [
      {
        id: 'memory-snapshots',
        owner: 'MemorySnapshotStore',
        currentKey: 'memory_snapshot_payload_v1',
        scopeStrategy: 'ref-and-payload',
        scopedKeyExample: 'memory_snapshot_payload_v1__default',
        legacyReadKeys: [],
        writeTargets: ['memory_snapshot_payload_v1__<scope>'],
        payloadVersion: 1,
        risk: 'high',
        importExportSurfaces: ['turn-checkpoint'],
        tests: ['memory-lifecycle-integration'],
      },
    ],
    setMeta: (value) => { meta = value; },
    setText: (value) => { text = value; },
  });
  assert.equal(result.count, 1);
  assert.equal(meta, 'contracts=1 · high=1 · legacy-read=0');
  assert.equal(text.includes('[HIGH] memory-snapshots'), true);
  assert.equal(text.includes('writeTargets: memory_snapshot_payload_v1__<scope>'), true);
  console.log('ok - refreshStorageMigrationDiagnosticsView writes migration checklist text');
}

{
  let meta = '';
  let text = '';
  const warnings = [];
  const result = handleStorageMigrationDiagnosticsLoadError({
    error: new Error('boom'),
    setMeta: (value) => { meta = value; },
    setText: (value) => { text = value; },
    logWarn: (message) => warnings.push(message),
  });
  assert.equal(result, 'boom');
  assert.equal(meta, '加载失败: boom');
  assert.equal(text, '存储迁移检查表加载失败\n\nboom');
  assert.deepEqual(warnings, ['存储迁移检查表加载失败: boom']);
  console.log('ok - handleStorageMigrationDiagnosticsLoadError writes fallback text and warning log');
}

{
  let meta = '';
  let text = '';
  const result = refreshBridgeContractDiagnosticsView({
    registry: {
      version: 1,
      contracts: {
        sendMessageFromPlugin: {
          name: 'sendMessageFromPlugin',
          domain: 'message-action',
          kind: 'method',
          source: 'app-bridge-contract',
        },
      },
    },
    setMeta: (value) => { meta = value; },
    setText: (value) => { text = value; },
  });
  assert.equal(result.meta, 'contracts=1 · domains=1 · version=1');
  assert.equal(meta, result.meta);
  assert.equal(text.includes('[message-action] 1'), true);
  assert.equal(text.includes('sendMessageFromPlugin'), true);
  console.log('ok - refreshBridgeContractDiagnosticsView writes bridge registry meta and text');
}

{
  let meta = '';
  let text = '';
  const warnings = [];
  const result = handleBridgeContractDiagnosticsLoadError({
    error: new Error('boom'),
    setMeta: (value) => { meta = value; },
    setText: (value) => { text = value; },
    logWarn: (message) => warnings.push(message),
  });
  assert.equal(result, 'boom');
  assert.equal(meta, '加载失败: boom');
  assert.equal(text, 'Bridge contract 诊断加载失败\n\nboom');
  assert.deepEqual(warnings, ['Bridge contract 诊断加载失败: boom']);
  console.log('ok - handleBridgeContractDiagnosticsLoadError writes fallback text and warning log');
}

{
  let meta = '';
  let text = '';
  const result = refreshViewportKeyboardDiagnosticsView({
    getSnapshot: () => ({
      visualViewport: { width: 393, height: 522 },
      keyboard: { visible: true, insetBottom: 318 },
      activeElement: { id: 'composer-input', tagName: 'textarea' },
    }),
    setMeta: (value) => { meta = value; },
    setText: (value) => { text = value; },
  });
  assert.equal(result.meta, 'keyboard=visible · inset=318px · visual=393x522 · active=composer-input');
  assert.equal(meta, result.meta);
  assert.equal(text.includes('"keyboard"'), true);
  console.log('ok - refreshViewportKeyboardDiagnosticsView writes keyboard viewport snapshot');
}

{
  let meta = '';
  let text = '';
  const warnings = [];
  const result = handleViewportKeyboardDiagnosticsLoadError({
    error: new Error('viewport boom'),
    setMeta: (value) => { meta = value; },
    setText: (value) => { text = value; },
    logWarn: (message) => warnings.push(message),
  });
  assert.equal(result, 'viewport boom');
  assert.equal(meta, '加载失败: viewport boom');
  assert.equal(text, '键盘/视口诊断加载失败\n\nviewport boom');
  assert.deepEqual(warnings, ['键盘/视口诊断加载失败: viewport boom']);
  console.log('ok - handleViewportKeyboardDiagnosticsLoadError writes fallback text and warning log');
}

{
  let meta = '';
  let text = '';
  const store = {
    listRuns: () => [
      {
        id: 'run-a',
        kind: 'image_director_generation',
        sessionId: 's1',
        source: 'image-director-agent',
        status: 'succeeded',
        summary: 'image done',
        createdAt: 1000,
        updatedAt: 1100,
        finishedAt: 1100,
        steps: [{ id: 'step-a', type: 'image_director.generate', status: 'succeeded', updatedAt: 1100 }],
      },
    ],
    listEvents: () => [{ id: 'event-a', runId: 'run-a' }],
  };
  const result = refreshAgentRunDiagnosticsView({
    store,
    providerToolExperimentDiagnostics: {
      status: {
        enabled: false,
        allowedTools: ['contact_profile.list'],
        provider: 'debug-provider',
        model: 'debug-model',
      },
      history: [
        {
          id: 'diag-a',
          kind: 'stream_delta',
          status: 'succeeded',
          ok: true,
          deltas: [{ phase: 'complete', toolName: 'contact_profile.list' }],
          completedToolCalls: [{ toolName: 'contact_profile.list', arguments: { limit: 1 } }],
          results: [{ ok: true, status: 'succeeded', parts: [{ type: 'provider_tool_result' }] }],
          parts: [{ type: 'provider_tool_result' }],
        },
      ],
    },
    options: { limit: 5 },
    setMeta: (value) => { meta = value; },
    setText: (value) => { text = value; },
  });
  assert.equal(meta.includes('runs=1/1 · total=1 · active=0 · failures=0'), true);
  assert.equal(meta.includes('provider-tools=off · history=1'), true);
  assert.equal(result.view.runs[0].id, 'run-a');
  assert.equal(text.includes('[SUCCEEDED] image_director_generation'), true);
  assert.equal(text.includes('Provider Tool Experiment'), true);
  assert.equal(text.includes('completed tool calls:'), true);
  console.log('ok - refreshAgentRunDiagnosticsView writes agent run diagnostics');
}

{
  let meta = '';
  let text = '';
  const warnings = [];
  const result = handleAgentRunDiagnosticsLoadError({
    error: new Error('agent boom'),
    setMeta: (value) => { meta = value; },
    setText: (value) => { text = value; },
    logWarn: (value) => warnings.push(value),
  });
  assert.equal(result, 'agent boom');
  assert.equal(meta, '加载失败: agent boom');
  assert.equal(text.includes('Agent run 诊断加载失败'), true);
  assert.equal(warnings[0].includes('agent boom'), true);
  console.log('ok - handleAgentRunDiagnosticsLoadError writes fallback text and warning log');
}

{
  let meta = '';
  let text = '';
  const result = refreshDebugTraceTimelineView({
    timeline: {
      snapshot: (options) => {
        assert.deepEqual(options, { limit: 200 });
        return [
          {
            eventId: 'trace-1',
            category: 'session',
            phase: 'enter.finish',
            sessionId: 's1',
            source: 'session-enter',
            status: 'success',
            startedAt: 100,
            endedAt: 120,
            durationMs: 20,
            summary: 'entered',
            details: { rendered: true },
            relatedIds: [],
          },
        ];
      },
    },
    setMeta: (value) => { meta = value; },
    setText: (value) => { text = value; },
  });
  assert.equal(result.count, 1);
  assert.equal(meta, 'events=1 · categories=1 · sessions=1 · failures=0');
  assert.equal(text.includes('session.enter.finish'), true);
  assert.equal(text.includes('details: {"rendered":true}'), true);
  console.log('ok - refreshDebugTraceTimelineView reads snapshot and writes trace text');
}

{
  let meta = '';
  let text = '';
  const warnings = [];
  const result = handleDebugTraceTimelineLoadError({
    error: new Error('boom'),
    setMeta: (value) => { meta = value; },
    setText: (value) => { text = value; },
    logWarn: (message) => warnings.push(message),
  });
  assert.equal(result, 'boom');
  assert.equal(meta, '加载失败: boom');
  assert.equal(text, '事件时间线加载失败\n\nboom');
  assert.deepEqual(warnings, ['事件时间线加载失败: boom']);
  console.log('ok - handleDebugTraceTimelineLoadError writes fallback text and warning log');
}

{
  let meta = '';
  let text = '';
  const result = refreshErrorLogView({
    logs: [
      { type: 'info', prefix: '✓', timestamp: '10:00:00', message: 'ok' },
      { type: 'warn', prefix: '⚠️', timestamp: '10:00:01', message: 'warn' },
    ],
    setMeta: (value) => { meta = value; },
    setText: (value) => { text = value; },
  });
  assert.deepEqual(result, { count: 1, text: '⚠️[10:00:01] warn' });
  assert.equal(meta, '共 1 条');
  assert.equal(text, '⚠️[10:00:01] warn');
  console.log('ok - refreshErrorLogView builds viewer meta and formatted error-log text');
}

{
  const calls = [];
  const result = await copyDebugTextFlow({
    text: 'copy me',
    writeText: async () => { throw new Error('no clipboard'); },
    fallbackCopy: async (text) => {
      calls.push(['fallback', text]);
      return true;
    },
    onWarning: (msg) => calls.push(['warning', msg]),
    onSuccess: (msg) => calls.push(['success', msg]),
    onError: (msg) => calls.push(['error', msg]),
  });
  assert.equal(result, true);
  assert.deepEqual(calls, [
    ['fallback', 'copy me'],
    ['success', '已复制'],
  ]);
  console.log('ok - copyDebugTextFlow falls back to secondary copy path and still reports success');
}

{
  const calls = [];
  const result = await exportDebugTextFlow({
    text: 'payload',
    filenamePrefix: 'diag',
    successLabel: 'done',
    buildFilename: (prefix) => `${prefix}.txt`,
    exportTextFile: async (text, filename, label) => {
      calls.push(['export', text, filename, label]);
    },
    onWarning: (msg) => calls.push(['warning', msg]),
    onLogWarn: (msg) => calls.push(['logWarn', msg]),
    onError: (msg) => calls.push(['error', msg]),
  });
  assert.equal(result, true);
  assert.deepEqual(calls, [['export', 'payload', 'diag.txt', 'done']]);
  console.log('ok - exportDebugTextFlow builds filename and delegates export through injected exporter');
}

{
  const metaEl = { textContent: '' };
  const textEl = { value: '', selectCalls: 0, select() { this.selectCalls += 1; } };
  const viewer = createDebugViewerTextBindings({ metaEl, textEl });
  viewer.setMeta('M');
  viewer.setText('T');
  assert.equal(viewer.hasViewer(), true);
  assert.equal(viewer.getText(), 'T');
  assert.equal(metaEl.textContent, 'M');
  assert.equal(textEl.value, 'T');
  console.log('ok - createDebugViewerTextBindings provides safe meta/text accessors for diagnostics viewers');
}

{
  const calls = [];
  const textarea = {
    value: '',
    style: {},
    setAttribute() {},
    select() { calls.push(['select']); },
    remove() { calls.push(['remove']); },
  };
  const documentRef = {
    body: { appendChild(node) { calls.push(['append', node]); } },
    createElement(tag) {
      assert.equal(tag, 'textarea');
      return textarea;
    },
  };
  const detachedFallback = createDetachedTextareaCopyFallback({
    documentRef,
    execCommand: (command) => {
      calls.push(['exec', command]);
      return true;
    },
  });
  assert.equal(await detachedFallback('payload'), true);
  const textEl = textarea;
  const selectedFallback = createSelectedTextareaCopyFallback({
    textEl,
    execCommand: (command) => {
      calls.push(['selected-exec', command]);
      return true;
    },
  });
  assert.equal(await selectedFallback(), true);
  assert.deepEqual(calls, [
    ['append', textarea],
    ['select'],
    ['exec', 'copy'],
    ['remove'],
    ['select'],
    ['selected-exec', 'copy'],
  ]);
  console.log('ok - diagnostics copy fallback helpers support detached textarea and selected textarea flows');
}

{
  const calls = [];
  const result = await copyVisibleDebugLogsFlow({
    logs: [{ prefix: '✓', timestamp: '10:00:00', message: 'hello' }],
    writeText: async () => { throw new Error('no clipboard'); },
    fallbackCopy: async (text) => {
      calls.push(['fallback', text]);
      return true;
    },
    onWarning: (msg) => calls.push(['warning', msg]),
    onSuccess: (msg) => calls.push(['success', msg]),
    onError: (msg) => calls.push(['error', msg]),
  });
  assert.equal(result, true);
  assert.deepEqual(calls, [
    ['fallback', '✓ [10:00:00] hello'],
    ['success', '已复制 1 条日志'],
  ]);
  console.log('ok - copyVisibleDebugLogsFlow formats visible logs and reports copied count');
}
