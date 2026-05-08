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
        return `- ${contract.name} (${contract.kind} · source=${contract.source}${bridgeField})`;
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
      `relatedIds: ${relatedIds}`,
      `details: ${formatTraceDetails(event?.details)}`,
    ].join('\n');
  }).join('\n\n');
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
