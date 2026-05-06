import { finalizeLlmHistory } from './llm-history-utils.js';
import { buildLlmHistoryCandidates } from './llm-history-candidate-utils.js';
import { buildLlmHistoryFinalizeOptions } from './llm-history-config-utils.js';
import {
  buildLlmHistoryEntry,
  loadLlmCreativeSummarySource,
  resolveLlmCreativeHistorySummary,
  resolveLlmHistoryImageAttachment,
} from './llm-history-entry-utils.js';

export const buildLlmHistoryForSession = ({
  applyMacros,
  buildStickerToken,
  creativeSummaryGetters,
  excludeMessageIds,
  isAttachmentExpired,
  isGroupChat,
  isRpMode,
  messages,
  openaiPreset,
  pendingUserText,
  reasoningPreset,
  resolvePlainText,
  resolveStickerKeyword,
  rpUiMode,
  settings,
} = {}) => {
  const resolveImageAttachment = (message) =>
    resolveLlmHistoryImageAttachment(message, { isAttachmentExpired });
  const creativeSummarySource = loadLlmCreativeSummarySource(creativeSummaryGetters);
  const candidates = buildLlmHistoryCandidates(messages || [], {
    excludeMessageIds,
    isRpMode,
    isGroupChat,
  });
  const history = candidates
    .map(({ message, depth }) => buildLlmHistoryEntry(message, {
      isGroupChat,
      isRpMode,
      rpUiMode,
      depth,
      creativeSummary: resolveLlmCreativeHistorySummary({
        directSummary: message?.meta?.summary,
        compactedSummary: creativeSummarySource.compactedSummary,
        summaries: creativeSummarySource.summaries,
      }),
      resolvePlainText,
      resolveStickerKeyword,
      buildStickerToken,
      resolveImageAttachment,
    }))
    .filter(Boolean);
  return finalizeLlmHistory(history, buildLlmHistoryFinalizeOptions({
    pendingUserText,
    settings,
    openaiPreset,
    rpUiMode,
    reasoningPreset,
    applyMacros,
  }));
};
