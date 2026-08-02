const trim = value => String(value || '').trim();
const MAX_TRACKED_STATES = 50;

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
    pendingRepair: value.pendingRepair === true,
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

// 只认协议驳回现场打过标记的信封：历史遗留信封、普通成功回复与已重派成功的原文都不得入选。
export const isRejectedProtocolRawEnvelope = (value = null) => {
  const envelope = normalizeEnvelope(value);
  return Boolean(
    envelope &&
    envelope.pendingRepair === true &&
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
  onOpenGuardianSettings = null,
} = {}) => {
  const states = new Map();
  const dismissedKeys = new Set();
  let activeSessionId = '';
  const titleEl = root?.querySelector?.('[data-format-repair-banner-title]') || null;
  const statusEl = root?.querySelector?.('[data-format-repair-banner-status]') || null;
  const applyButton = root?.querySelector?.('[data-format-repair-banner-action="apply"]') || null;
  const recheckButton = root?.querySelector?.('[data-format-repair-banner-action="recheck"]') || null;
  const settingsButton = root?.querySelector?.('[data-format-repair-banner-action="settings"]') || null;

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
  const deleteTrackedState = (sessionId = '') => {
    const sid = trim(sessionId);
    const tracked = states.get(sid) || null;
    if (tracked?.envelopeKey) dismissedKeys.delete(tracked.envelopeKey);
    states.delete(sid);
  };
  const pruneTrackedStates = () => {
    while (states.size > MAX_TRACKED_STATES) {
      const oldestEvictable = Array.from(states.entries())
        .find(([, state]) => state?.status !== 'applying');
      if (!oldestEvictable) break;
      deleteTrackedState(oldestEvictable[0]);
    }
  };
  // includeDismissed：关闭横幅只隐藏 UI，检查结果仍需记录，否则 Agent Center 兜底找不到候选。
  const getCurrentState = (sessionId = activeSessionId, { includeDismissed = false } = {}) => {
    const sid = trim(sessionId);
    const envelope = readEnvelope(sid);
    if (!sid || !isRejectedProtocolRawEnvelope(envelope)) {
      deleteTrackedState(sid);
      return null;
    }
    const envelopeKey = buildEnvelopeKey(sid, envelope);
    let state = states.get(sid) || null;
    if (!state || state.envelopeKey !== envelopeKey) {
      deleteTrackedState(sid);
      state = buildInitialState(sid, envelope);
      states.set(sid, state);
      pruneTrackedStates();
    } else {
      state.envelope = envelope;
    }
    if (includeDismissed) return state;
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
    const guardianUnavailable = state.status === 'guardian_unavailable';
    const status = guardianUnavailable
      ? 'guardian_unavailable'
      : (availability.available ? state.status : 'dispatcher_unavailable');
    root.dataset.status = status;
    if (titleEl) titleEl.textContent = '回复格式未通过';
    if (statusEl) statusEl.textContent = guardianUnavailable || availability.available
      ? state.statusText
      : availability.message;
    if (applyButton) {
      applyButton.disabled = !availability.available || !state.candidate || state.status === 'applying';
    }
    if (recheckButton) {
      recheckButton.disabled = (
        !availability.available
        || state.status === 'checking'
        || state.status === 'applying'
      );
      recheckButton.textContent = availability.available && state.status === 'checking' ? '检查中…' : '重新检查';
    }
    if (settingsButton) settingsButton.hidden = !guardianUnavailable;
    return true;
  };

  const sync = (sessionId = '') => {
    activeSessionId = trim(sessionId);
    return render();
  };

  const mutate = (sessionId, updater) => {
    const sid = trim(sessionId);
    if (!sid) return null;
    const state = getCurrentState(sid, { includeDismissed: true });
    if (!state) {
      render();
      return null;
    }
    updater?.(state);
    render();
    return state;
  };

  const markRejected = ({ sessionId = '' } = {}) => mutate(sessionId, (state) => {
    state.status = 'needs_check';
    state.statusText = '这次回复没有通过格式验收，可查看原文、重新检查或重新生成。';
    state.runId = '';
    state.result = null;
    state.candidate = null;
  });

  const markChecking = ({ sessionId = '' } = {}) => mutate(sessionId, (state) => {
    state.status = 'checking';
    state.statusText = '正在检查并生成最小格式补丁…';
  });

  const markGuardianUnavailable = ({
    sessionId = '',
    reason = 'guardian_unavailable',
    message = '格式修复 Agent 尚未开启或没有可用模型。',
  } = {}) => mutate(sessionId, (state) => {
    state.status = 'guardian_unavailable';
    state.statusText = trim(message) || '格式修复 Agent 尚未开启或没有可用模型。';
    state.runId = '';
    state.result = {
      status: 'guardian_unavailable',
      reason: trim(reason) || 'guardian_unavailable',
      summary: state.statusText,
    };
    state.candidate = null;
  });

  const updateReview = ({ sessionId = '', runId = '', result = null } = {}) => mutate(sessionId, (state) => {
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

  // 模型复查结束但没有产出可展示部件时（例如 no_change），由此收口，避免横幅永远停在“检查中…”。
  const settleChecking = ({ sessionId = '', runId = '', result = null } = {}) => {
    const state = getCurrentState(sessionId, { includeDismissed: true });
    if (!state || state.status !== 'checking') return null;
    return updateReview({ sessionId, runId: trim(runId) || state.runId, result });
  };

  const invoke = async (kind, sessionId = activeSessionId) => {
    const state = getCurrentState(sessionId);
    if (!state) return null;
    if (kind === 'view') return onViewOriginal?.(state);
    if (kind === 'settings') return onOpenGuardianSettings?.(state);
    if ((kind === 'recheck' || kind === 'apply') && !readRepairAvailability(state).available) {
      render();
      return null;
    }
    if (kind === 'recheck') {
      if (state.status === 'checking' || state.status === 'applying') return null;
      markChecking({ sessionId: state.sessionId });
      try {
        return await onRecheck?.(state);
      } catch (err) {
        updateReview({
          sessionId: state.sessionId,
          result: { errors: [trim(err?.message) || '格式检查未能完成，请重试或重新生成。'] },
        });
        return null;
      }
    }
    if (kind === 'regenerate') return onRegenerate?.(state);
    if (kind !== 'apply' || !state.candidate) return null;
    if (state.status === 'applying') return null;
    state.status = 'applying';
    state.statusText = '正在打开补丁审阅…';
    render();
    let result = null;
    let failureMessage = '';
    try {
      result = await onApply?.(state);
    } catch (err) {
      failureMessage = trim(err?.message) || '应用格式修复时发生异常，请重试或重新生成。';
    }
    if (result?.applied === true) return result;
    state.status = 'candidate_ready';
    state.statusText = failureMessage || trim(result?.message || result?.reason) || state.candidate.summary;
    render();
    if (result) return result;
    return failureMessage ? { applied: false, message: failureMessage } : null;
  };

  // Agent Center 的显式应用等于撤销关闭：用户主动要求处理这条候选。
  const hasRunCandidate = (runId = '') => {
    const id = trim(runId);
    if (!id) return false;
    const tracked = Array.from(states.values()).find(item => item.runId === id) || null;
    if (!tracked?.candidate) return false;
    const state = getCurrentState(tracked.sessionId, { includeDismissed: true });
    return Boolean(state?.runId === id && state.candidate);
  };

  const applyByRunId = async (runId = '') => {
    const id = trim(runId);
    if (!id) return null;
    const tracked = Array.from(states.values()).find(item => item.runId === id) || null;
    if (!tracked) return null;
    const state = getCurrentState(tracked.sessionId, { includeDismissed: true });
    if (state?.runId !== id) return null;
    dismissedKeys.delete(state.envelopeKey);
    return invoke('apply', state.sessionId);
  };

  const clear = (sessionId = '') => {
    const sid = trim(sessionId || activeSessionId);
    deleteTrackedState(sid);
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
    markGuardianUnavailable,
    updateReview,
    settleChecking,
    hasRunCandidate,
    applyByRunId,
    clear,
    dismiss,
    getState: sessionId => getCurrentState(sessionId),
  };
};
