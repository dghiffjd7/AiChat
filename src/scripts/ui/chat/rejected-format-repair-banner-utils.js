const trim = value => String(value || '').trim();

const normalizeStringList = value => Array.from(new Set(
  (Array.isArray(value) ? value : [])
    .map(item => trim(item))
    .filter(Boolean),
));

const normalizeEnvelope = (value = null) => {
  if (!value || typeof value !== 'object') return null;
  return {
    text: String(value.text || ''),
    at: Number(value.at || 0) || 0,
    truncated: value.truncated === true,
    turnId: trim(value.turnId),
    sourceSessionId: trim(value.sourceSessionId),
    targetSessionId: trim(value.targetSessionId),
    targetSessionIds: normalizeStringList(value.targetSessionIds),
    sourceKind: trim(value.sourceKind) || 'social_turn_raw',
    sourceMessageIds: normalizeStringList(value.sourceMessageIds),
  };
};

const buildEnvelopeKey = (sessionId = '', envelope = null) => {
  const normalized = normalizeEnvelope(envelope);
  if (!normalized) return '';
  return JSON.stringify([
    trim(sessionId),
    normalized.at,
    normalized.turnId,
    normalized.sourceSessionId,
    normalized.text.length,
    normalized.text.slice(0, 80),
    normalized.text.slice(-80),
  ]);
};

export const isRejectedProtocolRawEnvelope = (value = null) => {
  const envelope = normalizeEnvelope(value);
  return Boolean(
    envelope &&
    envelope.text.trim() &&
    envelope.truncated !== true &&
    envelope.sourceKind === 'social_turn_raw' &&
    envelope.sourceMessageIds.length === 0,
  );
};

export const resolveRejectedFormatRepairDispatcherAvailability = ({
  dispatcher = null,
  envelope = null,
} = {}) => {
  if (!dispatcher || typeof dispatcher.processEvent !== 'function') {
    return {
      available: false,
      reason: 'protocol_dispatcher_unavailable',
      message: '应用通道已在重启后失效，请先在本聊天室完成一轮对话，或直接重新生成。',
    };
  }
  const sourceSessionId = trim(envelope?.sourceSessionId);
  const turnId = trim(envelope?.turnId);
  const dispatcherSourceSessionId = trim(dispatcher.sourceSessionId);
  const dispatcherTurnId = trim(dispatcher.getTurnId?.());
  if (
    (sourceSessionId && dispatcherSourceSessionId !== sourceSessionId) ||
    (turnId && dispatcherTurnId !== turnId)
  ) {
    return {
      available: false,
      reason: 'protocol_dispatcher_revision_mismatch',
      message: '这次回复的应用通道已失效，请重新生成后再检查格式。',
    };
  }
  return { available: true, reason: '', message: '' };
};

const buildInitialState = (sessionId = '', envelope = null) => ({
  sessionId: trim(sessionId),
  envelopeKey: buildEnvelopeKey(sessionId, envelope),
  envelope: normalizeEnvelope(envelope),
  status: 'needs_check',
  statusText: '这次回复没有通过格式验收，可查看原文、重新检查或重新生成。',
  runId: '',
  result: null,
  candidate: null,
});

const resolveReviewCandidate = (result = null) => {
  const review = result?.modelReview && typeof result.modelReview === 'object'
    ? result.modelReview
    : null;
  const candidateText = String(review?.candidateText || '');
  const linePatches = Array.isArray(review?.linePatches) ? review.linePatches : [];
  if (review?.canRepair !== true || !candidateText || !linePatches.length) return null;
  return {
    candidateText,
    linePatches,
    baseRevision: trim(review.baseRevision || result?.baseRevision),
    summary: trim(review.repairSummary) || '格式修复候选已就绪。',
    sourceTruncationSuspected: review.sourceTruncationSuspected === true,
  };
};

export const createRejectedFormatRepairBannerRuntime = ({
  root = null,
  getEnvelope = null,
  getRepairAvailability = null,
  onViewOriginal = null,
  onApply = null,
  onRecheck = null,
  onRegenerate = null,
} = {}) => {
  const states = new Map();
  const dismissedKeys = new Set();
  let activeSessionId = '';
  const titleEl = root?.querySelector?.('[data-format-repair-banner-title]') || null;
  const statusEl = root?.querySelector?.('[data-format-repair-banner-status]') || null;
  const applyButton = root?.querySelector?.('[data-format-repair-banner-action="apply"]') || null;
  const recheckButton = root?.querySelector?.('[data-format-repair-banner-action="recheck"]') || null;

  const readEnvelope = sessionId => normalizeEnvelope(getEnvelope?.(sessionId));
  const readRepairAvailability = state => {
    if (typeof getRepairAvailability !== 'function') {
      return { available: true, reason: '', message: '' };
    }
    try {
      const availability = getRepairAvailability(state);
      if (availability?.available === true) {
        return { available: true, reason: '', message: '' };
      }
      return {
        available: false,
        reason: trim(availability?.reason) || 'protocol_dispatcher_unavailable',
        message: trim(availability?.message) || '应用通道不可用，请先完成一轮对话或重新生成。',
      };
    } catch {
      return {
        available: false,
        reason: 'protocol_dispatcher_unavailable',
        message: '应用通道不可用，请先完成一轮对话或重新生成。',
      };
    }
  };
  const getCurrentState = (sessionId = activeSessionId) => {
    const sid = trim(sessionId);
    const envelope = readEnvelope(sid);
    if (!sid || !isRejectedProtocolRawEnvelope(envelope)) {
      states.delete(sid);
      return null;
    }
    const envelopeKey = buildEnvelopeKey(sid, envelope);
    let state = states.get(sid) || null;
    if (!state || state.envelopeKey !== envelopeKey) {
      state = buildInitialState(sid, envelope);
      states.set(sid, state);
    } else {
      state.envelope = envelope;
    }
    return dismissedKeys.has(envelopeKey) ? null : state;
  };

  const render = () => {
    const state = getCurrentState(activeSessionId);
    if (!root) return Boolean(state);
    root.hidden = !state;
    if (!state) {
      delete root.dataset.status;
      return false;
    }
    const availability = readRepairAvailability(state);
    const status = availability.available ? state.status : 'dispatcher_unavailable';
    root.dataset.status = status;
    if (titleEl) titleEl.textContent = '回复格式未通过';
    if (statusEl) statusEl.textContent = availability.available
      ? state.statusText
      : availability.message;
    if (applyButton) {
      applyButton.disabled = !availability.available || !state.candidate || state.status === 'applying';
    }
    if (recheckButton) {
      recheckButton.disabled = !availability.available || state.status === 'checking' || state.status === 'applying';
      recheckButton.textContent = availability.available && state.status === 'checking' ? '检查中…' : '重新检查';
    }
    return true;
  };

  const sync = (sessionId = '') => {
    activeSessionId = trim(sessionId);
    return render();
  };

  const mutate = (sessionId, updater) => {
    const sid = trim(sessionId);
    if (!sid) return null;
    const state = getCurrentState(sid);
    if (!state) {
      render();
      return null;
    }
    updater?.(state);
    render();
    return state;
  };

  const markRejected = ({ sessionId = '' } = {}) => mutate(sessionId, (state) => {
    dismissedKeys.delete(state.envelopeKey);
    state.status = 'needs_check';
    state.statusText = '这次回复没有通过格式验收，可查看原文、重新检查或重新生成。';
    state.runId = '';
    state.result = null;
    state.candidate = null;
  });

  const markChecking = ({ sessionId = '' } = {}) => mutate(sessionId, (state) => {
    dismissedKeys.delete(state.envelopeKey);
    state.status = 'checking';
    state.statusText = '正在检查并生成最小格式补丁…';
  });

  const updateReview = ({ sessionId = '', runId = '', result = null } = {}) => mutate(sessionId, (state) => {
    dismissedKeys.delete(state.envelopeKey);
    const candidate = resolveReviewCandidate(result);
    state.runId = trim(runId);
    state.result = result;
    state.candidate = candidate;
    if (candidate) {
      state.status = 'candidate_ready';
      state.statusText = candidate.summary;
      return;
    }
    state.status = 'check_failed';
    state.statusText = trim(
      result?.modelReview?.repairSummary ||
      result?.errors?.[0] ||
      result?.summary,
    ) || '当前没有可安全应用的补丁，可重新检查或重新生成。';
  });

  const invoke = async (kind, sessionId = activeSessionId) => {
    const state = getCurrentState(sessionId);
    if (!state) return null;
    if (kind === 'view') return onViewOriginal?.(state);
    if ((kind === 'recheck' || kind === 'apply') && !readRepairAvailability(state).available) {
      render();
      return null;
    }
    if (kind === 'recheck') {
      markChecking({ sessionId: state.sessionId });
      return onRecheck?.(state);
    }
    if (kind === 'regenerate') return onRegenerate?.(state);
    if (kind !== 'apply' || !state.candidate) return null;
    state.status = 'applying';
    state.statusText = '正在打开补丁审阅…';
    render();
    const result = await onApply?.(state);
    if (result?.applied === true) return result;
    state.status = 'candidate_ready';
    state.statusText = trim(result?.message || result?.reason) || state.candidate.summary;
    render();
    return result || null;
  };

  const applyByRunId = async (runId = '') => {
    const id = trim(runId);
    if (!id) return null;
    const state = Array.from(states.values()).find(item => item.runId === id) || null;
    if (!state || getCurrentState(state.sessionId)?.runId !== id) return null;
    return invoke('apply', state.sessionId);
  };

  const clear = (sessionId = '') => {
    const sid = trim(sessionId || activeSessionId);
    states.delete(sid);
    if (sid === activeSessionId && root) {
      root.hidden = true;
      delete root.dataset.status;
    }
    return true;
  };

  const dismiss = (sessionId = activeSessionId) => {
    const state = getCurrentState(sessionId);
    if (!state) return false;
    dismissedKeys.add(state.envelopeKey);
    render();
    return true;
  };

  root?.addEventListener?.('click', (event) => {
    const action = trim(event?.target?.closest?.('[data-format-repair-banner-action]')?.dataset?.formatRepairBannerAction);
    if (!action) return;
    event.preventDefault?.();
    if (action === 'dismiss') {
      dismiss();
      return;
    }
    void invoke(action);
  });

  return {
    sync,
    render,
    markRejected,
    markChecking,
    updateReview,
    applyByRunId,
    clear,
    dismiss,
    getState: sessionId => getCurrentState(sessionId),
  };
};
