const MAX_PREVIEW_CHARS = 2400;
const SENSITIVE_KEY_RE = /(api[-_]?key|authorization|access[-_]?token|refresh[-_]?token|secret|password|credential|bearer)/i;

const isPlainObject = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));

const trim = (value, fallback = '') => {
  const text = String(value ?? '').trim();
  return text || fallback;
};

const boolLabel = value => (value === true ? 'yes' : 'no');

const truncateText = (value = '', limit = MAX_PREVIEW_CHARS) => {
  const text = String(value ?? '');
  const max = Math.max(200, Math.trunc(Number(limit)) || MAX_PREVIEW_CHARS);
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n... truncated ${text.length - max} chars`;
};

const redactValue = (value, key = '', depth = 0, seen = new WeakSet()) => {
  if (SENSITIVE_KEY_RE.test(String(key || ''))) return '[redacted]';
  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;
  if (depth >= 8) return '[depth-limit]';
  if (seen.has(value)) return '[circular]';
  seen.add(value);
  if (Array.isArray(value)) {
    return value.slice(0, 80).map(item => redactValue(item, '', depth + 1, seen));
  }
  const out = {};
  Object.entries(value).slice(0, 120).forEach(([nextKey, nextValue]) => {
    out[nextKey] = redactValue(nextValue, nextKey, depth + 1, seen);
  });
  return out;
};

const stringifyPreview = (value) => {
  try {
    return truncateText(JSON.stringify(redactValue(value), null, 2));
  } catch {
    return truncateText(String(value ?? ''));
  }
};

const readRunnerDraft = (continuation = {}) => (
  isPlainObject(continuation?.runnerRequestDraft)
    ? continuation.runnerRequestDraft
    : {}
);

const readCurrentRunner = (currentRunner = {}) => (
  isPlainObject(currentRunner?.diagnostics)
    ? currentRunner.diagnostics
    : (isPlainObject(currentRunner) ? currentRunner : {})
);

const buildRow = (label, value) => ({
  label,
  value: trim(value, '-'),
});

export const buildProviderContinuationConfirmViewModel = ({
  continuation = {},
  currentRunner = {},
  allowAppendCommit = false,
} = {}) => {
  const draft = readRunnerDraft(continuation);
  const runner = readCurrentRunner(currentRunner);
  const continuationReady = continuation?.status === 'ready';
  const runnerReady = runner?.status === 'ready' || currentRunner?.status === 'ready';
  const canRun = continuationReady && runnerReady;
  const request = isPlainObject(draft.request)
    ? draft.request
    : (isPlainObject(continuation?.requestPreview) ? continuation.requestPreview : {});
  const previewText = stringifyPreview({
    runner: trim(draft.runner),
    provider: trim(draft.provider || request.provider || runner.provider),
    model: trim(draft.model || request.model || runner.model),
    sessionId: trim(draft.sessionId || request.sessionId),
    payloadKind: trim(draft.payloadKind),
    payloadCount: Number(draft.payloadCount || 0) || 0,
    request,
  });
  const blockedReason = canRun
    ? ''
    : trim(continuation?.reason || runner?.reason || currentRunner?.reason, 'continuation or runner is not ready');

  return {
    canRun,
    canAppend: canRun && allowAppendCommit === true,
    title: 'Provider Continue Preview',
    blockedReason,
    previewText,
    confirmLabel: 'Run Preview',
    appendLabel: 'Run + Append',
    cancelLabel: 'Cancel',
    rows: [
      buildRow('continuation', continuation?.status),
      buildRow('runner', runner?.status || currentRunner?.status),
      buildRow('provider', draft.provider || runner.provider || request.provider),
      buildRow('model', draft.model || runner.model || request.model),
      buildRow('session', draft.sessionId || request.sessionId || runner?.runtime?.sessionId),
      buildRow('payload', `${trim(draft.payloadKind)} x${Number(draft.payloadCount || 0) || 0}`),
      buildRow('tool results', Number(draft.toolResultCount || continuation?.requestPreview?.toolResultCount || 0) || 0),
      buildRow('network after confirm', boolLabel(runner.network === true || currentRunner.network === true)),
      buildRow('writes chat', boolLabel(continuation?.writesChat === true || runner.writesChat === true)),
      buildRow('rollback', runner.rollback || 'disable providerToolSessionGate'),
    ],
  };
};

const createElement = (documentRef, tagName, {
  className = '',
  text = '',
  style = '',
} = {}) => {
  const el = documentRef.createElement(tagName);
  if (className) el.className = className;
  if (text) el.textContent = text;
  if (style && el.style) el.style.cssText = style;
  return el;
};

export const showProviderContinuationConfirmDialog = ({
  documentRef = globalThis.document,
  continuation = {},
  currentRunner = {},
  allowAppendCommit = false,
  onConfirm = null,
} = {}) => {
  if (!documentRef?.createElement || !documentRef?.body?.appendChild) {
    return Promise.resolve({ action: 'unavailable', confirmed: false });
  }
  const model = buildProviderContinuationConfirmViewModel({ continuation, currentRunner, allowAppendCommit });
  return new Promise((resolve) => {
    const overlay = createElement(documentRef, 'div', {
      className: 'provider-continuation-confirm-overlay',
      style: `
        position:fixed;inset:0;z-index:10020;
        background:rgba(4,8,14,0.62);
        display:grid;place-items:center;
        padding:18px;box-sizing:border-box;
      `,
    });
    const panel = createElement(documentRef, 'div', {
      className: 'provider-continuation-confirm-panel',
      style: `
        width:min(94vw, 680px);
        max-height:min(86vh, 760px);
        display:grid;grid-template-rows:auto minmax(0,1fr) auto;
        background:var(--app-surface-panel, #171b22);
        color:var(--app-text-primary, #f5f7fb);
        border:1px solid var(--app-border-default, rgba(148,163,184,0.36));
        border-radius:10px;
        box-shadow:0 24px 80px rgba(0,0,0,0.42);
        overflow:hidden;
      `,
    });
    const header = createElement(documentRef, 'div', {
      style: `
        display:flex;align-items:center;justify-content:space-between;gap:12px;
        padding:14px 16px;border-bottom:1px solid var(--app-border-default, rgba(148,163,184,0.28));
      `,
    });
    const title = createElement(documentRef, 'div', {
      text: model.title,
      style: 'font-size:14px;font-weight:800;line-height:1.2;',
    });
    const closeButton = createElement(documentRef, 'button', {
      text: 'Close',
      style: `
        border:1px solid var(--app-border-default, rgba(148,163,184,0.34));
        background:var(--app-surface-subtle, rgba(255,255,255,0.04));
        color:var(--app-text-primary, #f5f7fb);
        min-height:30px;padding:5px 10px;border-radius:8px;
        font-size:12px;font-weight:800;cursor:pointer;
      `,
    });
    closeButton.type = 'button';
    header.appendChild(title);
    header.appendChild(closeButton);

    const body = createElement(documentRef, 'div', {
      style: `
        min-height:0;overflow:auto;
        display:grid;gap:12px;
        padding:14px 16px;
      `,
    });
    const rows = createElement(documentRef, 'div', {
      style: `
        display:grid;grid-template-columns:minmax(110px, 0.32fr) minmax(0, 1fr);
        gap:6px 12px;font-size:12px;line-height:1.35;
      `,
    });
    model.rows.forEach((row) => {
      rows.appendChild(createElement(documentRef, 'div', {
        text: row.label,
        style: 'color:var(--app-text-muted, #9aa6b2);font-weight:700;',
      }));
      rows.appendChild(createElement(documentRef, 'div', {
        text: row.value,
        style: 'min-width:0;overflow-wrap:anywhere;',
      }));
    });
    body.appendChild(rows);
    if (model.blockedReason) {
      body.appendChild(createElement(documentRef, 'div', {
        text: model.blockedReason,
        style: `
          border:1px solid rgba(245,158,11,0.38);
          background:rgba(245,158,11,0.12);
          color:var(--app-text-primary, #f5f7fb);
          border-radius:8px;padding:8px 10px;
          font-size:12px;line-height:1.35;
        `,
      }));
    }
    body.appendChild(createElement(documentRef, 'pre', {
      text: model.previewText,
      style: `
        margin:0;white-space:pre-wrap;overflow-wrap:anywhere;
        max-height:310px;overflow:auto;
        border:1px solid var(--app-border-default, rgba(148,163,184,0.28));
        border-radius:8px;
        background:rgba(0,0,0,0.22);
        color:var(--app-text-primary, #f5f7fb);
        padding:10px;font-size:11px;line-height:1.45;
      `,
    }));

    const footer = createElement(documentRef, 'div', {
      style: `
        display:flex;justify-content:flex-end;gap:8px;
        padding:12px 16px;border-top:1px solid var(--app-border-default, rgba(148,163,184,0.28));
      `,
    });
    const cancelButton = createElement(documentRef, 'button', {
      text: model.cancelLabel,
      style: `
        border:1px solid var(--app-border-default, rgba(148,163,184,0.34));
        background:var(--app-surface-subtle, rgba(255,255,255,0.04));
        color:var(--app-text-primary, #f5f7fb);
        min-height:34px;padding:6px 12px;border-radius:8px;
        font-size:12px;font-weight:800;cursor:pointer;
      `,
    });
    const confirmButton = createElement(documentRef, 'button', {
      text: model.confirmLabel,
      style: `
        border:1px solid rgba(74,222,128,0.55);
        background:rgba(34,197,94,0.18);
        color:var(--app-text-primary, #f5f7fb);
        min-height:34px;padding:6px 12px;border-radius:8px;
        font-size:12px;font-weight:800;cursor:pointer;
      `,
    });
    const appendButton = createElement(documentRef, 'button', {
      text: model.appendLabel,
      style: `
        border:1px solid rgba(59,130,246,0.55);
        background:rgba(59,130,246,0.18);
        color:var(--app-text-primary, #f5f7fb);
        min-height:34px;padding:6px 12px;border-radius:8px;
        font-size:12px;font-weight:800;cursor:pointer;
      `,
    });
    cancelButton.type = 'button';
    confirmButton.type = 'button';
    appendButton.type = 'button';
    confirmButton.disabled = model.canRun !== true;
    appendButton.disabled = model.canAppend !== true;
    if (confirmButton.disabled && confirmButton.style) {
      confirmButton.style.opacity = '0.55';
      confirmButton.style.cursor = 'not-allowed';
    }
    if (appendButton.disabled && appendButton.style) {
      appendButton.style.opacity = '0.55';
      appendButton.style.cursor = 'not-allowed';
    }
    footer.appendChild(cancelButton);
    footer.appendChild(confirmButton);
    if (allowAppendCommit === true) footer.appendChild(appendButton);

    panel.appendChild(header);
    panel.appendChild(body);
    panel.appendChild(footer);
    overlay.appendChild(panel);

    let settled = false;
    const close = (result) => {
      if (settled) return;
      settled = true;
      overlay.remove?.();
      resolve(result);
    };
    overlay.addEventListener?.('click', () => close({ action: 'close', confirmed: false }));
    panel.addEventListener?.('click', event => event.stopPropagation?.());
    closeButton.addEventListener?.('click', () => close({ action: 'close', confirmed: false }));
    cancelButton.addEventListener?.('click', () => close({ action: 'cancel', confirmed: false }));
    const runConfirm = async (commitStrategy = 'preview_only', button = confirmButton) => {
      if (!model.canRun || button.disabled) return;
      confirmButton.disabled = true;
      appendButton.disabled = true;
      try {
        const result = typeof onConfirm === 'function'
          ? await onConfirm({ model, continuation, currentRunner, commitStrategy })
          : null;
        close({ action: 'confirm', confirmed: true, commitStrategy, result });
      } catch (error) {
        close({ action: 'confirm_failed', confirmed: true, commitStrategy, error });
      } finally {
        if (!settled) button.disabled = false;
      }
    };
    confirmButton.addEventListener?.('click', () => runConfirm('preview_only', confirmButton));
    appendButton.addEventListener?.('click', () => runConfirm('append_to_previous_bubble', appendButton));

    documentRef.body.appendChild(overlay);
    confirmButton.focus?.();
  });
};
