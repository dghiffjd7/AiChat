export const createDividerMessageWrapperCore = ({
  documentLike,
  message,
} = {}) => {
  const wrapper = documentLike.createElement('div');
  wrapper.className = 'QQ_chat_sysmsg QQ_chat_unread-divider';
  wrapper.dataset.msgId = message?.id || '';
  wrapper.dataset.role = 'system';
  wrapper.__chatappMessage = message;

  const line = documentLike.createElement('div');
  line.className = 'QQ_chat_unread-line';
  const text = documentLike.createElement('span');
  text.textContent = String(message?.content ?? '');
  line.appendChild?.(text);
  wrapper.appendChild?.(line);
  return wrapper;
};

export const createSystemMessageWrapperCore = ({
  documentLike,
  message,
} = {}) => {
  const wrapper = documentLike.createElement('div');
  wrapper.className = 'QQ_chat_sysmsg';
  wrapper.dataset.msgId = message?.id || '';
  wrapper.dataset.role = 'system';
  if (Number.isFinite(Number(message?.timestamp)) && Number(message.timestamp) > 0) {
    wrapper.dataset.timestamp = String(Number(message.timestamp));
  }
  wrapper.__chatappMessage = message;

  const bubble = documentLike.createElement('div');
  bubble.className = 'QQ_chat_sysbubble';
  bubble.textContent = String(message?.content ?? '');

  const timeEl = documentLike.createElement('span');
  timeEl.className = 'QQ_chat_time sys';
  timeEl.textContent = message?.time || '';

  wrapper.appendChild?.(bubble);
  if (timeEl.textContent) wrapper.appendChild?.(timeEl);
  return wrapper;
};

export const createStandardMessageWrapperCore = ({
  documentLike,
  message,
  isUser = false,
  applyCreativeBubbleState = null,
} = {}) => {
  const wrapper = documentLike.createElement('div');
  wrapper.className = isUser ? 'QQ_chat_mymsg' : 'QQ_chat_charmsg';
  wrapper.dataset.msgId = message?.id || '';
  wrapper.dataset.role = message?.role || '';
  if (Number.isFinite(Number(message?.timestamp)) && Number(message.timestamp) > 0) {
    wrapper.dataset.timestamp = String(Number(message.timestamp));
  }
  wrapper.__chatappMessage = message;
  if (message?.meta?.floor != null) wrapper.dataset.rpFloor = String(message.meta.floor);
  if (message?.meta?.swipeRegenerating === true) {
    wrapper.classList?.add?.('is-rp-regenerating');
    wrapper.setAttribute?.('aria-busy', 'true');
  }
  if (message?.meta?.hideAvatar === true || message?.meta?.compactWithSource === true) {
    wrapper.classList?.add?.('is-source-followup');
  }
  applyCreativeBubbleState?.(wrapper, message);
  if (message?.status === 'pending' || message?.status === 'sending') {
    wrapper.classList?.add?.('message-pending');
    wrapper.dataset.status = message.status;
  }
  return wrapper;
};

export const createMessageAvatarImageCore = ({
  documentLike,
  message,
  defaultAvatar = '',
} = {}) => {
  const avatarImg = documentLike.createElement('img');
  avatarImg.className = 'QQ_chat_head';
  avatarImg.src = message?.avatar || defaultAvatar;
  avatarImg.alt = message?.name || '';
  avatarImg.loading = 'lazy';
  avatarImg.decoding = 'async';
  if (message?.meta?.hideAvatar === true || message?.meta?.compactWithSource === true) {
    avatarImg.classList?.add?.('is-hidden-followup');
    avatarImg.alt = '';
    avatarImg.setAttribute?.('aria-hidden', 'true');
    if (avatarImg.style) {
      avatarImg.style.visibility = 'hidden';
      avatarImg.style.pointerEvents = 'none';
    }
  }
  return avatarImg;
};
