import { stripUpdateVariableBlocks } from './update-variable-block-utils.js';

export const STATUS_PLACEHOLDER_RE = /<StatusPlaceHolderImpl\s*\/?>/i;

export const resolveUpdateVariableMessageState = (message) => {
  const raw =
    (typeof message?.rawOriginal === 'string' && message.rawOriginal) ||
    (typeof message?.rawSource === 'string' && message.rawSource) ||
    (typeof message?.raw === 'string' && message.raw) ||
    (typeof message?.content === 'string' && message.content) ||
    '';
  const baseStoredRaw = typeof message?.raw === 'string' ? message.raw : '';
  const baseSource = typeof message?.rawSource === 'string' ? message.rawSource : '';
  const baseOriginal = typeof message?.rawOriginal === 'string' ? message.rawOriginal : '';
  const baseFallback = typeof message?.content === 'string' ? message.content : '';
  const sourceText = baseSource || baseOriginal || baseFallback;
  return {
    raw,
    baseStoredRaw,
    baseSource,
    baseOriginal,
    baseFallback,
    sourceText,
    hasSourceText: Boolean(sourceText),
  };
};

export const stripUpdateVariableMessageState = ({
  raw = '',
  baseStoredRaw = '',
  sourceText = '',
  stripBlocks = stripUpdateVariableBlocks,
} = {}) => {
  const safeStrip = typeof stripBlocks === 'function' ? stripBlocks : (text => String(text ?? ''));
  return {
    nextStored: baseStoredRaw ? safeStrip(baseStoredRaw) : '',
    nextSource: sourceText ? safeStrip(sourceText) : '',
    fallbackStoredSource: safeStrip(baseStoredRaw || raw),
    fallbackSourceText: safeStrip(sourceText || raw),
  };
};

export const appendStatusPlaceholderIfNeeded = ({
  raw = '',
  sourceText = '',
  baseStoredRaw = '',
  nextStored = '',
  nextSource = '',
  isTavernMvuSession = false,
} = {}) => {
  const rawHasPlaceholder = STATUS_PLACEHOLDER_RE.test(String(raw || ''));
  const sourceHasPlaceholder = STATUS_PLACEHOLDER_RE.test(String(sourceText || ''));
  const storedHasPlaceholder = STATUS_PLACEHOLDER_RE.test(String(baseStoredRaw || ''));
  const shouldAppendPlaceholder =
    Boolean(isTavernMvuSession) &&
    !(rawHasPlaceholder || sourceHasPlaceholder || storedHasPlaceholder);
  if (!shouldAppendPlaceholder) {
    return {
      nextStored,
      nextSource,
      placeholderInjected: false,
      rawHasPlaceholder,
      sourceHasPlaceholder,
      storedHasPlaceholder,
    };
  }
  return {
    nextStored: `${nextStored || ''}\n\n<StatusPlaceHolderImpl/>`.trim(),
    nextSource: `${nextSource || ''}\n\n<StatusPlaceHolderImpl/>`.trim(),
    placeholderInjected: true,
    rawHasPlaceholder,
    sourceHasPlaceholder,
    storedHasPlaceholder,
  };
};

export const buildUpdateVariableMessagePatch = ({
  message,
  nextStored = '',
  nextSource = '',
  nextDisplay = '',
  hasSourceText = false,
  forceRenderRich = false,
  includeMeta = true,
} = {}) => {
  let nextMeta = message?.meta && typeof message.meta === 'object' ? { ...message.meta } : null;
  if (forceRenderRich) {
    if (!nextMeta) nextMeta = { renderRich: true };
    else if (nextMeta.renderRich !== true) nextMeta.renderRich = true;
  }
  const updatePayload = { raw: nextStored, content: nextDisplay };
  if (hasSourceText) updatePayload.rawSource = nextSource;
  if (includeMeta && nextMeta) updatePayload.meta = nextMeta;
  return {
    updatePayload,
    nextMeta: includeMeta ? nextMeta : null,
    storedUnchanged: nextStored === (typeof message?.raw === 'string' ? message.raw : ''),
    sourceUnchanged: !hasSourceText || nextSource === (
      (typeof message?.rawSource === 'string' && message.rawSource) ||
      (typeof message?.rawOriginal === 'string' && message.rawOriginal) ||
      (typeof message?.content === 'string' ? message.content : '')
    ),
    displayUnchanged: nextDisplay === (typeof message?.content === 'string' ? message.content : ''),
  };
};

export const buildUpdateVariableCommitPlan = ({
  message,
  nextStored = '',
  nextSource = '',
  nextDisplay = '',
  hasSourceText = false,
  forceRenderRich = false,
  variableChanged = false,
  placeholderInjected = false,
  includeMeta = true,
} = {}) => {
  const patchState = buildUpdateVariableMessagePatch({
    message,
    nextStored,
    nextSource,
    nextDisplay,
    hasSourceText,
    forceRenderRich,
    includeMeta,
  });
  const shouldPersist =
    Boolean(variableChanged || placeholderInjected) ||
    !patchState.storedUnchanged ||
    !patchState.sourceUnchanged ||
    !patchState.displayUnchanged;
  return {
    ...patchState,
    shouldPersist,
    resultChanged: Boolean(variableChanged || placeholderInjected),
    fallbackUpdatedMessage: {
      ...(message || {}),
      raw: nextStored,
      content: nextDisplay,
      rawSource: hasSourceText ? nextSource : message?.rawSource,
      meta: patchState.nextMeta || message?.meta,
    },
  };
};

export const buildUpdateVariableApplyPlan = ({
  message,
  raw = '',
  isTavernMvuSession = false,
  stripBlocks = stripUpdateVariableBlocks,
  transformStored,
  transformDisplay,
  forceRenderRich = false,
  variableChanged = false,
} = {}) => {
  const {
    raw: resolvedRaw,
    baseStoredRaw,
    sourceText,
    hasSourceText,
  } = resolveUpdateVariableMessageState(message);
  const effectiveRaw = raw || resolvedRaw;
  if (!effectiveRaw) {
    return {
      raw: '',
      hasRaw: false,
      hasSourceText,
      nextStored: '',
      nextSource: '',
      nextDisplay: '',
      placeholderInjected: false,
      shouldPersist: false,
      resultChanged: false,
      updatePayload: null,
      fallbackUpdatedMessage: message || null,
    };
  }
  let { nextStored, nextSource } = stripUpdateVariableMessageState({
    raw: effectiveRaw,
    baseStoredRaw,
    sourceText,
    stripBlocks,
  });
  if (!nextStored) {
    const cleanedSource = nextSource;
    nextStored =
      typeof transformStored === 'function'
        ? transformStored(cleanedSource)
        : cleanedSource;
  }
  const placeholderState = appendStatusPlaceholderIfNeeded({
    raw: effectiveRaw,
    sourceText,
    baseStoredRaw,
    nextStored,
    nextSource,
    isTavernMvuSession,
  });
  nextStored = placeholderState.nextStored;
  nextSource = placeholderState.nextSource;
  const nextDisplay =
    typeof transformDisplay === 'function'
      ? transformDisplay(nextStored)
      : nextStored;
  return {
    raw: effectiveRaw,
    hasRaw: true,
    hasSourceText,
    nextStored,
    nextSource,
    nextDisplay,
    placeholderInjected: Boolean(placeholderState.placeholderInjected),
    ...buildUpdateVariableCommitPlan({
      message,
      nextStored,
      nextSource,
      nextDisplay,
      hasSourceText,
      forceRenderRich,
      variableChanged,
      placeholderInjected: Boolean(placeholderState.placeholderInjected),
    }),
  };
};

export const buildUpdateVariableFallbackStripPlan = ({
  message,
  isTavernMvuSession = false,
  stripBlocks = stripUpdateVariableBlocks,
  transformDisplay,
} = {}) => {
  const { raw, baseStoredRaw, sourceText, hasSourceText } = resolveUpdateVariableMessageState(message);
  if (!raw) {
    return {
      raw: '',
      hasRaw: false,
      hasSourceText,
      nextStored: '',
      nextSource: '',
      nextDisplay: '',
      placeholderInjected: false,
      shouldPersist: false,
      resultChanged: false,
      updatePayload: null,
      fallbackUpdatedMessage: message || null,
    };
  }
  let { fallbackStoredSource: nextStored, fallbackSourceText: nextSource } = stripUpdateVariableMessageState({
    raw,
    baseStoredRaw,
    sourceText,
    stripBlocks,
  });
  const placeholderState = appendStatusPlaceholderIfNeeded({
    raw,
    sourceText,
    baseStoredRaw,
    nextStored,
    nextSource,
    isTavernMvuSession,
  });
  nextStored = placeholderState.nextStored;
  nextSource = placeholderState.nextSource;
  const nextDisplay =
    typeof transformDisplay === 'function'
      ? transformDisplay(nextStored)
      : nextStored;
  return {
    raw,
    hasRaw: true,
    hasSourceText,
    nextStored,
    nextSource,
    nextDisplay,
    placeholderInjected: Boolean(placeholderState.placeholderInjected),
    ...buildUpdateVariableCommitPlan({
      message,
      nextStored,
      nextSource,
      nextDisplay,
      hasSourceText,
      forceRenderRich: false,
      variableChanged: false,
      placeholderInjected: false,
      includeMeta: false,
    }),
  };
};
