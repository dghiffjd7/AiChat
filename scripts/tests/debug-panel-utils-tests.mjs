import assert from 'node:assert/strict';

import {
  buildBridgeContractDiagnosticsMeta,
  buildCustomBundleDiagnosticsMeta,
  buildDebugTraceTimelineDiagnosticsMeta,
  buildDebugTextFilename,
  buildStorageMigrationDiagnosticsMeta,
  collectBridgeContractDiagnostics,
  collectErrorLogs,
  formatBridgeContractDiagnostics,
  formatCustomBundleDiagnostics,
  formatDebugTraceTimelineDiagnostics,
  formatErrorLogs,
  formatStorageMigrationDiagnostics,
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
  const checklist = [
    {
      id: 'contacts',
      owner: 'ContactsStore',
      currentKey: 'contacts_store_v1',
      scopeStrategy: 'scoped-with-legacy-migration',
      scopedKeyExample: 'contacts_store_v1__default',
      legacyReadKeys: ['contacts_store_v1'],
      legacyMigrationKey: 'contacts_store_v1__scoped_migrated',
      writeTargets: ['contacts_store_v1__<scope>'],
      payloadVersion: 1,
      risk: 'high',
      importExportSurfaces: ['custom-bundle'],
      tests: ['settings-lifecycle-integration'],
    },
    {
      id: 'regex',
      owner: 'RegexStore',
      currentKey: 'regex_store_v1',
      scopeStrategy: 'shared',
      writeTargets: ['regex_store_v1'],
      payloadVersion: 1,
      risk: 'medium',
      importExportSurfaces: ['character-card'],
      tests: ['regex-transfer-tests'],
    },
  ];
  assert.equal(buildStorageMigrationDiagnosticsMeta(checklist), 'contracts=2 · high=1 · legacy-read=1');
  const text = formatStorageMigrationDiagnostics(checklist);
  assert.equal(text.includes('[HIGH] contacts'), true);
  assert.equal(text.includes('legacyMigrationKey: contacts_store_v1__scoped_migrated'), true);
  assert.equal(text.includes('tests: regex-transfer-tests'), true);
  assert.equal(formatStorageMigrationDiagnostics([]), '暂无存储迁移检查表');
  console.log('ok - storage migration diagnostics format checklist meta and text');
}

{
  const registry = {
    version: 1,
    contracts: {
      notify: {
        name: 'notify',
        domain: 'prompt-injection',
        kind: 'method',
        source: 'app-bridge-contract',
        params: ['message: string', 'level?: string'],
        returns: 'boolean',
        sideEffects: ['shows toast notification'],
        tests: ['app-bridge-contract-tests.mjs'],
        status: 'covered',
      },
      resolveRoleWorldBindings: {
        name: 'resolveRoleWorldBindings',
        domain: 'role-world',
        kind: 'resolver',
        source: 'app-bridge-contract',
        bridgeField: 'setRoleWorldResolver',
      },
    },
  };
  const diagnostics = collectBridgeContractDiagnostics(registry);
  assert.equal(diagnostics.total, 2);
  assert.deepEqual(diagnostics.domains, [
    { domain: 'prompt-injection', count: 1 },
    { domain: 'role-world', count: 1 },
  ]);
  assert.deepEqual(diagnostics.contracts[0].params, ['message: string', 'level?: string']);
  assert.equal(diagnostics.contracts[0].returns, 'boolean');
  assert.deepEqual(diagnostics.contracts[0].sideEffects, ['shows toast notification']);
  assert.deepEqual(diagnostics.contracts[0].tests, ['app-bridge-contract-tests.mjs']);
  assert.equal(diagnostics.contracts[0].status, 'covered');
  assert.equal(buildBridgeContractDiagnosticsMeta(registry), 'contracts=2 · domains=2 · version=1');
  const text = formatBridgeContractDiagnostics(registry);
  assert.equal(text.includes('[prompt-injection] 1'), true);
  assert.equal(text.includes('- notify (method · source=app-bridge-contract · status=covered · returns=boolean)'), true);
  assert.equal(text.includes('params: message: string, level?: string'), true);
  assert.equal(text.includes('sideEffects: shows toast notification'), true);
  assert.equal(text.includes('tests: app-bridge-contract-tests.mjs'), true);
  assert.equal(text.includes('field=setRoleWorldResolver'), true);
  assert.equal(formatBridgeContractDiagnostics(null), '暂无 Bridge contract registry');
  console.log('ok - bridge contract diagnostics summarize registry domains and contract entries');
}

{
  const events = [
    {
      eventId: 'trace-1',
      category: 'generation',
      phase: 'send.start',
      sessionId: 's1',
      hookName: 'message.after_send',
      runtimeLabel: 'plugin',
      messageId: 'm1',
      source: 'send',
      status: 'started',
      startedAt: Date.UTC(2026, 4, 7, 10, 0, 0),
      endedAt: null,
      durationMs: null,
      summary: 'started',
      details: { messageCount: 2 },
      relatedIds: ['m1'],
    },
    {
      eventId: 'trace-2',
      category: 'memory',
      phase: 'apply.finish',
      sessionId: 's1',
      source: 'memory',
      status: 'error',
      startedAt: Date.UTC(2026, 4, 7, 10, 0, 1),
      endedAt: Date.UTC(2026, 4, 7, 10, 0, 2),
      durationMs: 1000,
      summary: 'failed',
      details: {},
      relatedIds: [],
    },
  ];
  assert.equal(buildDebugTraceTimelineDiagnosticsMeta(events), 'events=2 · categories=2 · sessions=1 · failures=1');
  const text = formatDebugTraceTimelineDiagnostics(events);
  assert.equal(text.includes('#1 [STARTED] generation.send.start'), true);
  assert.equal(text.includes('metadata: hookName=message.after_send · runtimeLabel=plugin · messageId=m1'), true);
  assert.equal(text.includes('details: {"messageCount":2}'), true);
  assert.equal(text.includes('durationMs: 1000ms'), true);
  assert.equal(formatDebugTraceTimelineDiagnostics([]), '暂无事件时间线');
  console.log('ok - debug trace timeline diagnostics summarize meta and format event text');
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
