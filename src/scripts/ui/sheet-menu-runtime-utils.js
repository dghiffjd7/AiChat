export const createSheetMenuRuntime = ({
  hideMenus = null,
  getViewportWidth = null,
  getViewportHeight = null,
} = {}) => {
  const lastAnchors = {
    settings: null,
    persona: null,
    quick: null,
    moments: null,
    reading: null,
  };

  const positionSheet = (menuEl, anchorEl, offsetX = 0, offsetY = 0, alignRight = false) => {
    if (!menuEl || !anchorEl) return false;
    const rect = anchorEl.getBoundingClientRect();
    const viewportPad = 12;
    const wasHidden = menuEl.classList.contains('hidden');
    const prevVisibility = menuEl.style.visibility;
    if (wasHidden) {
      menuEl.classList.remove('hidden');
      menuEl.style.visibility = 'hidden';
    }
    const menuWidth = menuEl.offsetWidth || 180;
    const menuHeight = menuEl.offsetHeight || 120;
    const viewportWidth = Number(getViewportWidth?.() || 0);
    const viewportHeight = Number(getViewportHeight?.() || 0);
    let top = rect.bottom + 1 + offsetY;
    const maxTop = Math.max(viewportPad, viewportHeight - menuHeight - viewportPad);
    if (top > maxTop) {
      top = rect.top - menuHeight - 8 + offsetY;
    }
    top = Math.min(Math.max(viewportPad, top), maxTop);
    let left = alignRight ? (rect.right - menuWidth + offsetX) : (rect.left + offsetX);
    const maxLeft = Math.max(viewportPad, viewportWidth - menuWidth - viewportPad);
    left = Math.min(Math.max(viewportPad, left), maxLeft);
    menuEl.style.top = `${top}px`;
    menuEl.style.left = `${left}px`;
    menuEl.style.right = 'auto';
    if (wasHidden) {
      menuEl.classList.add('hidden');
      menuEl.style.visibility = prevVisibility;
    }
    return true;
  };

  const getLastAnchor = (kind = '') => lastAnchors[String(kind || '').trim()] || null;

  const toggleSheetAt = (menuEl, anchorEl, { alignRight = false, kind = 'generic' } = {}) => {
    if (!menuEl || !anchorEl) return false;
    const normalizedKind = String(kind || 'generic').trim();
    const isVisible = !menuEl.classList.contains('hidden');
    const lastAnchor = getLastAnchor(normalizedKind);
    const sameAnchor = lastAnchor === anchorEl;
    hideMenus?.();
    positionSheet(menuEl, anchorEl, 0, 4, alignRight);
    if (!isVisible || !sameAnchor) {
      menuEl.classList.remove('hidden');
    } else {
      menuEl.classList.add('hidden');
    }
    if (Object.prototype.hasOwnProperty.call(lastAnchors, normalizedKind)) {
      lastAnchors[normalizedKind] = anchorEl;
    }
    return true;
  };

  return {
    positionSheet,
    toggleSheetAt,
    getLastAnchor,
  };
};
