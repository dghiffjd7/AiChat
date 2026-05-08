import {
  emitLifecycleTraceEvent,
  normalizeLifecycleTraceDetails,
  normalizeLifecycleTraceText,
} from './lifecycle-trace-utils.js';

export const buildHookLifecycleTraceEvent = ({
  phase = '',
  hookName = '',
  runtimeLabel = '',
  sessionId = '',
  messageId = '',
  status = 'info',
  summary = '',
  details = {},
} = {}) => ({
  category: 'plugin-hooks',
  source: 'hook-lifecycle',
  phase: normalizeLifecycleTraceText(phase, 'event'),
  hookName: normalizeLifecycleTraceText(hookName, ''),
  runtimeLabel: normalizeLifecycleTraceText(runtimeLabel, ''),
  sessionId: normalizeLifecycleTraceText(sessionId, ''),
  messageId: normalizeLifecycleTraceText(messageId, ''),
  status: normalizeLifecycleTraceText(status, 'info'),
  summary: normalizeLifecycleTraceText(summary, ''),
  details: normalizeLifecycleTraceDetails(details),
});

export const emitHookLifecycleTrace = (recordTraceEvent, event) => {
  emitLifecycleTraceEvent(recordTraceEvent, buildHookLifecycleTraceEvent(event));
};
