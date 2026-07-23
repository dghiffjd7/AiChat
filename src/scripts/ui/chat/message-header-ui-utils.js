export const normalizeReasoningDisplayText = (value = '') => (
  String(value ?? '')
    .replace(/&amp;lt;\s*br\s*\/?\s*&amp;gt;/gi, '\n')
    .replace(/&lt;\s*br\s*\/?\s*&gt;/gi, '\n')
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
);

export const getReasoningText = (message) => {
  const meta = message?.meta;
  if (!meta || typeof meta !== 'object') return '';
  const raw = typeof meta.reasoningDisplay === 'string' ? meta.reasoningDisplay : meta.reasoning;
  return normalizeReasoningDisplayText(raw);
};

export const getReasoningUiState = (message) => {
  const meta = message?.meta;
  if (!meta || typeof meta !== 'object') return null;
  return {
    reasoningCollapsed: meta.reasoningCollapsed === true,
    reasoningExpanded: meta.reasoningExpanded === true,
  };
};

export const applyReasoningUiState = (targetMessage, sourceMessage) => {
  if (!targetMessage || typeof targetMessage !== 'object') return targetMessage;
  const sourceState = getReasoningUiState(sourceMessage);
  if (!sourceState) return targetMessage;
  if (!targetMessage.meta || typeof targetMessage.meta !== 'object') {
    targetMessage.meta = {};
  }
  if (sourceState.reasoningCollapsed || sourceState.reasoningExpanded) {
    targetMessage.meta.reasoningCollapsed = sourceState.reasoningCollapsed === true;
    targetMessage.meta.reasoningExpanded = sourceState.reasoningExpanded === true;
  } else if (targetMessage.meta.reasoningCollapsed !== true && targetMessage.meta.reasoningExpanded !== true) {
    targetMessage.meta.reasoningCollapsed = false;
    targetMessage.meta.reasoningExpanded = false;
  }
  return targetMessage;
};

export const resolveReasoningOpenState = (message, { appSettings } = {}) => {
  const meta = message?.meta;
  if (!meta || typeof meta !== 'object') return false;
  if (meta.reasoningExpanded === true) return true;
  if (meta.reasoningCollapsed === true) return false;
  return appSettings?.get?.().reasoningAutoExpand === true && meta.reasoningHidden !== true;
};

export const createMessageHeaderUiRuntime = ({
  documentLike,
  appSettings,
  normalizeReplyTarget,
  getDefaultReplyAvatar,
  getBridge,
  getUiMode,
  openRpGreetingSheet,
  onAction,
  scrollToMessage,
  resolveMessageSessionId,
  warningToast,
} = {}) => {
  const runtime = {
    getReasoningText,
    getReasoningUiState,
    applyReasoningUiState,
    resolveReasoningOpenState(message) {
      return resolveReasoningOpenState(message, { appSettings });
    },
    syncReasoningElement(details, message) {
      const meta = message?.meta;
      if (!meta || typeof meta !== 'object' || !documentLike?.createElement) return null;
      const text = getReasoningText(message);
      const label = String(meta.reasoningLabel || '').trim() || '推理';
      if (!text) return null;
      const reasoningEl = details || documentLike.createElement('details');
      const isNew = !details;
      reasoningEl.className = 'chat-reasoning';
      if (meta.reasoningHidden === true) reasoningEl.dataset.hidden = '1';
      else delete reasoningEl.dataset.hidden;
      reasoningEl.__chatappReasoningMessage = message;
      let summary = reasoningEl.querySelector?.('.chat-reasoning-summary') || null;
      if (!summary) {
        summary = documentLike.createElement('summary');
        summary.className = 'chat-reasoning-summary';
        reasoningEl.appendChild(summary);
      }
      summary.textContent = label;
      let content = reasoningEl.querySelector?.('.chat-reasoning-content') || null;
      if (!content) {
        content = documentLike.createElement('div');
        content.className = 'chat-reasoning-content';
        reasoningEl.appendChild(content);
      }
      content.textContent = text;
      if (isNew) {
        reasoningEl.open = runtime.resolveReasoningOpenState(message);
      }
      if (isNew) {
        reasoningEl.addEventListener('toggle', () => {
          const host =
            typeof reasoningEl.closest === 'function'
              ? reasoningEl.closest('.QQ_chat_charmsg, .QQ_chat_mymsg')
              : null;
          const fallbackMessage = reasoningEl.__chatappReasoningMessage;
          const targetMessage =
            host?.__chatappMessage && typeof host.__chatappMessage === 'object'
              ? host.__chatappMessage
              : fallbackMessage;
          if (!targetMessage || typeof targetMessage !== 'object') return;
          if (!targetMessage.meta || typeof targetMessage.meta !== 'object') targetMessage.meta = {};
          targetMessage.meta.reasoningExpanded = reasoningEl.open === true;
          targetMessage.meta.reasoningCollapsed = reasoningEl.open !== true;
        });
      }
      return reasoningEl;
    },
    buildReasoningElement(message) {
      return runtime.syncReasoningElement(null, message);
    },
    buildGreetingSwitch(message) {
      const meta = message?.meta;
      if (!meta || meta.isGreeting !== true || !documentLike?.createElement) return null;
      if (String(getUiMode?.() || '').trim() !== 'rp') return null;
      const bridge = getBridge?.();
      if (!bridge?.getRpGreetingState) return null;
      const activeSessionId = bridge.getActiveSessionId?.();
      const state = bridge.getRpGreetingState(activeSessionId || message?.sessionId);
      const list = Array.isArray(state?.greetings) ? state.greetings : [];
      const activeId = String(state?.activeId || meta.greetingId || '').trim();
      const active = list.find(item => String(item?.id || '').trim() === activeId) || list[0] || null;
      const titleText = String(active?.title || meta.greetingTitle || '开场白').trim() || '开场白';

      const wrap = documentLike.createElement('div');
      wrap.className = 'rp-greeting-switch rp-greeting-card-header';

      const changeButton = documentLike.createElement('button');
      changeButton.type = 'button';
      changeButton.className = 'rp-greeting-card-change';
      changeButton.textContent = '更换';
      changeButton.setAttribute?.('aria-label', '更换开场白');
      changeButton.addEventListener?.('click', (event) => {
        event?.preventDefault?.();
        event?.stopPropagation?.();
        openRpGreetingSheet?.({ message, state });
      });
      wrap.appendChild(changeButton);

      const ornament = documentLike.createElement('div');
      ornament.className = 'rp-greeting-card-ornament';
      const lineBefore = documentLike.createElement('span');
      lineBefore.className = 'rp-greeting-card-line';
      const seal = documentLike.createElement('span');
      seal.className = 'rp-greeting-card-seal';
      seal.textContent = '序';
      const lineAfter = documentLike.createElement('span');
      lineAfter.className = 'rp-greeting-card-line is-after';
      ornament.appendChild(lineBefore);
      ornament.appendChild(seal);
      ornament.appendChild(lineAfter);
      wrap.appendChild(ornament);

      const kicker = documentLike.createElement('div');
      kicker.className = 'rp-greeting-card-kicker';
      kicker.textContent = '序　幕';
      wrap.appendChild(kicker);

      const title = documentLike.createElement('div');
      title.className = 'rp-greeting-card-title';
      title.textContent = titleText;
      wrap.appendChild(title);

      const diamonds = documentLike.createElement('div');
      diamonds.className = 'rp-greeting-card-diamonds';
      for (let index = 0; index < 3; index += 1) {
        const diamond = documentLike.createElement('span');
        if (index === 1) diamond.className = 'is-accent';
        diamonds.appendChild(diamond);
      }
      wrap.appendChild(diamonds);
      return wrap;
    },
    buildReplyPreviewElement(message) {
      if (!documentLike?.createElement) return null;
      const replyTo = normalizeReplyTarget?.(message?.meta?.replyTo);
      if (!replyTo) return null;
      const box = documentLike.createElement('button');
      box.type = 'button';
      box.className = 'chat-reply-preview';
      box.setAttribute('aria-label', `查看回复原消息：${replyTo.author || '消息'}`);
      const avatar = documentLike.createElement('img');
      avatar.className = 'chat-reply-preview-avatar';
      avatar.src = replyTo.avatar || getDefaultReplyAvatar?.() || '';
      avatar.alt = '';
      const textWrap = documentLike.createElement('span');
      textWrap.className = 'chat-reply-preview-text';
      const author = documentLike.createElement('span');
      author.className = 'chat-reply-preview-author';
      author.textContent = replyTo.author || '消息';
      const snippet = documentLike.createElement('span');
      snippet.className = 'chat-reply-preview-snippet';
      snippet.textContent = replyTo.content || '...';
      textWrap.appendChild(author);
      textWrap.appendChild(snippet);
      box.appendChild(avatar);
      box.appendChild(textWrap);
      box.addEventListener('click', async (e) => {
        e?.preventDefault?.();
        e?.stopPropagation?.();
        const handled = await onAction?.('jump-reply-target', message, {
          targetId: replyTo.id,
          sessionId: replyTo.sessionId || message?.sessionId || resolveMessageSessionId?.(message),
          keyword: replyTo.content || '',
        });
        if (handled) return;
        if (replyTo.id && scrollToMessage?.(replyTo.id, { keyword: replyTo.content || '', kind: 'anchor' })) return;
        warningToast?.('未找到被回复的消息');
      });
      return box;
    },
    prepareTextContainer(bubble, message) {
      if (!bubble) return bubble;
      const replyEl = runtime.buildReplyPreviewElement(message);
      const greetingEl = runtime.buildGreetingSwitch(message);
      const greetingFooter = greetingEl ? documentLike.createElement('div') : null;
      if (greetingFooter) {
        greetingFooter.className = 'rp-greeting-card-footer';
        greetingFooter.textContent = '—— 幕 启 ——';
      }
      const existingReasoning = Array.from(bubble.children || [])
        .find(child => String(child?.className || '').split(/\s+/).includes('chat-reasoning')) || null;
      const reasoningEl = runtime.syncReasoningElement(existingReasoning, message);
      if (!replyEl && !greetingEl && !reasoningEl) return bubble;
      const existingContent = Array.from(bubble.children || [])
        .find(child => String(child?.className || '').split(/\s+/).includes('chat-message-content')) || null;
      const content = existingContent || documentLike.createElement('div');
      content.className = 'chat-message-content';
      const retained = new Set([reasoningEl, content].filter(Boolean));
      Array.from(bubble.children || []).forEach((child) => {
        if (retained.has(child)) return;
        if (typeof child?.remove === 'function') child.remove();
        else bubble.removeChild?.(child);
      });
      if (content.parentNode !== bubble) bubble.appendChild(content);
      if (reasoningEl && reasoningEl.parentNode !== bubble) {
        bubble.insertBefore?.(reasoningEl, content);
      }
      const headerAnchor = reasoningEl || content;
      if (replyEl) bubble.insertBefore?.(replyEl, headerAnchor);
      if (greetingEl) bubble.insertBefore?.(greetingEl, headerAnchor);
      if (greetingFooter) bubble.appendChild?.(greetingFooter);
      return content;
    },
  };
  return runtime;
};
