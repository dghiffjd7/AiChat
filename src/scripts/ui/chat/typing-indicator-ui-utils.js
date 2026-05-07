export const createTypingIndicatorUiRuntime = ({
  schedule = (handler, delay = 0) => setTimeout(handler, delay),
  clearSchedule = (timerId) => clearTimeout(timerId),
} = {}) => ({
  clearTypingTimers({
    getCycleTimer,
    setCycleTimer,
    getThinkTimer,
    setThinkTimer,
    getResumeTimer,
    setResumeTimer,
  }) {
    const cycleTimer = getCycleTimer?.();
    if (cycleTimer) {
      clearSchedule(cycleTimer);
      setCycleTimer?.(null);
    }
    const thinkTimer = getThinkTimer?.();
    if (thinkTimer) {
      clearSchedule(thinkTimer);
      setThinkTimer?.(null);
    }
    const resumeTimer = getResumeTimer?.();
    if (resumeTimer) {
      clearSchedule(resumeTimer);
      setResumeTimer?.(null);
    }
  },
  removeTypingElement({
    typingEl,
    floatingTypingEl,
    setTypingEl,
    setFloatingTypingEl,
    onRemoved,
  }) {
    if (!typingEl) return false;
    typingEl.remove?.();
    setTypingEl?.(null);
    if (floatingTypingEl) {
      floatingTypingEl.remove?.();
      setFloatingTypingEl?.(null);
    }
    onRemoved?.();
    return true;
  },
  applyThinkPause({ typingEl }) {
    if (!typingEl) return false;
    typingEl.style.height = `${typingEl.offsetHeight}px`;
    typingEl.offsetHeight;
    typingEl.classList.add('typing-think-pause');
    return true;
  },
  removeThinkPause({
    typingEl,
    typingNaturalHeight = 36,
  }) {
    if (!typingEl) return false;
    typingEl.classList.remove('typing-think-pause');
    typingEl.style.height = `${typingNaturalHeight || 36}px`;
    schedule(() => {
      if (typingEl) typingEl.style.height = '';
    }, 200);
    return true;
  },
  showFloatingTyping({
    scrollEl,
    sourceWrap,
    floatingTypingEl,
    setFloatingTypingEl,
  }) {
    if (floatingTypingEl) {
      floatingTypingEl.remove?.();
      setFloatingTypingEl?.(null);
    }
    const host = scrollEl?.parentElement;
    if (!host || !sourceWrap?.cloneNode) return null;
    const clone = sourceWrap.cloneNode(true);
    clone.removeAttribute?.('id');
    clone.className = 'typing-indicator-floating';
    host.appendChild?.(clone);
    setFloatingTypingEl?.(clone);
    return clone;
  },
});
