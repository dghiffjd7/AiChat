export const formatScrollDateLabel = (timestamp, { now = new Date() } = {}) => {
  const ts = Number(timestamp || 0);
  if (!Number.isFinite(ts) || ts <= 0) return '';
  const date = new Date(ts);
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const targetStart = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const diffDays = Math.round((todayStart - targetStart) / 86400000);
  if (diffDays === 0) return '今天';
  if (diffDays === 1) return '昨天';
  if (date.getFullYear() === now.getFullYear()) {
    return `${date.getMonth() + 1}/${date.getDate()}`;
  }
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
};

export const resolveScrollDateLabel = (scrollEl, {
  formatLabel = formatScrollDateLabel,
} = {}) => {
  if (!scrollEl) return '';
  const items = scrollEl.querySelectorAll?.('[data-msg-id][data-timestamp]') || [];
  if (!items.length) return '';
  const anchorTop = Number(scrollEl.scrollTop || 0) + 24;
  let fallback = null;
  for (const el of items) {
    const ts = Number(el.dataset.timestamp || 0);
    if (!Number.isFinite(ts) || ts <= 0) continue;
    fallback = el;
    const bottom = Number(el.offsetTop || 0) + Number(el.offsetHeight || 0);
    if (bottom >= anchorTop) {
      return formatLabel(ts);
    }
  }
  return fallback ? formatLabel(Number(fallback.dataset.timestamp || 0)) : '';
};

export const createScrollDateBadgeUiRuntime = ({
  documentLike,
  getUiMode,
  schedule,
  clearSchedule,
} = {}) => ({
  ensureBadge({ scrollEl, existingBadgeEl }) {
    if (!scrollEl) return existingBadgeEl || null;
    if (existingBadgeEl) return existingBadgeEl;
    const host = scrollEl.parentElement;
    if (!host) return null;
    const badge = documentLike.createElement('div');
    badge.className = 'chat-scroll-date-badge';
    badge.setAttribute?.('aria-hidden', 'true');
    host.appendChild(badge);
    return badge;
  },
  hideBadge({ badgeEl, immediate = false }) {
    if (!badgeEl) return;
    if (immediate) {
      badgeEl.classList.add('is-immediate');
      badgeEl.classList.remove('is-visible');
      schedule?.(() => {
        badgeEl?.classList?.remove('is-immediate');
      }, 0);
      return;
    }
    badgeEl.classList.remove('is-visible');
  },
  showBadge({ badgeEl, label, clearHideTimer, getHideTimer, setHideTimer }) {
    const text = String(label || '').trim();
    if (!badgeEl || !text) return false;
    badgeEl.textContent = text;
    badgeEl.classList.remove('is-immediate');
    badgeEl.classList.add('is-visible');
    const active = getHideTimer?.();
    if (active) clearHideTimer?.(active);
    const nextTimer = schedule?.(() => {
      setHideTimer?.(null);
      badgeEl?.classList?.remove('is-visible');
    }, 760);
    setHideTimer?.(nextTimer || null);
    return true;
  },
  refreshBadge({
    scrollEl,
    badgeEl,
    reveal = false,
    hideBadge,
    showBadge,
    resolveLabel = value => resolveScrollDateLabel(value, { formatLabel: formatScrollDateLabel }),
  }) {
    if (getUiMode?.() === 'rp') {
      hideBadge?.({ immediate: true });
      return '';
    }
    const label = resolveLabel(scrollEl);
    if (!label) {
      hideBadge?.({ immediate: !reveal });
      return '';
    }
    if (reveal) showBadge?.(label);
    else hideBadge?.({ immediate: true });
    return label;
  },
  clearTimer(timerId) {
    if (!timerId) return;
    clearSchedule?.(timerId);
  },
});
