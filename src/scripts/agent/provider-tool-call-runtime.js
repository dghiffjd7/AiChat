import {
  buildProviderToolCallMessagePart,
  buildProviderToolPermissionRequestPart,
  buildProviderToolResultMessagePart,
  normalizeProviderToolCall,
} from './provider-tool-call-parts.js';
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
      parts.push(buildProviderToolPermissionRequestPart({
        toolCall: normalized,
        permissions: request.permissions,
        riskLevel: request.riskLevel,
        checks: request.checks,
        decision: 'ask',
        now,
      }));
      if (typeof context.requestPermission === 'function') {
        return await context.requestPermission(request);
      }
      return { decision: 'ask' };
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
