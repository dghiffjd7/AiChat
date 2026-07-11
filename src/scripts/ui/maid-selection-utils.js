// 女仆选区模式纯函数（女仆交互优化计划 §1）：
// 选区项归一化、元素语义描述、注入提示词块组装。DOM runtime 见 maid-selection-mode.js。

const trim = (value, fallback = '') => {
  const text = String(value ?? '').trim();
  return text || fallback;
};

const truncate = (value = '', max = 400) => {
  const text = trim(value);
  if (text.length <= max) return text;
  return `${text.slice(0, max)}…`;
};

let selectionItemSeq = 0;

export const normalizeMaidViewportRect = (raw = null) => {
  if (!raw || typeof raw !== 'object') return null;
  const left = Number(raw.left);
  const top = Number(raw.top);
  const width = Number(raw.width);
  const height = Number(raw.height);
  if (![left, top, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return null;
  return { left, top, width, height };
};

export const resolveMaidAnchoredViewportRect = (rect = null, anchorRect = null, offset = null) => {
  const normalized = normalizeMaidViewportRect(rect);
  if (!normalized || !anchorRect || !offset) return null;
  const values = [anchorRect.left, anchorRect.top, anchorRect.width, anchorRect.height, offset.dx, offset.dy]
    .map(Number);
  if (!values.every(Number.isFinite) || values[2] <= 0 || values[3] <= 0) return null;
  return {
    ...normalized,
    left: values[0] + values[4],
    top: values[1] + values[5],
  };
};

export const resolveMaidUnanchoredViewportRect = (rect = null, createdRevision = 0, currentRevision = 0) => {
  const normalized = normalizeMaidViewportRect(rect);
  const created = Number(createdRevision);
  const current = Number(currentRevision);
  if (!normalized || !Number.isFinite(created) || !Number.isFinite(current) || created !== current) return null;
  return normalized;
};

export const normalizeMaidSelectionItem = (raw = {}) => {
  const type = raw?.type === 'element' ? 'element' : 'text';
  const text = truncate(raw?.text, 1200);
  const semanticSummary = truncate(raw?.semanticSummary, 200);
  if (!text && !semanticSummary) return null;
  const viewportRect = normalizeMaidViewportRect(raw?.viewportRect);
  selectionItemSeq += 1;
  return {
    id: trim(raw?.id) || `sel-${selectionItemSeq}`,
    type,
    text,
    semanticSummary,
    messageId: trim(raw?.messageId),
    sessionId: trim(raw?.sessionId),
    panel: trim(raw?.panel),
    regionId: viewportRect ? trim(raw?.regionId) : '',
    viewportRect,
  };
};

// 语义容器优先级：消息 > 卡片/条目 > 有 aria-label 的控件 > 面板容器。
export const SEMANTIC_CONTAINER_SELECTOR = [
  '[data-msg-id]',
  '.agent-center-card',
  '.moment-item',
  '[data-entry-id]',
  '[role="dialog"]',
  '[aria-label]',
  '[data-panel]',
  'button',
  'article',
  'section',
].join(',');

export const findSemanticContainer = (element = null) => {
  if (!element || typeof element.closest !== 'function') return null;
  return element.closest(SEMANTIC_CONTAINER_SELECTOR) || element;
};

export const describeElementForSelection = (element = null, {
  getCurrentSessionId = null,
} = {}) => {
  if (!element) return null;
  const container = findSemanticContainer(element);
  if (!container) return null;
  const text = truncate(container.textContent, 600);
  const msgId = trim(container.getAttribute?.('data-msg-id'));
  const ariaLabel = trim(container.getAttribute?.('aria-label'));
  const panel = trim(container.getAttribute?.('data-panel'));
  const parts = [];
  if (msgId) {
    parts.push('聊天消息');
  } else if (container.classList?.contains?.('agent-center-card')) {
    parts.push('Agent Center 卡片');
  } else if (container.classList?.contains?.('moment-item')) {
    parts.push('动态条目');
  } else if (container.tagName === 'BUTTON') {
    parts.push('按钮');
  } else if (panel) {
    parts.push(`面板 ${panel}`);
  } else if (ariaLabel) {
    parts.push(ariaLabel);
  } else {
    parts.push(trim(container.tagName, 'element').toLowerCase());
  }
  const sessionId = msgId && typeof getCurrentSessionId === 'function'
    ? trim(getCurrentSessionId())
    : '';
  return {
    element: container,
    item: normalizeMaidSelectionItem({
      type: 'element',
      text,
      semanticSummary: `${parts.join(' ')}${ariaLabel && !parts.includes(ariaLabel) ? `（${ariaLabel}）` : ''}`,
      messageId: msgId,
      sessionId,
      panel,
    }),
  };
};

export const buildMaidSelectionPromptBlock = (items = []) => {
  const list = (Array.isArray(items) ? items : [])
    .map(item => normalizeMaidSelectionItem(item))
    .filter(Boolean);
  if (!list.length) return '';
  const lines = list.map((item, index) => {
    const head = [
      `${index + 1}. [${item.type === 'element' ? '界面元素' : '选中文字'}]`,
      item.semanticSummary,
      item.messageId ? `消息ID: ${item.messageId}` : '',
      item.sessionId ? `会话: ${item.sessionId}` : '',
      item.regionId ? `区域ID: ${item.regionId}（需要检查图片、布局、颜色、错位或遮挡时可调用 ui.capture_region）` : '',
    ].filter(Boolean).join(' ');
    return item.text ? `${head}\n   内容: ${item.text}` : head;
  });
  return [
    '<user_selection>',
    '用户在界面上圈选了以下内容作为本次请求的针对目标（“这个/这段/这里”等指代优先指向这些选区）：',
    ...lines,
    '</user_selection>',
  ].join('\n');
};

// —— 矩形框选（Windows 桌面式）支持 ——

// 从候选语义容器中筛出被矩形覆盖（元素自身面积的 coverage 比例落在矩形内）的元素，
// 并做祖先去重：父子同时命中时保留最外层（框住整条消息时不重复计入内部按钮）。
export const filterRectCoveredElements = (candidates = [], rect = null, { coverage = 0.6 } = {}) => {
  if (!rect || !Array.isArray(candidates)) return [];
  const right = rect.left + rect.width;
  const bottom = rect.top + rect.height;
  const covered = candidates.filter((el) => {
    const r = el?.getBoundingClientRect?.();
    if (!r || r.width <= 0 || r.height <= 0) return false;
    const ix = Math.max(0, Math.min(right, r.right) - Math.max(rect.left, r.left));
    const iy = Math.max(0, Math.min(bottom, r.bottom) - Math.max(rect.top, r.top));
    return (ix * iy) / (r.width * r.height) >= coverage;
  });
  return covered.filter(el => !covered.some(other => other !== el && other.contains?.(el)));
};

export const describeRegionSelection = (coveredElements = [], rect = null, {
  getCurrentSessionId = null,
  regionId = '',
} = {}) => {
  const described = (Array.isArray(coveredElements) ? coveredElements : [])
    .map(el => describeElementForSelection(el, { getCurrentSessionId })?.item)
    .filter(Boolean);
  const size = rect ? `${Math.round(rect.width)}×${Math.round(rect.height)}` : '';
  const summaries = described.map(item => item.semanticSummary).filter(Boolean);
  const messageIds = [...new Set(described.map(item => item.messageId).filter(Boolean))];
  return normalizeMaidSelectionItem({
    type: 'element',
    semanticSummary: summaries.length
      ? `屏幕选区（${size}，含：${summaries.slice(0, 4).join('、')}${summaries.length > 4 ? ` 等 ${summaries.length} 项` : ''}）`
      : `屏幕选区（${size}）`,
    text: described.map(item => item.text).filter(Boolean).join('\n---\n'),
    messageId: messageIds.length === 1 ? messageIds[0] : '',
    sessionId: described.find(item => item.sessionId)?.sessionId || '',
    regionId,
    viewportRect: rect,
  });
};
