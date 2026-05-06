import assert from 'node:assert/strict';

import {
  buildCustomBundleDiagnosticsMeta,
  buildDebugTextFilename,
  collectErrorLogs,
  formatCustomBundleDiagnostics,
  formatErrorLogs,
} from '../../src/scripts/ui/debug-panel-utils.js';

{
  assert.equal(formatCustomBundleDiagnostics(null), '暂无自定义资料包导入诊断');
  assert.equal(formatCustomBundleDiagnostics({ a: 1 }), '{\n  "a": 1\n}');
  console.log('ok - formatCustomBundleDiagnostics formats object snapshots and handles empty input');
}

{
  const meta = buildCustomBundleDiagnosticsMeta({
    lastImport: { phase: 'done', durationMs: 321, fileName: 'bundle.zip' },
    history: [{}, {}],
  });
  assert.equal(meta, 'phase=done · duration=321ms · history=2 · file=bundle.zip');
  console.log('ok - buildCustomBundleDiagnosticsMeta summarizes last import phase duration history and file name');
}

{
  const logs = [
    { type: 'info', prefix: '✓', timestamp: '10:00:00', message: 'ok' },
    { type: 'warn', prefix: '⚠️', timestamp: '10:00:01', message: 'warn' },
    { type: 'error', prefix: '❌', timestamp: '10:00:02', message: 'error' },
  ];
  assert.deepEqual(collectErrorLogs(logs), [logs[1], logs[2]]);
  assert.equal(formatErrorLogs(logs), '⚠️[10:00:01] warn\n❌[10:00:02] error');
  console.log('ok - collectErrorLogs and formatErrorLogs keep only warn/error entries in export order');
}

{
  const date = new Date('2026-05-06T20:06:07');
  assert.equal(buildDebugTextFilename('custom-bundle-import', date), 'custom-bundle-import-20260506-200607.txt');
  console.log('ok - buildDebugTextFilename generates deterministic timestamped text filenames');
}
