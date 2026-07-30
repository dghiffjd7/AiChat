const trim = (value, fallback = '') => {
  const text = String(value ?? '').trim();
  return text || fallback;
};

const MEMORY_KINDS = Object.freeze([
  'preference',
  'decision',
  'resource_state',
  'relationship',
  'task_state',
  'important_event',
]);
const MEMORY_STATUSES = Object.freeze(['active', 'resolved', 'stale', 'archived']);

const truncate = (value = '', max = 240) => {
  const text = trim(value);
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1))}…`;
};

const normalizeIds = (value = []) => (Array.isArray(value) ? value : [])
  .map(item => trim(item))
  .filter(Boolean)
  .slice(0, 50);

const compactMemory = (memory = {}) => ({
  id: trim(memory?.id),
  kind: trim(memory?.kind),
  key: trim(memory?.key),
  contentSummary: truncate(memory?.content),
  confidence: trim(memory?.confidence),
  status: trim(memory?.status),
  updatedAt: Number(memory?.updatedAt || 0) || 0,
});

const isExplicitPreferenceOrDecision = memory => (
  memory?.confidence === 'explicit' &&
  (memory?.kind === 'preference' || memory?.kind === 'decision')
);

const compactArchiveResultItem = (item = {}) => ({
  id: trim(item?.id),
  status: item?.status === 'missing' ? 'skipped' : trim(item?.status, 'skipped'),
  reason: trim(item?.reason),
});

const summarizeCounts = (items = []) => ({
  archivedCount: items.filter(item => item.status === 'archived').length,
  protectedCount: items.filter(item => item.status === 'protected').length,
  skippedCount: items.filter(item => item.status === 'skipped' || item.status === 'missing').length,
  failedCount: items.filter(item => item.status === 'failed').length,
});

export const createMaidMemoryTools = ({
  semanticMemoryStore = null,
} = {}) => {
  const archiveSnapshots = new WeakMap();

  const getMemory = (id = '') => {
    try {
      return semanticMemoryStore?.getMemory?.(id) || null;
    } catch {
      return null;
    }
  };

  const buildArchiveSnapshot = (args = {}) => {
    const requested = normalizeIds(args.memoryIds);
    const seen = new Set();
    const items = requested.map((id) => {
      if (seen.has(id)) {
        return { id, status: 'skipped', reason: 'duplicate_target' };
      }
      seen.add(id);
      const memory = getMemory(id);
      if (!memory) return { id, status: 'missing', reason: 'memory_not_found' };
      const base = {
        id,
        kind: trim(memory.kind),
        key: trim(memory.key),
        contentSummary: truncate(memory.content),
        confidence: trim(memory.confidence),
        memoryStatus: trim(memory.status),
        warning: isExplicitPreferenceOrDecision(memory),
      };
      if (memory.status === 'archived') {
        return { ...base, status: 'skipped', reason: 'already_archived' };
      }
      if (memory.status !== 'active') {
        return { ...base, status: 'skipped', reason: 'memory_not_active' };
      }
      if (memory.kind === 'task_state') {
        return { ...base, status: 'protected', reason: 'active_task_state_protected' };
      }
      return { ...base, status: 'planned', reason: '' };
    });
    return {
      requested,
      items,
      plannedCount: items.filter(item => item.status === 'planned').length,
      protectedCount: items.filter(item => item.status === 'protected').length,
    };
  };

  const executeArchive = async (args = {}, context = {}) => {
    const snapshot = archiveSnapshots.get(args) || buildArchiveSnapshot(args);
    if (!snapshot.requested.length) {
      return {
        ok: false,
        reason: 'memory_ids_required',
        requestedCount: 0,
        plannedCount: 0,
        results: [],
      };
    }
    if (args.preview === true) {
      const results = snapshot.items.map(compactArchiveResultItem);
      return {
        ok: true,
        preview: true,
        requestedCount: snapshot.requested.length,
        plannedCount: snapshot.plannedCount,
        ...summarizeCounts(results),
        results,
      };
    }
    if (
      snapshot.plannedCount > 0 &&
      (
        context?.toolSafety?.decision !== 'allow' ||
        context?.toolSafety?.request?.kind !== 'maid.memory.archive'
      )
    ) {
      return {
        ok: false,
        reason: 'confirmation_required',
        requestedCount: snapshot.requested.length,
        plannedCount: snapshot.plannedCount,
        results: snapshot.items.map(compactArchiveResultItem),
      };
    }

    const results = [];
    for (const item of snapshot.items) {
      if (item.status !== 'planned') {
        results.push(compactArchiveResultItem(item));
        continue;
      }
      const current = getMemory(item.id);
      if (!current) {
        results.push({ id: item.id, status: 'skipped', reason: 'memory_not_found' });
        continue;
      }
      if (current.status === 'archived') {
        results.push({ id: item.id, status: 'skipped', reason: 'already_archived' });
        continue;
      }
      if (current.status !== 'active') {
        results.push({ id: item.id, status: 'skipped', reason: 'memory_not_active' });
        continue;
      }
      if (current.kind === 'task_state') {
        results.push({ id: item.id, status: 'protected', reason: 'active_task_state_protected' });
        continue;
      }
      try {
        const archived = await semanticMemoryStore?.setMemoryStatus?.(item.id, 'archived');
        results.push(archived
          ? { id: item.id, status: 'archived', reason: '' }
          : { id: item.id, status: 'skipped', reason: 'memory_not_found' });
      } catch {
        results.push({ id: item.id, status: 'failed', reason: 'archive_failed' });
      }
    }
    const counts = summarizeCounts(results);
    return {
      ok: counts.failedCount === 0,
      preview: false,
      requestedCount: snapshot.requested.length,
      plannedCount: snapshot.plannedCount,
      ...counts,
      results,
    };
  };

  return [
    {
      name: 'maid.memory.list',
      title: 'List maid semantic memories',
      description: 'List the maid’s own long-term semantic memories. Defaults to active memories and returns compact summaries only.',
      source: 'maid-memory',
      permissions: [],
      riskLevel: 'low',
      capabilities: {
        read: true,
        write: false,
        network: false,
        cost: 'none',
        undo: 'none',
        modelContext: 'allowlist',
        confirmation: 'allow_once',
      },
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          query: { type: 'string', maxLength: 200 },
          kind: { type: 'string', enum: MEMORY_KINDS },
          status: { type: 'string', enum: [...MEMORY_STATUSES, 'all'] },
          limit: { type: 'integer', minimum: 1, maximum: 30 },
        },
      },
      execute: async (args = {}) => {
        if (typeof semanticMemoryStore?.listMemories !== 'function') {
          return { ok: false, reason: 'maid_memory_store_unavailable', count: 0, items: [] };
        }
        const status = trim(args.status, 'active');
        const limit = Math.max(1, Math.min(30, Math.trunc(Number(args.limit) || 20)));
        const memories = semanticMemoryStore.listMemories({
          query: trim(args.query),
          kind: trim(args.kind),
          status: status === 'all' ? '' : status,
          limit,
        });
        const items = (Array.isArray(memories) ? memories : []).slice(0, limit).map(compactMemory);
        return {
          ok: true,
          query: trim(args.query),
          kind: trim(args.kind),
          status,
          count: items.length,
          items,
        };
      },
      summarizeResult: result => result?.ok === false
        ? 'maid memory list unavailable'
        : `maid memory list returned ${Number(result?.count || 0)} item(s)`,
    },
    {
      name: 'maid.memory.archive',
      title: 'Archive maid semantic memories',
      description: 'Soft-archive explicit maid memory ids after one structured confirmation. This never physically deletes memory records.',
      source: 'maid-memory',
      permissions: [],
      riskLevel: 'medium',
      capabilities: {
        read: true,
        write: true,
        network: false,
        cost: 'none',
        undo: 'manual',
        modelContext: 'none',
        confirmation: 'required',
      },
      safety: {
        operationType: 'archive_maid_memories',
        destructive: 'conditional',
        description: 'Stops selected memories from being injected while preserving them for manual restoration.',
        preflight: async (args = {}) => {
          const snapshot = buildArchiveSnapshot(args);
          archiveSnapshots.set(args, snapshot);
          if (args.preview === true || snapshot.plannedCount === 0) {
            return { destructive: false, operationType: 'archive_maid_memories' };
          }
          return {
            destructive: true,
            kind: 'maid.memory.archive',
            operationType: 'archive_maid_memories',
            title: '归档女仆长期记忆',
            message: `将归档 ${snapshot.plannedCount} 条长期记忆。归档后不再注入女仆上下文，可在女仆设置中恢复。`,
            confirmText: '确认归档',
            cancelText: '取消',
            danger: false,
            allowAlways: false,
            details: {
              resource: 'maid_memory',
              requestedCount: snapshot.requested.length,
              plannedCount: snapshot.plannedCount,
              items: snapshot.items.map(item => ({
                id: item.id,
                label: item.contentSummary || item.id,
                meta: [item.kind, item.key, item.warning ? '用户明确记忆' : ''].filter(Boolean).join(' · '),
                status: item.status === 'planned' ? 'archive_planned' : item.status,
                reason: item.reason,
                warning: item.warning === true,
              })),
            },
            onDeny: {
              action: 'skip',
              reason: 'maid_memory_archive_cancelled',
              result: {
                ok: false,
                skipped: true,
                reason: 'maid_memory_archive_cancelled',
                requestedCount: snapshot.requested.length,
                plannedCount: snapshot.plannedCount,
              },
            },
          };
        },
      },
      schema: {
        type: 'object',
        required: ['memoryIds'],
        additionalProperties: false,
        properties: {
          memoryIds: {
            type: 'array',
            minItems: 1,
            maxItems: 50,
            items: { type: 'string', minLength: 1, maxLength: 200 },
          },
          preview: { type: 'boolean' },
        },
      },
      execute: executeArchive,
      summarizeResult: result => result?.ok === false
        ? `maid memory archive stopped: ${trim(result?.reason, 'unknown')}`
        : `maid memory archive completed (${Number(result?.archivedCount || 0)} archived)`,
    },
  ];
};

export const registerMaidMemoryTools = (registry, deps = {}) => {
  const tools = createMaidMemoryTools(deps);
  if (!registry || typeof registry.registerMany !== 'function') return tools;
  registry.registerMany(tools);
  return tools;
};
