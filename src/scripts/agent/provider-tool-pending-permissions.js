import { AGENT_PERMISSION_DECISIONS } from './agent-permissions.js';
import {
  PROVIDER_TOOL_PERMISSION_ACTIONS,
  normalizeProviderToolPermissionAction,
} from './provider-tool-permission-actions.js';

export const PROVIDER_TOOL_PENDING_PERMISSION_STATUSES = Object.freeze({
  pending: 'pending',
  allowed: 'allowed',
  denied: 'denied',
  expired: 'expired',
  cancelled: 'cancelled',
});

export const PROVIDER_TOOL_PENDING_PERMISSION_RESUME_CONTRACT = Object.freeze({
  mode: 'single_tool_call_only',
  replayChat: false,
  writesChat: false,
  runsProvider: false,
  requiresSessionGate: true,
});

export const PROVIDER_TOOL_PENDING_PERMISSION_RESUME_STATUSES = Object.freeze({
  idle: 'idle',
  running: 'running',
  succeeded: 'succeeded',
  failed: 'failed',
  blocked: 'blocked',
  cancelled: 'cancelled',
});

export const PROVIDER_TOOL_PENDING_PERMISSION_CONTINUATION_STATUSES = Object.freeze({
  idle: 'idle',
  ready: 'ready',
  succeeded: 'succeeded',
  skipped: 'skipped',
  blocked: 'blocked',
  failed: 'failed',
});

export const PROVIDER_TOOL_PENDING_PERMISSION_COMMIT_STATUSES = Object.freeze({
  idle: 'idle',
  running: 'running',
  committed: 'committed',
  skipped: 'skipped',
  blocked: 'blocked',
  failed: 'failed',
  undone: 'undone',
});

export const PROVIDER_TOOL_PENDING_PERMISSION_COMMIT_UNDO_STATUSES = Object.freeze({
  idle: 'idle',
  running: 'running',
  undone: 'undone',
  skipped: 'skipped',
  blocked: 'blocked',
  failed: 'failed',
});

const STATUS_SET = new Set(Object.values(PROVIDER_TOOL_PENDING_PERMISSION_STATUSES));
const RESUME_STATUS_SET = new Set(Object.values(PROVIDER_TOOL_PENDING_PERMISSION_RESUME_STATUSES));
const CONTINUATION_STATUS_SET = new Set(Object.values(PROVIDER_TOOL_PENDING_PERMISSION_CONTINUATION_STATUSES));
const COMMIT_STATUS_SET = new Set(Object.values(PROVIDER_TOOL_PENDING_PERMISSION_COMMIT_STATUSES));
const COMMIT_UNDO_STATUS_SET = new Set(Object.values(PROVIDER_TOOL_PENDING_PERMISSION_COMMIT_UNDO_STATUSES));

const isPlainObject = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));

const trim = (value, fallback = '') => {
  const text = String(value ?? '').trim();
  return text || fallback;
};

const clone = (value) => {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return Array.isArray(value) ? value.slice() : { ...value };
  }
};

const list = value => (Array.isArray(value) ? value : [value])
  .map(item => trim(item))
  .filter(Boolean);

const toFiniteNumber = (value, fallback = 0) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const normalizeStatus = (value = '', fallback = PROVIDER_TOOL_PENDING_PERMISSION_STATUSES.pending) => {
  const status = trim(value, fallback).toLowerCase();
  return STATUS_SET.has(status) ? status : fallback;
};

const normalizeResumeStatus = (value = '', fallback = PROVIDER_TOOL_PENDING_PERMISSION_RESUME_STATUSES.idle) => {
  const status = trim(value, fallback).toLowerCase();
  return RESUME_STATUS_SET.has(status) ? status : fallback;
};

const normalizeContinuationStatus = (
  value = '',
  fallback = PROVIDER_TOOL_PENDING_PERMISSION_CONTINUATION_STATUSES.idle,
) => {
  const status = trim(value, fallback).toLowerCase();
  return CONTINUATION_STATUS_SET.has(status) ? status : fallback;
};

const normalizeCommitStatus = (
  value = '',
  fallback = PROVIDER_TOOL_PENDING_PERMISSION_COMMIT_STATUSES.idle,
) => {
  const status = trim(value, fallback).toLowerCase();
  return COMMIT_STATUS_SET.has(status) ? status : fallback;
};

const normalizeCommitUndoStatus = (
  value = '',
  fallback = PROVIDER_TOOL_PENDING_PERMISSION_COMMIT_UNDO_STATUSES.idle,
) => {
  const status = trim(value, fallback).toLowerCase();
  return COMMIT_UNDO_STATUS_SET.has(status) ? status : fallback;
};

const readToolCall = (entry = {}) => (isPlainObject(entry.toolCall) ? entry.toolCall : {});

const buildRequestSnapshot = (entry = {}, normalized = {}) => ({
  toolName: normalized.toolName,
  permissions: normalized.permissions.slice(),
  argsPreview: clone(normalized.argsPreview),
  checks: clone(normalized.checks),
  riskLevel: normalized.riskLevel,
  source: normalized.source,
  interaction: clone(normalized.interaction),
});

export const buildProviderToolPendingPermissionId = ({
  sessionId = '',
  requestId = '',
  toolCallId = '',
} = {}) => {
  const parts = [
    trim(sessionId, 'session'),
    trim(requestId, 'request'),
    trim(toolCallId, 'tool'),
  ].map(part => part.replace(/\s+/g, '_'));
  return `provider-tool-permission:${parts.join(':')}`;
};

export const normalizeProviderToolPendingPermission = (entry = {}, {
  now = Date.now,
  ttlMs = 5 * 60 * 1000,
} = {}) => {
  const src = isPlainObject(entry) ? entry : {};
  const toolCall = readToolCall(src);
  const interaction = isPlainObject(src.interaction)
    ? clone(src.interaction)
    : (isPlainObject(src.request?.interaction) ? clone(src.request.interaction) : null);
  const createdAt = toFiniteNumber(src.createdAt, toFiniteNumber(now?.(), Date.now()));
  const updatedAt = toFiniteNumber(src.updatedAt, createdAt);
  const requestId = trim(src.requestId || src.streamId || src.generationId);
  const sessionId = trim(src.sessionId || toolCall.sessionId || interaction?.sessionId);
  const toolCallId = trim(src.toolCallId || toolCall.toolCallId || toolCall.id);
  const toolName = trim(src.toolName || toolCall.toolName || toolCall.name || src.request?.toolName);
  const permissions = list(src.permissions?.length ? src.permissions : src.request?.permissions);
  const normalized = {
    id: trim(src.id, buildProviderToolPendingPermissionId({ sessionId, requestId, toolCallId })),
    status: normalizeStatus(src.status),
    action: trim(src.action),
    decision: trim(src.decision, AGENT_PERMISSION_DECISIONS.ask),
    remember: src.remember === true,
    sessionId,
    requestId,
    toolCallId,
    toolName,
    permissions,
    riskLevel: trim(src.riskLevel || src.request?.riskLevel, 'low'),
    argsPreview: clone(src.argsPreview ?? src.request?.argsPreview ?? toolCall.arguments ?? {}),
    checks: clone(Array.isArray(src.checks) ? src.checks : (Array.isArray(src.request?.checks) ? src.request.checks : [])),
    interaction,
    createdAt,
    updatedAt,
    expiresAt: toFiniteNumber(src.expiresAt, createdAt + Math.max(0, Number(ttlMs) || 0)),
    resolvedAt: toFiniteNumber(src.resolvedAt, 0),
    source: trim(src.source || toolCall.source || src.request?.source, 'provider-tool-permission'),
    reason: trim(src.reason),
    resumeContract: {
      ...PROVIDER_TOOL_PENDING_PERMISSION_RESUME_CONTRACT,
      ...(isPlainObject(src.resumeContract) ? clone(src.resumeContract) : {}),
    },
    resumeStatus: normalizeResumeStatus(src.resumeStatus),
    resumeAttempt: Math.max(0, Math.trunc(Number(src.resumeAttempt || 0)) || 0),
    resumeStartedAt: toFiniteNumber(src.resumeStartedAt, 0),
    resumeFinishedAt: toFiniteNumber(src.resumeFinishedAt, 0),
    resumeResult: clone(src.resumeResult ?? null),
    resumeParts: clone(Array.isArray(src.resumeParts) ? src.resumeParts : []),
    resumeErrorMessage: trim(src.resumeErrorMessage),
    continuationStatus: normalizeContinuationStatus(src.continuationStatus),
    continuationAttempt: Math.max(0, Math.trunc(Number(src.continuationAttempt || 0)) || 0),
    continuationFinishedAt: toFiniteNumber(src.continuationFinishedAt, 0),
    continuationResult: clone(src.continuationResult ?? null),
    continuationParts: clone(Array.isArray(src.continuationParts) ? src.continuationParts : []),
    continuationErrorMessage: trim(src.continuationErrorMessage),
    commitStatus: normalizeCommitStatus(src.commitStatus),
    commitAttempt: Math.max(0, Math.trunc(Number(src.commitAttempt || 0)) || 0),
    commitStartedAt: toFiniteNumber(src.commitStartedAt, 0),
    commitFinishedAt: toFiniteNumber(src.commitFinishedAt, 0),
    commitResult: clone(src.commitResult ?? null),
    commitErrorMessage: trim(src.commitErrorMessage),
    commitUndoStatus: normalizeCommitUndoStatus(src.commitUndoStatus),
    commitUndoAttempt: Math.max(0, Math.trunc(Number(src.commitUndoAttempt || 0)) || 0),
    commitUndoStartedAt: toFiniteNumber(src.commitUndoStartedAt, 0),
    commitUndoFinishedAt: toFiniteNumber(src.commitUndoFinishedAt, 0),
    commitUndoResult: clone(src.commitUndoResult ?? null),
    commitUndoErrorMessage: trim(src.commitUndoErrorMessage),
    toolCall: clone(toolCall),
  };
  normalized.request = isPlainObject(src.request)
    ? {
        ...buildRequestSnapshot(src.request, normalized),
        ...clone(src.request),
        interaction: clone(normalized.interaction),
      }
    : buildRequestSnapshot(src, normalized);
  return normalized;
};

export const createProviderToolPendingPermissionStore = ({
  now = Date.now,
  ttlMs = 5 * 60 * 1000,
  maxEntries = 100,
} = {}) => {
  const entries = new Map();
  const continuationContexts = new Map();
  const readNow = () => toFiniteNumber(now?.(), Date.now());

  const prune = () => {
    const limit = Math.max(1, Math.trunc(Number(maxEntries)) || 100);
    while (entries.size > limit) {
      const firstKey = entries.keys().next().value;
      if (!firstKey) break;
      entries.delete(firstKey);
      continuationContexts.delete(firstKey);
    }
  };

  const expire = (at = readNow()) => {
    const expired = [];
    entries.forEach((entry, id) => {
      if (entry.status !== PROVIDER_TOOL_PENDING_PERMISSION_STATUSES.pending) return;
      if (!entry.expiresAt || entry.expiresAt > at) return;
      const next = {
        ...entry,
        status: PROVIDER_TOOL_PENDING_PERMISSION_STATUSES.expired,
        decision: AGENT_PERMISSION_DECISIONS.deny,
        action: PROVIDER_TOOL_PERMISSION_ACTIONS.deny,
        reason: entry.reason || 'permission request expired',
        updatedAt: at,
        resolvedAt: at,
      };
      entries.set(id, next);
      continuationContexts.delete(id);
      expired.push(clone(next));
    });
    return expired;
  };

  const add = (request = {}) => {
    expire();
    const sourceToolCall = isPlainObject(request?.toolCall) ? request.toolCall : {};
    const providerContinuation = isPlainObject(sourceToolCall.providerContinuation)
      ? clone(sourceToolCall.providerContinuation)
      : null;
    const { providerContinuation: _providerContinuation, ...publicToolCall } = sourceToolCall;
    const normalized = normalizeProviderToolPendingPermission({
      ...request,
      toolCall: publicToolCall,
    }, { now, ttlMs });
    const previous = entries.get(normalized.id);
    const entry = previous?.status === PROVIDER_TOOL_PENDING_PERMISSION_STATUSES.pending
      ? {
          ...normalized,
          createdAt: previous.createdAt,
          updatedAt: readNow(),
        }
      : normalized;
    entries.set(entry.id, entry);
    if (isPlainObject(request.continuationContext) || providerContinuation) {
      continuationContexts.set(entry.id, clone({
        ...(isPlainObject(request.continuationContext) ? request.continuationContext : {}),
        ...(providerContinuation ? { providerContinuation } : {}),
      }));
    }
    prune();
    return clone(entry);
  };

  const get = (id = '') => {
    expire();
    const entry = entries.get(trim(id));
    return entry ? clone(entry) : null;
  };

  const listEntries = (options = {}) => {
    expire();
    const opts = isPlainObject(options) ? options : {};
    const status = trim(opts.status);
    const sessionId = trim(opts.sessionId);
    const limit = Math.max(0, Math.trunc(Number(opts.limit || entries.size)) || entries.size);
    return Array.from(entries.values())
      .filter(entry => (!status || entry.status === status))
      .filter(entry => (!sessionId || entry.sessionId === sessionId))
      .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0))
      .slice(0, limit)
      .map(clone);
  };

  const resolve = (id = '', action = PROVIDER_TOOL_PERMISSION_ACTIONS.deny, options = {}) => {
    expire();
    const key = trim(id);
    const current = entries.get(key);
    if (!current) return null;
    if (current.status !== PROVIDER_TOOL_PENDING_PERMISSION_STATUSES.pending) return clone(current);
    const resolvedAt = toFiniteNumber(options?.now, readNow());
    const normalizedAction = normalizeProviderToolPermissionAction(action, PROVIDER_TOOL_PERMISSION_ACTIONS.deny);
    const allowed = normalizedAction === PROVIDER_TOOL_PERMISSION_ACTIONS.allowOnce ||
      normalizedAction === PROVIDER_TOOL_PERMISSION_ACTIONS.rememberAllow;
    const next = {
      ...current,
      status: allowed
        ? PROVIDER_TOOL_PENDING_PERMISSION_STATUSES.allowed
        : PROVIDER_TOOL_PENDING_PERMISSION_STATUSES.denied,
      action: normalizedAction,
      decision: allowed ? AGENT_PERMISSION_DECISIONS.allow : AGENT_PERMISSION_DECISIONS.deny,
      remember: normalizedAction === PROVIDER_TOOL_PERMISSION_ACTIONS.rememberAllow,
      reason: trim(options?.reason, allowed ? 'permission allowed' : 'permission denied'),
      updatedAt: resolvedAt,
      resolvedAt,
    };
    entries.set(key, next);
    if (!allowed) continuationContexts.delete(key);
    return clone(next);
  };

  const markResume = (id = '', resume = {}) => {
    expire();
    const key = trim(id);
    const current = entries.get(key);
    if (!current) return null;
    const src = isPlainObject(resume) ? resume : {};
    const at = toFiniteNumber(src.now, readNow());
    const status = normalizeResumeStatus(src.status, current.resumeStatus);
    const terminal = status === PROVIDER_TOOL_PENDING_PERMISSION_RESUME_STATUSES.succeeded ||
      status === PROVIDER_TOOL_PENDING_PERMISSION_RESUME_STATUSES.failed ||
      status === PROVIDER_TOOL_PENDING_PERMISSION_RESUME_STATUSES.blocked ||
      status === PROVIDER_TOOL_PENDING_PERMISSION_RESUME_STATUSES.cancelled;
    const next = {
      ...current,
      resumeStatus: status,
      resumeAttempt: status === PROVIDER_TOOL_PENDING_PERMISSION_RESUME_STATUSES.running
        ? Number(current.resumeAttempt || 0) + 1
        : Number(current.resumeAttempt || 0),
      resumeStartedAt: status === PROVIDER_TOOL_PENDING_PERMISSION_RESUME_STATUSES.running
        ? at
        : Number(current.resumeStartedAt || 0),
      resumeFinishedAt: terminal ? at : Number(current.resumeFinishedAt || 0),
      resumeResult: src.result !== undefined ? clone(src.result) : current.resumeResult,
      resumeParts: Array.isArray(src.parts) ? clone(src.parts) : current.resumeParts,
      resumeErrorMessage: trim(src.errorMessage, current.resumeErrorMessage),
      updatedAt: at,
    };
    entries.set(key, next);
    return clone(next);
  };

  const markContinuation = (id = '', continuation = {}) => {
    expire();
    const key = trim(id);
    const current = entries.get(key);
    if (!current) return null;
    const src = isPlainObject(continuation) ? continuation : {};
    const at = toFiniteNumber(src.now, readNow());
    const status = normalizeContinuationStatus(src.status, current.continuationStatus);
    const next = {
      ...current,
      continuationStatus: status,
      continuationAttempt: status !== PROVIDER_TOOL_PENDING_PERMISSION_CONTINUATION_STATUSES.idle
        ? Number(current.continuationAttempt || 0) + 1
        : Number(current.continuationAttempt || 0),
      continuationFinishedAt: at,
      continuationResult: src.result !== undefined ? clone(src.result) : current.continuationResult,
      continuationParts: Array.isArray(src.parts) ? clone(src.parts) : current.continuationParts,
      continuationErrorMessage: trim(src.errorMessage || src.reason, current.continuationErrorMessage),
      updatedAt: at,
    };
    entries.set(key, next);
    if (status === PROVIDER_TOOL_PENDING_PERMISSION_CONTINUATION_STATUSES.succeeded) {
      continuationContexts.delete(key);
    }
    return clone(next);
  };

  const markCommit = (id = '', commit = {}) => {
    expire();
    const key = trim(id);
    const current = entries.get(key);
    if (!current) return null;
    const src = isPlainObject(commit) ? commit : {};
    const at = toFiniteNumber(src.now, readNow());
    const status = normalizeCommitStatus(src.status, current.commitStatus);
    const terminal = status === PROVIDER_TOOL_PENDING_PERMISSION_COMMIT_STATUSES.committed ||
      status === PROVIDER_TOOL_PENDING_PERMISSION_COMMIT_STATUSES.skipped ||
      status === PROVIDER_TOOL_PENDING_PERMISSION_COMMIT_STATUSES.blocked ||
      status === PROVIDER_TOOL_PENDING_PERMISSION_COMMIT_STATUSES.failed ||
      status === PROVIDER_TOOL_PENDING_PERMISSION_COMMIT_STATUSES.undone;
    const next = {
      ...current,
      commitStatus: status,
      commitAttempt: status === PROVIDER_TOOL_PENDING_PERMISSION_COMMIT_STATUSES.running
        ? Number(current.commitAttempt || 0) + 1
        : Number(current.commitAttempt || 0),
      commitStartedAt: status === PROVIDER_TOOL_PENDING_PERMISSION_COMMIT_STATUSES.running
        ? at
        : Number(current.commitStartedAt || 0),
      commitFinishedAt: terminal ? at : Number(current.commitFinishedAt || 0),
      commitResult: src.result !== undefined ? clone(src.result) : current.commitResult,
      commitErrorMessage: trim(src.errorMessage || src.reason, current.commitErrorMessage),
      updatedAt: at,
    };
    entries.set(key, next);
    return clone(next);
  };

  const markCommitUndo = (id = '', undo = {}) => {
    expire();
    const key = trim(id);
    const current = entries.get(key);
    if (!current) return null;
    const src = isPlainObject(undo) ? undo : {};
    const at = toFiniteNumber(src.now, readNow());
    const status = normalizeCommitUndoStatus(src.status, current.commitUndoStatus);
    const terminal = status === PROVIDER_TOOL_PENDING_PERMISSION_COMMIT_UNDO_STATUSES.undone ||
      status === PROVIDER_TOOL_PENDING_PERMISSION_COMMIT_UNDO_STATUSES.skipped ||
      status === PROVIDER_TOOL_PENDING_PERMISSION_COMMIT_UNDO_STATUSES.blocked ||
      status === PROVIDER_TOOL_PENDING_PERMISSION_COMMIT_UNDO_STATUSES.failed;
    const next = {
      ...current,
      commitStatus: status === PROVIDER_TOOL_PENDING_PERMISSION_COMMIT_UNDO_STATUSES.undone
        ? PROVIDER_TOOL_PENDING_PERMISSION_COMMIT_STATUSES.undone
        : current.commitStatus,
      commitUndoStatus: status,
      commitUndoAttempt: status === PROVIDER_TOOL_PENDING_PERMISSION_COMMIT_UNDO_STATUSES.running
        ? Number(current.commitUndoAttempt || 0) + 1
        : Number(current.commitUndoAttempt || 0),
      commitUndoStartedAt: status === PROVIDER_TOOL_PENDING_PERMISSION_COMMIT_UNDO_STATUSES.running
        ? at
        : Number(current.commitUndoStartedAt || 0),
      commitUndoFinishedAt: terminal ? at : Number(current.commitUndoFinishedAt || 0),
      commitUndoResult: src.result !== undefined ? clone(src.result) : current.commitUndoResult,
      commitUndoErrorMessage: trim(src.errorMessage || src.reason, current.commitUndoErrorMessage),
      updatedAt: at,
    };
    entries.set(key, next);
    return clone(next);
  };

  const clear = () => {
    const count = entries.size;
    entries.clear();
    continuationContexts.clear();
    return { count };
  };

  const getStats = () => {
    expire();
    const stats = {
      total: entries.size,
      pending: 0,
      allowed: 0,
      denied: 0,
      expired: 0,
      cancelled: 0,
    };
    entries.forEach((entry) => {
      if (Object.prototype.hasOwnProperty.call(stats, entry.status)) stats[entry.status] += 1;
    });
    return stats;
  };

  return {
    add,
    clear,
    expire,
    get,
    getContinuationContext: (id = '') => {
      expire();
      const context = continuationContexts.get(trim(id));
      return context ? clone(context) : null;
    },
    getStats,
    list: listEntries,
    markCommit,
    markCommitUndo,
    markContinuation,
    markResume,
    resolve,
  };
};
