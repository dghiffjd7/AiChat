import {
  buildMemoryActionBatchPreview,
  executeMemoryActionBatchMutation,
  restoreMemoryRowsFromRollbackSnapshot,
} from './chat/memory-table-action-utils.js';
import { buildUpdateVariableCommandsPreview } from './chat/update-variable-command-utils.js';
import { batchCreateMemoriesWithFallback } from './session-memory-write-utils.js';
import { buildWorldbookActionBatchPreview } from './worldbook-action-preview-utils.js';
import {
  deleteValueAtPath,
  getValueAtPath,
  resolveExistingVariablePath,
  setValueAtPath,
} from '../variables/variable-path-utils.js';

const trim = value => String(value ?? '').trim();
const isPlainObject = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));

const clone = (value) => {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return Array.isArray(value) ? value.slice() : { ...value };
  }
};

const resolveMemoryPlan = ({
  getLastMemoryPlan = null,
  resolvePlanForSession = null,
  sessionId = '',
} = {}) => {
  try {
    const rawPlan = typeof getLastMemoryPlan === 'function' ? getLastMemoryPlan() : null;
    const resolved = typeof resolvePlanForSession === 'function'
      ? resolvePlanForSession({ rawPlan, sessionId })
      : { plan: rawPlan };
    return resolved?.plan || null;
  } catch {
    return null;
  }
};

const loadMemoryActionContextForRuntime = async ({
  memoryTableStore = null,
  memoryTemplateStore = null,
  loadActionContext = null,
  getLastMemoryPlan = null,
  resolvePlanForSession = null,
  getContact = null,
  getUiMode = null,
  sessionId = '',
  isGroup = false,
  contextType = '',
  uiMode = '',
  useSharedGlobalScope = false,
} = {}) => {
  const sid = trim(sessionId);
  const currentUiMode = trim(uiMode || (typeof getUiMode === 'function' ? getUiMode() : ''));
  const plan = resolveMemoryPlan({ getLastMemoryPlan, resolvePlanForSession, sessionId: sid });
  const planOrder = Array.isArray(plan?.tableOrder) ? plan.tableOrder : [];
  const rowIndexMap = plan?.rowIndexMap && typeof plan.rowIndexMap === 'object' ? plan.rowIndexMap : {};
  const contact = typeof getContact === 'function' ? getContact(sid) : null;
  const resolvedIsGroup = Boolean(isGroup || sid.startsWith('group:') || contact?.isGroup);
  let actionContext = null;
  if (sid && memoryTableStore && memoryTemplateStore && typeof loadActionContext === 'function') {
    actionContext = await loadActionContext({
      memoryTemplateStore,
      memoryTableStore,
      sessionId: sid,
      isGroup: resolvedIsGroup,
      uiMode: currentUiMode,
      contextType,
      filterTables: true,
      useSharedGlobalScope,
      tableOrderOverride: planOrder,
      rowIndexMap,
    });
  }
  return { actionContext, plan, isGroup: resolvedIsGroup, uiMode: currentUiMode };
};

export const createMemoryPreviewActionsRuntime = ({
  memoryTableStore = null,
  memoryTemplateStore = null,
  loadActionContext = null,
  getLastMemoryPlan = null,
  resolvePlanForSession = null,
  getContact = null,
  getUiMode = null,
  buildPreview = buildMemoryActionBatchPreview,
} = {}) => async ({
  sessionId = '',
  isGroup = false,
  updateMode = '',
  actions = [],
  contextType = '',
  uiMode = '',
  useSharedGlobalScope = false,
} = {}) => {
  const sid = trim(sessionId);
  const list = Array.isArray(actions) ? actions : [];
  const currentUiMode = trim(uiMode || (typeof getUiMode === 'function' ? getUiMode() : ''));
  const fallbackUpdateMode = trim(updateMode) || 'full';

  if (typeof buildPreview !== 'function') {
    return null;
  }

  if (!sid) {
    return buildPreview({
      actions: list,
      actionContext: null,
      updateMode: fallbackUpdateMode,
      isGroup: Boolean(isGroup),
    });
  }

  const { actionContext, plan, isGroup: resolvedIsGroup } = await loadMemoryActionContextForRuntime({
    memoryTableStore,
    memoryTemplateStore,
    loadActionContext,
    getLastMemoryPlan,
    resolvePlanForSession,
    getContact,
    getUiMode,
    sessionId: sid,
    isGroup,
    contextType,
    uiMode: currentUiMode,
    useSharedGlobalScope,
  });

  return buildPreview({
    actions: list,
    actionContext,
    updateMode: trim(updateMode) || trim(plan?.updateMode) || 'full',
    isGroup: resolvedIsGroup,
  });
};

export const createVariablePreviewCommandsRuntime = ({
  chatStore = null,
  buildPreview = buildUpdateVariableCommandsPreview,
  getAt = (obj, path) => getValueAtPath(obj, path, { allowDirectKey: false }),
  setAt = (obj, path, value, options = {}) => setValueAtPath(obj, path, value, options),
  deleteAt = (obj, path) => deleteValueAtPath(obj, path),
  resolveExistingPath = (obj, path, options = {}) => resolveExistingVariablePath(obj, path, options),
} = {}) => async ({
  sessionId = '',
  useGlobal = false,
  commands = [],
} = {}) => {
  const sid = trim(sessionId);
  const list = Array.isArray(commands) ? commands : [];
  const initialRoot = useGlobal
    ? (chatStore?.listGlobalVariables?.() || {})
    : (chatStore?.listVariables?.(sid) || {});
  return buildPreview(initialRoot, list, {
    getAt,
    setAt,
    deleteAt,
    resolveExistingPath,
  });
};

export const createWorldbookPreviewActionsRuntime = ({
  loadWorld = null,
  buildPreview = buildWorldbookActionBatchPreview,
} = {}) => async ({
  worldId = '',
  actions = [],
} = {}) => {
  const id = trim(worldId);
  const worldData = id && typeof loadWorld === 'function'
    ? await loadWorld(id)
    : null;
  return buildPreview({
    worldId: id,
    worldData,
    actions: Array.isArray(actions) ? actions : [],
  });
};

export const createMemoryPreviewCommitRuntime = ({
  memoryTableStore = null,
  memoryTemplateStore = null,
  loadActionContext = null,
  loadRollbackContext = null,
  getLastMemoryPlan = null,
  resolvePlanForSession = null,
  getContact = null,
  getUiMode = null,
  onMemoryCommitted = null,
  onMemoryUndone = null,
} = {}) => ({
  commit: async ({ args = {}, previewResult = {} } = {}) => {
    const sid = trim(args.sessionId);
    const actions = Array.isArray(args.actions) ? args.actions : [];
    const { actionContext, plan, isGroup } = await loadMemoryActionContextForRuntime({
      memoryTableStore,
      memoryTemplateStore,
      loadActionContext,
      getLastMemoryPlan,
      resolvePlanForSession,
      getContact,
      getUiMode,
      sessionId: sid,
      isGroup: args.isGroup === true,
      contextType: trim(args.contextType),
      uiMode: trim(args.uiMode),
      useSharedGlobalScope: args.useSharedGlobalScope === true,
    });
    if (!sid || !actions.length || !actionContext?.record) {
      return { status: 'blocked', reason: 'memory_context_missing', writesStore: false };
    }
    const result = await executeMemoryActionBatchMutation({
      actions,
      actionContext,
      updateMode: trim(args.updateMode) || trim(plan?.updateMode) || 'full',
      memoryTableStore,
      createMemories: inputs => batchCreateMemoriesWithFallback({
        memoryTableStore,
        inputs,
      }),
      currentTurnNumber: Number(previewResult?.currentTurnNumber || 0) || 0,
      isGroup,
    });
    const changed = Number(result?.changed || 0) || 0;
    const commit = {
      status: changed > 0 ? 'committed' : 'skipped',
      reason: changed > 0 ? '' : 'no_changes',
      writesStore: changed > 0,
      toolName: 'memory.preview_actions',
      sessionId: sid,
      changed,
      inserted: Number(result?.inserted || 0) || 0,
      updated: Number(result?.updated || 0) || 0,
      deleted: Number(result?.deleted || 0) || 0,
      skipped: Number(result?.skipped || 0) || 0,
      rollbackSnapshot: result?.rollbackSnapshot || null,
      refs: {
        sessionId: sid,
        templateId: trim(actionContext.templateId),
      },
      undo: { strategy: 'restore_memory_rollback_snapshot' },
      displayMessage: changed > 0 ? `已写入记忆变更 ${changed} 项。` : '没有可提交的记忆变更。',
    };
    if (changed > 0 && typeof onMemoryCommitted === 'function') await onMemoryCommitted(commit);
    return commit;
  },
  undo: async ({ commitResult = {} } = {}) => {
    const rollback = commitResult?.rollbackSnapshot;
    const sid = trim(commitResult?.sessionId || commitResult?.refs?.sessionId);
    if (!sid || !rollback || !Array.isArray(rollback.tables) || !rollback.tables.length) {
      return { status: 'blocked', reason: 'rollback_snapshot_missing' };
    }
    if (!memoryTableStore || !memoryTemplateStore || typeof loadRollbackContext !== 'function') {
      return { status: 'blocked', reason: 'memory_rollback_context_missing' };
    }
    const rollbackContext = await loadRollbackContext({
      memoryTemplateStore,
      memoryTableStore,
      sessionId: sid,
      isGroup: sid.startsWith('group:'),
      uiMode: typeof getUiMode === 'function' ? getUiMode() : '',
      rollback,
    });
    const templateId = trim(rollbackContext?.templateId);
    if (!templateId) return { status: 'blocked', reason: 'memory_rollback_template_missing' };
    let changed = 0;
    for (const tableContext of Array.isArray(rollbackContext.tables) ? rollbackContext.tables : []) {
      changed += await restoreMemoryRowsFromRollbackSnapshot({
        memoryTableStore,
        templateId,
        tableId: tableContext.tableId,
        scopeFields: tableContext.scopeFields,
        currentRows: tableContext.currentRows,
        snapshotRows: tableContext.snapshotRows,
      });
    }
    const undo = {
      status: changed > 0 ? 'undone' : 'skipped',
      reason: changed > 0 ? '' : 'no_changes',
      changed,
      refs: { sessionId: sid, templateId },
      displayMessage: changed > 0 ? `已撤销记忆变更 ${changed} 项。` : '记忆已无需撤销。',
    };
    if (changed > 0 && typeof onMemoryUndone === 'function') await onMemoryUndone(undo);
    return undo;
  },
});

export const createVariablePreviewCommitRuntime = ({
  chatStore = null,
} = {}) => ({
  commit: async ({ args = {}, previewResult = {} } = {}) => {
    const sid = trim(args.sessionId);
    const useGlobal = args.useGlobal === true;
    const updates = isPlainObject(previewResult?.updates) ? previewResult.updates : {};
    const changedKeys = Object.keys(updates).filter(Boolean);
    if (!sid || !changedKeys.length) {
      return { status: 'skipped', reason: 'no_changes', writesStore: false };
    }
    const setVar = useGlobal ? chatStore?.setGlobalVariable?.bind(chatStore) : chatStore?.setVariable?.bind(chatStore);
    const deleteVar = useGlobal ? chatStore?.deleteGlobalVariable?.bind(chatStore) : chatStore?.deleteVariable?.bind(chatStore);
    if (typeof setVar !== 'function') {
      return { status: 'blocked', reason: 'variable_store_missing', writesStore: false };
    }
    let changed = 0;
    for (const key of changedKeys) {
      const value = updates[key];
      if (value === undefined) {
        if (typeof deleteVar === 'function') {
          const ok = useGlobal ? deleteVar(key) : deleteVar(key, sid);
          if (ok) changed += 1;
        }
      } else {
        const ok = useGlobal ? setVar(key, value) : setVar(key, value, sid);
        if (ok) changed += 1;
      }
    }
    return {
      status: changed > 0 ? 'committed' : 'skipped',
      reason: changed > 0 ? '' : 'no_changes',
      writesStore: changed > 0,
      toolName: 'variable.preview_commands',
      sessionId: sid,
      useGlobal,
      changed,
      rollbackSnapshot: clone(previewResult?.rollbackSnapshot || {}),
      refs: { changedKeys },
      undo: { strategy: 'restore_variable_keys' },
      displayMessage: changed > 0 ? `已写入变量变更 ${changed} 项。` : '没有可提交的变量变更。',
    };
  },
  undo: async ({ commitResult = {} } = {}) => {
    const sid = trim(commitResult?.sessionId);
    const useGlobal = commitResult?.useGlobal === true;
    const keys = Array.isArray(commitResult?.refs?.changedKeys)
      ? commitResult.refs.changedKeys.map(trim).filter(Boolean)
      : [];
    const snapshot = isPlainObject(commitResult?.rollbackSnapshot) ? commitResult.rollbackSnapshot : {};
    if (!sid || !keys.length) return { status: 'blocked', reason: 'variable_commit_refs_missing' };
    const setVar = useGlobal ? chatStore?.setGlobalVariable?.bind(chatStore) : chatStore?.setVariable?.bind(chatStore);
    const deleteVar = useGlobal ? chatStore?.deleteGlobalVariable?.bind(chatStore) : chatStore?.deleteVariable?.bind(chatStore);
    if (typeof setVar !== 'function') return { status: 'blocked', reason: 'variable_store_missing' };
    let changed = 0;
    for (const key of keys) {
      if (Object.prototype.hasOwnProperty.call(snapshot, key)) {
        const ok = useGlobal ? setVar(key, snapshot[key]) : setVar(key, snapshot[key], sid);
        if (ok) changed += 1;
      } else if (typeof deleteVar === 'function') {
        const ok = useGlobal ? deleteVar(key) : deleteVar(key, sid);
        if (ok) changed += 1;
      }
    }
    return {
      status: changed > 0 ? 'undone' : 'skipped',
      reason: changed > 0 ? '' : 'no_changes',
      changed,
      refs: { changedKeys: keys },
      displayMessage: changed > 0 ? `已撤销变量变更 ${changed} 项。` : '变量已无需撤销。',
    };
  },
});

export const createWorldbookPreviewCommitRuntime = ({
  loadWorld = null,
  saveWorld = null,
  buildPreview = buildWorldbookActionBatchPreview,
} = {}) => ({
  commit: async ({ args = {} } = {}) => {
    const worldId = trim(args.worldId);
    const actions = Array.isArray(args.actions) ? args.actions : [];
    if (!worldId || !actions.length) return { status: 'skipped', reason: 'no_changes', writesStore: false };
    if (typeof loadWorld !== 'function' || typeof saveWorld !== 'function') {
      return { status: 'blocked', reason: 'worldbook_store_missing', writesStore: false };
    }
    const worldData = await loadWorld(worldId);
    const preview = buildPreview({
      worldId,
      worldData,
      actions,
      includeNextWorldData: true,
    });
    const changed = Number(preview?.changed || 0) || 0;
    if (changed <= 0 || !preview?.nextWorldData) {
      return {
        status: 'skipped',
        reason: 'no_changes',
        writesStore: false,
        changed: 0,
        rollbackSnapshot: preview?.rollbackSnapshot || null,
      };
    }
    await saveWorld(worldId, preview.nextWorldData);
    return {
      status: 'committed',
      writesStore: true,
      toolName: 'worldbook.preview_actions',
      worldId,
      changed,
      inserted: Number(preview.inserted || 0) || 0,
      updated: Number(preview.updated || 0) || 0,
      deleted: Number(preview.deleted || 0) || 0,
      skipped: Number(preview.skipped || 0) || 0,
      rollbackSnapshot: preview.rollbackSnapshot,
      refs: { worldId },
      undo: { strategy: 'restore_worldbook_snapshot' },
      displayMessage: `已写入世界书变更 ${changed} 项。`,
    };
  },
  undo: async ({ commitResult = {} } = {}) => {
    const worldId = trim(commitResult?.worldId || commitResult?.refs?.worldId);
    const worldData = commitResult?.rollbackSnapshot?.worldData;
    if (!worldId || !isPlainObject(worldData)) return { status: 'blocked', reason: 'worldbook_rollback_missing' };
    if (typeof saveWorld !== 'function') return { status: 'blocked', reason: 'worldbook_store_missing' };
    await saveWorld(worldId, worldData);
    return {
      status: 'undone',
      changed: 1,
      refs: { worldId },
      displayMessage: `已撤销世界书「${worldId}」变更。`,
    };
  },
});

export const createAgentWritePreviewRuntimes = (deps = {}) => ({
  previewMemoryActions: createMemoryPreviewActionsRuntime(deps),
  previewVariableCommands: createVariablePreviewCommandsRuntime(deps),
  previewWorldbookActions: createWorldbookPreviewActionsRuntime(deps),
  memoryCommit: createMemoryPreviewCommitRuntime(deps),
  variableCommit: createVariablePreviewCommitRuntime(deps),
  worldbookCommit: createWorldbookPreviewCommitRuntime(deps),
});
