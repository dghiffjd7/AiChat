const INLINE_GENERATED_IMAGE_TOKEN_RE = /\[(?:img|img-error)-[^\]\n]+\]/i;

const hasInlineGeneratedImageToken = value => INLINE_GENERATED_IMAGE_TOKEN_RE.test(String(value || ''));

const compactStringValues = values => values
  .map(value => (typeof value === 'string' ? value : ''))
  .filter(value => value.trim());

export const buildContextMenuActions = (message, {
  hasCode = false,
  isThreadingEnabled = false,
} = {}) => {
  const actions = [];
  if (isThreadingEnabled) {
    actions.push({ key: 'reply', label: '回复' });
  }
  const canViewSource = hasCode || (message?.role === 'assistant' && message?.meta?.renderRich === true);
  if (canViewSource) {
    actions.push({ key: 'view-code', label: '✏' });
  }
  const canDownload = ['image', 'document', 'sticker'].includes(String(message?.type || ''));
  if (canDownload) {
    actions.push({ key: 'download', label: '下载' });
  }
  if (message?.meta?.generatedMedia?.status === 'running') {
    actions.push({ key: 'cancel-media-generation', label: '取消生成' });
    return actions;
  }
  if (
    message?.status !== 'pending' &&
    message?.status !== 'sending' &&
    ['text', 'image', 'sticker'].includes(String(message?.type || 'text'))
  ) {
    const hasGeneratedImagePrompt = Boolean(String(message?.meta?.generatedMedia?.prompt || '').trim());
    actions.push({
      key: 'generate-image',
      label: message?.type === 'image' && hasGeneratedImagePrompt ? '重新生成图片' : '以此生成图片',
    });
  }
  if (message?.role === 'assistant') {
    actions.push({ key: 'copy-text', label: '复制' });
    actions.push({ key: 'regenerate', label: '重新生成' });
    if (canDeleteCurrentSwipe(message)) {
      actions.push({ key: 'delete-current-swipe', label: '删除当前回复' });
    }
    actions.push({ key: 'delete', label: '删除' });
  } else if (message?.role === 'user') {
    if (message?.status === 'pending') {
      actions.push({ key: 'send-to-here', label: '🚀 发送到这里' });
    }
    actions.push({ key: 'copy-text', label: '复制' });
    if (message?.status !== 'pending' && message?.status !== 'sending' && !message?.meta?.generatedByAssistant) {
      actions.push({ key: 'regenerate', label: '重新生成' });
    }
    if (message?.status !== 'pending' && message?.status !== 'sending') {
      actions.push({ key: 'edit', label: '编辑' });
    }
    actions.push({ key: 'delete', label: '删除' });
  }
  return actions;
};

export const resolveActiveSwipeIndex = (message) => {
  const swipes = Array.isArray(message?.meta?.swipes) ? message.meta.swipes : [];
  const raw = Math.trunc(Number(message?.meta?.activeSwipe));
  if (!swipes.length) return 0;
  return Number.isFinite(raw)
    ? Math.min(Math.max(0, raw), swipes.length - 1)
    : Math.max(0, swipes.length - 1);
};

export const canDeleteCurrentSwipe = (message) => {
  if (message?.role !== 'assistant') return false;
  const swipes = Array.isArray(message?.meta?.swipes) ? message.meta.swipes : [];
  if (swipes.length <= 1) return false;
  if (message?.meta?.swipeRegenerating === true || message?.meta?.activeSwipeDraft?.active === true) return false;
  const active = resolveActiveSwipeIndex(message);
  return swipes[active]?.draft !== true;
};

export const resolveViewCodeText = (message) => {
  const swipes = Array.isArray(message?.meta?.swipes) ? message.meta.swipes : [];
  const branch = swipes.length
    ? swipes[resolveActiveSwipeIndex(message)]
    : null;
  const branchRawSource = typeof branch?.rawSource === 'string' ? branch.rawSource : '';
  const messageRawSource = typeof message?.rawSource === 'string' ? message.rawSource : '';
  const branchHasInlineImage = hasInlineGeneratedImageToken(branchRawSource);
  const messageHasInlineImage = hasInlineGeneratedImageToken(messageRawSource);
  const shouldPreferCurrentSource =
    message?.meta?.renderRich === true ||
    branchHasInlineImage ||
    messageHasInlineImage;
  const richCurrentSources = messageHasInlineImage && !branchHasInlineImage
    ? [messageRawSource, branchRawSource]
    : [branchRawSource, messageRawSource];
  const ordered = shouldPreferCurrentSource
    ? compactStringValues([
      ...richCurrentSources,
      branch?.rawOriginal,
      branch?.raw,
      message?.raw_source,
      message?.source,
      message?.rawOriginal,
      message?.raw,
      message?.content,
    ])
    : compactStringValues([
      branch?.rawOriginal,
      branchRawSource,
      branch?.raw,
      message?.rawOriginal,
      messageRawSource,
      message?.raw_source,
      message?.source,
      message?.raw,
      message?.content,
    ]);
  return String(ordered[0] || '');
};

export const positionContextMenu = (menu, { x = 0, y = 0, windowLike, padding = 8, offsetY = 6 } = {}) => {
  if (!menu || !windowLike) return;
  menu.style.visibility = 'hidden';
  menu.style.display = 'block';
  const menuW = menu.offsetWidth || 160;
  const menuH = menu.offsetHeight || 120;
  let left = x;
  let top = y + offsetY;
  left = Math.max(padding, Math.min(left, windowLike.innerWidth - menuW - padding));
  top = Math.max(padding, Math.min(top, windowLike.innerHeight - menuH - padding));
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
  menu.style.visibility = 'visible';
};
