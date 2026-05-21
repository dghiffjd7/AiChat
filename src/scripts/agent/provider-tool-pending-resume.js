import { AGENT_PERMISSION_DECISIONS } from './agent-permissions.js';
import {
  buildProviderToolCallMessagePart,
  buildProviderToolResultMessagePart,
  normalizeProviderToolCall,
} from './provider-tool-call-parts.js';
import {
  PROVIDER_TOOL_PENDING_PERMISSION_RESUME_STATUSES,
  PROVIDER_TOOL_PENDING_PERMISSION_STATUSES,
} from './provider-tool-pending-permissions.js';
import { PROVIDER_TOOL_PERMISSION_ACTIONS } from './provider-tool-permission-actions.js';

const isPlainObject = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));

const trim = (value, fallback = '') => {
  const text = String(value ?? '').trim();
  return text || fallback;
};

const list = value => (Array.isArray(value) ? value : [value])
  .map(item => trim(item))
  .filter(Boolean);

const normalizeErrorMessage = error => trim(error?.message || error, 'provider tool pending resume failed');

const buildBlockedResult = ({
  pending = null,
  status = PROVIDER_TOOL_PENDING_PERMISSION_RESUME_STATUSES.blocked,
  reason = '',
  now = Date.now,
} = {}) => ({
  ok: false,
  status,
  reason: trim(reason, 'provider tool pending resume blocked'),
  pending,
  output: null,
  parts: [],
  resumed: false,
  replayChat: false,
  writesChat: false,
  runsProvider: false,
  createdAt: Number(now?.() || Date.now()) || Date.now(),
});

const requestMatchesPending = (request = {}, pending = {}) => {
  const requestedToolName = trim(request.toolName);
  if (requestedToolName && requestedToolName !== pending.toolName) return false;
  const pendingPermissions = new Set(list(pending.permissions));
  const requestedPermissions = list(request.permissions);
  if (!requestedPermissions.length) return true;
  if (!pendingPermissions.size) return false;
  return requestedPermissions.every(permission => pendingPermissions.has(permission));
};

export const createProviderToolPendingResumeExecutor = ({
  toolRegistry = null,
  pendingPermissionStore = null,
  readSessionGate = null,
  now = Date.now,
  logger = console,
} = {}) => {
  const markResume = (id, resume = {}) => (
    typeof pendingPermissionStore?.markResume === 'function'
      ? pendingPermissionStore.markResume(id, resume)
      : null
  );

  const resume = async (id = '', options = {}) => {
    const opts = isPlainObject(options) ? options : {};
    const pendingId = trim(id || opts.id || opts.pendingPermissionId);
    const pending = typeof pendingPermissionStore?.get === 'function'
      ? pendingPermissionStore.get(pendingId)
      : null;
    if (!pending) {
      return buildBlockedResult({
        status: PROVIDER_TOOL_PENDING_PERMISSION_RESUME_STATUSES.blocked,
        reason: 'pending permission not found',
        now,
      });
    }
    if (pending.status !== PROVIDER_TOOL_PENDING_PERMISSION_STATUSES.allowed ||
      pending.decision !== AGENT_PERMISSION_DECISIONS.allow) {
      return buildBlockedResult({
        pending,
        status: PROVIDER_TOOL_PENDING_PERMISSION_RESUME_STATUSES.blocked,
        reason: `pending permission is not allowed: ${pending.status}`,
        now,
      });
    }
    if (pending.resumeStatus === PROVIDER_TOOL_PENDING_PERMISSION_RESUME_STATUSES.running ||
      pending.resumeStatus === PROVIDER_TOOL_PENDING_PERMISSION_RESUME_STATUSES.succeeded) {
      return buildBlockedResult({
        pending,
        status: pending.resumeStatus,
        reason: `pending permission already ${pending.resumeStatus}`,
        now,
      });
    }
    const resumeContract = isPlainObject(pending.resumeContract) ? pending.resumeContract : {};
    if (resumeContract.mode !== 'single_tool_call_only' ||
      resumeContract.replayChat !== false ||
      resumeContract.writesChat !== false ||
      resumeContract.runsProvider !== false) {
      markResume(pending.id, {
        status: PROVIDER_TOOL_PENDING_PERMISSION_RESUME_STATUSES.blocked,
        errorMessage: 'invalid provider tool resume contract',
      });
      return buildBlockedResult({
        pending,
        status: PROVIDER_TOOL_PENDING_PERMISSION_RESUME_STATUSES.blocked,
        reason: 'invalid provider tool resume contract',
        now,
      });
    }
    const sessionGate = typeof readSessionGate === 'function'
      ? readSessionGate(pending.sessionId)
      : null;
    if (resumeContract.requiresSessionGate !== false && sessionGate?.enabled !== true) {
      const blocked = markResume(pending.id, {
        status: PROVIDER_TOOL_PENDING_PERMISSION_RESUME_STATUSES.blocked,
        errorMessage: 'provider tool session gate is disabled',
      }) || pending;
      return buildBlockedResult({
        pending: blocked,
        status: PROVIDER_TOOL_PENDING_PERMISSION_RESUME_STATUSES.blocked,
        reason: 'provider tool session gate is disabled',
        now,
      });
    }
    if (!toolRegistry || typeof toolRegistry.executeTool !== 'function') {
      const blocked = markResume(pending.id, {
        status: PROVIDER_TOOL_PENDING_PERMISSION_RESUME_STATUSES.blocked,
        errorMessage: 'provider tool registry not configured',
      }) || pending;
      return buildBlockedResult({
        pending: blocked,
        status: PROVIDER_TOOL_PENDING_PERMISSION_RESUME_STATUSES.blocked,
        reason: 'provider tool registry not configured',
        now,
      });
    }

    const toolCall = normalizeProviderToolCall(pending.toolCall || {}, {
      provider: opts.provider || pending.toolCall?.provider,
      model: opts.model || pending.toolCall?.model,
      sessionId: pending.sessionId,
      source: 'provider-tool-pending-resume',
      now,
    });
    const parts = [
      buildProviderToolCallMessagePart({
        ...toolCall,
        status: 'running',
        summary: 'resuming approved provider tool call',
      }, { now }),
    ];
    const running = markResume(pending.id, {
      status: PROVIDER_TOOL_PENDING_PERMISSION_RESUME_STATUSES.running,
    }) || pending;

    const requestPermission = async (request = {}) => {
      if (!requestMatchesPending(request, pending)) {
        return {
          decision: AGENT_PERMISSION_DECISIONS.deny,
          action: PROVIDER_TOOL_PERMISSION_ACTIONS.deny,
          reason: 'permission request does not match pending tool call',
        };
      }
      return {
        decision: AGENT_PERMISSION_DECISIONS.allow,
        action: pending.action || PROVIDER_TOOL_PERMISSION_ACTIONS.allowOnce,
        request,
        pendingPermissionId: pending.id,
      };
    };

    try {
      const output = await toolRegistry.executeTool(toolCall.toolName, toolCall.arguments, {
        ...opts,
        provider: toolCall.provider,
        model: toolCall.model,
        sessionId: pending.sessionId,
        source: pending.source || 'provider-tool-pending-resume',
        requestId: pending.requestId,
        resumeContract,
        providerToolSessionGate: sessionGate,
        requestPermission,
        emit: null,
      });
      parts.push(buildProviderToolResultMessagePart({
        toolCall,
        result: isPlainObject(output) ? output.result ?? output : output,
        status: output?.status || 'succeeded',
        summary: output?.summary,
        now,
      }));
      const completed = markResume(pending.id, {
        status: PROVIDER_TOOL_PENDING_PERMISSION_RESUME_STATUSES.succeeded,
        result: {
          output,
          partCount: parts.length,
        },
        parts,
      }) || running;
      return {
        ok: true,
        status: PROVIDER_TOOL_PENDING_PERMISSION_RESUME_STATUSES.succeeded,
        pending: completed,
        output,
        parts,
        resumed: true,
        replayChat: false,
        writesChat: false,
        runsProvider: false,
        resumeContract,
      };
    } catch (err) {
      const status = err?.name === 'AbortError'
        ? PROVIDER_TOOL_PENDING_PERMISSION_RESUME_STATUSES.cancelled
        : PROVIDER_TOOL_PENDING_PERMISSION_RESUME_STATUSES.failed;
      const errorMessage = normalizeErrorMessage(err);
      parts.push(buildProviderToolResultMessagePart({
        toolCall,
        status: err?.name === 'AbortError' ? 'cancelled' : 'failed',
        summary: errorMessage,
        errorMessage,
        now,
      }));
      const failed = markResume(pending.id, {
        status,
        result: { partCount: parts.length },
        parts,
        errorMessage,
      }) || running;
      logger?.warn?.('provider tool pending resume failed', toolCall.toolName, err);
      return {
        ok: false,
        status,
        pending: failed,
        error: err,
        errorMessage,
        parts,
        resumed: false,
        replayChat: false,
        writesChat: false,
        runsProvider: false,
        resumeContract,
      };
    }
  };

  return {
    resume,
  };
};
