const trim = (value, fallback = '') => {
  const text = String(value ?? '').trim();
  return text || fallback;
};

export const buildChatFormatGuardianApplyRepairPayload = ({
  actionMeta = null,
  part = null,
} = {}) => {
  const repairCandidate = actionMeta?.repairCandidate || part?.metadata?.repairCandidate || null;
  const text = trim(repairCandidate?.replacementText);
  if (!text) return null;
  return {
    text,
    regexEditMode: false,
    source: 'chat_format_guardian',
    repairKind: trim(repairCandidate?.kind),
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
