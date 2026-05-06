import assert from 'node:assert/strict';

import {
  copyVisibleDebugLogsFlow,
  copyDebugTextFlow,
  createDebugViewerTextBindings,
  createDetachedTextareaCopyFallback,
  createSelectedTextareaCopyFallback,
  exportDebugTextFlow,
  handleCustomBundleDiagnosticsLoadError,
  refreshCustomBundleDiagnosticsView,
  refreshErrorLogView,
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
