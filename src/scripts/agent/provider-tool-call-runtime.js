import {
  buildProviderToolCallMessagePart,
  buildProviderToolPermissionRequestPart,
  buildProviderToolResultMessagePart,
  normalizeProviderToolCall,
} from './provider-tool-call-parts.js';
import {
  PROVIDER_TOOL_PERMISSION_INTERACTION_MODES,
  buildProviderToolPermissionInteraction,
} from './provider-tool-permission-interaction.js';
import { createProviderToolLoopGuard } from './provider-tool-loop-guard.js';

const isPlainObject = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));

const trim = (value, fallback = '') => {
  const text = String(value ?? '').trim();
  return text || fallback;
};

const normalizeErrorMessage = error => trim(error?.message || error, 'provider tool call failed');

export const createProviderToolCallRuntime = ({
  toolRegistry = null,
  loopGuard = createProviderToolLoopGuard(),
  pendingPermissionStore = null,
  now = Date.now,
  logger = console,
} = {}) => {
  const executeToolCall = async (toolCall = {}, context = {}) => {
    const normalized = normalizeProviderToolCall(toolCall, {
      provider: context.provider,
      model: context.model,
      runId: context.runId,
      stepId: context.stepId,
      sessionId: context.sessionId,
      now,
    });
    const parts = [buildProviderToolCallMessagePart(normalized, { now })];

    if (!toolRegistry || typeof toolRegistry.executeTool !== 'function') {
      const errorMessage = 'provider tool registry not configured';
      parts.push(buildProviderToolResultMessagePart({
        toolCall: normalized,
        status: 'failed',
        summary: errorMessage,
        errorMessage,
        now,
      }));
      return {
        ok: false,
        status: 'failed',
        toolCall: normalized,
        errorMessage,
        parts,
      };
    }

    const loop = loopGuard?.record?.(normalized) || { allowed: true };
    if (!loop.allowed) {
      const errorMessage = loop.reason || 'repeated provider tool call blocked';
      parts.push(buildProviderToolResultMessagePart({
        toolCall: normalized,
        status: 'failed',
        summary: errorMessage,
        errorMessage,
        now,
      }));
      return {
        ok: false,
        status: 'blocked',
        toolCall: normalized,
        loop,
        errorMessage,
        parts,
      };
    }

    const requestPermission = async (request = {}) => {
      const interaction = buildProviderToolPermissionInteraction(request, {
        sessionId: normalized.sessionId,
        sessionGate: context.providerToolSessionGate,
        promptPermission: context.promptPermission === true,
        source: context.source || normalized.source,
        timeoutMs: context.permissionTimeoutMs,
      });
      const pending = interaction.mode === PROVIDER_TOOL_PERMISSION_INTERACTION_MODES.deferredMessagePart &&
        typeof pendingPermissionStore?.add === 'function'
        ? pendingPermissionStore.add({
            ...request,
            requestId: context.requestId,
            sessionId: normalized.sessionId,
            source: context.source || normalized.source,
            toolCall: normalized,
            interaction,
            continuationContext: isPlainObject(context.providerContinuationContext)
              ? context.providerContinuationContext
              : null,
          })
        : null;
      parts.push(buildProviderToolPermissionRequestPart({
        toolCall: normalized,
        permissions: request.permissions,
        riskLevel: request.riskLevel,
        checks: request.checks,
        decision: 'ask',
        interaction,
        pendingPermissionId: pending?.id,
        requestId: context.requestId,
        now,
      }));
      if (typeof context.requestPermission === 'function') {
        const requested = await context.requestPermission({
          ...request,
          interaction,
        });
        const completedRequest = isPlainObject(requested) && !isPlainObject(requested.interaction)
          ? { ...requested, interaction }
          : requested;
        const decision = typeof completedRequest === 'string'
          ? completedRequest
          : trim(completedRequest?.decision);
        if (pending?.id && (decision === 'allow' || decision === 'deny')) {
          pendingPermissionStore.resolve(
            pending.id,
            decision === 'allow' ? trim(completedRequest?.action, 'allow_once') : 'deny',
            { reason: 'permission callback resolved' },
          );
        }
        return completedRequest;
      }
      return { decision: 'ask', action: 'deferred', interaction };
    };

    try {
      const output = await toolRegistry.executeTool(normalized.toolName, normalized.arguments, {
        ...context,
        provider: normalized.provider,
        model: normalized.model,
        sessionId: normalized.sessionId,
        requestPermission,
      });
      parts.push(buildProviderToolResultMessagePart({
        toolCall: normalized,
        result: isPlainObject(output) ? output.result ?? output : output,
        status: output?.status || 'succeeded',
        summary: output?.summary,
        now,
      }));
      return {
        ok: true,
        status: 'succeeded',
        toolCall: normalized,
        output,
        parts,
      };
    } catch (err) {
      const errorMessage = normalizeErrorMessage(err);
      parts.push(buildProviderToolResultMessagePart({
        toolCall: normalized,
        status: err?.name === 'AbortError' ? 'cancelled' : 'failed',
        summary: errorMessage,
        errorMessage,
        now,
      }));
      logger?.warn?.('provider tool call failed', normalized.toolName, err);
      return {
        ok: false,
        status: err?.name === 'AbortError' ? 'cancelled' : 'failed',
        toolCall: normalized,
        error: err,
        errorMessage,
        parts,
      };
    }
  };

  return {
    executeToolCall,
    getLoopGuardSnapshot: () => loopGuard?.getSnapshot?.() || [],
    clearLoopGuard: () => loopGuard?.clear?.(),
  };
};
