export const ensureSwipeMeta = (message) => {
  if (!message || typeof message !== 'object') return null;
  if (!message.meta || typeof message.meta !== 'object') message.meta = {};
  if (!Array.isArray(message.meta.swipes)) {
    message.meta.swipes = [{ content: message.content, raw: message.raw }];
    message.meta.activeSwipe = 0;
  }
  return message.meta;
};

export const resolveSwipeIndicatorState = (message) => {
  const swipes = Array.isArray(message?.meta?.swipes) ? message.meta.swipes : null;
  const total = swipes?.length ? swipes.length : 1;
  const rawActive = Math.trunc(Number(message?.meta?.activeSwipe));
  const active = swipes
    ? (Number.isFinite(rawActive) ? Math.min(Math.max(0, rawActive), total - 1) : 0)
    : 0;
  const generating = Boolean(message?.meta?.swipeRegenerating) || Boolean(message?.meta?.activeSwipeDraft?.active);
  const nextLabel = generating ? '生成中' : (active >= total - 1 ? '生成新回复' : '下一条回复');
  return {
    swipes,
    total,
    active,
    generating,
    nextLabel,
  };
};

export const createSwipeIndicatorElement = (documentLike, message) => {
  const { total, active, generating, nextLabel } = resolveSwipeIndicatorState(message);
  const swipeWrap = documentLike.createElement('div');
  swipeWrap.className = 'rp-swipe-indicator';
  swipeWrap.dataset.msgId = message?.id || '';

  const prevBtn = documentLike.createElement('button');
  prevBtn.type = 'button';
  prevBtn.className = 'rp-swipe-prev';
  prevBtn.textContent = '◀';
  prevBtn.disabled = generating || active <= 0;
  prevBtn.setAttribute('aria-label', '上一条回复');
  prevBtn.title = '上一条回复';

  const counter = documentLike.createElement('span');
  counter.className = 'rp-swipe-counter';
  counter.textContent = `${active + 1}/${total}`;

  const nextBtn = documentLike.createElement('button');
  nextBtn.type = 'button';
  nextBtn.className = 'rp-swipe-next';
  nextBtn.textContent = '▶';
  nextBtn.disabled = generating;
  nextBtn.setAttribute('aria-label', nextLabel);
  nextBtn.title = nextLabel;

  swipeWrap.appendChild(prevBtn);
  swipeWrap.appendChild(counter);
  swipeWrap.appendChild(nextBtn);
  return swipeWrap;
};

export const syncSwipeIndicatorElement = (indicator, index, total, { generating = false } = {}) => {
  if (!indicator) return;
  const safeTotal = Math.max(1, Number(total) || 1);
  const safeIndex = Math.min(Math.max(0, Number(index) || 0), safeTotal - 1);
  const counter = indicator.querySelector?.('.rp-swipe-counter');
  if (counter) counter.textContent = `${safeIndex + 1}/${safeTotal}`;
  const prevBtn = indicator.querySelector?.('.rp-swipe-prev');
  if (prevBtn) {
    prevBtn.disabled = generating || safeIndex <= 0;
    prevBtn.setAttribute('aria-label', '上一条回复');
    prevBtn.title = '上一条回复';
  }
  const nextBtn = indicator.querySelector?.('.rp-swipe-next');
  if (nextBtn) {
    nextBtn.disabled = generating;
    const label = generating ? '生成中' : (safeIndex >= safeTotal - 1 ? '生成新回复' : '下一条回复');
    nextBtn.setAttribute('aria-label', label);
    nextBtn.title = label;
  }
};

export const resolveActiveSwipeMessageCore = (message, {
  activeSwipeGenerationMsgId = '',
} = {}) => {
  if (!message || typeof message !== 'object') return message;
  let meta = message.meta && typeof message.meta === 'object' ? message.meta : null;
  let swipes = Array.isArray(meta?.swipes) && meta.swipes.length ? meta.swipes : null;
  if (!swipes) return message;
  if (swipes.some(branch => branch?.draft)) {
    const keepDraft =
      meta?.swipeRegenerating === true &&
      activeSwipeGenerationMsgId &&
      activeSwipeGenerationMsgId === String(message?.id || '');
    if (!keepDraft) {
      const cleanedSwipes = swipes.filter(branch => !branch?.draft);
      swipes = cleanedSwipes.length
        ? cleanedSwipes
        : [{ content: message.content ?? '', raw: message.raw }];
      const rawIndex = Math.trunc(Number(meta.activeSwipe));
      const activeIndex = Number.isFinite(rawIndex)
        ? Math.min(Math.max(0, rawIndex), swipes.length - 1)
        : Math.max(0, swipes.length - 1);
      meta = {
        ...meta,
        swipes,
        activeSwipe: activeIndex,
      };
      delete meta.swipeRegenerating;
      delete meta.activeSwipeDraft;
    }
  }
  const rawIndex = Math.trunc(Number(meta.activeSwipe));
  const active = Number.isFinite(rawIndex)
    ? Math.min(Math.max(0, rawIndex), swipes.length - 1)
    : 0;
  const branch = swipes[active] || {};
  const activeSwipeDraft = branch?.draft
    ? { active: true, label: String(branch?.label || '生成新回复中...') }
    : null;
  const nextMeta = { ...(meta || {}) };
  if (meta.activeSwipe !== active) nextMeta.activeSwipe = active;
  if (activeSwipeDraft) nextMeta.activeSwipeDraft = activeSwipeDraft;
  else delete nextMeta.activeSwipeDraft;
  const next = {
    ...message,
    content: branch.content ?? message.content ?? '',
    meta: nextMeta,
  };
  if (branch.raw !== undefined) next.raw = branch.raw;
  else if (branch.content !== undefined) next.raw = branch.content;
  return next;
};

export const renderSwipeDraftPlaceholderCore = (target, {
  documentLike,
  label = '生成新回复中...',
} = {}) => {
  if (!target) return false;
  target.classList.add('rp-swipe-draft-placeholder');
  const dots = documentLike.createElement('span');
  dots.className = 'rp-static-dots';
  dots.setAttribute?.('aria-hidden', 'true');
  for (let i = 0; i < 3; i += 1) {
    const dot = documentLike.createElement('span');
    dot.className = 'rp-static-dot';
    dots.appendChild(dot);
  }
  const text = documentLike.createElement('span');
  text.textContent = String(label || '生成新回复中...');
  target.appendChild(dots);
  target.appendChild(text);
  return true;
};
