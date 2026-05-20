const isPlainObject = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));

const trim = (value, fallback = '') => {
  const text = String(value ?? '').trim();
  return text || fallback;
};

const normalizeList = (value = []) => {
  if (Array.isArray(value)) return value.map(item => trim(item)).filter(Boolean);
  const text = trim(value);
  return text ? [text] : [];
};

const normalizeEntries = (entries) => {
  if (!entries) return [];
  if (Array.isArray(entries)) return entries;
  if (typeof entries === 'object') return Object.values(entries);
  return [];
};

const collectWorldEntries = (raw = {}) => {
  const src = raw?.raw && typeof raw.raw === 'object' ? raw.raw : raw;
  const data = src?.data && typeof src.data === 'object' ? src.data : src;
  const out = [];
  const directEntries = normalizeEntries(data?.entries || src?.entries);
  if (directEntries.length) out.push(...directEntries);
  const book = data?.character_book || src?.character_book || null;
  if (book && typeof book === 'object') out.push(...normalizeEntries(book.entries || book));
  const ext = data?.extensions || src?.extensions || {};
  const worldInfo = ext?.world_info || ext?.worldInfo || ext?.world_info_entry || ext?.worldInfoEntry;
  if (worldInfo) out.push(...normalizeEntries(worldInfo.entries || worldInfo));
  return out;
};

const readEntryText = (entry = {}) => trim(entry.content || entry.text || entry.prompt);

const normalizeEntry = (entry = {}, index = 0) => {
  const ext = entry?.extensions && typeof entry.extensions === 'object' ? entry.extensions : {};
  const id = trim(entry.id ?? entry.uid ?? `entry-${index}`);
  const title = trim(entry.comment || entry.title || entry.name || id);
  const content = readEntryText(entry);
  const keys = normalizeList(entry.keys ?? entry.key ?? entry.triggers);
  const secondaryKeys = normalizeList(entry.secondary_keys ?? entry.keysecondary ?? entry.secondary);
  const disabled = entry.disable === true || entry.disabled === true || entry.enabled === false;
  const probability = Number.isFinite(Number(ext.probability ?? entry.probability))
    ? Number(ext.probability ?? entry.probability)
    : 100;
  const useProbability = entry.useProbability !== false && ext.useProbability !== false;
  return {
    raw: entry,
    id,
    title,
    content,
    keys,
    secondaryKeys,
    disabled,
    constant: entry.constant === true,
    selective: entry.selective === true,
    probability,
    useProbability,
    order: Number.isFinite(Number(entry.order ?? entry.insertion_order ?? entry.priority))
      ? Number(entry.order ?? entry.insertion_order ?? entry.priority)
      : 100,
    position: trim(entry.position ?? ext.position),
    group: trim(entry.group ?? ext.group),
    automationId: trim(entry.automationId ?? ext.automationId ?? entry.automation_id ?? ext.automation_id),
    preventRecursion: entry.preventRecursion === true || ext.preventRecursion === true,
    excludeRecursion: entry.excludeRecursion === true || ext.excludeRecursion === true,
    index,
  };
};

const makeFinding = (entry, type, severity, message, evidence = {}) => ({
  entryId: entry.id,
  title: entry.title,
  type,
  severity,
  message,
  evidence,
});

const auditEntry = (entry) => {
  const findings = [];
  const lowerTitle = entry.title.toLowerCase();
  const lowerContent = entry.content.toLowerCase();
  const hasTrigger = entry.keys.length > 0 || entry.secondaryKeys.length > 0;
  const hasMvuMarker = (
    lowerTitle.includes('mvu') ||
    lowerContent.includes('stat_data') ||
    lowerContent.includes('mvu_data') ||
    lowerContent.includes('<mvu') ||
    lowerContent.includes('[mvu_update]') ||
    lowerContent.includes('[initvar]')
  );
  if (entry.disabled) {
    findings.push(makeFinding(entry, 'disabled_entry', 'info', 'Disabled worldbook entry is preserved for audit.', {
      disabled: true,
    }));
  }
  if (!entry.content && (hasTrigger || entry.automationId)) {
    findings.push(makeFinding(entry, 'route_only_entry', 'info', 'Entry has routing triggers but no prompt content.', {
      keys: entry.keys,
      secondaryKeys: entry.secondaryKeys,
      automationId: entry.automationId,
    }));
  }
  if (!entry.disabled && !entry.constant && !hasTrigger) {
    findings.push(makeFinding(entry, 'missing_trigger', 'warning', 'Non-constant enabled entry has no trigger keys.', {
      constant: entry.constant,
      keys: entry.keys,
    }));
  }
  if (entry.useProbability && entry.probability < 100) {
    findings.push(makeFinding(entry, 'probability_gate', 'info', 'Entry activation depends on probability.', {
      probability: entry.probability,
    }));
  }
  if (hasMvuMarker) {
    findings.push(makeFinding(entry, 'mvu_marker', 'warning', 'Entry appears to contain MVU/stat data behavior.', {
      hasInitVar: lowerContent.includes('[initvar]'),
      hasMvuUpdate: lowerContent.includes('[mvu_update]'),
      hasStatData: lowerContent.includes('stat_data') || lowerContent.includes('mvu_data'),
    }));
  }
  if (entry.preventRecursion || entry.excludeRecursion) {
    findings.push(makeFinding(entry, 'recursion_policy', 'info', 'Entry has recursion controls that should be preserved.', {
      preventRecursion: entry.preventRecursion,
      excludeRecursion: entry.excludeRecursion,
    }));
  }
  return findings;
};

export const auditWorldbookData = (worldData = {}, {
  worldId = '',
  source = '',
} = {}) => {
  const entries = collectWorldEntries(worldData).map(normalizeEntry);
  const findings = entries.flatMap(auditEntry);
  const counts = {
    entries: entries.length,
    disabled: entries.filter(entry => entry.disabled).length,
    routeOnly: findings.filter(item => item.type === 'route_only_entry').length,
    missingTrigger: findings.filter(item => item.type === 'missing_trigger').length,
    mvuMarkers: findings.filter(item => item.type === 'mvu_marker').length,
    probabilityGates: findings.filter(item => item.type === 'probability_gate').length,
    recursionPolicies: findings.filter(item => item.type === 'recursion_policy').length,
    warnings: findings.filter(item => item.severity === 'warning').length,
  };
  return {
    worldId: trim(worldId || worldData?.id || worldData?.name),
    source: trim(source),
    counts,
    findings,
    entries: entries.map(entry => ({
      id: entry.id,
      title: entry.title,
      disabled: entry.disabled,
      constant: entry.constant,
      keyCount: entry.keys.length,
      secondaryKeyCount: entry.secondaryKeys.length,
      contentLength: entry.content.length,
      order: entry.order,
      position: entry.position,
      group: entry.group,
    })),
  };
};

export const createWorldbookAuditAgent = ({
  agentTaskRuntime = null,
  loadWorld = async () => null,
} = {}) => {
  const auditWorldbook = (request = {}) => {
    const src = isPlainObject(request) ? request : {};
    const worldId = trim(src.worldId || src.id || src.name);
    const source = trim(src.source, 'manual');
    if (!agentTaskRuntime || typeof agentTaskRuntime.enqueue !== 'function') {
      return Promise.reject(new Error('agent task runtime not configured'));
    }
    return agentTaskRuntime.enqueue({
      kind: 'worldbook_audit',
      title: 'Worldbook audit',
      sessionId: trim(src.sessionId),
      source: 'worldbook-audit-agent',
      trigger: source,
      summary: `worldbook audit${worldId ? `: ${worldId}` : ''}`,
      metadata: { worldId },
    }, async ({ runId, startStep, finishStep }) => {
      const loadStep = startStep({
        type: 'worldbook_audit.load',
        summary: 'load worldbook data',
        input: { worldId, hasInlineWorldData: Boolean(src.worldData) },
      });
      const worldData = src.worldData || await loadWorld(worldId);
      if (!worldData || typeof worldData !== 'object') {
        finishStep(loadStep.id, {
          status: 'failed',
          errorMessage: 'worldbook data not found',
        });
        throw new Error('worldbook data not found');
      }
      const entries = collectWorldEntries(worldData);
      finishStep(loadStep.id, {
        status: 'succeeded',
        output: {
          worldId: worldId || trim(worldData.id || worldData.name),
          entryCount: entries.length,
        },
      });

      const auditStep = startStep({
        type: 'worldbook_audit.analyze',
        summary: 'analyze worldbook entries',
      });
      const report = auditWorldbookData(worldData, { worldId, source });
      finishStep(auditStep.id, {
        status: 'succeeded',
        output: {
          counts: report.counts,
          findingCount: report.findings.length,
        },
      });
      return {
        runId,
        status: 'succeeded',
        report,
      };
    });
  };

  return {
    auditWorldbook,
  };
};
