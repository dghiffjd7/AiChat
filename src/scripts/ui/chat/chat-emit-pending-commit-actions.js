import { buildChatEmitCommitContract } from '../../agent/tools/chat-emit-commit-contract.js';

const CHAT_EMIT_PREFIX = 'chat.emit_';

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

const readToolResult = (pending = {}) => {
  const output = pending.resumeResult?.output || pending.resume?.output || null;
  if (isPlainObject(output?.result)) return output.result;
  if (isPlainObject(pending.resumeResult?.result)) return pending.resumeResult.result;
  return {};
};

const readCommitContract = (pending = {}) => {
  const toolResult = readToolResult(pending);
  if (isPlainObject(toolResult.commitContract)) return clone(toolResult.commitContract);
  return buildChatEmitCommitContract({
    toolName: pending.toolName,
    args: readArgsPreview(pending),
    eventDraft: toolResult.eventDraft,
    sessionId: pending.sessionId,
  });
};

const normalizeCommitStatus = (status = '') => {
  const text = trim(status, 'blocked');
  if (text === 'committed' || text === 'skipped' || text === 'blocked' || text === 'failed') return text;
  return text || 'blocked';
};

const okCommitStatus = status => status === 'committed' || status === 'skipped';
const okUndoStatus = status => status === 'undone' || status === 'skipped';

const formatReason = (reason = '', { pending = null, result = null } = {}) => {
  const code = trim(reason);
  if (!code) return '';
  if (code.startsWith('resume_not_succeeded:')) {
    const status = trim(code.split(':')[1], 'idle');
    return `候选尚未完成工具恢复，当前状态为 ${status}。请先允许一次并等待工具执行成功。`;
  }
  if (code.startsWith('commit_not_undoable:')) {
    const status = trim(code.split(':')[1], 'idle');
    return `当前提交状态为 ${status}，没有可撤销的已提交内容。`;
  }
  const missing = Array.isArray(result?.preflight?.missingMethods)
    ? result.preflight.missingMethods.filter(Boolean).join('、')
    : '';
  const map = {
    pending_permission_not_found: '找不到这次候选，可能已被清理或已经过期。',
    not_chat_emit_tool: '这不是聊天/动态候选工具，不能在这里提交。',
    already_committed: '这条候选已经提交过，如需回退请使用撤销提交。',
    already_undone: '这条候选已经撤销过。',
    commit_adapter_not_configured: '当前环境没有聊天候选提交适配器。',
    undo_adapter_not_configured: '当前环境没有聊天候选撤销适配器。',
    confirmation_required: '需要用户再次确认后才会提交。',
    preflight_blocked: missing ? `提交环境未就绪，缺少：${missing}。` : '提交环境未就绪。',
    target_session_not_found: '找不到候选目标会话，请检查目标名称或 ID 后重试。',
    no_chat_message_created: '没有创建聊天消息，请检查候选正文、目标与说话人。',
    missing_moment_id: '候选缺少动态 ID，无法写入评论。',
    moment_not_found: '找不到目标动态，无法添加评论。',
    no_comment_created: '没有创建动态评论，请检查评论正文与目标动态。',
    empty_moment_post: '候选动态内容为空，未写入。',
    moment_post_not_saved: '动态候选未能保存，请检查动态 store 状态后重试。',
    created_message_not_found: '本次提交创建的消息已经不存在，无法撤销。',
    snapshot_restore_noop: '没有可恢复的动态快照或新增项，撤销未产生变化。',
    unsupported_undo_strategy: '当前撤销策略不支持。',
    unsupported_protocol_event: '当前候选事件类型不支持提交。',
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
  reason: trim(reason, 'chat emit commit blocked'),
  message: formatReason(reason, { pending }),
  pendingPermissionId: trim(id),
  pending,
});

const readStore = store => ({
  get: typeof store?.get === 'function' ? store.get.bind(store) : null,
  markCommit: typeof store?.markCommit === 'function' ? store.markCommit.bind(store) : null,
  markCommitUndo: typeof store?.markCommitUndo === 'function' ? store.markCommitUndo.bind(store) : null,
});

export const createChatEmitPendingCommitActions = ({
  pendingPermissionStore = null,
  createRuntime = null,
  commitChatEmitContract = null,
  undoChatEmitCommit = null,
  onCommitFinished = null,
  onUndoFinished = null,
} = {}) => {
  const store = readStore(pendingPermissionStore);

  const getPending = (id = '') => {
    const pendingId = trim(id);
    return pendingId && store.get ? store.get(pendingId) : null;
  };

  const getRuntime = () => {
    const runtime = typeof createRuntime === 'function' ? createRuntime() : createRuntime;
    return isPlainObject(runtime) ? runtime : {};
  };

  const commitChatEmitPendingPermission = async (options = {}) => {
    const opts = isPlainObject(options) ? options : { id: options };
    const id = trim(opts.id || opts.pendingPermissionId);
    const pending = getPending(id);
    if (!pending) return buildBlockedResult({ id, reason: 'pending_permission_not_found' });
    if (!trim(pending.toolName).startsWith(CHAT_EMIT_PREFIX)) {
      return buildBlockedResult({ id, reason: 'not_chat_emit_tool', pending });
    }
    if (pending.resumeStatus !== 'succeeded') {
      return buildBlockedResult({ id, reason: `resume_not_succeeded:${pending.resumeStatus || 'idle'}`, pending });
    }
    if (pending.commitStatus === 'committed') {
      return buildBlockedResult({ id, reason: 'already_committed', pending });
    }
    if (typeof commitChatEmitContract !== 'function') {
      return buildBlockedResult({ id, reason: 'commit_adapter_not_configured', pending });
    }

    const contract = readCommitContract(pending);
    store.markCommit?.(id, { status: 'running' });
    try {
      const runtime = getRuntime();
      const commit = await commitChatEmitContract({
        contract,
        runtime,
        confirmed: opts.confirmed === true,
      });
      const status = normalizeCommitStatus(commit?.status);
      const message = formatReason(commit?.reason || commit?.errorMessage, {
        pending,
        result: commit,
      });
      const storedCommit = {
        ...commit,
        ...(message ? { displayMessage: message } : {}),
      };
      const nextPending = store.markCommit?.(id, {
        status,
        result: storedCommit,
        errorMessage: okCommitStatus(status) ? '' : (message || commit?.reason || commit?.errorMessage || ''),
      }) || getPending(id);
      if (typeof onCommitFinished === 'function') {
        await onCommitFinished({ commit: storedCommit, pending: nextPending, runtime });
      }
      return {
        ok: okCommitStatus(status),
        status,
        message,
        pendingPermissionId: id,
        pending: nextPending,
        contract,
        commit: storedCommit,
        writesChat: storedCommit?.writesChat === true,
      };
    } catch (err) {
      const message = trim(err?.message || err, 'chat emit commit failed');
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

  const undoChatEmitPendingCommit = async (options = {}) => {
    const opts = isPlainObject(options) ? options : { id: options };
    const id = trim(opts.id || opts.pendingPermissionId);
    const pending = getPending(id);
    if (!pending) return buildBlockedResult({ id, reason: 'pending_permission_not_found' });
    if (pending.commitStatus !== 'committed' || !isPlainObject(pending.commitResult)) {
      return buildBlockedResult({ id, reason: `commit_not_undoable:${pending.commitStatus || 'idle'}`, pending });
    }
    if (pending.commitUndoStatus === 'undone') {
      return buildBlockedResult({ id, reason: 'already_undone', pending });
    }
    if (typeof undoChatEmitCommit !== 'function') {
      return buildBlockedResult({ id, reason: 'undo_adapter_not_configured', pending });
    }

    store.markCommitUndo?.(id, { status: 'running' });
    try {
      const runtime = getRuntime();
      const undo = await undoChatEmitCommit({
        commitResult: pending.commitResult,
        runtime,
        confirmed: opts.confirmed === true,
      });
      const status = okUndoStatus(undo?.status) ? undo.status : normalizeCommitStatus(undo?.status);
      const message = formatReason(undo?.reason || undo?.errorMessage, {
        pending,
        result: undo,
      });
      const storedUndo = {
        ...undo,
        ...(message ? { displayMessage: message } : {}),
      };
      const nextPending = store.markCommitUndo?.(id, {
        status,
        result: storedUndo,
        errorMessage: okUndoStatus(status) ? '' : (message || undo?.reason || undo?.errorMessage || ''),
      }) || getPending(id);
      if (typeof onUndoFinished === 'function') {
        await onUndoFinished({ undo: storedUndo, pending: nextPending, runtime });
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
      const message = trim(err?.message || err, 'chat emit commit undo failed');
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
    commitChatEmitPendingPermission,
    undoChatEmitPendingCommit,
  };
};
