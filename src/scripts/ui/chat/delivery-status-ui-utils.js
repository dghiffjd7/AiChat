export const resolveDeliveryStatusTargets = (scrollEl, {
  matchText = (text) => text === '✔ 已送出' || text.startsWith('已读'),
} = {}) => {
  const statusEls = scrollEl?.querySelectorAll?.('.chat-delivery-status') || [];
  return [...statusEls].filter((el) => {
    const text = String(el?.textContent || '').trim();
    return matchText(text);
  });
};

export const syncDeliveryTextToMessages = (targets, text, {
  onDeliveryTextChange,
} = {}) => {
  targets.forEach((el) => {
    el.textContent = text;
    const wrapper = el.closest?.('[data-msg-id]');
    if (!wrapper) return;
    if (wrapper.__chatappMessage) {
      if (!wrapper.__chatappMessage.meta) wrapper.__chatappMessage.meta = {};
      wrapper.__chatappMessage.meta.deliveryText = text;
    }
    const msgId = wrapper.dataset.msgId;
    if (msgId && typeof onDeliveryTextChange === 'function') {
      try {
        onDeliveryTextChange(msgId, text);
      } catch {}
    }
  });
};

export const createDeliveryStatusUiRuntime = ({
  schedule = (handler, delay = 0) => setTimeout(handler, delay),
  clearSchedule = (timerId) => clearTimeout(timerId),
  random = Math.random,
} = {}) => ({
  clearDeliverySequence({
    getReadTimer,
    setReadTimer,
    getTypingTimer,
    setTypingTimer,
  }) {
    const readTimer = getReadTimer?.();
    if (readTimer) {
      clearSchedule(readTimer);
      setReadTimer?.(null);
    }
    const typingTimer = getTypingTimer?.();
    if (typingTimer) {
      clearSchedule(typingTimer);
      setTypingTimer?.(null);
    }
  },
  showDeliveryStatus({ scrollEl }) {
    const statusEls = scrollEl?.querySelectorAll?.('.chat-delivery-status') || [];
    [...statusEls].forEach((el) => {
      if (!String(el.textContent || '').trim()) {
        el.textContent = '✔ 已送出';
      }
    });
  },
  syncDeliveryText(targets, text, options = {}) {
    syncDeliveryTextToMessages(targets, text, options);
  },
  markAsRead({
    scrollEl,
    groupMemberCount,
    onSyncText,
    getReadCountCurrent,
    setReadCountCurrent,
    setReadCountTargets,
    setReadCountMax,
    getReadCountTimer,
    setReadCountTimer,
  }) {
    const targets = resolveDeliveryStatusTargets(scrollEl);
    if (!targets.length) return;

    if (groupMemberCount && groupMemberCount > 1) {
      const existing = Number(getReadCountCurrent?.() || 0);
      let current = Math.max(1, existing);
      const softMax = Math.min(
        groupMemberCount,
        Math.max(current + 1, Math.ceil(groupMemberCount * (0.3 + random() * 0.3))),
      );
      setReadCountCurrent?.(current);
      setReadCountTargets?.(targets);
      setReadCountMax?.(groupMemberCount);
      onSyncText?.(targets, `已读${current}`);

      const activeTimer = getReadCountTimer?.();
      if (activeTimer) {
        clearSchedule(activeTimer);
        setReadCountTimer?.(null);
      }

      const scheduleIncrement = () => {
        if (current >= softMax) return;
        const timerId = schedule(() => {
          current = Math.min(current + 1, softMax);
          setReadCountCurrent?.(current);
          onSyncText?.(targets, `已读${current}`);
          scheduleIncrement();
        }, random() * 3000 + 1500);
        setReadCountTimer?.(timerId);
      };
      scheduleIncrement();
      return;
    }

    onSyncText?.(targets, '已读');
  },
  bumpReadCount({
    speakerCount,
    onSyncText,
    getReadCountTargets,
    getReadCountCurrent,
    setReadCountCurrent,
    getReadCountMax,
    getReadCountTimer,
    setReadCountTimer,
  }) {
    const targets = getReadCountTargets?.();
    if (!targets?.length || !speakerCount) return;
    const ceiling = Number(getReadCountMax?.() || 999);
    const minCount = Math.min(ceiling, Math.max(speakerCount, Number(getReadCountCurrent?.() || 1)));

    const activeTimer = getReadCountTimer?.();
    if (activeTimer) {
      clearSchedule(activeTimer);
      setReadCountTimer?.(null);
    }

    setReadCountCurrent?.(minCount);
    onSyncText?.(targets, `已读${minCount}`);

    const max = Math.min(
      ceiling,
      minCount + Math.floor(random() * Math.max(3, Math.ceil(minCount * 0.3))) + 1,
    );
    let current = minCount;
    const scheduleMore = () => {
      if (current >= max) return;
      const timerId = schedule(() => {
        current = Math.min(current + 1, max);
        setReadCountCurrent?.(current);
        onSyncText?.(targets, `已读${current}`);
        scheduleMore();
      }, random() * 4000 + 2000);
      setReadCountTimer?.(timerId);
    };
    scheduleMore();
  },
  startDeliverySequence({
    avatarUrl = '',
    typingOptions = {},
    readOptions = {},
    clearDeliverySequence,
    setDeliverySequenceDone,
    markAsRead,
    showTyping,
    setReadTimer,
    setTypingTimer,
  }) {
    clearDeliverySequence?.();
    setDeliverySequenceDone?.(false);
    const readDelay = random() * 1200 + 800;
    const readTimer = schedule(() => {
      setReadTimer?.(null);
      markAsRead?.(readOptions);
      const typingDelay = random() * 700 + 300;
      const typingTimer = schedule(() => {
        setTypingTimer?.(null);
        setDeliverySequenceDone?.(true);
        showTyping?.(avatarUrl, typingOptions);
      }, typingDelay);
      setTypingTimer?.(typingTimer);
    }, readDelay);
    setReadTimer?.(readTimer);
  },
  fastForwardDeliverySequence({
    readOptions = {},
    clearDeliverySequence,
    markAsRead,
    setDeliverySequenceDone,
  }) {
    clearDeliverySequence?.();
    markAsRead?.(readOptions);
    setDeliverySequenceDone?.(true);
  },
});
