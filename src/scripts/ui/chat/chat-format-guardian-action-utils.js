const trim = (value, fallback = '') => {
  const text = String(value ?? '').trim();
  return text || fallback;
};

export const buildChatFormatGuardianApplyRepairPayload = ({
  actionMeta = null,
  part = null,
} = {}) => {
  const repairCandidate = actionMeta?.repairCandidate || part?.metadata?.repairCandidate || null;
  const text = String(repairCandidate?.replacementText ?? '');
  if (!text.trim()) return null;
  return {
    text,
    regexEditMode: false,
    source: 'chat_format_guardian',
    repairKind: trim(repairCandidate?.kind),
    repairSummary: trim(repairCandidate?.summary),
    reviewWarning: trim(repairCandidate?.reviewWarning),
    protocolVersion: trim(repairCandidate?.protocolVersion),
    baseRevision: trim(repairCandidate?.baseRevision),
    sourceSnapshot: String(repairCandidate?.sourceSnapshot ?? ''),
    sourceKind: trim(repairCandidate?.sourceKind),
    sourceSessionId: trim(repairCandidate?.sourceSessionId),
    targetSessionId: trim(repairCandidate?.targetSessionId),
    turnId: trim(repairCandidate?.turnId),
    sourceMessageIds: Array.isArray(repairCandidate?.sourceMessageIds)
      ? repairCandidate.sourceMessageIds.map(item => trim(item)).filter(Boolean)
      : [],
    formatTarget: trim(repairCandidate?.formatTarget),
    formatSourceIds: Array.isArray(repairCandidate?.formatSourceIds)
      ? repairCandidate.formatSourceIds.map(item => trim(item)).filter(Boolean)
      : [],
    linePatches: Array.isArray(repairCandidate?.linePatches)
      ? repairCandidate.linePatches.map(patch => ({ ...patch }))
      : [],
  };
};

export const buildChatFormatGuardianRetryPlan = ({
  uiMode = '',
  canSwipeRegen = false,
  message = null,
  part = null,
} = {}) => {
  const msgId = trim(message?.id);
  if (trim(uiMode) === 'rp' && canSwipeRegen === true && msgId) {
    return {
      kind: 'swipe_regen',
      payload: {
        msgId,
        message,
        source: 'chat_format_guardian',
      },
    };
  }
  return {
    kind: 'regenerate',
    action: 'regenerate',
    message,
    payload: {
      source: 'chat_format_guardian',
      reason: trim(part?.summary),
    },
  };
};
