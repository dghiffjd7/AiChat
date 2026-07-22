const STYLE_ID = 'maid-onboarding-entry-ui-style';

const injectStyle = (documentRef) => {
  if (!documentRef?.head || documentRef.getElementById?.(STYLE_ID)) return;
  const style = documentRef.createElement?.('style');
  if (!style) return;
  style.id = STYLE_ID;
  style.textContent = `
.maid-onboarding-hint,
.maid-onboarding-toast {
  position: fixed;
  z-index: 25020;
  box-sizing: border-box;
  border: 1px solid var(--app-border-subtle, rgba(148,163,184,.24));
  background: color-mix(in srgb, var(--app-surface-card, #fff) 96%, transparent);
  color: var(--app-text-primary, #111827);
  box-shadow: 0 22px 54px -25px rgba(15,23,42,.46);
  backdrop-filter: blur(10px);
}
.maid-onboarding-hint {
  right: max(18px, env(safe-area-inset-right, 0px));
  bottom: calc(86px + env(safe-area-inset-bottom, 0px));
  width: min(360px, calc(100vw - 28px));
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  padding: 10px 10px 10px 12px;
  border-radius: 18px;
  animation: maid-onboarding-entry-in 360ms cubic-bezier(.22,1,.36,1) both;
}
.maid-onboarding-hint-icon,
.maid-onboarding-toast-icon {
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  border-radius: 13px;
  background: color-mix(in srgb, var(--app-accent-primary, #2563eb) 10%, var(--app-surface-card));
  color: var(--app-accent-primary, #2563eb);
}
.maid-onboarding-hint-icon { width: 38px; height: 38px; }
.maid-onboarding-hint-copy { min-width: 0; }
.maid-onboarding-hint-title { font-size: 12.5px; font-weight: 850; line-height: 1.35; }
.maid-onboarding-hint-sub { margin-top: 2px; color: var(--app-text-secondary, #64748b); font-size: 10.5px; line-height: 1.4; }
.maid-onboarding-hint-actions { display: flex; align-items: center; gap: 4px; }
.maid-onboarding-hint-start,
.maid-onboarding-hint-close,
.maid-onboarding-toast-action,
.maid-onboarding-toast-close {
  border: 0;
  cursor: pointer;
  font: inherit;
  touch-action: manipulation;
}
.maid-onboarding-hint-start {
  min-height: 40px;
  padding: 0 13px;
  border-radius: 12px;
  background: var(--app-accent-primary, #2563eb);
  color: var(--app-text-inverse, #fff);
  font-size: 11.5px;
  font-weight: 850;
}
.maid-onboarding-hint-close,
.maid-onboarding-toast-close {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: transparent;
  color: var(--app-text-muted, #64748b);
  font-size: 18px;
}
.maid-onboarding-toast {
  left: 50%;
  bottom: calc(22px + env(safe-area-inset-bottom, 0px));
  width: min(420px, calc(100vw - 28px));
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 11px 10px 11px 12px;
  border-radius: 18px;
  transform: translateX(-50%);
  animation: maid-onboarding-toast-in 320ms cubic-bezier(.22,1,.36,1) both;
}
.maid-onboarding-toast-icon {
  width: 40px;
  height: 40px;
  background: color-mix(in srgb, var(--app-success-text, #047857) 12%, var(--app-surface-card));
  color: var(--app-success-text, #047857);
}
.maid-onboarding-toast-copy { min-width: 0; flex: 1; }
.maid-onboarding-toast-title { font-size: 13px; font-weight: 850; }
.maid-onboarding-toast-sub { margin-top: 2px; color: var(--app-text-secondary, #64748b); font-size: 11px; }
.maid-onboarding-toast-action {
  min-height: 40px;
  padding: 0 13px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--app-success-text, #047857) 10%, var(--app-surface-card));
  color: var(--app-success-text, #047857);
  font-size: 11.5px;
  font-weight: 850;
}
@keyframes maid-onboarding-entry-in {
  from { opacity: 0; transform: translate3d(0, 12px, 0) scale(.97); }
  to { opacity: 1; transform: translate3d(0, 0, 0) scale(1); }
}
@keyframes maid-onboarding-toast-in {
  from { opacity: 0; transform: translate3d(-50%, 14px, 0) scale(.97); }
  to { opacity: 1; transform: translate3d(-50%, 0, 0) scale(1); }
}
@media (max-width: 520px) {
  .maid-onboarding-hint { right: 14px; left: 14px; width: auto; grid-template-columns: 34px minmax(0, 1fr) auto; }
  .maid-onboarding-hint-icon { width: 34px; height: 34px; }
  .maid-onboarding-hint-start { padding: 0 10px; }
}
@media (prefers-reduced-motion: reduce) {
  .maid-onboarding-hint,
  .maid-onboarding-toast { animation: none !important; transition: none !important; }
}
body[data-reduced-motion='on'] .maid-onboarding-hint,
body[data-reduced-motion='on'] .maid-onboarding-toast { animation: none !important; transition: none !important; }
`;
  documentRef.head.appendChild(style);
};

const iconSvg = body => `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
const ICONS = Object.freeze({
  wand: iconSvg('<path d="m15 4 5 5L8 21l-5-5Z"/><path d="m6 14 5 5"/><path d="M14 2v3"/><path d="M22 10h-3"/>'),
  check: iconSvg('<circle cx="12" cy="12" r="9"/><path d="m8 12 2.5 2.5L16 9"/>'),
});

const create = (documentRef, tag, className = '', text = '') => {
  const element = documentRef?.createElement?.(tag);
  if (!element) return null;
  element.className = className;
  if (text) element.textContent = text;
  return element;
};

export const createMaidOnboardingEntryUi = ({
  documentRef = globalThis?.document || null,
  setTimeoutFn = globalThis?.setTimeout || null,
  clearTimeoutFn = globalThis?.clearTimeout || null,
} = {}) => {
  let hintEl = null;
  let toastEl = null;
  let toastTimer = null;

  const hideHint = () => {
    hintEl?.remove?.();
    hintEl = null;
  };

  const hideToast = () => {
    if (toastTimer != null) clearTimeoutFn?.(toastTimer);
    toastTimer = null;
    toastEl?.remove?.();
    toastEl = null;
  };

  const showHint = ({ onStart = null, onDismiss = null } = {}) => {
    if (!documentRef?.body || hintEl) return false;
    injectStyle(documentRef);
    hintEl = create(documentRef, 'aside', 'maid-onboarding-hint');
    hintEl.setAttribute?.('role', 'status');
    const icon = create(documentRef, 'span', 'maid-onboarding-hint-icon');
    icon.innerHTML = ICONS.wand;
    const copy = create(documentRef, 'div', 'maid-onboarding-hint-copy');
    copy.append(
      create(documentRef, 'div', 'maid-onboarding-hint-title', '第一次来？让女仆带你接好 API'),
      create(documentRef, 'div', 'maid-onboarding-hint-sub', '大约 2 分钟，不需要先唤醒 AI'),
    );
    const actions = create(documentRef, 'div', 'maid-onboarding-hint-actions');
    const start = create(documentRef, 'button', 'maid-onboarding-hint-start', '开始');
    start.type = 'button';
    start.addEventListener?.('click', () => {
      hideHint();
      onStart?.();
    });
    const close = create(documentRef, 'button', 'maid-onboarding-hint-close', '×');
    close.type = 'button';
    close.setAttribute?.('aria-label', '不再提示 API 新手引导');
    close.addEventListener?.('click', () => {
      hideHint();
      onDismiss?.();
    });
    actions.append(start, close);
    hintEl.append(icon, copy, actions);
    documentRef.body.appendChild(hintEl);
    return true;
  };

  const showCompletion = ({ title = '新手任务完成', reward = '', onViewTasks = null, duration = 6500 } = {}) => {
    if (!documentRef?.body) return false;
    injectStyle(documentRef);
    hideToast();
    toastEl = create(documentRef, 'aside', 'maid-onboarding-toast');
    toastEl.setAttribute?.('role', 'status');
    const icon = create(documentRef, 'span', 'maid-onboarding-toast-icon');
    icon.innerHTML = ICONS.check;
    const copy = create(documentRef, 'div', 'maid-onboarding-toast-copy');
    copy.append(
      create(documentRef, 'div', 'maid-onboarding-toast-title', title),
      create(documentRef, 'div', 'maid-onboarding-toast-sub', reward ? `获得成就「${reward}」` : '进度已保存'),
    );
    const view = create(documentRef, 'button', 'maid-onboarding-toast-action', '查看清单');
    view.type = 'button';
    view.addEventListener?.('click', () => {
      hideToast();
      onViewTasks?.();
    });
    const close = create(documentRef, 'button', 'maid-onboarding-toast-close', '×');
    close.type = 'button';
    close.setAttribute?.('aria-label', '关闭完成提示');
    close.addEventListener?.('click', hideToast);
    toastEl.append(icon, copy, view, close);
    documentRef.body.appendChild(toastEl);
    if (Number(duration) > 0) toastTimer = setTimeoutFn?.(hideToast, Number(duration)) ?? null;
    return true;
  };

  return {
    destroy() {
      hideHint();
      hideToast();
    },
    hideHint,
    hideToast,
    showCompletion,
    showHint,
    getElements: () => ({ hintEl, toastEl }),
  };
};
