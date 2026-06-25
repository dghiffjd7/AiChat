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
  createCustomSelectWrapper,
  bindCustomSelectButton,
  normalizeReplyTarget,
  getDefaultReplyAvatar,
  getBridge,
  getUiMode,
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
    buildReasoningElement(message) {
      const meta = message?.meta;
      if (!meta || typeof meta !== 'object' || !documentLike?.createElement) return null;
      const text = getReasoningText(message);
      const label = String(meta.reasoningLabel || '').trim() || '推理';
      if (!text) return null;
      const details = documentLike.createElement('details');
      details.className = 'chat-reasoning';
      if (meta.reasoningHidden === true) details.dataset.hidden = '1';
      details.open = runtime.resolveReasoningOpenState(message);
      const summary = documentLike.createElement('summary');
      summary.className = 'chat-reasoning-summary';
      summary.textContent = label;
      const content = documentLike.createElement('div');
      content.className = 'chat-reasoning-content';
      content.textContent = text;
      details.appendChild(summary);
      details.appendChild(content);
      details.addEventListener('toggle', () => {
        const host =
          typeof details.closest === 'function'
            ? details.closest('.QQ_chat_charmsg, .QQ_chat_mymsg')
            : null;
        const targetMessage =
          host?.__chatappMessage && typeof host.__chatappMessage === 'object'
            ? host.__chatappMessage
            : message;
        if (!targetMessage || typeof targetMessage !== 'object') return;
        if (!targetMessage.meta || typeof targetMessage.meta !== 'object') targetMessage.meta = {};
        targetMessage.meta.reasoningExpanded = details.open === true;
        targetMessage.meta.reasoningCollapsed = details.open !== true;
      });
      return details;
    },
    buildGreetingSwitch(message) {
      const meta = message?.meta;
      if (!meta || meta.isGreeting !== true || !documentLike?.createElement) return null;
      if (String(getUiMode?.() || '').trim() !== 'rp') return null;
      const bridge = getBridge?.();
      if (!bridge?.getRpGreetingState || !bridge?.setRpGreeting) return null;
      const activeSessionId = bridge.getActiveSessionId?.();
      const state = bridge.getRpGreetingState(activeSessionId || message?.sessionId);
      const list = Array.isArray(state?.greetings) ? state.greetings : [];
      if (list.length <= 1) return null;

      const wrap = documentLike.createElement('div');
      wrap.className = 'rp-greeting-switch';
      const label = documentLike.createElement('span');
      label.className = 'rp-greeting-switch-label';
      label.textContent = '开场白';
      const select = documentLike.createElement('select');
      select.className = 'rp-greeting-switch-select';
      list.forEach((g, idx) => {
        const opt = documentLike.createElement('option');
        opt.value = g.id;
        opt.textContent = g.title || `开场白 ${idx + 1}`;
        select.appendChild(opt);
      });
      const activeId = String(state?.activeId || '').trim();
      if (activeId) select.value = activeId;
      select.disabled = state?.locked === true;
      select.addEventListener('change', () => {
        const nextId = String(select.value || '').trim();
        if (!nextId) return;
        bridge.setRpGreeting?.(nextId, state?.sessionId || activeSessionId);
      });
      wrap.appendChild(label);
      const selectWrap = createCustomSelectWrapper?.(select, {
        placeholder: '选择开场白',
        wrapperStyle: 'min-width:160px;',
        buttonStyle: 'min-width:160px;',
      });
      if (selectWrap) {
        const button = selectWrap.querySelector?.('button');
        bindCustomSelectButton?.({
          buttonEl: button,
          selectEl: select,
          fallback: '选择开场白',
        });
        wrap.appendChild(selectWrap);
      } else {
        wrap.appendChild(select);
      }
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
      const reasoningEl = runtime.buildReasoningElement(message);
      if (!replyEl && !greetingEl && !reasoningEl) return bubble;
      const existingContent = Array.from(bubble.children || [])
        .find(child => String(child?.className || '').split(/\s+/).includes('chat-message-content')) || null;
      bubble.innerHTML = '';
      if (replyEl) bubble.appendChild(replyEl);
      if (greetingEl) bubble.appendChild(greetingEl);
      if (reasoningEl) bubble.appendChild(reasoningEl);
      const content = existingContent || documentLike.createElement('div');
      content.className = 'chat-message-content';
      bubble.appendChild(content);
      return content;
    },
  };
  return runtime;
};
