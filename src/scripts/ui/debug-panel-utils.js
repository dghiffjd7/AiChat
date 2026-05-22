import {
  buildAgentRunDiagnosticsMeta,
  buildAgentRunListView,
  formatAgentRunDiagnostics,
} from '../agent/agent-run-view-model.js';

export const formatCustomBundleDiagnostics = (snapshot) => {
  if (!snapshot || typeof snapshot !== 'object') return '暂无自定义资料包导入诊断';
  try {
    return JSON.stringify(snapshot, null, 2);
  } catch {
    return String(snapshot || '');
  }
};

export const buildCustomBundleDiagnosticsMeta = (snapshot) => {
  const lastImport = snapshot?.lastImport || null;
  const historyCount = Array.isArray(snapshot?.history) ? snapshot.history.length : 0;
  const fileName = String(lastImport?.fileName || '').trim() || '未命名';
  const phase = String(lastImport?.phase || '').trim() || 'none';
  const durationMs = Number(lastImport?.durationMs || 0) || 0;
  return `phase=${phase} · duration=${durationMs}ms · history=${historyCount} · file=${fileName}`;
};

const formatList = (items = []) => {
  const list = Array.isArray(items)
    ? items.map(item => String(item || '').trim()).filter(Boolean)
    : [];
  return list.length ? list.join(', ') : '-';
};

export const buildStorageMigrationDiagnosticsMeta = (checklist = []) => {
  const list = Array.isArray(checklist) ? checklist : [];
  const highRisk = list.filter(item => item?.risk === 'high').length;
  const legacyRead = list.filter(item => Array.isArray(item?.legacyReadKeys) && item.legacyReadKeys.length).length;
  return `contracts=${list.length} · high=${highRisk} · legacy-read=${legacyRead}`;
};

export const formatStorageMigrationDiagnostics = (checklist = []) => {
  const list = Array.isArray(checklist) ? checklist : [];
  if (!list.length) return '暂无存储迁移检查表';
  return list.map((item) => [
    `[${String(item?.risk || 'unknown').toUpperCase()}] ${String(item?.id || '').trim() || 'unknown'}`,
    `owner: ${String(item?.owner || '').trim() || '-'}`,
    `currentKey: ${String(item?.currentKey || '').trim() || '-'}`,
    `scopeStrategy: ${String(item?.scopeStrategy || '').trim() || '-'}`,
    `scopedKeyExample: ${String(item?.scopedKeyExample || '').trim() || '-'}`,
    `legacyReadKeys: ${formatList(item?.legacyReadKeys)}`,
    `legacyMigrationKey: ${String(item?.legacyMigrationKey || '').trim() || '-'}`,
    `writeTargets: ${formatList(item?.writeTargets)}`,
    `payloadVersion: ${String(item?.payloadVersion ?? '-')}`,
    `importExportSurfaces: ${formatList(item?.importExportSurfaces)}`,
    `tests: ${formatList(item?.tests)}`,
  ].join('\n')).join('\n\n');
};

const isPlainObject = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));

const normalizeDiagnosticList = (value = []) => (
  Array.isArray(value) ? value : (value ? [value] : [])
).map(item => String(item || '').trim()).filter(Boolean);

export const collectBridgeContractDiagnostics = (registry = null) => {
  const contracts = isPlainObject(registry?.contracts) ? registry.contracts : {};
  const entries = Object.entries(contracts)
    .map(([key, contract]) => {
      const source = isPlainObject(contract) ? contract : {};
      const name = String(source.name || key || '').trim();
      if (!name) return null;
      return {
        name,
        domain: String(source.domain || 'app-bridge').trim() || 'app-bridge',
        kind: String(source.kind || 'method').trim() || 'method',
        source: String(source.source || 'unknown').trim() || 'unknown',
        bridgeField: String(source.bridgeField || '').trim(),
        params: normalizeDiagnosticList(source.params),
        returns: String(source.returns || '').trim(),
        sideEffects: normalizeDiagnosticList(source.sideEffects),
        tests: normalizeDiagnosticList(source.tests),
        callers: normalizeDiagnosticList(source.callers),
        status: String(source.status || '').trim(),
      };
    })
    .filter(Boolean)
    .sort((left, right) => (
      left.domain.localeCompare(right.domain)
      || left.name.localeCompare(right.name)
    ));
  const domainCounts = entries.reduce((acc, entry) => {
    acc[entry.domain] = (acc[entry.domain] || 0) + 1;
    return acc;
  }, {});
  const domains = Object.entries(domainCounts)
    .map(([domain, count]) => ({ domain, count }))
    .sort((left, right) => left.domain.localeCompare(right.domain));
  return {
    version: Number(registry?.version || 0) || 0,
    total: entries.length,
    domains,
    contracts: entries,
  };
};

export const buildBridgeContractDiagnosticsMeta = (registry = null) => {
  const diagnostics = collectBridgeContractDiagnostics(registry);
  const version = diagnostics.version || '-';
  return `contracts=${diagnostics.total} · domains=${diagnostics.domains.length} · version=${version}`;
};

export const formatBridgeContractDiagnostics = (registry = null) => {
  const diagnostics = collectBridgeContractDiagnostics(registry);
  if (!diagnostics.contracts.length) return '暂无 Bridge contract registry';
  const domainBlocks = diagnostics.domains.map(({ domain, count }) => {
    const entries = diagnostics.contracts
      .filter(contract => contract.domain === domain)
      .map((contract) => {
        const bridgeField = contract.bridgeField ? ` · field=${contract.bridgeField}` : '';
        const status = contract.status ? ` · status=${contract.status}` : '';
        const returns = contract.returns ? ` · returns=${contract.returns}` : '';
        const params = contract.params.length ? `\n  params: ${formatList(contract.params)}` : '';
        const sideEffects = contract.sideEffects.length ? `\n  sideEffects: ${formatList(contract.sideEffects)}` : '';
        const tests = contract.tests.length ? `\n  tests: ${formatList(contract.tests)}` : '';
        const callers = contract.callers.length ? `\n  callers: ${formatList(contract.callers)}` : '';
        return `- ${contract.name} (${contract.kind} · source=${contract.source}${bridgeField}${status}${returns})${params}${sideEffects}${tests}${callers}`;
      });
    return [`[${domain}] ${count}`, ...entries].join('\n');
  });
  return [
    `version: ${diagnostics.version || '-'}`,
    `contracts: ${diagnostics.total}`,
    `domains: ${diagnostics.domains.length}`,
    '',
    ...domainBlocks,
  ].join('\n');
};

export const formatViewportKeyboardDiagnostics = (snapshot = null) => {
  if (!snapshot || typeof snapshot !== 'object') return '暂无键盘/视口诊断';
  try {
    return JSON.stringify(snapshot, null, 2);
  } catch {
    return String(snapshot || '');
  }
};

export const buildViewportKeyboardDiagnosticsMeta = (snapshot = null) => {
  if (!snapshot || typeof snapshot !== 'object') return '暂无数据';
  const keyboard = isPlainObject(snapshot.keyboard) ? snapshot.keyboard : {};
  const visualViewport = isPlainObject(snapshot.visualViewport) ? snapshot.visualViewport : {};
  const activeElement = isPlainObject(snapshot.activeElement) ? snapshot.activeElement : {};
  const visible = keyboard.visible === true ? 'visible' : 'hidden';
  const inset = Number.isFinite(Number(keyboard.insetBottom)) ? `${Number(keyboard.insetBottom)}px` : '-';
  const width = Number.isFinite(Number(visualViewport.width)) ? Number(visualViewport.width) : 0;
  const height = Number.isFinite(Number(visualViewport.height)) ? Number(visualViewport.height) : 0;
  const activeId = String(activeElement.id || '').trim();
  const activeTag = String(activeElement.tagName || '').trim();
  const active = activeId || activeTag || '-';
  return `keyboard=${visible} · inset=${inset} · visual=${width}x${height} · active=${active}`;
};

const normalizeTraceEvents = (events = []) => (
  Array.isArray(events) ? events : []
).filter(Boolean);

const formatTraceTimestamp = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return '-';
  try {
    return new Date(numeric).toISOString();
  } catch {
    return String(numeric);
  }
};

const formatTraceDetails = (details = {}) => {
  if (!isPlainObject(details) || !Object.keys(details).length) return '-';
  try {
    return JSON.stringify(details);
  } catch {
    return String(details || '');
  }
};

const formatTraceMetadata = (event = {}) => {
  const entries = [
    ['hookName', event?.hookName],
    ['runtimeLabel', event?.runtimeLabel],
    ['messageId', event?.messageId],
    ['momentId', event?.momentId],
  ].map(([key, value]) => [key, String(value || '').trim()])
    .filter(([, value]) => value);
  if (!entries.length) return '-';
  return entries.map(([key, value]) => `${key}=${value}`).join(' · ');
};

export const buildDebugTraceTimelineDiagnosticsMeta = (events = []) => {
  const list = normalizeTraceEvents(events);
  const categories = new Set(list.map(event => String(event?.category || '').trim()).filter(Boolean));
  const sessions = new Set(list.map(event => String(event?.sessionId || '').trim()).filter(Boolean));
  const failures = list.filter((event) => {
    const status = String(event?.status || '').trim().toLowerCase();
    return status === 'error' || status === 'failed' || status === 'failure';
  }).length;
  return `events=${list.length} · categories=${categories.size} · sessions=${sessions.size} · failures=${failures}`;
};

export const formatDebugTraceTimelineDiagnostics = (events = []) => {
  const list = normalizeTraceEvents(events);
  if (!list.length) return '暂无事件时间线';
  return list.map((event, index) => {
    const category = String(event?.category || 'general').trim() || 'general';
    const phase = String(event?.phase || 'event').trim() || 'event';
    const status = String(event?.status || 'info').trim() || 'info';
    const source = String(event?.source || 'unknown').trim() || 'unknown';
    const sessionId = String(event?.sessionId || '').trim() || '-';
    const duration = event?.durationMs == null ? '-' : `${Number(event.durationMs) || 0}ms`;
    const summary = String(event?.summary || '').trim() || '-';
    const relatedIds = formatList(event?.relatedIds);
    return [
      `#${index + 1} [${status.toUpperCase()}] ${category}.${phase}`,
      `eventId: ${String(event?.eventId || '').trim() || '-'}`,
      `source: ${source}`,
      `sessionId: ${sessionId}`,
      `startedAt: ${formatTraceTimestamp(event?.startedAt)}`,
      `endedAt: ${event?.endedAt == null ? '-' : formatTraceTimestamp(event.endedAt)}`,
      `durationMs: ${duration}`,
      `summary: ${summary}`,
      `metadata: ${formatTraceMetadata(event)}`,
      `relatedIds: ${relatedIds}`,
      `details: ${formatTraceDetails(event?.details)}`,
    ].join('\n');
  }).join('\n\n');
};

export const buildAgentRunDiagnosticsView = ({
  runs = [],
  events = [],
  options = {},
} = {}) => buildAgentRunListView(runs, {
  ...(options && typeof options === 'object' ? options : {}),
  events,
});

export const buildAgentRunDiagnosticsText = ({
  runs = [],
  events = [],
  options = {},
} = {}) => formatAgentRunDiagnostics(buildAgentRunDiagnosticsView({ runs, events, options }));

export const buildAgentRunDiagnosticsViewMeta = ({
  runs = [],
  events = [],
  options = {},
} = {}) => buildAgentRunDiagnosticsMeta(buildAgentRunDiagnosticsView({ runs, events, options }));

const formatJsonInline = (value = null) => {
  if (value === null || value === undefined) return '-';
  try {
    return JSON.stringify(value);
  } catch {
    return String(value || '');
  }
};

export const buildProviderToolExperimentDiagnosticsMeta = (snapshot = {}) => {
  const history = Array.isArray(snapshot?.history) ? snapshot.history : [];
  const status = isPlainObject(snapshot?.status) ? snapshot.status : {};
  const deltaCount = history.reduce((sum, entry) => sum + (Array.isArray(entry?.deltas) ? entry.deltas.length : 0), 0);
  const completedCount = history.reduce((sum, entry) => sum + (Array.isArray(entry?.completedToolCalls) ? entry.completedToolCalls.length : 0), 0);
  const resultCount = history.reduce((sum, entry) => sum + (Array.isArray(entry?.results) ? entry.results.length : 0), 0);
  const failures = history.filter(entry => entry?.ok === false && String(entry?.status || '') !== 'disabled').length;
  const enabled = status.enabled === true ? 'on' : 'off';
  return `provider-tools=${enabled} · history=${history.length} · deltas=${deltaCount} · completed=${completedCount} · results=${resultCount} · failures=${failures}`;
};

const formatProviderToolExperimentMode = (entry = {}) => {
  const kind = String(entry?.kind || '').trim();
  if (kind === 'stream_delta_capture') return 'read-only capture · no tool execution';
  if (kind === 'stream_delta') return 'debug execution · explicit only';
  if (kind === 'tool_call') return 'debug tool call · explicit only';
  return 'diagnostic';
};

export const formatProviderToolExperimentDiagnostics = (snapshot = {}) => {
  const history = Array.isArray(snapshot?.history) ? snapshot.history : [];
  const status = isPlainObject(snapshot?.status) ? snapshot.status : {};
  const header = [
    'Provider Tool Experiment',
    `enabled: ${status.enabled === true ? 'true' : 'false'}`,
    `allowedTools: ${formatList(status.allowedTools)}`,
    `provider: ${String(status.provider || '-').trim() || '-'}`,
    `model: ${String(status.model || '-').trim() || '-'}`,
  ].join('\n');
  if (!history.length) return `${header}\n\nNo provider tool experiment diagnostics`;

  const blocks = history.map((entry, index) => {
    const deltas = Array.isArray(entry?.deltas) ? entry.deltas : [];
    const completed = Array.isArray(entry?.completedToolCalls) ? entry.completedToolCalls : [];
    const results = Array.isArray(entry?.results) ? entry.results : [];
    const parts = Array.isArray(entry?.parts) ? entry.parts : [];
    const continuation = isPlainObject(entry?.continuation) ? entry.continuation : null;
    const requestPreview = isPlainObject(entry?.requestPreview) ? entry.requestPreview : null;
    const mockLoopPreview = isPlainObject(entry?.mockLoopPreview) ? entry.mockLoopPreview : null;
    const mockProviderRun = isPlainObject(entry?.mockProviderRun) ? entry.mockProviderRun : null;
    const runnerHandoff = isPlainObject(entry?.runnerHandoff) ? entry.runnerHandoff : null;
    const runnerRequestDraft = isPlainObject(entry?.runnerRequestDraft) ? entry.runnerRequestDraft : null;
    const runnerModePlan = isPlainObject(entry?.runnerModePlan) ? entry.runnerModePlan : null;
    const runnerFacade = isPlainObject(entry?.runnerFacade) ? entry.runnerFacade : null;
    const runnerDryRun = isPlainObject(entry?.runnerDryRun) ? entry.runnerDryRun : null;
    const realRunnerDebug = isPlainObject(entry?.realRunnerDebug) ? entry.realRunnerDebug : null;
    const permissionStrategy = isPlainObject(entry?.permissionStrategy) ? entry.permissionStrategy : null;
    const loopState = isPlainObject(entry?.loopState) ? entry.loopState : null;
    const lines = [
      `#${index + 1} [${String(entry?.status || 'unknown').toUpperCase()}] ${String(entry?.kind || 'tool_call')}`,
      `id: ${String(entry?.id || '-').trim() || '-'}`,
      `ok: ${entry?.ok === true ? 'true' : 'false'}`,
      `provider/model: ${String(entry?.provider || '-').trim() || '-'} / ${String(entry?.model || '-').trim() || '-'}`,
      `sessionId: ${String(entry?.sessionId || '-').trim() || '-'}`,
      `mode: ${formatProviderToolExperimentMode(entry)}`,
      `createdAt: ${formatTraceTimestamp(entry?.createdAt)}`,
      `updatedAt: ${formatTraceTimestamp(entry?.updatedAt)}`,
      `explicitEnabled: ${entry?.explicitEnabled === true ? 'true' : 'false'}`,
      `reason: ${String(entry?.reason || '-').trim() || '-'}`,
      `deltas: ${deltas.length} · completedToolCalls: ${completed.length} · results: ${results.length} · parts: ${parts.length}`,
    ];
    if (continuation) {
      lines.push(`continuation: ${String(continuation.strategy || '-').trim() || '-'} · shouldContinue=${continuation.shouldContinue === true ? 'true' : 'false'}`);
    }
    if (permissionStrategy) {
      lines.push(`permissionStrategy: ${String(permissionStrategy.mode || '-').trim() || '-'} · presentation=${String(permissionStrategy.presentation || '-').trim() || '-'} · promptModal=${permissionStrategy.promptModal === true ? 'true' : 'false'} · silent=${permissionStrategy.silentPrompt === true ? 'true' : 'false'}`);
    }
    if (requestPreview) {
      lines.push(`requestPreview: ${String(requestPreview.format || '-').trim() || '-'} · network=${requestPreview.network === true ? 'true' : 'false'} · toolResults=${Number(requestPreview.toolResultCount || 0) || 0}`);
    }
    if (mockLoopPreview) {
      lines.push(`mockLoopPreview: ${String(mockLoopPreview.status || '-').trim() || '-'} · network=${mockLoopPreview.network === true ? 'true' : 'false'}`);
    }
    if (mockProviderRun) {
      const events = Array.isArray(mockProviderRun.events)
        ? mockProviderRun.events.length
        : (Number(mockProviderRun.eventCount || 0) || 0);
      const chars = Array.from(String(mockProviderRun.finalText || '')).length;
      lines.push(`mockProviderRun: ${String(mockProviderRun.status || '-').trim() || '-'} · network=${mockProviderRun.network === true ? 'true' : 'false'} · events=${events} · chars=${chars}`);
    }
    if (loopState) {
      lines.push(`loopState: ${String(loopState.status || '-').trim() || '-'} · phase=${String(loopState.phase || '-').trim() || '-'} · phases=${Number(loopState.phaseCount || 0) || 0} · network=${loopState.network === true ? 'true' : 'false'}`);
    }
    if (runnerHandoff) {
      lines.push(`runnerHandoff: ${String(runnerHandoff.status || '-').trim() || '-'} · output=${String(runnerHandoff.output || '-').trim() || '-'} · network=${runnerHandoff.network === true ? 'true' : 'false'} · writesChat=${runnerHandoff.writesChat === true ? 'true' : 'false'}`);
    }
    if (runnerRequestDraft) {
      lines.push(`runnerRequestDraft: ${String(runnerRequestDraft.status || '-').trim() || '-'} · payload=${String(runnerRequestDraft.payloadKind || '-').trim() || '-'} · network=${runnerRequestDraft.network === true ? 'true' : 'false'} · writesChat=${runnerRequestDraft.writesChat === true ? 'true' : 'false'}`);
    }
    if (runnerModePlan) {
      lines.push(`runnerMode: ${String(runnerModePlan.mode || '-').trim() || '-'} · status=${String(runnerModePlan.status || '-').trim() || '-'} · facade=${runnerModePlan.runnerFacadeEnabled === true ? 'true' : 'false'} · network=${runnerModePlan.network === true ? 'true' : 'false'} · writesChat=${runnerModePlan.writesChat === true ? 'true' : 'false'}`);
    }
    if (realRunnerDebug) {
      lines.push(`realRunnerDebug: ${String(realRunnerDebug.status || '-').trim() || '-'} · mode=${String(realRunnerDebug.mode || '-').trim() || '-'} · adapter=${realRunnerDebug.adapterEnabled === true ? 'true' : 'false'} · client=${realRunnerDebug.providerClientInjected === true ? 'true' : 'false'} · llm=${realRunnerDebug.llmClientInjected === true ? 'true' : 'false'} · network=${realRunnerDebug.allowRunnerNetwork === true ? 'true' : 'false'} · writesChat=${realRunnerDebug.writesChat === true ? 'true' : 'false'}`);
      lines.push(`realRunnerPolicy: tools=${formatList(realRunnerDebug.allowedTools)} · modelContext=${String(realRunnerDebug.modelContextPolicy || '-').trim() || '-'} · rollback=${String(realRunnerDebug.rollback || '-').trim() || '-'}`);
    }
    if (runnerFacade) {
      const events = Array.isArray(runnerFacade.events)
        ? runnerFacade.events.length
        : (Number(runnerFacade.eventCount || 0) || 0);
      lines.push(`runnerFacade: ${String(runnerFacade.status || '-').trim() || '-'} · events=${events} · network=${runnerFacade.network === true ? 'true' : 'false'} · writesChat=${runnerFacade.writesChat === true ? 'true' : 'false'}`);
      if (isPlainObject(runnerFacade.runnerBoundary)) {
        const boundary = runnerFacade.runnerBoundary;
        lines.push(`runnerBoundary: ${String(boundary.status || '-').trim() || '-'} · input=${String(boundary.input || '-').trim() || '-'} · method=${String(boundary.clientMethod || '-').trim() || '-'} · payload=${String(boundary.payloadKind || '-').trim() || '-'}`);
        if (isPlainObject(boundary.capability)) {
          const capability = boundary.capability;
          lines.push(`runnerCapability: ${String(capability.status || '-').trim() || '-'} · provider=${String(capability.providerFamily || '-').trim() || '-'} · runner=${String(capability.runnerKind || '-').trim() || '-'} · native=${capability.requiresProviderNativeRunner === true ? 'true' : 'false'}`);
        }
        if (isPlainObject(boundary.nativeRunnerContract)) {
          const contract = boundary.nativeRunnerContract;
          lines.push(`nativeRunnerContract: ${String(contract.status || '-').trim() || '-'} · kind=${String(contract.contractKind || '-').trim() || '-'} · entry=${String(contract.entrypoint || '-').trim() || '-'} · payload=${String(contract.payloadKind || '-').trim() || '-'}`);
        }
      }
    }
    if (runnerDryRun) {
      const events = Array.isArray(runnerDryRun.events)
        ? runnerDryRun.events.length
        : (Number(runnerDryRun.eventCount || 0) || 0);
      lines.push(`runnerDryRun: ${String(runnerDryRun.status || '-').trim() || '-'} · events=${events} · network=${runnerDryRun.network === true ? 'true' : 'false'} · writesChat=${runnerDryRun.writesChat === true ? 'true' : 'false'}`);
    }
    if (entry?.toolCall) {
      lines.push(`toolCall: ${String(entry.toolCall.toolName || entry.toolCall.name || '-')} ${formatJsonInline(entry.toolCall.arguments)}`);
    }
    if (deltas.length) {
      lines.push('delta chain:');
      deltas.slice(0, 20).forEach((delta, deltaIndex) => {
        const id = String(delta?.toolCallId || delta?.id || '').trim() || `index:${delta?.index ?? '-'}`;
        const argsDelta = String(delta?.argumentsDelta || '').trim();
        const argText = argsDelta ? ` · argsDelta=${argsDelta}` : '';
        lines.push(`  ${deltaIndex + 1}. ${String(delta?.phase || '-')} · ${id} · ${String(delta?.toolName || '-')}${argText}`);
      });
      if (deltas.length > 20) lines.push(`  ... ${deltas.length - 20} more deltas`);
    }
    if (completed.length) {
      lines.push('completed tool calls:');
      completed.forEach((toolCall, toolIndex) => {
        lines.push(`  ${toolIndex + 1}. ${String(toolCall?.toolName || '-')} · id=${String(toolCall?.toolCallId || toolCall?.id || '-')} · args=${formatJsonInline(toolCall?.arguments)}`);
      });
    }
    if (results.length) {
      lines.push('results:');
      results.forEach((result, resultIndex) => {
        const partTypes = Array.isArray(result?.parts)
          ? result.parts.map(part => String(part?.type || '').trim()).filter(Boolean).join(', ')
          : '-';
        lines.push(`  ${resultIndex + 1}. [${String(result?.status || '-').toUpperCase()}] ok=${result?.ok === true ? 'true' : 'false'} · tool=${String(result?.toolCall?.toolName || '-')} · parts=${partTypes || '-'}`);
        const message = String(result?.reason || result?.errorMessage || '').trim();
        if (message) lines.push(`     message: ${message}`);
      });
    }
    return lines.join('\n');
  });

  return [header, ...blocks].join('\n\n');
};

export const collectErrorLogs = (logs = []) => (
  Array.isArray(logs) ? logs : []
).filter((log) => log?.type === 'error' || log?.type === 'warn');

export const formatErrorLogs = (logs = []) => {
  const list = collectErrorLogs(logs);
  if (!list.length) return '暂无错误日志';
  return list.map((log) => `${log.prefix}[${log.timestamp}] ${log.message}`).join('\n');
};

export const buildDebugTextFilename = (prefix, date = new Date()) => {
  const pad = (value) => String(value).padStart(2, '0');
  return `${String(prefix || 'debug').trim() || 'debug'}-${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}.txt`;
};
