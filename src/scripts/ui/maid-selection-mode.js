// 女仆选区模式 DOM runtime（女仆交互优化计划 §1，2026-07-05 改为 Windows 桌面式矩形框选）。
// 显式进入（圈选按钮）后：
//  - 空白/元素处按住拖拽 -> 画选区矩形（淡蓝框），松手固化；矩形内容按覆盖元素归组注入女仆。
//  - 单击（未拖动）-> 以命中语义容器的矩形快捷建区。
//  - 已有选区：8 个手柄（四角+四边）拖拽调整，区域内右上角 × 取消。
//  - 文字叶子上按下 -> 放行原生滑选，松手固化为文字选区项（CSS Highlight API 标记）。
// 模式内 capture 拦截点击避免触发原有交互；滚动时选区按锚元素跟随。

import {
  SEMANTIC_CONTAINER_SELECTOR,
  buildMaidSelectionPromptBlock,
  describeElementForSelection,
  describeRegionSelection,
  filterRectCoveredElements,
  normalizeMaidSelectionItem,
} from './maid-selection-utils.js';

const STYLE_ID = 'maid-selection-mode-style';
const HIGHLIGHT_NAME = 'maid-selection';
const MAX_ITEMS = 8;
const DRAG_THRESHOLD = 6;
const MIN_REGION_SIZE = 20;
const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

const MODE_CSS = `
.maid-selection-bar {
  position: fixed;
  top: max(10px, env(safe-area-inset-top, 0px));
  left: 50%;
  transform: translateX(-50%);
  z-index: 26090;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border: 1px solid rgba(37, 99, 235, 0.32);
  border-radius: 999px;
  background: color-mix(in srgb, var(--app-surface-card) 92%, rgba(37, 99, 235, 0.2));
  color: var(--app-text-primary);
  font-size: 12px;
  font-weight: 600;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.18);
}
.maid-selection-bar button {
  border: 1px solid rgba(37, 99, 235, 0.28);
  border-radius: 999px;
  background: rgba(37, 99, 235, 0.10);
  color: #1d4ed8;
  padding: 4px 10px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}
body[data-theme-mode='dark'] .maid-selection-bar button {
  color: #93c5fd;
}
.maid-selection-count {
  cursor: pointer;
}
.maid-selection-list {
  position: fixed;
  z-index: 26091;
  min-width: 220px;
  max-width: min(320px, calc(100vw - 24px));
  max-height: 45vh;
  overflow: auto;
  border: 1px solid var(--app-border-default);
  border-radius: 12px;
  background: var(--app-surface-card);
  box-shadow: 0 12px 32px rgba(15, 23, 42, 0.22);
  padding: 6px;
}
.maid-selection-list-item {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 8px;
  font-size: 12px;
  color: var(--app-text-primary);
}
.maid-selection-list-item:hover {
  background: var(--app-surface-subtle);
}
.maid-selection-list-item .maid-selection-remove {
  border: none;
  background: transparent;
  color: var(--app-text-secondary);
  font-size: 14px;
  cursor: pointer;
  padding: 0 4px;
  flex-shrink: 0;
}
.maid-selection-region {
  position: fixed;
  z-index: 26088;
  border: 2px solid #3b82f6;
  border-radius: 6px;
  background: rgba(59, 130, 246, 0.14);
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.45);
  box-sizing: border-box;
  touch-action: none;
}
body[data-theme-mode='dark'] .maid-selection-region {
  box-shadow: 0 0 0 1px rgba(15, 23, 42, 0.55);
}
.maid-selection-region.is-draft {
  pointer-events: none;
  border-style: dashed;
}
.maid-selection-region-index {
  position: absolute;
  top: -9px;
  left: -9px;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  border: 2px solid rgba(255, 255, 255, 0.9);
  background: #2563eb;
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  pointer-events: none;
}
.maid-selection-region-close {
  position: absolute;
  top: 4px;
  right: 18px;
  width: 18px;
  height: 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.55);
  color: #fff;
  font-size: 12px;
  line-height: 1;
  cursor: pointer;
  padding: 0;
}
.maid-selection-region-close:hover {
  background: rgba(190, 18, 60, 0.85);
}
.maid-selection-text-close {
  position: fixed;
  z-index: 26092;
  width: 22px;
  height: 22px;
  font-size: 13px;
  box-shadow: 0 4px 12px rgba(15, 23, 42, 0.3);
}
.maid-selection-handle {
  position: absolute;
  width: 12px;
  height: 12px;
  border-radius: 3px;
  border: 2px solid #3b82f6;
  background: #fff;
  box-sizing: border-box;
  touch-action: none;
}
.maid-selection-handle[data-handle="nw"] { top: -7px; left: -7px; cursor: nwse-resize; }
.maid-selection-handle[data-handle="n"]  { top: -7px; left: calc(50% - 6px); cursor: ns-resize; }
.maid-selection-handle[data-handle="ne"] { top: -7px; right: -7px; cursor: nesw-resize; }
.maid-selection-handle[data-handle="e"]  { top: calc(50% - 6px); right: -7px; cursor: ew-resize; }
.maid-selection-handle[data-handle="se"] { bottom: -7px; right: -7px; cursor: nwse-resize; }
.maid-selection-handle[data-handle="s"]  { bottom: -7px; left: calc(50% - 6px); cursor: ns-resize; }
.maid-selection-handle[data-handle="sw"] { bottom: -7px; left: -7px; cursor: nesw-resize; }
.maid-selection-handle[data-handle="w"]  { top: calc(50% - 6px); left: -7px; cursor: ew-resize; }
::highlight(${HIGHLIGHT_NAME}) {
  background: rgba(59, 130, 246, 0.28);
}
`;

const isTextLeaf = (element) => {
  if (!element) return false;
  const node = element.nodeType === Node.TEXT_NODE ? element.parentElement : element;
  if (!node || node.childElementCount > 0) return false;
  return Boolean(String(node.textContent || '').trim());
};

export const createMaidSelectionMode = ({
  documentRef = globalThis?.document || null,
  getCurrentSessionId = () => '',
  onChange = null,
  logger = console,
} = {}) => {
  let active = false;
  // 每项：{ item, rect?, overlayEl?, anchorEl?, anchorOffset?, range? }
  let entries = [];
  let barEl = null;
  let listEl = null;
  let lastRange = null;
  // 拖拽会话：{ kind: 'create'|'resize', startX, startY, draftEl?, entry?, handle?, baseRect?, moved }
  let dragSession = null;
  let textSelecting = false;
  // 拖拽松手后浏览器仍会派发 click；置位让下一个 click 只做拦截不建区
  let suppressNextClick = false;
  // 点击已高亮文字段时唤出的取消按钮
  let textCloseEl = null;

  const doc = documentRef;

  const emitChange = () => {
    try {
      onChange?.({ active, items: entries.map(entry => ({ ...entry.item })) });
    } catch (err) {
      logger?.debug?.('maid selection onChange failed', err);
    }
  };

  const ensureStyle = () => {
    if (!doc || doc.getElementById(STYLE_ID)) return;
    const style = doc.createElement('style');
    style.id = STYLE_ID;
    style.textContent = MODE_CSS;
    doc.head?.appendChild(style);
  };

  const refreshHighlights = () => {
    try {
      if (typeof Highlight !== 'function' || !CSS?.highlights) return;
      const ranges = entries.filter(entry => entry.range).map(entry => entry.range);
      if (!ranges.length) {
        CSS.highlights.delete(HIGHLIGHT_NAME);
        return;
      }
      CSS.highlights.set(HIGHLIGHT_NAME, new Highlight(...ranges));
    } catch (err) {
      logger?.debug?.('maid selection highlight failed', err);
    }
  };

  const positionOverlay = (entry) => {
    if (!entry?.overlayEl || !entry.rect) return;
    entry.overlayEl.style.left = `${entry.rect.left}px`;
    entry.overlayEl.style.top = `${entry.rect.top}px`;
    entry.overlayEl.style.width = `${entry.rect.width}px`;
    entry.overlayEl.style.height = `${entry.rect.height}px`;
  };

  const renderOverlayIndexes = () => {
    entries.forEach((entry, index) => {
      const badge = entry.overlayEl?.querySelector?.('.maid-selection-region-index');
      if (badge) badge.textContent = String(index + 1);
    });
  };

  const createOverlay = (entry) => {
    if (!doc) return;
    const overlay = doc.createElement('div');
    overlay.className = 'maid-selection-region';
    overlay.dataset.maidSelectionUi = 'true';
    overlay.innerHTML = `
      <span class="maid-selection-region-index"></span>
      <button type="button" class="maid-selection-region-close" data-region-close aria-label="取消该选区">×</button>
      ${HANDLES.map(handle => `<span class="maid-selection-handle" data-handle="${handle}"></span>`).join('')}
    `;
    doc.body.appendChild(overlay);
    entry.overlayEl = overlay;
    positionOverlay(entry);
    renderOverlayIndexes();
  };

  // 矩形选区内容归组：覆盖的语义容器 -> 选区项
  const rebuildRegionItem = (entry) => {
    if (!entry?.rect || !doc) return;
    const candidates = Array.from(doc.querySelectorAll(SEMANTIC_CONTAINER_SELECTOR))
      .filter(el => !el.closest('[data-maid-selection-ui], .maid-selection-bar, .maid-command-input'));
    const covered = filterRectCoveredElements(candidates, entry.rect);
    entry.item = describeRegionSelection(covered, entry.rect, { getCurrentSessionId })
      || normalizeMaidSelectionItem({ type: 'element', semanticSummary: `屏幕选区（${Math.round(entry.rect.width)}×${Math.round(entry.rect.height)}）` });
    // 滚动锚定：以第一个覆盖元素为锚
    const anchor = covered[0] || null;
    if (anchor) {
      const anchorRect = anchor.getBoundingClientRect();
      entry.anchorEl = anchor;
      entry.anchorOffset = { dx: entry.rect.left - anchorRect.left, dy: entry.rect.top - anchorRect.top };
    } else {
      entry.anchorEl = null;
      entry.anchorOffset = null;
    }
  };

  const removeEntry = (index) => {
    const entry = entries[index];
    if (!entry) return;
    entry.overlayEl?.remove();
    entries.splice(index, 1);
    refreshHighlights();
    renderOverlayIndexes();
    renderBar();
    renderListPopup({ onlyIfOpen: true });
    emitChange();
  };

  const addRegionEntry = (rect) => {
    if (entries.length >= MAX_ITEMS) return false;
    const entry = { rect: { ...rect }, expand: null };
    rebuildRegionItem(entry);
    if (!entry.item) return false;
    entries.push(entry);
    createOverlay(entry);
    renderBar();
    emitChange();
    return true;
  };

  const closeListPopup = () => {
    listEl?.remove();
    listEl = null;
  };

  const closeTextCancelButton = () => {
    textCloseEl?.remove();
    textCloseEl = null;
  };

  // 点击处是否落在某个文字选区的高亮范围内
  const findTextEntryAtPoint = (x, y) => {
    try {
      const caret = doc?.caretRangeFromPoint?.(x, y);
      if (!caret) return -1;
      return entries.findIndex(entry => entry.range
        && entry.range.isPointInRange?.(caret.startContainer, caret.startOffset));
    } catch {
      return -1;
    }
  };

  const openTextCancelButton = (entryIndex, x, y) => {
    closeTextCancelButton();
    if (!doc) return;
    textCloseEl = doc.createElement('button');
    textCloseEl.type = 'button';
    textCloseEl.className = 'maid-selection-region-close maid-selection-text-close';
    textCloseEl.dataset.maidSelectionUi = 'true';
    textCloseEl.dataset.textRemove = String(entryIndex);
    textCloseEl.setAttribute('aria-label', '取消这段文字选中');
    textCloseEl.textContent = '×';
    doc.body.appendChild(textCloseEl);
    textCloseEl.style.left = `${Math.min(Math.max(4, x - 9), window.innerWidth - 24)}px`;
    textCloseEl.style.top = `${Math.max(4, y - 30)}px`;
  };

  const renderBar = () => {
    if (!doc || !active) return;
    if (!barEl) {
      barEl = doc.createElement('div');
      barEl.className = 'maid-selection-bar';
      barEl.dataset.maidSelectionUi = 'true';
      doc.body.appendChild(barEl);
    }
    barEl.innerHTML = `
      <span class="maid-selection-count" data-selection-action="list">已选 ${entries.length} 项</span>
      <button type="button" data-selection-action="done">完成</button>
      <button type="button" data-selection-action="clear">清空退出</button>
    `;
  };

  const renderListPopup = ({ onlyIfOpen = false } = {}) => {
    const wasOpen = Boolean(listEl);
    closeListPopup();
    if (onlyIfOpen && !wasOpen) return;
    if (!doc || !entries.length) return;
    listEl = doc.createElement('div');
    listEl.className = 'maid-selection-list';
    listEl.dataset.maidSelectionUi = 'true';
    listEl.innerHTML = entries.map((entry, index) => `
      <div class="maid-selection-list-item">
        <span>${index + 1}. ${entry.rect ? '⬚' : '“”'} ${String(entry.item.semanticSummary || entry.item.text || '').slice(0, 42).replace(/</g, '&lt;')}</span>
        <button type="button" class="maid-selection-remove" data-selection-remove="${index}" aria-label="移除">×</button>
      </div>
    `).join('');
    doc.body.appendChild(listEl);
    const barRect = barEl?.getBoundingClientRect?.();
    listEl.style.top = `${(barRect?.bottom || 48) + 6}px`;
    listEl.style.left = `${Math.max(12, (barRect?.left || 12))}px`;
  };

  const rectFromPoints = (x1, y1, x2, y2) => ({
    left: Math.min(x1, x2),
    top: Math.min(y1, y2),
    width: Math.abs(x2 - x1),
    height: Math.abs(y2 - y1),
  });

  const applyHandleDrag = (baseRect, handle, dx, dy) => {
    let { left, top, width, height } = baseRect;
    if (handle.includes('w')) { left += dx; width -= dx; }
    if (handle.includes('e')) { width += dx; }
    if (handle.includes('n')) { top += dy; height -= dy; }
    if (handle.includes('s')) { height += dy; }
    if (width < MIN_REGION_SIZE) {
      if (handle.includes('w')) left -= (MIN_REGION_SIZE - width);
      width = MIN_REGION_SIZE;
    }
    if (height < MIN_REGION_SIZE) {
      if (handle.includes('n')) top -= (MIN_REGION_SIZE - height);
      height = MIN_REGION_SIZE;
    }
    return { left, top, width, height };
  };

  const handlePointerDown = (event) => {
    if (!active) return;
    const target = event.target;
    // 手柄：进入 resize 会话
    const handleEl = target?.closest?.('.maid-selection-handle');
    if (handleEl) {
      const overlay = handleEl.closest('.maid-selection-region');
      const entry = entries.find(item => item.overlayEl === overlay);
      if (entry) {
        event.preventDefault();
        event.stopPropagation();
        dragSession = {
          kind: 'resize',
          entry,
          handle: handleEl.dataset.handle || 'se',
          startX: event.clientX,
          startY: event.clientY,
          baseRect: { ...entry.rect },
          moved: false,
        };
      }
      return;
    }
    // 模式 UI（提示条/列表/× 等）放行给 click 处理
    if (target?.closest?.('[data-maid-selection-ui], .maid-command-input')) return;
    // 文字叶子：放行原生滑选
    if (isTextLeaf(target)) {
      textSelecting = true;
      return;
    }
    // 空白/元素处：可能是画框的起点
    event.preventDefault();
    dragSession = {
      kind: 'create',
      startX: event.clientX,
      startY: event.clientY,
      draftEl: null,
      moved: false,
    };
  };

  const handlePointerMove = (event) => {
    if (!active || !dragSession) return;
    const dx = event.clientX - dragSession.startX;
    const dy = event.clientY - dragSession.startY;
    if (!dragSession.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    dragSession.moved = true;
    event.preventDefault();
    if (dragSession.kind === 'resize') {
      dragSession.entry.rect = applyHandleDrag(dragSession.baseRect, dragSession.handle, dx, dy);
      positionOverlay(dragSession.entry);
      return;
    }
    // create：画草稿框
    if (!dragSession.draftEl && doc) {
      dragSession.draftEl = doc.createElement('div');
      dragSession.draftEl.className = 'maid-selection-region is-draft';
      dragSession.draftEl.dataset.maidSelectionUi = 'true';
      doc.body.appendChild(dragSession.draftEl);
    }
    const rect = rectFromPoints(dragSession.startX, dragSession.startY, event.clientX, event.clientY);
    if (dragSession.draftEl) {
      dragSession.draftEl.style.left = `${rect.left}px`;
      dragSession.draftEl.style.top = `${rect.top}px`;
      dragSession.draftEl.style.width = `${rect.width}px`;
      dragSession.draftEl.style.height = `${rect.height}px`;
    }
  };

  const handlePointerUp = (event) => {
    if (!active) return;
    // 文字滑选固化
    if (textSelecting) {
      textSelecting = false;
      setTimeout(() => {
        const selection = window.getSelection?.();
        const text = String(selection?.toString?.() || '').trim();
        if (!text || !lastRange) return;
        if (entries.length >= MAX_ITEMS) return;
        const container = lastRange.commonAncestorContainer;
        const node = container?.nodeType === Node.TEXT_NODE ? container.parentElement : container;
        const described = describeElementForSelection(node, { getCurrentSessionId });
        const item = normalizeMaidSelectionItem({
          type: 'text',
          text,
          semanticSummary: described?.item?.semanticSummary
            ? `选中文字（位于 ${described.item.semanticSummary}）`
            : '选中文字',
          messageId: described?.item?.messageId,
          sessionId: described?.item?.sessionId,
        });
        if (!item) return;
        entries.push({ item, range: lastRange });
        lastRange = null;
        try { selection.removeAllRanges(); } catch {}
        refreshHighlights();
        renderBar();
        emitChange();
      }, 10);
      return;
    }
    if (!dragSession) return;
    const session = dragSession;
    dragSession = null;
    if (session.kind === 'resize') {
      if (session.moved) {
        suppressNextClick = true;
        rebuildRegionItem(session.entry);
        renderBar();
        renderListPopup({ onlyIfOpen: true });
        emitChange();
        event.preventDefault();
        event.stopPropagation();
      }
      return;
    }
    // create 收尾
    session.draftEl?.remove();
    if (session.moved) {
      suppressNextClick = true;
      event.preventDefault();
      event.stopPropagation();
      const rect = rectFromPoints(session.startX, session.startY, event.clientX, event.clientY);
      if (rect.width >= MIN_REGION_SIZE && rect.height >= MIN_REGION_SIZE) {
        addRegionEntry(rect);
      }
    }
    // 未拖动的单击由 click handler 处理（元素快捷建区）
  };

  const handleCaptureClick = (event) => {
    if (!active) return;
    if (suppressNextClick) {
      suppressNextClick = false;
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    const target = event.target;
    const ui = target?.closest?.('[data-maid-selection-ui], .maid-command-input');
    if (ui) {
      // 区域 × 取消
      const closeBtn = target?.closest?.('[data-region-close]');
      if (closeBtn) {
        event.preventDefault();
        event.stopPropagation();
        const overlay = closeBtn.closest('.maid-selection-region');
        const index = entries.findIndex(entry => entry.overlayEl === overlay);
        if (index >= 0) removeEntry(index);
        return;
      }
      const textRemoveIdx = target?.dataset?.textRemove;
      if (textRemoveIdx !== undefined && textRemoveIdx !== null && textRemoveIdx !== '') {
        event.preventDefault();
        event.stopPropagation();
        closeTextCancelButton();
        removeEntry(Number(textRemoveIdx));
        return;
      }
      const removeIdx = target?.dataset?.selectionRemove;
      if (removeIdx !== undefined && removeIdx !== null && removeIdx !== '') {
        event.preventDefault();
        event.stopPropagation();
        removeEntry(Number(removeIdx));
        return;
      }
      const action = target?.dataset?.selectionAction || target?.closest?.('[data-selection-action]')?.dataset?.selectionAction;
      if (action === 'done') { event.preventDefault(); event.stopPropagation(); exit({ keepItems: true }); }
      else if (action === 'clear') { event.preventDefault(); event.stopPropagation(); exit({ keepItems: false }); }
      else if (action === 'list') {
        event.preventDefault(); event.stopPropagation();
        if (listEl) closeListPopup(); else renderListPopup();
      }
      return;
    }
    // 拦截页面原有交互
    event.preventDefault();
    event.stopPropagation();
    closeListPopup();
    const selText = String(window.getSelection?.()?.toString?.() || '').trim();
    if (selText) return;
    // 点击已高亮的文字段：唤出取消按钮（不建区）
    const textIndex = findTextEntryAtPoint(event.clientX, event.clientY);
    if (textIndex >= 0) {
      openTextCancelButton(textIndex, event.clientX, event.clientY);
      return;
    }
    closeTextCancelButton();
    // 单击（未拖动）：以命中语义容器的矩形快捷建区
    const described = describeElementForSelection(target, { getCurrentSessionId });
    const container = described?.element;
    if (container) {
      const rect = container.getBoundingClientRect();
      addRegionEntry({
        left: rect.left,
        top: rect.top,
        width: Math.max(MIN_REGION_SIZE, rect.width),
        height: Math.max(MIN_REGION_SIZE, rect.height),
      });
    }
  };

  const captureSelectionRange = () => {
    try {
      const selection = doc?.getSelection?.() || window.getSelection?.();
      if (!selection || selection.isCollapsed || !selection.rangeCount) return;
      const text = String(selection.toString() || '').trim();
      if (!text) return;
      lastRange = selection.getRangeAt(0).cloneRange();
    } catch {}
  };

  // 滚动/缩放：按锚元素重新定位选区（锚不可见则隐藏该选区框）
  const handleViewportShift = () => {
    if (!active) return;
    entries.forEach((entry) => {
      if (!entry.overlayEl || !entry.rect) return;
      if (entry.anchorEl && entry.anchorOffset) {
        if (!entry.anchorEl.isConnected) {
          entry.overlayEl.style.display = 'none';
          return;
        }
        const anchorRect = entry.anchorEl.getBoundingClientRect();
        entry.rect.left = anchorRect.left + entry.anchorOffset.dx;
        entry.rect.top = anchorRect.top + entry.anchorOffset.dy;
        entry.overlayEl.style.display = '';
        positionOverlay(entry);
      }
    });
  };

  const enter = () => {
    if (active || !doc) return;
    ensureStyle();
    active = true;
    renderBar();
    doc.addEventListener('pointerdown', handlePointerDown, true);
    doc.addEventListener('pointermove', handlePointerMove, true);
    doc.addEventListener('pointerup', handlePointerUp, true);
    doc.addEventListener('click', handleCaptureClick, true);
    doc.addEventListener('selectionchange', captureSelectionRange);
    window.addEventListener('scroll', handleViewportShift, true);
    window.addEventListener('resize', handleViewportShift);
    emitChange();
  };

  const clear = () => {
    entries.forEach(entry => entry.overlayEl?.remove());
    try { CSS?.highlights?.delete?.(HIGHLIGHT_NAME); } catch {}
    entries = [];
    emitChange();
  };

  const exit = ({ keepItems = false } = {}) => {
    if (!active) {
      if (!keepItems) clear();
      return;
    }
    active = false;
    doc.removeEventListener('pointerdown', handlePointerDown, true);
    doc.removeEventListener('pointermove', handlePointerMove, true);
    doc.removeEventListener('pointerup', handlePointerUp, true);
    doc.removeEventListener('click', handleCaptureClick, true);
    doc.removeEventListener('selectionchange', captureSelectionRange);
    window.removeEventListener('scroll', handleViewportShift, true);
    window.removeEventListener('resize', handleViewportShift);
    barEl?.remove();
    barEl = null;
    closeListPopup();
    closeTextCancelButton();
    dragSession?.draftEl?.remove();
    dragSession = null;
    if (!keepItems) {
      clear();
    } else {
      // 完成：保留选区数据供发送注入，清掉视觉痕迹
      entries.forEach((entry) => {
        entry.overlayEl?.remove();
        entry.overlayEl = null;
      });
      try { CSS?.highlights?.delete?.(HIGHLIGHT_NAME); } catch {}
    }
    emitChange();
  };

  return {
    enter,
    exit,
    toggle: () => (active ? exit({ keepItems: true }) : enter()),
    isActive: () => active,
    getItems: () => entries.map(entry => ({ ...entry.item })),
    clear,
    buildPromptBlock: () => buildMaidSelectionPromptBlock(entries.map(entry => entry.item)),
  };
};
