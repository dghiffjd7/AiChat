import assert from 'node:assert/strict';

import {
  buildAgentRunDiagnosticsText,
  buildAgentRunDiagnosticsView,
  buildAgentRunDiagnosticsViewMeta,
  buildBridgeContractDiagnosticsMeta,
  buildCustomBundleDiagnosticsMeta,
  buildDebugTraceTimelineDiagnosticsMeta,
  buildDebugTextFilename,
  buildProviderToolExperimentDiagnosticsMeta,
  buildStorageMigrationDiagnosticsMeta,
  collectBridgeContractDiagnostics,
  collectErrorLogs,
  formatBridgeContractDiagnostics,
  formatCustomBundleDiagnostics,
  formatDebugTraceTimelineDiagnostics,
  formatErrorLogs,
  formatProviderToolExperimentDiagnostics,
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
  const runs = [
    {
      id: 'agent-run-1',
      kind: 'contact_profile_update',
      sessionId: 's1',
      source: 'contact-profiler-agent',
      status: 'running',
      summary: 'profile update',
      createdAt: Date.UTC(2026, 4, 7, 10, 0, 0),
      updatedAt: Date.UTC(2026, 4, 7, 10, 0, 1),
      steps: [
        { id: 'step-1', type: 'contact_profile.collect_context', status: 'succeeded', summary: 'context', updatedAt: Date.UTC(2026, 4, 7, 10, 0, 1) },
      ],
    },
  ];
  const events = [{ id: 'event-1', runId: 'agent-run-1' }];
  const view = buildAgentRunDiagnosticsView({ runs, events, options: { limit: 5 } });
  assert.equal(buildAgentRunDiagnosticsViewMeta({ runs, events, options: { limit: 5 } }), 'runs=1/1 · total=1 · active=1 · failures=0');
  const text = buildAgentRunDiagnosticsText({ runs, events, options: { limit: 5 } });
  assert.equal(view.runs[0].lastStep.type, 'contact_profile.collect_context');
  assert.equal(text.includes('[RUNNING] contact_profile_update'), true);
  assert.equal(text.includes('events: 1'), true);
  console.log('ok - agent run diagnostics build lightweight run view text');
}

{
  const snapshot = {
    status: {
      enabled: false,
      allowedTools: ['contact_profile.list'],
      provider: 'debug-provider',
      model: 'debug-model',
    },
    history: [
      {
        id: 'diag-1',
        kind: 'stream_delta',
        status: 'succeeded',
        ok: true,
        provider: 'openai',
        model: 'gpt-x',
        sessionId: 's1',
        explicitEnabled: true,
        createdAt: Date.UTC(2026, 4, 7, 10, 0, 0),
        updatedAt: Date.UTC(2026, 4, 7, 10, 0, 1),
        deltas: [
          {
            phase: 'start',
            toolCallId: 'call-1',
            toolName: 'contact_profile.list',
          },
          {
            phase: 'arguments_delta',
            toolCallId: 'call-1',
            toolName: 'contact_profile.list',
            argumentsDelta: '{"limit":1}',
          },
        ],
        completedToolCalls: [
          {
            toolCallId: 'call-1',
            toolName: 'contact_profile.list',
            arguments: { limit: 1 },
          },
        ],
        results: [
          {
            ok: true,
            status: 'succeeded',
            toolCall: { toolName: 'contact_profile.list' },
            parts: [{ type: 'provider_tool_call' }, { type: 'provider_tool_result' }],
          },
        ],
        continuation: {
          strategy: 'stop_after_tool_result',
          shouldContinue: false,
        },
        requestPreview: {
          format: 'openai_chat_completions_tool_result',
          network: false,
          toolResultCount: 1,
        },
        mockLoopPreview: {
          status: 'preview_ready',
          network: false,
        },
        mockProviderRun: {
          status: 'succeeded',
          network: false,
          eventCount: 4,
          finalText: 'Mock continuation after tool result',
        },
        loopState: {
          status: 'succeeded',
          phase: 'completed',
          phaseCount: 5,
          network: false,
        },
        runnerHandoff: {
          status: 'ready',
          output: 'provider_stream_events',
          network: false,
          writesChat: false,
        },
        runnerRequestDraft: {
          status: 'ready',
          payloadKind: 'messages',
          network: false,
          writesChat: false,
        },
        runnerModePlan: {
          mode: 'read_only_capture',
          status: 'ready',
          runnerFacadeEnabled: false,
          network: false,
          writesChat: false,
        },
        realRunnerDebug: {
          status: 'blocked',
          mode: 'read_only_capture',
          adapterEnabled: false,
          providerClientInjected: false,
          llmClientInjected: false,
          allowRunnerNetwork: false,
          writesChat: false,
          allowedTools: ['contact_profile.list'],
          modelContextPolicy: 'allowlist_only',
          rollback: 'set runnerMode=read_only_capture or remove providerRunner/providerClient',
        },
        runnerFacade: {
          status: 'disabled',
          eventCount: 0,
          network: false,
          writesChat: false,
          runnerBoundary: {
            status: 'ready',
            input: 'runnerRequestDraft.request',
            clientMethod: 'streamChat',
            payloadKind: 'messages',
            capability: {
              status: 'ready',
              providerFamily: 'openai',
              runnerKind: 'llmclient_stream_chat',
              requiresProviderNativeRunner: false,
            },
            nativeRunnerContract: {
              status: 'ready',
              contractKind: 'openai_messages_tool_result',
              entrypoint: 'providerClient.runProviderToolRequest',
              payloadKind: 'messages',
            },
          },
        },
        runnerDryRun: {
          status: 'succeeded',
          eventCount: 4,
          network: false,
          writesChat: false,
        },
        parts: [{ type: 'provider_tool_result' }],
      },
    ],
  };
  assert.equal(
    buildProviderToolExperimentDiagnosticsMeta(snapshot),
    'provider-tools=off · history=1 · deltas=2 · completed=1 · results=1 · failures=0',
  );
  const text = formatProviderToolExperimentDiagnostics(snapshot);
  assert.equal(text.includes('Provider Tool Experiment'), true);
  assert.equal(text.includes('mode: debug execution · explicit only'), true);
  assert.equal(text.includes('continuation: stop_after_tool_result · shouldContinue=false'), true);
  assert.equal(text.includes('requestPreview: openai_chat_completions_tool_result · network=false · toolResults=1'), true);
  assert.equal(text.includes('mockLoopPreview: preview_ready · network=false'), true);
  assert.equal(text.includes('mockProviderRun: succeeded · network=false · events=4 · chars=35'), true);
  assert.equal(text.includes('loopState: succeeded · phase=completed · phases=5 · network=false'), true);
  assert.equal(text.includes('runnerHandoff: ready · output=provider_stream_events · network=false · writesChat=false'), true);
  assert.equal(text.includes('runnerRequestDraft: ready · payload=messages · network=false · writesChat=false'), true);
  assert.equal(text.includes('runnerMode: read_only_capture · status=ready · facade=false · network=false · writesChat=false'), true);
  assert.equal(text.includes('realRunnerDebug: blocked · mode=read_only_capture · adapter=false · client=false · llm=false · network=false · writesChat=false'), true);
  assert.equal(text.includes('realRunnerPolicy: tools=contact_profile.list · modelContext=allowlist_only · rollback=set runnerMode=read_only_capture or remove providerRunner/providerClient'), true);
  assert.equal(text.includes('runnerFacade: disabled · events=0 · network=false · writesChat=false'), true);
  assert.equal(text.includes('runnerBoundary: ready · input=runnerRequestDraft.request · method=streamChat · payload=messages'), true);
  assert.equal(text.includes('runnerCapability: ready · provider=openai · runner=llmclient_stream_chat · native=false'), true);
  assert.equal(text.includes('nativeRunnerContract: ready · kind=openai_messages_tool_result · entry=providerClient.runProviderToolRequest · payload=messages'), true);
  assert.equal(text.includes('runnerDryRun: succeeded · events=4 · network=false · writesChat=false'), true);
  assert.equal(text.includes('delta chain:'), true);
  assert.equal(text.includes('completed tool calls:'), true);
  assert.equal(text.includes('provider_tool_call, provider_tool_result'), true);
  console.log('ok - provider tool experiment diagnostics format delta chain and results');
}

{
  const snapshot = {
    status: {
      enabled: false,
      allowedTools: ['contact_profile.list'],
    },
    history: [
      {
        id: 'diag-capture',
        kind: 'stream_delta_capture',
        status: 'captured',
        ok: true,
        provider: 'openai',
        model: 'gpt-x',
        sessionId: 's1',
        deltas: [{ phase: 'start', toolCallId: 'call-1', toolName: 'contact_profile.list' }],
        completedToolCalls: [{ toolCallId: 'call-1', toolName: 'contact_profile.list', arguments: { limit: 1 } }],
        results: [],
      },
    ],
  };
  const text = formatProviderToolExperimentDiagnostics(snapshot);
  assert.equal(text.includes('mode: read-only capture · no tool execution'), true);
  assert.equal(text.includes('results: 0'), true);
  assert.equal(text.includes('completed tool calls:'), true);
  console.log('ok - provider tool experiment diagnostics marks read-only capture mode');
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
