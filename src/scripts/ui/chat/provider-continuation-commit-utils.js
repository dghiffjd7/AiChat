export const PROVIDER_CONTINUATION_COMMIT_STRATEGIES = Object.freeze({
  previewOnly: 'preview_only',
  appendToPreviousBubble: 'append_to_previous_bubble',
});

const isPlainObject = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));

const trim = (value, fallback = '') => {
  const text = String(value ?? '').trim();
  return text || fallback;
};

const readNonBlankText = (value = '') => {
  const text = typeof value === 'string' ? value : String(value ?? '');
  return text.trim() ? text : '';
};

export const normalizeProviderContinuationCommitStrategy = (value = '') => {
  const strategy = trim(value, PROVIDER_CONTINUATION_COMMIT_STRATEGIES.previewOnly);
  return Object.values(PROVIDER_CONTINUATION_COMMIT_STRATEGIES).includes(strategy)
    ? strategy
    : PROVIDER_CONTINUATION_COMMIT_STRATEGIES.previewOnly;
};

export const extractProviderContinuationFinalText = (continuationResult = {}) => {
  const result = isPlainObject(continuationResult) ? continuationResult : {};
  const parts = Array.isArray(result.parts)
    ? result.parts
    : (Array.isArray(result.continuationParts) ? result.continuationParts : []);
  const partText = parts
    .slice()
    .reverse()
    .map(part => readNonBlankText(part?.metadata?.finalText))
    .find(Boolean);
  if (partText) return partText;

  const events = Array.isArray(result.runnerFacade?.events) ? result.runnerFacade.events : [];
  const endText = events
    .slice()
    .reverse()
    .map(event => readNonBlankText(event?.finalText || event?.accumulatedText))
    .find(Boolean);
  return endText || '';
};

const appendText = (base = '', addition = '') => `${String(base ?? '')}${String(addition ?? '')}`;

export const buildProviderContinuationCommitPlan = ({
  strategy = PROVIDER_CONTINUATION_COMMIT_STRATEGIES.previewOnly,
  continuationResult = {},
  targetMessage = null,
} = {}) => {
  const normalizedStrategy = normalizeProviderContinuationCommitStrategy(strategy);
  const finalText = extractProviderContinuationFinalText(continuationResult);
  if (normalizedStrategy === PROVIDER_CONTINUATION_COMMIT_STRATEGIES.previewOnly) {
    return {
      ok: true,
      status: 'preview_only',
      strategy: normalizedStrategy,
      writesChat: false,
      finalText,
      reason: '',
    };
  }
  if (!finalText.trim()) {
    return {
      ok: false,
      status: 'blocked',
      strategy: normalizedStrategy,
      writesChat: false,
      finalText: '',
      reason: 'provider continuation returned no text to append',
    };
  }
  const targetId = trim(targetMessage?.id);
  if (!targetId) {
    return {
      ok: false,
      status: 'blocked',
      strategy: normalizedStrategy,
      writesChat: false,
      finalText,
      reason: 'append target message is missing',
    };
  }
  return {
    ok: true,
    status: 'ready',
    strategy: normalizedStrategy,
    writesChat: true,
    finalText,
    targetMessageId: targetId,
    reason: '',
  };
};

export const commitProviderContinuationToMessage = ({
  strategy = PROVIDER_CONTINUATION_COMMIT_STRATEGIES.previewOnly,
  continuationResult = {},
  targetMessage = null,
  sessionId = '',
  chatStore = null,
  isSessionActive = () => false,
  updateUiMessage = () => {},
  now = Date.now,
} = {}) => {
  const plan = buildProviderContinuationCommitPlan({ strategy, continuationResult, targetMessage });
  if (!plan.ok || plan.strategy === PROVIDER_CONTINUATION_COMMIT_STRATEGIES.previewOnly) return plan;

  const sid = trim(sessionId || targetMessage?.sessionId);
  const targetId = plan.targetMessageId;
  const existing = chatStore?.findMessage?.(targetId, sid) || targetMessage;
  if (!existing) {
    return {
      ...plan,
      ok: false,
      status: 'blocked',
      writesChat: false,
      reason: 'append target message was not found in chat store',
    };
  }

  const committedAt = Number(now?.() || Date.now()) || Date.now();
  const previousMeta = isPlainObject(existing.meta) ? existing.meta : {};
  const commitHistory = Array.isArray(previousMeta.providerContinuationCommits)
    ? previousMeta.providerContinuationCommits.slice(-10)
    : [];
  const commitEntry = {
    strategy: plan.strategy,
    pendingPermissionId: trim(continuationResult?.pendingPermissionId),
    committedAt,
    chars: plan.finalText.length,
  };
  const updatePayload = {
    content: appendText(existing.content, plan.finalText),
    raw: appendText(typeof existing.raw === 'string' ? existing.raw : existing.content, plan.finalText),
    meta: {
      ...previousMeta,
      providerContinuationCommits: [...commitHistory, commitEntry],
    },
  };
  const saved = chatStore?.updateMessage?.(targetId, updatePayload, sid) || {
    ...existing,
    ...updatePayload,
    id: targetId,
  };
  if (isSessionActive(sid)) updateUiMessage(targetId, saved);
  return {
    ...plan,
    ok: true,
    status: 'committed',
    writesChat: true,
    message: saved,
    commit: commitEntry,
  };
};
