export const createTypingIndicatorScheduleRuntime = ({
  schedule = (handler, delay = 0) => setTimeout(handler, delay),
  scheduleFrame = typeof requestAnimationFrame === 'function'
    ? requestAnimationFrame
    : (cb => setTimeout(cb, 16)),
  random = Math.random,
} = {}) => ({
  runGroupTypingCycle({
    members = [],
    renderCycle,
    setCycleTimer,
  }) {
    const nextMembers = [...members];
    const scheduleCycle = () => {
      const timerId = schedule(() => {
        renderCycle?.(nextMembers);
        scheduleCycle();
      }, random() * 2500 + 500);
      setCycleTimer?.(timerId);
    };
    renderCycle?.(nextMembers);
    scheduleCycle();
  },
  runPrivateThinkPause({
    getTypingEl,
    isNearBottom,
    applyThinkPause,
    removeThinkPause,
    scrollToBottom,
    setThinkTimer,
    setResumeTimer,
  }) {
    const scheduleThinkPause = () => {
      const interval = 2500 + random() * 4000;
      const thinkTimer = schedule(() => {
        if (!getTypingEl?.() || random() > 0.35) {
          scheduleThinkPause();
          return;
        }
        const nearBefore = Boolean(isNearBottom?.());
        applyThinkPause?.();
        const resumeTimer = schedule(() => {
          if (getTypingEl?.()) {
            removeThinkPause?.();
            if (nearBefore) {
              scheduleFrame(() => {
                scrollToBottom?.();
              });
            }
          }
          scheduleThinkPause();
        }, 600 + random() * 900);
        setResumeTimer?.(resumeTimer);
      }, interval);
      setThinkTimer?.(thinkTimer);
    };
    scheduleThinkPause();
  },
  mountTypingElement({
    scrollEl,
    wrap,
    isNearBottom,
    setTypingEl,
    setTypingNaturalHeight,
    showFloatingTyping,
    scrollToBottom,
  }) {
    if (!scrollEl || !wrap) return false;
    wrap.style.transition = 'none';
    const wasNearBottom = Boolean(isNearBottom?.());
    scrollEl.appendChild?.(wrap);
    setTypingEl?.(wrap);
    setTypingNaturalHeight?.(wrap.offsetHeight);
    wrap.style.transition = '';
    if (!wasNearBottom) showFloatingTyping?.(wrap);
    else scrollToBottom?.();
    return wasNearBottom;
  },
});
