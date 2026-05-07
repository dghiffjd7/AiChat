export const clearMessageQueueTimerCore = ({
  getMessageQueueTimer,
  setMessageQueueTimer,
  clearTimer = clearTimeout,
} = {}) => {
  const timer = getMessageQueueTimer?.();
  if (!timer) return false;
  clearTimer(timer);
  setMessageQueueTimer?.(null);
  return true;
};

export const showTypingCore = ({
  avatarUrl = '',
  options = {},
  isTypingDotsEnabled,
  uiMode = '',
  typingEl = null,
  clearTypingTimers,
  createTypingIndicatorShell,
  documentLike,
  runGroupTypingCycle,
  renderTypingGroupMembers,
  getDefaultAvatar,
  schedule,
  runPrivateThinkPause,
  isNearBottom,
  applyThinkPause,
  removeThinkPause,
  scrollToBottom,
  setCycleTimer,
  setThinkTimer,
  setResumeTimer,
  mountTypingElement,
  scrollEl,
  setTypingEl,
  setTypingNaturalHeight,
  showFloatingTyping,
} = {}) => {
  if (!isTypingDotsEnabled?.()) return false;
  if (uiMode === 'rp') return false;
  if (typingEl) return false;
  clearTypingTimers?.();
  const { groupMembers } = options || {};
  const { wrap, kind, avatarStack, labelEl } = createTypingIndicatorShell?.({
    documentLike,
    groupMembers,
  }) || {};
  if (!wrap) return false;
  if (kind === 'group') {
    runGroupTypingCycle?.({
      members: groupMembers,
      renderCycle: members => {
        renderTypingGroupMembers?.({
          documentLike,
          avatarStack,
          labelEl,
          members,
          getDefaultAvatar,
          schedule,
        });
      },
      setCycleTimer,
    });
  } else {
    runPrivateThinkPause?.({
      getTypingEl: () => typingEl,
      isNearBottom,
      applyThinkPause,
      removeThinkPause,
      scrollToBottom,
      setThinkTimer,
      setResumeTimer,
    });
  }
  mountTypingElement?.({
    scrollEl,
    wrap,
    isNearBottom,
    setTypingEl,
    setTypingNaturalHeight,
    showFloatingTyping,
    scrollToBottom,
  });
  return true;
};

export const hideTypingCore = ({
  clearTypingTimers,
  clearMessageQueueTimer,
  removeTypingElement,
} = {}) => {
  clearTypingTimers?.();
  clearMessageQueueTimer?.();
  removeTypingElement?.();
};

export const enqueueMessagesCore = ({
  items = [],
  options = {},
  clearMessageQueueTimer,
  hideTyping,
  showTyping,
  getTypingThinkTimer,
  setTypingThinkTimer,
  getTypingThinkResumeTimer,
  setTypingThinkResumeTimer,
  isNearBottom,
  applyThinkPause,
  removeThinkPause,
  removeTypingElement,
  scrollToBottom,
  setMessageQueueTimer,
  scheduleTimeout = (handler, delay) => setTimeout(handler, delay),
  scheduleFrame = handler => requestAnimationFrame(handler),
  addMessage,
  random = Math.random,
} = {}) => {
  let cancelled = false;
  const cancel = () => {
    cancelled = true;
    clearMessageQueueTimer?.();
    hideTyping?.();
  };

  const calcDelay = (charCount) => {
    const base = Math.min(charCount * 60, 5500) + 1200;
    const jitter = (random() - 0.5) * 1200;
    return Math.max(1500, base + jitter);
  };

  const sleep = delay => new Promise((resolve) => {
    setMessageQueueTimer?.(scheduleTimeout(resolve, delay));
  });

  const promise = (async () => {
    for (let i = 0; i < items.length; i += 1) {
      if (cancelled) break;
      const item = items[i];

      if (i > 0) {
        const prevContent = String(items[i - 1]?.message?.content || '');
        const delay = calcDelay(prevContent.length);
        const isPrivate = !Array.isArray(options.typingOptions?.groupMembers) || options.typingOptions.groupMembers.length === 0;

        showTyping?.(options.avatarUrl || '', options.typingOptions || {});
        const thinkTimer = getTypingThinkTimer?.();
        if (thinkTimer) {
          clearTimeout(thinkTimer);
          setTypingThinkTimer?.(null);
        }
        const resumeTimer = getTypingThinkResumeTimer?.();
        if (resumeTimer) {
          clearTimeout(resumeTimer);
          setTypingThinkResumeTimer?.(null);
        }

        if (isPrivate && delay >= 1500 && random() < 0.3) {
          const pauseCount = delay >= 3000 && random() < 0.4 ? 2 : 1;
          const segments = pauseCount + 1;
          const segmentBase = delay / (segments + pauseCount * 0.4);
          for (let p = 0; p < pauseCount; p += 1) {
            if (cancelled) break;
            const nearBottom = isNearBottom?.();
            const typingTime = segmentBase * (0.8 + random() * 0.4);
            await sleep(typingTime);
            if (cancelled) break;
            applyThinkPause?.();
            const pauseTime = 600 + random() * 900;
            await sleep(pauseTime);
            if (cancelled) break;
            removeThinkPause?.();
            if (nearBottom) scheduleFrame(() => scrollToBottom?.());
          }
          if (!cancelled) {
            const remaining = segmentBase * (0.8 + random() * 0.4);
            await sleep(remaining);
          }
        } else {
          await sleep(delay);
        }
        if (cancelled) break;
        removeTypingElement?.();
      }

      addMessage?.(item.message);
      if (typeof item.callback === 'function') {
        try { item.callback(item.message); } catch {}
      }
    }

    if (!cancelled && items.length > 1 && random() < 0.2) {
      await sleep(800 + random() * 1500);
      if (!cancelled) {
        showTyping?.(options.avatarUrl || '', options.typingOptions || {});
        await sleep(1500 + random() * 2500);
        if (!cancelled) {
          applyThinkPause?.();
          await sleep(200);
          hideTyping?.();
        }
      }
    }
  })();

  return { cancel, promise };
};
