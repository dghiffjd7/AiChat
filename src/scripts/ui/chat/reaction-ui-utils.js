import {
  DEFAULT_REACTION_EMOJIS,
  SELF_REACTION_ACTOR,
  countReactionActors,
  hasReactionActor,
  normalizeReactionEntries,
} from './message-interaction-utils.js';
import {
  REACTION_EMOJI_CATEGORIES,
  filterReactionEmojiCatalog,
  findReactionEmoji,
  getTwemojiAssetPath,
} from './reaction-emoji-catalog.js';
import { resolveFrequentReactionEmojis } from './reaction-preference-utils.js';

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

const createSvgNode = (documentLike, tagName) => (
  documentLike.createElementNS?.(SVG_NAMESPACE, tagName) || documentLike.createElement(tagName)
);

const createReactionMoreIcon = (documentLike) => {
  const svg = createSvgNode(documentLike, 'svg');
  Object.entries({
    viewBox: '0 0 24 24',
    width: '18',
    height: '18',
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': '1.8',
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    focusable: 'false',
    'aria-hidden': 'true',
  }).forEach(([name, value]) => svg.setAttribute?.(name, value));
  ['M14.4 5.2A7.5 7.5 0 1 0 18.8 9.6', 'M8.4 10h.01', 'M12.6 10h.01', 'M8.5 14c1.5 1.4 3.5 1.4 5 0', 'M18 3v6', 'M15 6h6']
    .forEach((pathData) => {
      const path = createSvgNode(documentLike, 'path');
      path.setAttribute?.('d', pathData);
      svg.appendChild?.(path);
    });
  return svg;
};

export const createReactionEmojiVisual = (emojiValue, {
  documentLike = document,
  className = '',
} = {}) => {
  const emoji = String(emojiValue || '').trim();
  const wrap = documentLike.createElement('span');
  wrap.className = `chat-reaction-emoji-visual${className ? ` ${className}` : ''}`;
  wrap.setAttribute?.('aria-hidden', 'true');

  const image = documentLike.createElement('img');
  image.className = 'chat-reaction-emoji-image';
  image.src = getTwemojiAssetPath(emoji);
  image.alt = '';
  image.draggable = false;
  image.decoding = 'async';

  const fallback = documentLike.createElement('span');
  fallback.className = 'chat-reaction-emoji-fallback';
  fallback.textContent = emoji;
  image.addEventListener?.('error', () => wrap.classList?.add?.('is-fallback'));

  wrap.appendChild?.(image);
  wrap.appendChild?.(fallback);
  return wrap;
};

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
    const emoji = createReactionEmojiVisual(entry.emoji, {
      documentLike,
      className: 'chat-reaction-chip-emoji',
    });
    const count = documentLike.createElement('span');
    count.className = 'chat-reaction-chip-count';
    count.textContent = String(countReactionActors(entry));
    chip.appendChild?.(emoji);
    chip.appendChild?.(count);
    chip.setAttribute?.('aria-label', `${entry.emoji} ${countReactionActors(entry)}个反应`);
    chip.addEventListener?.('click', (event) => {
      event.preventDefault?.();
      event.stopPropagation?.();
      onToggleReaction?.(entry.emoji);
    });
    wrap.appendChild?.(chip);
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
  reactionBtn.appendChild?.(createReactionMoreIcon(documentLike));
  reactionBtn.addEventListener?.('click', (event) => {
    event.preventDefault?.();
    event.stopPropagation?.();
    onShowPicker?.(reactionBtn, message);
  });
  return reactionBtn;
};

export const createReactionQuickBar = (
  message,
  {
    documentLike = document,
    isThreadingEnabled = false,
    emojis = [],
    onToggleReaction = null,
    onShowPicker = null,
  } = {},
) => {
  if (!isThreadingEnabled) return null;
  const values = Array.from(new Set((Array.isArray(emojis) ? emojis : [])
    .map(value => String(value || '').trim())
    .filter(Boolean)))
    .slice(0, 3);
  if (!values.length) return null;
  const currentReactions = normalizeReactionEntries(message?.meta?.reactions);
  const bar = documentLike.createElement('div');
  bar.className = 'chat-reaction-quick-bar';
  bar.setAttribute?.('role', 'toolbar');
  bar.setAttribute?.('aria-label', '快捷表情反应');

  values.forEach((emojiValue) => {
    const button = documentLike.createElement('button');
    button.type = 'button';
    button.className = 'chat-reaction-quick-button';
    button.dataset.emoji = emojiValue;
    if (currentReactions.some(entry => (
      entry.emoji === emojiValue && hasReactionActor(entry, SELF_REACTION_ACTOR)
    ))) {
      button.classList?.add?.('is-active');
    }
    button.setAttribute?.('aria-label', `使用${emojiValue}回应`);
    button.appendChild?.(createReactionEmojiVisual(emojiValue, { documentLike }));
    button.addEventListener?.('click', (event) => {
      event.preventDefault?.();
      event.stopPropagation?.();
      onToggleReaction?.(emojiValue);
    });
    bar.appendChild?.(button);
  });

  const moreButton = documentLike.createElement('button');
  moreButton.type = 'button';
  moreButton.className = 'chat-reaction-quick-button chat-reaction-more';
  moreButton.setAttribute?.('aria-label', '选择更多表情反应');
  moreButton.appendChild?.(createReactionMoreIcon(documentLike));
  moreButton.addEventListener?.('click', (event) => {
    event.preventDefault?.();
    event.stopPropagation?.();
    onShowPicker?.(moreButton, message);
  });
  bar.appendChild?.(moreButton);
  return bar;
};

const isReactionTouchTargetInteractive = (target) => Boolean(target?.closest?.(
  'a, button, input, textarea, select, summary, audio, video, canvas, iframe, [contenteditable="true"]',
));

export const createReactionQuickBarTouchRuntime = ({
  documentLike = document,
} = {}) => {
  let activeStack = null;
  const boundBubbles = new WeakSet();
  const close = () => {
    activeStack?.classList?.remove?.('is-reaction-bar-open');
    activeStack = null;
  };
  const onOutsidePointerDown = (event) => {
    if (!activeStack || activeStack.contains?.(event?.target)) return;
    close();
  };
  documentLike.addEventListener?.('pointerdown', onOutsidePointerDown, { passive: true });
  return {
    bind({ bubbleStack = null, bubble = null, quickBar = null } = {}) {
      if (!bubbleStack || !bubble || !quickBar) return false;
      if (boundBubbles.has(bubble)) return true;
      boundBubbles.add(bubble);
      let touchStart = null;
      bubble.addEventListener?.('pointerdown', (event) => {
        if (event?.pointerType === 'mouse' || isReactionTouchTargetInteractive(event?.target)) {
          touchStart = null;
          return;
        }
        touchStart = {
          pointerId: event?.pointerId,
          x: Number(event?.clientX) || 0,
          y: Number(event?.clientY) || 0,
          moved: false,
          startedAt: Number.isFinite(Number(event?.timeStamp))
            ? Number(event.timeStamp)
            : Date.now(),
        };
      }, { passive: true });
      bubble.addEventListener?.('pointermove', (event) => {
        if (!touchStart || (touchStart.pointerId != null && event?.pointerId !== touchStart.pointerId)) return;
        const dx = (Number(event?.clientX) || 0) - touchStart.x;
        const dy = (Number(event?.clientY) || 0) - touchStart.y;
        if (dx * dx + dy * dy > 10 * 10) touchStart.moved = true;
      }, { passive: true });
      bubble.addEventListener?.('pointerup', (event) => {
        const tap = touchStart;
        touchStart = null;
        if (!tap || tap.moved || event?.pointerType === 'mouse' || event?.defaultPrevented) return;
        if (tap.pointerId != null && event?.pointerId !== tap.pointerId) return;
        const endedAt = Number.isFinite(Number(event?.timeStamp))
          ? Number(event.timeStamp)
          : Date.now();
        if (endedAt - tap.startedAt > 450) return;
        if (isReactionTouchTargetInteractive(event?.target)) return;
        try {
          if (String(documentLike.getSelection?.()?.toString?.() || '').trim()) return;
        } catch {}
        if (activeStack === bubbleStack) {
          close();
          return;
        }
        close();
        activeStack = bubbleStack;
        activeStack.classList?.add?.('is-reaction-bar-open');
      }, { passive: true });
      bubble.addEventListener?.('pointercancel', () => {
        touchStart = null;
      }, { passive: true });
      return true;
    },
    close,
    destroy() {
      close();
      documentLike.removeEventListener?.('pointerdown', onOutsidePointerDown);
    },
  };
};

export const createReactionPicker = ({
  documentLike = document,
  onOutsidePress = null,
} = {}) => {
  const picker = documentLike.createElement('div');
  picker.id = 'msg-reaction-picker';
  picker.className = 'chat-reaction-picker';
  picker.setAttribute?.('role', 'dialog');
  picker.setAttribute?.('aria-label', '选择表情反应');
  picker.style.cssText = 'position:fixed;display:none;z-index:20010;';
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
  picker.addEventListener?.('keydown', (event) => {
    if (event?.key !== 'Escape') return;
    event.preventDefault?.();
    onOutsidePress?.();
  });
  return picker;
};

export const hideReactionPicker = (picker) => {
  if (!picker) return;
  picker.style.display = 'none';
  picker.style.visibility = '';
  picker.innerHTML = '';
  if (picker.dataset) {
    delete picker.dataset.activeCategory;
    delete picker.dataset.mobile;
  }
};

const resolvePickerCategories = (usage = {}) => {
  const frequentEmojis = resolveFrequentReactionEmojis({
    usage,
    defaults: DEFAULT_REACTION_EMOJIS,
    limit: 18,
  });
  const frequentItems = frequentEmojis.map(emoji => findReactionEmoji(emoji) || {
    emoji,
    label: emoji,
    keywords: emoji,
    categoryId: 'frequent',
    categoryLabel: '常用',
  });
  return [
    { id: 'frequent', label: '常用', icon: '🕘', emojis: frequentItems },
    ...REACTION_EMOJI_CATEGORIES,
  ];
};

const buildPickerOption = ({
  item,
  currentReactions,
  documentLike,
  hidePicker,
  onToggleReaction,
}) => {
  const emojiValue = String(item?.emoji || '').trim();
  const button = documentLike.createElement('button');
  button.type = 'button';
  button.className = 'chat-reaction-option chat-reaction-picker-option';
  button.dataset.emoji = emojiValue;
  if (currentReactions.some(entry => (
    entry.emoji === emojiValue && hasReactionActor(entry, SELF_REACTION_ACTOR)
  ))) {
    button.classList?.add?.('is-active');
  }
  button.setAttribute?.('aria-label', `使用${emojiValue}回应，${item?.label || emojiValue}`);
  button.setAttribute?.('title', item?.label || emojiValue);
  button.appendChild?.(createReactionEmojiVisual(emojiValue, { documentLike }));
  button.addEventListener?.('click', (event) => {
    event.preventDefault?.();
    event.stopPropagation?.();
    hidePicker?.();
    onToggleReaction?.(emojiValue);
  });
  return button;
};

export const showReactionPicker = ({
  picker = null,
  contextMenuEl = null,
  anchor = null,
  message = null,
  isThreadingEnabled = false,
  usage = {},
  onToggleReaction = null,
  hidePicker = null,
  windowLike = window,
  documentLike = document,
} = {}) => {
  if (!picker || !anchor || !isThreadingEnabled) return false;
  if (contextMenuEl) contextMenuEl.style.display = 'none';
  picker.innerHTML = '';
  const currentReactions = normalizeReactionEntries(message?.meta?.reactions);
  const categories = resolvePickerCategories(usage);
  const state = { activeCategory: 'frequent', query: '' };

  const header = documentLike.createElement('div');
  header.className = 'chat-reaction-picker-header';
  const title = documentLike.createElement('strong');
  title.textContent = '添加表情反应';
  const closeButton = documentLike.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'chat-reaction-picker-close';
  closeButton.textContent = '×';
  closeButton.setAttribute?.('aria-label', '关闭表情选择器');
  closeButton.addEventListener?.('click', (event) => {
    event.preventDefault?.();
    hidePicker?.();
  });
  header.appendChild?.(title);
  header.appendChild?.(closeButton);

  const search = documentLike.createElement('input');
  search.type = 'search';
  search.className = 'chat-reaction-picker-search';
  search.placeholder = '搜索表情';
  search.setAttribute?.('aria-label', '搜索表情');

  const tabs = documentLike.createElement('div');
  tabs.className = 'chat-reaction-picker-tabs';
  tabs.setAttribute?.('role', 'tablist');
  tabs.setAttribute?.('aria-label', '表情分类');

  const content = documentLike.createElement('div');
  content.className = 'chat-reaction-picker-content';
  content.setAttribute?.('role', 'tabpanel');

  const tabButtons = new Map();
  const render = () => {
    picker.dataset.activeCategory = state.activeCategory;
    tabButtons.forEach((button, categoryId) => {
      const active = !state.query && categoryId === state.activeCategory;
      button.classList?.toggle?.('is-active', active);
      button.setAttribute?.('aria-selected', active ? 'true' : 'false');
    });
    content.innerHTML = '';
    const items = state.query
      ? filterReactionEmojiCatalog(state.query)
      : (categories.find(category => category.id === state.activeCategory)?.emojis || []);
    if (!items.length) {
      const empty = documentLike.createElement('div');
      empty.className = 'chat-reaction-picker-empty';
      empty.textContent = '没有找到表情';
      content.appendChild?.(empty);
      return;
    }
    items.forEach(item => content.appendChild?.(buildPickerOption({
      item,
      currentReactions,
      documentLike,
      hidePicker,
      onToggleReaction,
    })));
  };

  categories.forEach((category) => {
    const tab = documentLike.createElement('button');
    tab.type = 'button';
    tab.className = 'chat-reaction-picker-tab';
    tab.dataset.category = category.id;
    tab.setAttribute?.('role', 'tab');
    tab.setAttribute?.('aria-label', category.label);
    tab.setAttribute?.('title', category.label);
    tab.appendChild?.(createReactionEmojiVisual(category.icon, { documentLike }));
    tab.addEventListener?.('click', (event) => {
      event.preventDefault?.();
      state.activeCategory = category.id;
      state.query = '';
      search.value = '';
      render();
    });
    tabButtons.set(category.id, tab);
    tabs.appendChild?.(tab);
  });
  search.addEventListener?.('input', () => {
    state.query = String(search.value || '').trim();
    render();
  });

  picker.appendChild?.(header);
  picker.appendChild?.(search);
  picker.appendChild?.(tabs);
  picker.appendChild?.(content);
  render();

  picker.style.display = 'block';
  picker.style.visibility = 'hidden';
  const rect = anchor.getBoundingClientRect();
  const pickerW = picker.offsetWidth || 356;
  const pickerH = picker.offsetHeight || 390;
  const padding = 8;
  const isMobile = Number(windowLike.innerWidth || 0) <= 600;
  if (isMobile) {
    picker.dataset.mobile = '1';
    picker.style.left = `${padding}px`;
    picker.style.right = `${padding}px`;
    picker.style.top = 'auto';
    picker.style.bottom = 'calc(8px + env(safe-area-inset-bottom, 0px))';
  } else {
    delete picker.dataset.mobile;
    picker.style.right = 'auto';
    picker.style.bottom = 'auto';
    let left = rect.left + rect.width / 2 - pickerW / 2;
    let top = rect.top - pickerH - 10;
    left = Math.max(padding, Math.min(left, windowLike.innerWidth - pickerW - padding));
    if (top < padding) top = Math.min(windowLike.innerHeight - pickerH - padding, rect.bottom + 10);
    picker.style.left = `${left}px`;
    picker.style.top = `${Math.max(padding, top)}px`;
  }
  picker.style.visibility = 'visible';
  return true;
};
