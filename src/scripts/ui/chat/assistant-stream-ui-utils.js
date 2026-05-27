import {
  hideCreativeContentTagsForDisplay,
  resolveCreativeRichRenderSource,
} from './creative-content-display-utils.js';

export const buildAssistantStreamMessageCore = (placeholder, meta, msgId, state = {}) => {
  const streamState = state && typeof state === 'object' ? state : { content: state };
  const content = String(streamState.content ?? '');
  const raw = typeof streamState.raw === 'string' ? streamState.raw : content;
  const rawOriginal =
    typeof streamState.rawOriginal === 'string'
      ? streamState.rawOriginal
      : (typeof streamState.raw === 'string' ? streamState.raw : content);
  const rawSource =
    typeof streamState.rawSource === 'string'
      ? streamState.rawSource
      : (typeof streamState.raw === 'string' ? streamState.raw : content);
  const nextMeta = {
    ...((placeholder?.meta && typeof placeholder.meta === 'object') ? placeholder.meta : {}),
    ...((meta?.meta && typeof meta.meta === 'object') ? meta.meta : {}),
    ...((streamState.meta && typeof streamState.meta === 'object') ? streamState.meta : {}),
  };
  if (typeof streamState.reasoning === 'string') nextMeta.reasoning = streamState.reasoning;
  if (typeof streamState.reasoningDisplay === 'string') nextMeta.reasoningDisplay = streamState.reasoningDisplay;
  if (typeof streamState.reasoningLabel === 'string') nextMeta.reasoningLabel = streamState.reasoningLabel;
  if (typeof streamState.reasoningSource === 'string') nextMeta.reasoningSource = streamState.reasoningSource;
  if (typeof streamState.reasoningHidden === 'boolean') nextMeta.reasoningHidden = streamState.reasoningHidden;
  if (meta?.renderRich === true || meta?.streamMode === 'creative') nextMeta.renderRich = true;
  return {
    ...(placeholder || {}),
    role: 'assistant',
    type: 'text',
    id: msgId || streamState.id || placeholder?.id || '',
    avatar: streamState.avatar || meta?.avatar || placeholder?.avatar,
    name: streamState.name || meta?.name || placeholder?.name,
    time: streamState.time || meta?.time || placeholder?.time,
    content,
    raw,
    rawOriginal,
    rawSource,
    meta: nextMeta,
  };
};

export const renderAssistantStreamStateCore = ({
  messageEl,
  wrapperEl,
  msgId,
  meta,
  placeholder,
  state = {},
  buildAssistantStreamMessage = buildAssistantStreamMessageCore,
  applyReasoningUiState,
  cleanupRichTextMounts,
  prepareTextContainer,
  normalizeAssistantLineBreaks,
  renderTextWithStickers,
  renderRichText,
  applyCreativeBubbleState,
} = {}) => {
  const nextMessage = buildAssistantStreamMessage(placeholder, meta, msgId, state);
  applyReasoningUiState?.(nextMessage, wrapperEl?.__chatappMessage || placeholder);
  if (wrapperEl?.dataset?.typingPlaceholder) delete wrapperEl.dataset.typingPlaceholder;
  cleanupRichTextMounts?.(messageEl);
  const target = prepareTextContainer?.(messageEl, nextMessage) || messageEl;
  const text = nextMessage?.meta?.renderRich
    ? resolveCreativeRichRenderSource(nextMessage)
    : String(nextMessage.content ?? '');
  if (nextMessage?.meta?.renderRich) {
    try {
      renderRichText?.(target, text, {
        messageId: msgId || nextMessage.id,
        preserveHtmlNewlines: true,
        sessionId: nextMessage.sessionId,
        debugTag: nextMessage?.meta?.isGreeting ? 'rp-greeting' : '',
        lazyMount: false,
        deferSandboxExecution: true,
        streaming: true,
      });
    } catch {
      const normalized = hideCreativeContentTagsForDisplay(normalizeAssistantLineBreaks?.(text) ?? text);
      target.textContent = normalized;
      target.style.whiteSpace = 'pre-wrap';
    }
  } else {
    const normalized = hideCreativeContentTagsForDisplay(normalizeAssistantLineBreaks?.(text) ?? text);
    if (!renderTextWithStickers?.(target, normalized)) {
      target.textContent = normalized;
      target.style.whiteSpace = 'pre-wrap';
    }
  }
  if (wrapperEl) {
    wrapperEl.__chatappMessage = nextMessage;
    applyCreativeBubbleState?.(wrapperEl, nextMessage);
  }
  return nextMessage;
};

export const finishMessageDomCore = ({
  messageEl,
  wrapperEl,
  finalMessage,
  bufferIndex,
  msgId,
  meta,
  placeholder,
  messageBuffer,
  addMessage,
  applyReasoningUiState,
  applyCreativeBubbleState,
  prepareTextContainer,
  renderRichText,
  normalizeAssistantLineBreaks,
  renderTextWithStickers,
} = {}) => {
  if (finalMessage && finalMessage.type && finalMessage.type !== 'text') {
    const parent = messageEl?.parentElement?.parentElement || messageEl?.parentElement;
    parent?.remove?.();
    addMessage?.(finalMessage);
    if (Array.isArray(messageBuffer)) messageBuffer[bufferIndex] = finalMessage;
    return finalMessage;
  }
  const fm = finalMessage || messageBuffer?.[bufferIndex];
  applyReasoningUiState?.(fm, wrapperEl?.__chatappMessage || placeholder);
  if (wrapperEl) {
    wrapperEl.__chatappMessage = {
      ...(wrapperEl.__chatappMessage || placeholder),
      ...(fm || {}),
      id: msgId || fm?.id || placeholder?.id,
    };
    applyCreativeBubbleState?.(wrapperEl, fm);
  }
  if (Array.isArray(messageBuffer)) messageBuffer[bufferIndex] = fm;
  try {
    const text = fm?.meta?.renderRich
      ? resolveCreativeRichRenderSource(fm)
      : String(fm?.content ?? '');
    const target = prepareTextContainer?.(messageEl, fm) || messageEl;
    if (fm?.meta?.renderRich) {
      renderRichText?.(target, text, {
        messageId: msgId || fm?.id || meta?.id,
        preserveHtmlNewlines: true,
        sessionId: fm?.sessionId,
        debugTag: fm?.meta?.isGreeting ? 'rp-greeting' : '',
        lazyMount: false,
      });
    } else {
      const normalized = hideCreativeContentTagsForDisplay(normalizeAssistantLineBreaks?.(text) ?? text);
      if (!renderTextWithStickers?.(target, normalized)) {
        target.textContent = normalized;
        target.style.whiteSpace = 'pre-wrap';
      }
    }
  } catch {}
  return fm;
};

const resolveSchedulers = ({ scheduleFrame, cancelFrame, windowLike } = {}) => {
  const raf = typeof scheduleFrame === 'function'
    ? scheduleFrame
    : (cb => {
      try {
        if (windowLike?.requestAnimationFrame) return windowLike.requestAnimationFrame(cb);
      } catch {}
      return setTimeout(cb, 16);
    });
  const caf = typeof cancelFrame === 'function'
    ? cancelFrame
    : (id => {
      try {
        if (windowLike?.cancelAnimationFrame) return windowLike.cancelAnimationFrame(id);
      } catch {}
      clearTimeout(id);
    });
  return { raf, caf };
};

const escapeSelectorValue = (value) => {
  const raw = String(value || '');
  const escape = globalThis.CSS?.escape;
  if (typeof escape === 'function') return escape(raw);
  return raw.replace(/["\\]/g, '\\$&');
};

export const createAssistantStreamUiRuntime = ({
  windowLike,
  scheduleFrame,
  cancelFrame,
} = {}) => {
  const { raf, caf } = resolveSchedulers({ scheduleFrame, cancelFrame, windowLike });
  return {
    startAssistantContinuationStream({
      scrollEl,
      msgId,
      meta = {},
      messageBuffer,
      setStreamingState,
      isNearBottom,
      getStreamAutoFollow,
      setStreamAutoFollow,
      renderAssistantStreamState,
      finishMessageDom,
      buildAssistantStreamMessage = buildAssistantStreamMessageCore,
      normalizeAssistantStreamState,
      scrollToBottom,
    } = {}) {
      const id = String(msgId || '').trim();
      if (!id || !scrollEl) return null;
      const wrapperEl = scrollEl.querySelector?.(`[data-msg-id="${escapeSelectorValue(id)}"]`);
      const baseMessage = wrapperEl?.__chatappMessage;
      const messageEl = wrapperEl?.querySelector?.('.QQ_chat_msgdiv');
      if (!wrapperEl || !baseMessage || !messageEl) return null;
      const placeholder = {
        ...baseMessage,
        id,
        content: String(meta.initialContent ?? baseMessage.content ?? ''),
      };
      const originalMessage = { ...baseMessage, id };
      let updateHandle = null;
      let pendingState = normalizeAssistantStreamState?.({
        content: String(placeholder.content ?? ''),
        raw: typeof baseMessage?.raw === 'string' ? baseMessage.raw : String(placeholder.content ?? ''),
        rawOriginal:
          typeof baseMessage?.rawOriginal === 'string'
            ? baseMessage.rawOriginal
            : (typeof baseMessage?.raw === 'string' ? baseMessage.raw : String(placeholder.content ?? '')),
        rawSource:
          typeof baseMessage?.rawSource === 'string'
            ? baseMessage.rawSource
            : undefined,
        meta: {
          ...((baseMessage?.meta && typeof baseMessage.meta === 'object') ? baseMessage.meta : {}),
        },
      }) || { content: String(placeholder.content ?? '') };
      const bufferIndex =
        messageBuffer.push(buildAssistantStreamMessage(placeholder, meta, id, pendingState)) - 1;
      setStreamingState?.(true);
      setStreamAutoFollow?.(Boolean(isNearBottom?.(24)));
      wrapperEl.setAttribute?.('aria-busy', 'true');
      renderAssistantStreamState?.(messageEl, wrapperEl, id, meta, placeholder, pendingState);
      if (getStreamAutoFollow?.()) scrollToBottom?.();

      return {
        id,
        isConnected: () => Boolean(wrapperEl?.isConnected && messageEl?.isConnected),
        update: (payload) => {
          pendingState = normalizeAssistantStreamState?.(payload) || buildAssistantStreamMessage({}, {}, '', payload);
          messageBuffer[bufferIndex] = buildAssistantStreamMessage(placeholder, meta, id, pendingState);
          if (updateHandle != null) return;
          updateHandle = raf(() => {
            updateHandle = null;
            if (!messageEl.isConnected) return;
            renderAssistantStreamState?.(messageEl, wrapperEl, id, meta, placeholder, pendingState);
            if (getStreamAutoFollow?.()) scrollToBottom?.();
          });
        },
        finish: (finalMessage) => {
          setStreamingState?.(false);
          wrapperEl.setAttribute?.('aria-busy', 'false');
          if (updateHandle != null) {
            caf(updateHandle);
            updateHandle = null;
          }
          finishMessageDom?.(messageEl, wrapperEl, finalMessage, bufferIndex, id, meta, originalMessage);
        },
        cancel: (options = {}) => {
          const keepPartial = Boolean(options && options.keepPartial);
          if (updateHandle != null) {
            caf(updateHandle);
            updateHandle = null;
          }
          setStreamingState?.(false);
          wrapperEl.setAttribute?.('aria-busy', 'false');
          const buffered =
            messageBuffer?.[bufferIndex] || buildAssistantStreamMessage(placeholder, meta, id, pendingState);
          const displayText = String(buffered?.content ?? '');
          const rawText =
            typeof buffered?.rawOriginal === 'string'
              ? buffered.rawOriginal
              : (typeof buffered?.raw === 'string' ? buffered.raw : displayText);
          const reasoningText = String(
            buffered?.reasoningDisplay
              || buffered?.reasoning
              || buffered?.meta?.reasoningDisplay
              || buffered?.meta?.reasoning
              || '',
          );
          const hasText =
            displayText.trim().length > 0 ||
            rawText.trim().length > 0 ||
            reasoningText.trim().length > 0;
          if (keepPartial && hasText) {
            const partial = {
              ...(buffered || placeholder),
              id,
              role: 'assistant',
              type: 'text',
              content: displayText,
              raw: typeof buffered?.raw === 'string' ? buffered.raw : rawText,
              rawOriginal: typeof buffered?.rawOriginal === 'string' ? buffered.rawOriginal : rawText,
              rawSource:
                typeof buffered?.rawSource === 'string'
                  ? buffered.rawSource
                  : (typeof buffered?.raw === 'string' ? buffered.raw : rawText),
              meta: {
                ...((buffered?.meta && typeof buffered.meta === 'object') ? buffered.meta : {}),
                partial: true,
                cancelled: true,
              },
            };
            finishMessageDom?.(messageEl, wrapperEl, partial, bufferIndex, id, meta, originalMessage);
            return partial;
          }
          finishMessageDom?.(messageEl, wrapperEl, originalMessage, bufferIndex, id, meta, originalMessage);
          return null;
        },
      };
    },

    startAssistantStream({
      meta = {},
      addMessage,
      messageBuffer,
      setStreamingState,
      isNearBottom,
      getStreamAutoFollow,
      setStreamAutoFollow,
      buildAssistantStreamMessage = buildAssistantStreamMessageCore,
      renderAssistantStreamState,
      finishMessageDom,
      normalizeAssistantStreamState,
      isTypingDotsEnabled,
      scrollToBottom,
    } = {}) {
      const isCreativeRichStream = meta?.renderRich === true || meta?.streamMode === 'creative';
      const placeholder = {
        role: 'assistant',
        type: 'text',
        content: ' ',
        avatar: meta.avatar,
        name: meta.name,
        time: meta.time,
        meta: isCreativeRichStream ? { renderRich: true } : undefined,
      };
      const messageEl = addMessage?.(placeholder);
      const wrapperEl = messageEl?.closest?.('.QQ_chat_charmsg, .QQ_chat_mymsg') || messageEl?.parentElement || null;
      const msgId = wrapperEl?.dataset?.msgId || placeholder.id || meta?.id || '';
      if (wrapperEl) wrapperEl.dataset.typingPlaceholder = '1';
      if (meta?.typing !== false && messageEl && isTypingDotsEnabled?.()) {
        messageEl.innerHTML = `
                <div class="typing">
                    <span class="typing-dot"></span>
                    <span class="typing-dot"></span>
                    <span class="typing-dot"></span>
                </div>
            `;
      } else if (messageEl) {
        messageEl.textContent = '';
      }
      let updateHandle = null;
      let pendingState = { content: '' };
      const bufferIndex = messageBuffer.push({ role: 'assistant', type: 'text', content: '', meta: placeholder.meta }) - 1;
      setStreamingState?.(true);
      setStreamAutoFollow?.(Boolean(isNearBottom?.(24)));
      return {
        id: msgId,
        isConnected: () => Boolean(wrapperEl?.isConnected && messageEl?.isConnected),
        update: (payload) => {
          pendingState = normalizeAssistantStreamState?.(payload) || buildAssistantStreamMessage({}, {}, '', payload);
          const bufferedMessage = buildAssistantStreamMessage(placeholder, meta, msgId, pendingState);
          messageBuffer[bufferIndex] = bufferedMessage;
          if (updateHandle != null) return;
          updateHandle = raf(() => {
            updateHandle = null;
            if (!messageEl || !messageEl.isConnected) return;
            renderAssistantStreamState?.(messageEl, wrapperEl, msgId, meta, placeholder, pendingState);
            if (getStreamAutoFollow?.()) scrollToBottom?.();
          });
        },
        finish: (finalMessage) => {
          setStreamingState?.(false);
          if (updateHandle != null) {
            caf(updateHandle);
            updateHandle = null;
          }
          finishMessageDom?.(messageEl, wrapperEl, finalMessage, bufferIndex, msgId, meta, placeholder);
        },
        cancel: (options = {}) => {
          const keepPartial = Boolean(options && options.keepPartial);
          if (updateHandle != null) {
            caf(updateHandle);
            updateHandle = null;
          }
          const buffered =
            messageBuffer?.[bufferIndex] || buildAssistantStreamMessage(placeholder, meta, msgId, pendingState);
          const displayText = String(buffered?.content ?? pendingState?.content ?? '');
          const rawText =
            typeof buffered?.rawOriginal === 'string'
              ? buffered.rawOriginal
              : (typeof buffered?.raw === 'string' ? buffered.raw : displayText);
          const reasoningText = String(
            buffered?.reasoningDisplay
              || buffered?.reasoning
              || buffered?.meta?.reasoningDisplay
              || buffered?.meta?.reasoning
              || '',
          );
          const hasText =
            displayText.trim().length > 0 ||
            rawText.trim().length > 0 ||
            reasoningText.trim().length > 0;
          if (keepPartial && hasText) {
            const partial = {
              ...(buffered || placeholder),
              role: 'assistant',
              type: 'text',
              id: msgId || buffered?.id || placeholder.id,
              content: String(buffered?.content ?? rawText),
              raw: typeof buffered?.raw === 'string' ? buffered.raw : rawText,
              rawOriginal: typeof buffered?.rawOriginal === 'string' ? buffered.rawOriginal : rawText,
              rawSource:
                typeof buffered?.rawSource === 'string'
                  ? buffered.rawSource
                  : (typeof buffered?.raw === 'string' ? buffered.raw : rawText),
              meta: {
                ...((buffered?.meta && typeof buffered.meta === 'object') ? buffered.meta : {}),
                partial: true,
                cancelled: true,
              },
            };
            setStreamingState?.(false);
            finishMessageDom?.(messageEl, wrapperEl, partial, bufferIndex, msgId, meta, placeholder);
            return partial;
          }
          setStreamingState?.(false);
          try {
            wrapperEl?.remove?.();
          } catch {}
          try {
            messageBuffer.splice(bufferIndex, 1);
          } catch {}
          return null;
        },
      };
    },
  };
};
