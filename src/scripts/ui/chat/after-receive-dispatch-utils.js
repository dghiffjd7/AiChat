import {
  buildAfterReceiveHookFinishTraceEvent,
  buildAfterReceiveHookStartTraceEvent,
  emitHookLifecycleTrace,
} from './hook-lifecycle-trace-utils.js';
import { mergeAgentMessageParts } from '../../agent/agent-message-parts.js';
import {
  buildChatFormatRepairCandidate,
  extractChatFormatEventDrafts,
} from './chat-format-guardian-utils.js';

const CHAT_FORMAT_GUARDIAN_SOURCE = 'chat-format-guardian';
const CHAT_FORMAT_GUARDIAN_KIND = 'chat_format_guardian';

const isPlainObject = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));

const trim = (value, fallback = '') => {
  const text = String(value ?? '').trim();
  return text || fallback;
};

const list = value => (Array.isArray(value) ? value : []).filter(Boolean);

const toTimestamp = (now = Date.now) => {
  if (typeof now === 'function') {
    const numeric = Number(now());
    return Number.isFinite(numeric) && numeric > 0 ? numeric : Date.now();
  }
  const numeric = Number(now);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : Date.now();
};

const truncate = (value = '', maxLength = 80) => {
  const text = String(value ?? '').trim().replace(/\s+/g, ' ');
  const limit = Math.max(8, Math.trunc(Number(maxLength) || 80));
  return text.length > limit ? `${text.slice(0, limit - 1)}...` : text;
};

const countBy = (items = [], keyFn = item => item) => {
  const counts = {};
  list(items).forEach((item) => {
    const key = trim(keyFn(item), 'unknown');
    counts[key] = (counts[key] || 0) + 1;
  });
  return counts;
};

const getChatFormatGuardianStatus = (status = '') => {
  if (status === 'invalid') return 'failed';
  if (status === 'needs_review') return 'waiting_permission';
  return 'succeeded';
};

const getChatFormatGuardianTitle = (status = '') => {
  if (status === 'invalid') return '聊天格式错误';
  if (status === 'needs_review') return '聊天格式待确认';
  return '聊天格式已验证';
};

const sanitizeIdPart = (value = '', fallback = 'message') => {
  const text = trim(value, fallback)
    .replace(/[^a-zA-Z0-9:_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return text || fallback;
};

const buildChatFormatGuardianRunId = ({
  result = null,
  message = {},
  sessionId = '',
} = {}) => {
  const sourceMessageId = trim(result?.sourceMessageId || message?.id || sessionId, 'message');
  return `run:chat-format-guardian:${sanitizeIdPart(sourceMessageId)}`;
};

const resolveChatFormatGuardianSurface = (events = []) => {
  const surfaces = Array.from(new Set(list(events).map(event => trim(event?.surface)).filter(Boolean)));
  if (surfaces.length === 1) return surfaces[0];
  if (surfaces.includes('moments') && !surfaces.includes('chat')) return 'moments';
  return 'chat';
};

const buildChatFormatGuardianInputSuggestion = ({ errors = [], warnings = [] } = {}) => {
  const issues = [...errors, ...warnings].map(item => trim(item)).filter(Boolean);
  const hints = [];
  if (issues.some(issue => issue.includes('time is missing'))) hints.push('补齐每条聊天消息的时间');
  if (issues.some(issue => issue.includes('target is unresolved'))) hints.push('明确私聊对象、群名或动态目标');
  if (issues.some(issue => issue.includes('speaker is unresolved'))) hints.push('明确说话人，并使用联系人或群成员名称');
  if (issues.some(issue => issue.includes('content is required'))) hints.push('保留实际正文内容');
  if (!hints.length && issues.length) hints.push('修正格式字段与标签闭合');
  const suffix = hints.length ? `重点：${hints.join('；')}。` : '重点：只输出可解析的聊天或动态格式。';
  return `请重写上一条回复，严格遵守当前聊天/动态输出格式。${suffix}不要加入格式外说明。`;
};

const summarizeChatFormatRepairCandidate = (repairCandidate = null, { includeText = false } = {}) => {
  if (!repairCandidate?.available) return null;
  const summary = {
    available: true,
    kind: trim(repairCandidate.kind),
    title: trim(repairCandidate.title, '格式修复'),
    summary: trim(repairCandidate.summary),
    preview: truncate(repairCandidate.preview, 220),
    fallbackTime: trim(repairCandidate.fallbackTime),
    fixedWarnings: list(repairCandidate.fixedWarnings).map(item => trim(item)).filter(Boolean),
    eventCount: Math.max(0, Math.trunc(Number(repairCandidate.eventCount) || 0)),
    issueCount: Math.max(0, Math.trunc(Number(repairCandidate.issueCount) || 0)),
  };
  if (includeText) summary.replacementText = String(repairCandidate.replacementText || '');
  return summary;
};

const buildChatFormatGuardianDecisionActions = ({
  result = null,
  errors = [],
  warnings = [],
  repairCandidate = null,
  includeRepairText = false,
} = {}) => {
  const status = trim(result?.status);
  if (!status || status === 'no_events' || status === 'ready') return [];
  const inputSuggestion = buildChatFormatGuardianInputSuggestion({ errors, warnings });
  const repairSummary = summarizeChatFormatRepairCandidate(repairCandidate, { includeText: includeRepairText });
  const actions = [];
  if (repairSummary?.available) {
    actions.push({
      id: 'apply_repair',
      label: '应用修复',
      enabled: true,
      description: repairSummary.summary || '应用格式修复候选。',
      repairCandidate: repairSummary,
    });
  }
  actions.push(
    {
      id: 'swipe_retry',
      label: '重试生成',
      enabled: true,
      description: 'RP 模式会创建新的右滑候选；其他模式走现有重新生成链路。',
    },
    {
      id: 'review_original',
      label: '查看原文',
      enabled: true,
      description: '查看这次 AI 回复的原始内容。',
    },
    {
      id: 'edit_user_input_suggestion',
      label: '修改输入建议',
      enabled: true,
      description: '把一段格式修正建议放入输入框，由用户决定是否发送。',
      suggestion: inputSuggestion,
    },
    {
      id: 'open_agent_center',
      label: 'Agent Center',
      enabled: true,
      description: '在 Agent Center 活动页查看这次格式检查记录。',
    },
  );
  if (!repairSummary?.available) {
    actions.push({
      id: 'apply_repair',
      label: '应用修复',
      enabled: false,
      description: '当前问题没有安全的自动修复候选。',
    });
  }
  return actions;
};

const resolveChatFormatGuardianRepairCandidate = ({ result = null, message = {} } = {}) => {
  if (!result || result.status === 'no_events' || result.status === 'ready') return null;
  return buildChatFormatRepairCandidate(result, {
    fallbackTime: trim(result?.repairFallbackTime || message?.time),
    maxPreviewLength: 220,
  });
};

const shouldEmitChatFormatGuardianPart = (result = {}, options = {}) => {
  if (!result || result.status === 'no_events') return false;
  if (result.status === 'ready' && options.showSucceededPreview !== true) return false;
  return true;
};

export const resolveChatFormatGuardianInputText = (message = {}) => {
  const candidates = [
    ['rawOriginal', message?.rawOriginal],
    ['rawSource', message?.rawSource],
    ['raw_source', message?.raw_source],
    ['raw', message?.raw],
    ['content', message?.content],
    ['text', message?.text],
  ];
  const rawOriginalText = String(message?.rawOriginal ?? '');
  for (const [source, value] of candidates) {
    if (typeof value !== 'string') continue;
    const text = value.trim();
    if (text) {
      return {
        text,
        source,
        hasRawOriginal: Boolean(rawOriginalText.trim()),
      };
    }
  }
  return {
    text: '',
    source: '',
    hasRawOriginal: Boolean(rawOriginalText.trim()),
  };
};

export const buildChatFormatGuardianMessagePart = ({
  result = null,
  message = {},
  sessionId = '',
  showSucceededPreview = false,
  maxEvents = 5,
  maxIssues = 6,
  now = Date.now,
} = {}) => {
  if (!shouldEmitChatFormatGuardianPart(result, { showSucceededPreview })) return null;
  const events = list(result?.eventDrafts);
  const errors = list(result?.errors).map(item => trim(item)).filter(Boolean);
  const warnings = list(result?.warnings).map(item => trim(item)).filter(Boolean);
  const status = getChatFormatGuardianStatus(result?.status);
  const at = toTimestamp(now);
  const sourceMessageId = trim(result?.sourceMessageId || message?.id || sessionId, 'message');
  const runId = buildChatFormatGuardianRunId({ result, message, sessionId });
  const eventCount = events.length;
  const issueCount = errors.length + warnings.length;
  const repairCandidate = resolveChatFormatGuardianRepairCandidate({ result, message });
  const decisionActions = buildChatFormatGuardianDecisionActions({
    result,
    errors,
    warnings,
    repairCandidate,
    includeRepairText: true,
  });
  const summary = [
    `${eventCount} event draft${eventCount === 1 ? '' : 's'}`,
    `${errors.length} error${errors.length === 1 ? '' : 's'}`,
    `${warnings.length} warning${warnings.length === 1 ? '' : 's'}`,
  ].join(' · ');
  return {
    id: `chat-format-guardian:${sourceMessageId}`,
    type: 'agent_status',
    runId,
    source: CHAT_FORMAT_GUARDIAN_SOURCE,
    kind: 'chat_format.validate',
    status,
    title: getChatFormatGuardianTitle(result?.status),
    summary: result?.summary || summary,
    createdAt: at,
    updatedAt: at,
    errorMessage: status === 'failed' ? trim(errors[0]) : '',
    metadata: {
      sessionId: trim(sessionId),
      sourceMessageId,
      status: trim(result?.status),
      sourceTextKind: trim(result?.sourceTextKind),
      hasRawOriginal: result?.hasRawOriginal === true,
      repairCandidate: summarizeChatFormatRepairCandidate(repairCandidate, { includeText: true }),
      eventCount,
      issueCount,
      countsByType: countBy(events, event => event?.type),
      commitReady: result?.status === 'ready',
      decisionActions,
      inputSuggestion: decisionActions.find(action => action.id === 'edit_user_input_suggestion')?.suggestion || '',
      errors: errors.slice(0, Math.max(0, Math.trunc(Number(maxIssues) || 6))),
      warnings: warnings.slice(0, Math.max(0, Math.trunc(Number(maxIssues) || 6))),
      events: events
        .slice(0, Math.max(0, Math.trunc(Number(maxEvents) || 5)))
        .map(event => ({
          type: trim(event?.type),
          surface: trim(event?.surface),
          targetId: trim(event?.targetId),
          targetName: trim(event?.targetName),
          speakerId: trim(event?.speakerId),
          speakerName: trim(event?.speakerName),
          time: trim(event?.time),
          contentPreview: truncate(event?.content, 96),
          commitReady: list(event?.warnings).length === 0,
          warnings: list(event?.warnings).map(item => trim(item)).filter(Boolean).slice(0, 4),
        })),
    },
  };
};

export const buildChatFormatGuardianAgentRun = ({
  result = null,
  part = null,
  message = {},
  sessionId = '',
  showSucceededRun = true,
  maxEvents = 5,
  maxIssues = 6,
  now = Date.now,
} = {}) => {
  if (!result || result.status === 'no_events') return null;
  if (result.status === 'ready' && showSucceededRun !== true) return null;
  const events = list(result?.eventDrafts);
  const errors = list(result?.errors).map(item => trim(item)).filter(Boolean);
  const warnings = list(result?.warnings).map(item => trim(item)).filter(Boolean);
  const status = getChatFormatGuardianStatus(result?.status);
  const at = toTimestamp(now);
  const sourceMessageId = trim(result?.sourceMessageId || message?.id || sessionId, 'message');
  const runId = part?.runId || buildChatFormatGuardianRunId({ result, message, sessionId });
  const eventCount = events.length;
  const issueCount = errors.length + warnings.length;
  const summary = trim(result?.summary) || trim(part?.summary) || `${eventCount} event draft(s), ${errors.length} error(s), ${warnings.length} warning(s)`;
  const surface = resolveChatFormatGuardianSurface(events);
  const repairCandidate = resolveChatFormatGuardianRepairCandidate({ result, message });
  const decisionActions = buildChatFormatGuardianDecisionActions({
    result,
    errors,
    warnings,
    repairCandidate,
    includeRepairText: false,
  });
  const limitedEvents = events
    .slice(0, Math.max(0, Math.trunc(Number(maxEvents) || 5)))
    .map(event => ({
      type: trim(event?.type),
      surface: trim(event?.surface),
      targetId: trim(event?.targetId),
      targetName: trim(event?.targetName),
      speakerId: trim(event?.speakerId),
      speakerName: trim(event?.speakerName),
      time: trim(event?.time),
      contentPreview: truncate(event?.content, 96),
      warnings: list(event?.warnings).map(item => trim(item)).filter(Boolean).slice(0, 4),
    }));
  const metadata = {
    sessionId: trim(sessionId),
    sourceMessageId,
    sourceMessageRole: trim(message?.role),
    rawStatus: trim(result?.status),
    sourceTextKind: trim(result?.sourceTextKind),
    hasRawOriginal: result?.hasRawOriginal === true,
    repairCandidate: summarizeChatFormatRepairCandidate(repairCandidate, { includeText: false }),
    eventCount,
    issueCount,
    countsByType: countBy(events, event => event?.type),
    commitReady: result?.status === 'ready',
    decisionActions,
    inputSuggestion: decisionActions.find(action => action.id === 'edit_user_input_suggestion')?.suggestion || '',
    errors: errors.slice(0, Math.max(0, Math.trunc(Number(maxIssues) || 6))),
    warnings: warnings.slice(0, Math.max(0, Math.trunc(Number(maxIssues) || 6))),
    events: limitedEvents,
  };
  return {
    id: runId,
    kind: CHAT_FORMAT_GUARDIAN_KIND,
    title: getChatFormatGuardianTitle(result?.status),
    sessionId: trim(sessionId),
    surface,
    trigger: 'after_receive',
    source: CHAT_FORMAT_GUARDIAN_SOURCE,
    status,
    summary,
    errorMessage: status === 'failed' ? trim(errors[0]) : '',
    exportable: true,
    metadata,
    steps: [{
      id: `${runId}:validate`,
      runId,
      type: 'chat_format.validate',
      title: getChatFormatGuardianTitle(result?.status),
      status,
      summary,
      input: {
        sourceMessageId,
        messageRole: trim(message?.role),
        sourceTextKind: trim(result?.sourceTextKind),
        hasRawOriginal: result?.hasRawOriginal === true,
      },
      output: metadata,
      metadata: {
        eventCount,
        issueCount,
        commitReady: result?.status === 'ready',
      },
      errorMessage: status === 'failed' ? trim(errors[0]) : '',
      startedAt: at,
      updatedAt: at,
      finishedAt: status === 'waiting_permission' ? null : at,
    }],
    toolCalls: [],
    createdAt: at,
    updatedAt: at,
    finishedAt: status === 'waiting_permission' ? null : at,
  };
};

export const buildChatFormatGuardianPreviewMessage = (message = {}, part = null) => {
  if (!message || typeof message !== 'object' || !part) return null;
  const meta = isPlainObject(message.meta) ? { ...message.meta } : {};
  return {
    ...message,
    meta: {
      ...meta,
      agentMessageParts: mergeAgentMessageParts(meta.agentMessageParts, [part]),
    },
  };
};

export const runChatFormatGuardianPreview = ({
  message = null,
  sessionId = '',
  chatFormatGuardian = null,
  onChatFormatGuardianPreview = null,
  onChatFormatGuardianRun = null,
  logger = console,
  now = Date.now,
} = {}) => {
  if (!message || message.role !== 'assistant' || !chatFormatGuardian) return null;
  const options = chatFormatGuardian === true
    ? { enabled: true }
    : (isPlainObject(chatFormatGuardian) ? { ...chatFormatGuardian } : {});
  if (options.enabled === false) return null;
  const input = resolveChatFormatGuardianInputText(message);
  const text = input.text;
  if (!text) return null;
  try {
    const result = {
      ...extractChatFormatEventDrafts(text, {
        ...options,
        sourceMessageId: trim(message.id || options.sourceMessageId),
      }),
      sourceTextKind: input.source,
      hasRawOriginal: input.hasRawOriginal,
      repairFallbackTime: trim(options.repairFallbackTime || message?.time),
    };
    const part = buildChatFormatGuardianMessagePart({
      result,
      message,
      sessionId,
      showSucceededPreview: options.showSucceededPreview === true,
      maxEvents: options.maxEvents,
      maxIssues: options.maxIssues,
      now,
    });
    const patchedMessage = buildChatFormatGuardianPreviewMessage(message, part);
    const agentRun = buildChatFormatGuardianAgentRun({
      result,
      part,
      message,
      sessionId,
      showSucceededRun: options.recordSucceededRun !== false,
      maxEvents: options.maxEvents,
      maxIssues: options.maxIssues,
      now,
    });
    if (patchedMessage && typeof onChatFormatGuardianPreview === 'function') {
      onChatFormatGuardianPreview({ message, patchedMessage, result, part, agentRun, sessionId });
    }
    if (agentRun && typeof onChatFormatGuardianRun === 'function') {
      onChatFormatGuardianRun({ message, patchedMessage, result, part, agentRun, sessionId });
    }
    return { result, part, patchedMessage, agentRun };
  } catch (err) {
    logger?.warn?.('chat format guardian preview failed', err);
    return null;
  }
};

export const resolveAfterReceiveSkipScripts = (
  skipScriptsOverride,
  defaultSkipScripts = false,
) => (
  typeof skipScriptsOverride === 'boolean'
    ? skipScriptsOverride
    : Boolean(defaultSkipScripts)
);

const catchAsync = (maybePromise, onError) => {
  if (!maybePromise || typeof maybePromise.catch !== 'function') return;
  maybePromise.catch(onError);
};

export const dispatchAfterReceiveEffects = ({
  message,
  sessionId = '',
  skipScripts,
  defaultSkipScripts = false,
  scriptRuntime = null,
  pluginRuntime = null,
  logger = console,
  applyUpdateVariable,
  handleVariableRules,
  useGlobalVariables = false,
  recordTraceEvent = null,
  chatFormatGuardian = null,
  onChatFormatGuardianPreview = null,
  onChatFormatGuardianRun = null,
} = {}) => {
  if (!message || message.role !== 'assistant') return false;
  const shouldSkipScripts = resolveAfterReceiveSkipScripts(skipScripts, defaultSkipScripts);
  const payload = { message, sessionId };
  const dispatchRuntimeHook = ({ runtime = null, runtimeLabel = '' } = {}) => {
    if (!runtime) return;
    const messageId = String(message?.id || '').trim();
    emitHookLifecycleTrace(recordTraceEvent, buildAfterReceiveHookStartTraceEvent({
      runtimeLabel,
      sessionId,
      message,
    }));
    const result = runtime.dispatchEvent('message.after_receive', payload);
    catchAsync(result, err => {
      emitHookLifecycleTrace(recordTraceEvent, buildAfterReceiveHookFinishTraceEvent({
        runtimeLabel,
        sessionId,
        messageId,
        status: 'error',
        errorMessage: err?.message,
      }));
      logger?.warn?.(`${runtimeLabel} message.after_receive failed`, err);
    });
    emitHookLifecycleTrace(recordTraceEvent, buildAfterReceiveHookFinishTraceEvent({
      runtimeLabel,
      sessionId,
      messageId,
      status: 'queued',
    }));
  };
  if (scriptRuntime && !shouldSkipScripts) {
    dispatchRuntimeHook({ runtime: scriptRuntime, runtimeLabel: 'script' });
  }
  if (pluginRuntime) {
    dispatchRuntimeHook({ runtime: pluginRuntime, runtimeLabel: 'plugin' });
  }
  runChatFormatGuardianPreview({
    message,
    sessionId,
    chatFormatGuardian,
    onChatFormatGuardianPreview,
    onChatFormatGuardianRun,
    logger,
  });
  try {
    if (typeof applyUpdateVariable === 'function') applyUpdateVariable(message, sessionId);
    else logger?.warn?.('[update-variable] apply function unavailable');
  } catch (err) {
    logger?.warn?.('UpdateVariable parse failed', err);
  }
  if (typeof handleVariableRules === 'function') {
    catchAsync(
      handleVariableRules({ sessionId, message, useGlobalVariables }),
      err => logger?.warn?.('variable rules after_receive failed', err),
    );
  }
  return true;
};
