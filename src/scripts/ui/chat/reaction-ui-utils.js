import {
  DEFAULT_REACTION_EMOJIS,
  SELF_REACTION_ACTOR,
  countReactionActors,
  hasReactionActor,
  normalizeReactionEntries,
} from './message-interaction-utils.js';

export const buildReactionSummaryElement = (
  message,
  {
    documentLike = document,
    isThreadingEnabled = false,
    onToggleReaction = null,
  } = {},
) => {
  if (!isThreadingEnabled) return null;
  const reactions = normalizeReactionEntries(message?.meta?.reactions);
  if (!reactions.length) return null;
  const wrap = documentLike.createElement('div');
  wrap.className = 'chat-reaction-summary';
  reactions.forEach((entry) => {
    const chip = documentLike.createElement('button');
    chip.type = 'button';
    chip.className = 'chat-reaction-chip';
    if (hasReactionActor(entry, SELF_REACTION_ACTOR)) chip.classList?.add?.('is-self');
    const emoji = documentLike.createElement('span');
    emoji.className = 'chat-reaction-chip-emoji';
    emoji.textContent = entry.emoji;
    const count = documentLike.createElement('span');
    count.className = 'chat-reaction-chip-count';
    count.textContent = String(countReactionActors(entry));
    chip.appendChild(emoji);
    chip.appendChild(count);
    chip.setAttribute?.('aria-label', `${entry.emoji} ${countReactionActors(entry)}个反应`);
    chip.addEventListener?.('click', (event) => {
      event.preventDefault?.();
      event.stopPropagation?.();
      onToggleReaction?.(entry.emoji);
    });
    wrap.appendChild(chip);
  });
  return wrap;
};

export const createReactionTriggerButton = (
  message,
  {
    documentLike = document,
    isThreadingEnabled = false,
    onShowPicker = null,
  } = {},
) => {
  if (!isThreadingEnabled) return null;
  const reactionBtn = documentLike.createElement('button');
  reactionBtn.type = 'button';
  reactionBtn.className = 'chat-reaction-trigger';
  reactionBtn.setAttribute?.('aria-label', '添加反应');
  reactionBtn.textContent = '☺';
  reactionBtn.addEventListener?.('click', (event) => {
    event.preventDefault?.();
    event.stopPropagation?.();
    onShowPicker?.(reactionBtn, message);
  });
  return reactionBtn;
};

export const createReactionPicker = ({
  documentLike = document,
  onOutsidePress = null,
} = {}) => {
  const picker = documentLike.createElement('div');
  picker.id = 'msg-reaction-picker';
  picker.className = 'chat-reaction-picker';
  picker.style.cssText = `
            position: fixed;
            display: none;
            z-index: 20010;
        `;
  documentLike.body?.appendChild?.(picker);
  documentLike.addEventListener?.(
    'pointerdown',
    (event) => {
      if (picker.style.display === 'none') return;
      if (picker.contains?.(event.target)) return;
      onOutsidePress?.();
    },
    { passive: true },
  );
  return picker;
};

export const hideReactionPicker = (picker) => {
  if (!picker) return;
  picker.style.display = 'none';
  picker.innerHTML = '';
};

export const showReactionPicker = ({
  picker = null,
  contextMenuEl = null,
  anchor = null,
  message = null,
  isThreadingEnabled = false,
  onToggleReaction = null,
  hidePicker = null,
  windowLike = window,
  documentLike = document,
} = {}) => {
  if (!picker || !anchor || !isThreadingEnabled) return false;
  if (contextMenuEl) contextMenuEl.style.display = 'none';
  picker.innerHTML = '';
  const currentReactions = normalizeReactionEntries(message?.meta?.reactions);
  DEFAULT_REACTION_EMOJIS.forEach((emojiValue) => {
    const btn = documentLike.createElement('button');
    btn.type = 'button';
    btn.className = 'chat-reaction-option';
    if (currentReactions.some((entry) => entry.emoji === emojiValue && hasReactionActor(entry, SELF_REACTION_ACTOR))) {
      btn.classList?.add?.('is-active');
    }
    btn.textContent = emojiValue;
    btn.setAttribute?.('aria-label', `使用${emojiValue}回应`);
    btn.addEventListener?.('click', (event) => {
      event.preventDefault?.();
      event.stopPropagation?.();
      hidePicker?.();
      onToggleReaction?.(emojiValue);
    });
    picker.appendChild(btn);
  });
  picker.style.display = 'flex';
  picker.style.visibility = 'hidden';
  const rect = anchor.getBoundingClientRect();
  const pickerW = picker.offsetWidth || 240;
  const pickerH = picker.offsetHeight || 48;
  const padding = 8;
  let left = rect.left + rect.width / 2 - pickerW / 2;
  let top = rect.top - pickerH - 10;
  left = Math.max(padding, Math.min(left, windowLike.innerWidth - pickerW - padding));
  if (top < padding) top = Math.min(windowLike.innerHeight - pickerH - padding, rect.bottom + 10);
  picker.style.left = `${left}px`;
  picker.style.top = `${Math.max(padding, top)}px`;
  picker.style.visibility = 'visible';
  return true;
};
