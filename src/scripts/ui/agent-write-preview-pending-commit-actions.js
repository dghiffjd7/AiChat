const WRITE_PREVIEW_TOOLS = new Set([
  'memory.preview_actions',
  'variable.preview_commands',
  'worldbook.preview_actions',
]);

const trim = (value, fallback = '') => {
  const text = String(value ?? '').trim();
  return text || fallback;
};

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

const readArgsPreview = (pending = {}) => {
  const candidates = [
    pending.argsPreview,
    pending.request?.argsPreview,
    pending.toolCall?.arguments,
  ];
  return candidates.find(isPlainObject) || {};
};

const readPreviewResult = (pending = {}) => {
  const resumeResult = isPlainObject(pending?.resumeResult) ? pending.resumeResult : null;
  const output = isPlainObject(resumeResult?.output) ? resumeResult.output : null;
  const result = output?.result ?? resumeResult?.result ?? pending?.previewResult ?? null;
  return isPlainObject(result) ? result : null;
};

const normalizeCommitStatus = (status = '') => {
  const text = trim(status, 'blocked');
  if (['committed', 'skipped', 'blocked', 'failed'].includes(text)) return text;
  return text || 'blocked';
};

const normalizeUndoStatus = (status = '') => {
  const text = trim(status, 'blocked');
  if (['undone', 'skipped', 'blocked', 'failed'].includes(text)) return text;
  return text || 'blocked';
};

const okCommitStatus = status => status === 'committed' || status === 'skipped';
const okUndoStatus = status => status === 'undone' || status === 'skipped';

const formatReason = (reason = '', { pending = null } = {}) => {
  const code = trim(reason);
  if (!code) return '';
  if (code.startsWith('resume_not_succeeded:')) {
    const status = trim(code.split(':')[1], 'idle');
    return `预览尚未完成，当前状态为 ${status}。请先允许一次并等待 diff 生成。`;
  }
  if (code.startsWith('commit_not_undoable:')) {
    const status = trim(code.split(':')[1], 'idle');
    return `当前提交状态为 ${status}，没有可撤销的已提交内容。`;
  }
  const map = {
    pending_permission_not_found: '找不到这次预览请求，可能已被清理或已经过期。',
    not_write_preview_tool: '这不是记忆/变量/世界书写入预览工具，不能在这里提交。',
    preview_result_missing: '找不到已生成的 diff 结果，请先允许一次执行只读预览。',
    already_committed: '这条预览已经提交过，如需回退请使用撤销提交。',
    already_undone: '这条预览已经撤销过。',
    confirmation_required: '需要用户再次确认后才会提交。',
    commit_handler_missing: '当前环境没有这个写入预览的提交处理器。',
    undo_handler_missing: '当前环境没有这个写入预览的撤销处理器。',
    no_changes: '没有可提交的变更。',
    memory_context_missing: '记忆表上下文不可用，无法提交。',
    memory_rollback_context_missing: '记忆表撤销上下文不可用。',
    memory_rollback_template_missing: '记忆表撤销模板不可用。',
    rollback_snapshot_missing: '找不到可用于撤销的 rollback snapshot。',
    variable_store_missing: '变量 store 不可用，无法提交。',
    variable_commit_refs_missing: '找不到本次变量提交的变更键。',
    worldbook_store_missing: '世界书 store 不可用，无法提交。',
    worldbook_rollback_missing: '找不到可用于撤销的世界书快照。',
  };
  return map[code] || (pending?.toolName ? `${pending.toolName}: ${code}` : code);
};

const buildBlockedResult = ({
  id = '',
  reason = '',
  pending = null,
} = {}) => ({
  ok: false,
  status: 'blocked',
  reason: trim(reason, 'write preview commit blocked'),
  message: formatReason(reason, { pending }),
  pendingPermissionId: trim(id),
  pending,
});

const readStore = store => ({
  get: typeof store?.get === 'function' ? store.get.bind(store) : null,
  markCommit: typeof store?.markCommit === 'function' ? store.markCommit.bind(store) : null,
  markCommitUndo: typeof store?.markCommitUndo === 'function' ? store.markCommitUndo.bind(store) : null,
});

const normalizeHandlers = (handlers = {}) => (isPlainObject(handlers) ? handlers : {});

export const createAgentWritePreviewPendingCommitActions = ({
  pendingPermissionStore = null,
  commitHandlers = {},
  undoHandlers = {},
  onCommitFinished = null,
  onUndoFinished = null,
} = {}) => {
  const store = readStore(pendingPermissionStore);
  const commits = normalizeHandlers(commitHandlers);
  const undos = normalizeHandlers(undoHandlers);

  const getPending = (id = '') => {
    const pendingId = trim(id);
    return pendingId && store.get ? store.get(pendingId) : null;
  };

  const commitAgentWritePreviewPendingPermission = async (options = {}) => {
    const opts = isPlainObject(options) ? options : { id: options };
    const id = trim(opts.id || opts.pendingPermissionId);
    const pending = getPending(id);
    if (!pending) return buildBlockedResult({ id, reason: 'pending_permission_not_found' });
    const toolName = trim(pending.toolName);
    if (!WRITE_PREVIEW_TOOLS.has(toolName)) {
      return buildBlockedResult({ id, reason: 'not_write_preview_tool', pending });
    }
    if (pending.resumeStatus !== 'succeeded') {
      return buildBlockedResult({ id, reason: `resume_not_succeeded:${pending.resumeStatus || 'idle'}`, pending });
    }
    if (pending.commitStatus === 'committed') {
      return buildBlockedResult({ id, reason: 'already_committed', pending });
    }
    if (pending.commitStatus === 'undone' || pending.commitUndoStatus === 'undone') {
      return buildBlockedResult({ id, reason: 'already_undone', pending });
    }
    const previewResult = readPreviewResult(pending);
    if (!previewResult) return buildBlockedResult({ id, reason: 'preview_result_missing', pending });
    const commitHandler = commits[toolName];
    if (typeof commitHandler !== 'function') {
      return buildBlockedResult({ id, reason: 'commit_handler_missing', pending });
    }
    if (opts.confirmed !== true) {
      return buildBlockedResult({ id, reason: 'confirmation_required', pending });
    }

    const args = readArgsPreview(pending);
    store.markCommit?.(id, { status: 'running' });
    try {
      const commit = await commitHandler({
        pending: clone(pending),
        args,
        previewResult,
      });
      const status = normalizeCommitStatus(commit?.status);
      const message = trim(commit?.displayMessage) || formatReason(commit?.reason, { pending });
      const storedCommit = {
        ...commit,
        ...(message ? { displayMessage: message } : {}),
      };
      const nextPending = store.markCommit?.(id, {
        status,
        result: storedCommit,
        errorMessage: okCommitStatus(status) ? '' : (message || commit?.reason || ''),
      }) || getPending(id);
      if (typeof onCommitFinished === 'function') {
        await onCommitFinished({ commit: storedCommit, pending: nextPending });
      }
      return {
        ok: okCommitStatus(status),
        status,
        message,
        pendingPermissionId: id,
        pending: nextPending,
        commit: storedCommit,
        writesStore: storedCommit?.writesStore === true,
      };
    } catch (err) {
      const message = trim(err?.message || err, 'write preview commit failed');
      const nextPending = store.markCommit?.(id, {
        status: 'failed',
        errorMessage: message,
      }) || getPending(id);
      return {
        ok: false,
        status: 'failed',
        reason: message,
        message,
        pendingPermissionId: id,
        pending: nextPending,
      };
    }
  };

  const undoAgentWritePreviewPendingCommit = async (options = {}) => {
    const opts = isPlainObject(options) ? options : { id: options };
    const id = trim(opts.id || opts.pendingPermissionId);
    const pending = getPending(id);
    if (!pending) return buildBlockedResult({ id, reason: 'pending_permission_not_found' });
    const toolName = trim(pending.toolName);
    if (!WRITE_PREVIEW_TOOLS.has(toolName)) {
      return buildBlockedResult({ id, reason: 'not_write_preview_tool', pending });
    }
    if (pending.commitStatus !== 'committed' || !isPlainObject(pending.commitResult)) {
      return buildBlockedResult({ id, reason: `commit_not_undoable:${pending.commitStatus || 'idle'}`, pending });
    }
    if (pending.commitUndoStatus === 'undone') {
      return buildBlockedResult({ id, reason: 'already_undone', pending });
    }
    const undoHandler = undos[toolName];
    if (typeof undoHandler !== 'function') {
      return buildBlockedResult({ id, reason: 'undo_handler_missing', pending });
    }
    if (opts.confirmed !== true) {
      return buildBlockedResult({ id, reason: 'confirmation_required', pending });
    }

    store.markCommitUndo?.(id, { status: 'running' });
    try {
      const undo = await undoHandler({
        pending: clone(pending),
        commitResult: pending.commitResult,
      });
      const status = normalizeUndoStatus(undo?.status);
      const message = trim(undo?.displayMessage) || formatReason(undo?.reason, { pending });
      const storedUndo = {
        ...undo,
        ...(message ? { displayMessage: message } : {}),
      };
      const nextPending = store.markCommitUndo?.(id, {
        status,
        result: storedUndo,
        errorMessage: okUndoStatus(status) ? '' : (message || undo?.reason || ''),
      }) || getPending(id);
      if (typeof onUndoFinished === 'function') {
        await onUndoFinished({ undo: storedUndo, pending: nextPending });
      }
      return {
        ok: okUndoStatus(status),
        status,
        message,
        pendingPermissionId: id,
        pending: nextPending,
        undo: storedUndo,
      };
    } catch (err) {
      const message = trim(err?.message || err, 'write preview undo failed');
      const nextPending = store.markCommitUndo?.(id, {
        status: 'failed',
        errorMessage: message,
      }) || getPending(id);
      return {
        ok: false,
        status: 'failed',
        reason: message,
        message,
        pendingPermissionId: id,
        pending: nextPending,
      };
    }
  };

  return {
    commitAgentWritePreviewPendingPermission,
    undoAgentWritePreviewPendingCommit,
  };
};
