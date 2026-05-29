import {
  analyzeChatBodyQuality,
  CHAT_BODY_QUALITY_STATUSES,
} from './chat-body-quality-guardian-utils.js';

const trim = (value, fallback = '') => {
  const text = String(value ?? '').trim();
  return text || fallback;
};

export const buildChatBodyQualityApplyPatchPayload = ({
  actionMeta = null,
  part = null,
  message = null,
} = {}) => {
  const advertisedCandidate = actionMeta?.patchCandidate || part?.metadata?.patchCandidate || null;
  const result = analyzeChatBodyQuality({ message });
  const computedCandidate = result?.patchCandidate || null;
  if (result?.status !== CHAT_BODY_QUALITY_STATUSES.minorIssues || computedCandidate?.available !== true) {
    return null;
  }
  const text = trim(computedCandidate.replacementText);
  if (!text) return null;
  return {
    text,
    regexEditMode: false,
    source: 'chat_body_quality_guardian',
    patchKind: trim(computedCandidate.id || advertisedCandidate?.id, 'body_quality_patch'),
    patchSummary: trim(computedCandidate.summary || advertisedCandidate?.summary),
    patchRisk: trim(computedCandidate.risk || advertisedCandidate?.risk, 'low'),
  };
};
