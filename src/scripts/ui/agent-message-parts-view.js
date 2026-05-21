import { normalizeAgentMessagePart } from '../agent/agent-message-parts.js';

const isPlainObject = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));

const trim = (value, fallback = '') => {
  const text = String(value ?? '').trim();
  return text || fallback;
};

const formatTime = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return '-';
  try {
    return new Date(numeric).toISOString();
  } catch {
    return String(numeric);
  }
};

const formatMetadata = (metadata = {}) => {
  if (!isPlainObject(metadata) || !Object.keys(metadata).length) return '';
  try {
    return JSON.stringify(metadata);
  } catch {
    return String(metadata || '');
  }
};

const STATUS_STYLE = Object.freeze({
  succeeded: {
    accent: '#5fd08a',
    label: 'done',
  },
  failed: {
    accent: '#ff6b6b',
    label: 'failed',
  },
  cancelled: {
    accent: '#f0a15e',
    label: 'cancelled',
  },
  skipped: {
    accent: '#9aa4b2',
    label: 'skipped',
  },
  queued: {
    accent: '#7aa7ff',
    label: 'queued',
  },
  waiting_permission: {
    accent: '#d9b45f',
    label: 'ask',
  },
  running: {
    accent: '#67d4f0',
    label: 'running',
  },
});

const getStatusStyle = status => STATUS_STYLE[trim(status, 'running')] || STATUS_STYLE.running;

const createElement = (documentRef, tagName, {
  className = '',
  text = '',
  style = '',
} = {}) => {
  const el = documentRef.createElement(tagName);
  if (className) el.className = className;
  if (style) el.style.cssText = style;
  if (text) el.textContent = text;
  return el;
};

export const AGENT_MESSAGE_PART_VIEW_STYLES = Object.freeze({
  container: `
    display:grid;
    grid-template-columns:minmax(0, 1fr);
    gap:8px;
    flex:0 1 min(42vh, 380px);
    max-height:min(42vh, 380px);
    min-height:120px;
    overflow:auto;
    padding:0 2px 10px 0;
    box-sizing:border-box;
  `,
  empty: `
    border:1px dashed var(--app-border-default);
    border-radius:8px;
    padding:10px;
    color:var(--app-text-muted);
    font-size:12px;
  `,
  details: `
    flex:0 0 auto;
    min-height:44px;
    border:1px solid var(--app-border-default);
    border-radius:8px;
    background:var(--app-surface-card);
    overflow:hidden;
  `,
  summary: `
    cursor:pointer;
    display:grid;
    grid-template-columns:12px minmax(0, 1fr) auto;
    align-items:center;
    gap:10px;
    min-height:44px;
    padding:8px 10px;
    font-size:12px;
    font-weight:700;
    line-height:1.35;
    color:var(--app-text-primary);
    background:var(--app-surface-subtle);
    box-sizing:border-box;
    list-style:none;
  `,
  dot: `
    width:9px;
    height:9px;
    border-radius:999px;
    box-shadow:0 0 0 3px color-mix(in srgb, currentColor 18%, transparent);
  `,
  summaryMain: `
    display:grid;
    gap:2px;
    min-width:0;
  `,
  titleLine: `
    overflow:hidden;
    text-overflow:ellipsis;
    white-space:nowrap;
  `,
  metaLine: `
    overflow:hidden;
    text-overflow:ellipsis;
    white-space:nowrap;
    color:var(--app-text-muted);
    font-weight:600;
  `,
  badge: `
    border:1px solid currentColor;
    border-radius:999px;
    padding:2px 8px;
    font-size:11px;
    font-weight:800;
    line-height:1.2;
  `,
  body: `
    display:grid;
    gap:4px;
    padding:8px 10px 10px;
    font-size:12px;
    line-height:1.4;
    color:var(--app-text-primary);
    font-family:ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace;
  `,
  row: `
    white-space:pre-wrap;
    overflow-wrap:anywhere;
  `,
});

export const buildAgentMessagePartViewModel = (parts = []) => (
  (Array.isArray(parts) ? parts : [])
    .map(normalizeAgentMessagePart)
    .filter(part => part.id)
    .map((part) => {
      const title = trim(part.title || part.kind || part.type, part.type);
      const status = trim(part.status, 'running');
      const statusStyle = getStatusStyle(status);
      const identity = [
        part.runId ? `run=${part.runId}` : '',
        part.stepId ? `step=${part.stepId}` : '',
        part.toolCallId ? `tool=${part.toolCallId}` : '',
      ].filter(Boolean).join(' · ');
      const summary = `[${status.toUpperCase()}] ${title}${identity ? ` · ${identity}` : ''}`;
      const timeLabel = formatTime(part.updatedAt || part.createdAt);
      const metaLabel = [
        identity,
        part.source ? `source=${part.source}` : '',
        timeLabel !== '-' ? timeLabel : '',
      ].filter(Boolean).join(' · ');
      const metadata = formatMetadata(part.metadata);
      const rows = [
        ['type', part.type],
        ['kind', part.kind],
        ['source', part.source],
        ['summary', part.summary],
        ['createdAt', formatTime(part.createdAt)],
        ['updatedAt', formatTime(part.updatedAt)],
        ['error', part.errorMessage],
        ['metadata', metadata],
      ].filter(([, value]) => trim(value));
      return {
        ...part,
        summaryLabel: summary,
        titleLabel: title,
        metaLabel,
        statusLabel: statusStyle.label,
        accent: statusStyle.accent,
        open: status !== 'succeeded',
        rows,
      };
    })
);

const clearContainer = (container) => {
  if (!container) return;
  if (typeof container.replaceChildren === 'function') {
    container.replaceChildren();
    return;
  }
  container.textContent = '';
  if (Array.isArray(container.children)) container.children.length = 0;
};

export const refreshAgentMessagePartsView = ({
  container = null,
  parts = [],
  documentRef = globalThis.document,
  emptyText = 'No agent message parts',
} = {}) => {
  if (!container || !documentRef?.createElement) return { count: 0, items: [] };
  const items = buildAgentMessagePartViewModel(parts);
  if (container.style) container.style.cssText = AGENT_MESSAGE_PART_VIEW_STYLES.container;
  clearContainer(container);
  if (!items.length) {
    container.appendChild(createElement(documentRef, 'div', {
      text: emptyText,
      style: AGENT_MESSAGE_PART_VIEW_STYLES.empty,
    }));
    return { count: 0, items };
  }
  items.forEach((item) => {
    const details = createElement(documentRef, 'details', {
      style: AGENT_MESSAGE_PART_VIEW_STYLES.details,
    });
    details.open = item.open;
    const summary = createElement(documentRef, 'summary', {
      style: AGENT_MESSAGE_PART_VIEW_STYLES.summary,
    });
    const dot = createElement(documentRef, 'span', {
      style: `${AGENT_MESSAGE_PART_VIEW_STYLES.dot}color:${item.accent};background:${item.accent};`,
    });
    const summaryMain = createElement(documentRef, 'span', {
      style: AGENT_MESSAGE_PART_VIEW_STYLES.summaryMain,
    });
    const titleLine = createElement(documentRef, 'span', {
      text: item.titleLabel || item.summaryLabel,
      style: AGENT_MESSAGE_PART_VIEW_STYLES.titleLine,
    });
    const metaLine = createElement(documentRef, 'span', {
      text: item.metaLabel || item.summaryLabel,
      style: AGENT_MESSAGE_PART_VIEW_STYLES.metaLine,
    });
    const badge = createElement(documentRef, 'span', {
      text: item.statusLabel,
      style: `${AGENT_MESSAGE_PART_VIEW_STYLES.badge}color:${item.accent};`,
    });
    summaryMain.appendChild(titleLine);
    summaryMain.appendChild(metaLine);
    summary.appendChild(dot);
    summary.appendChild(summaryMain);
    summary.appendChild(badge);
    details.appendChild(summary);
    const body = createElement(documentRef, 'div', {
      style: AGENT_MESSAGE_PART_VIEW_STYLES.body,
    });
    item.rows.forEach(([label, value]) => {
      const row = createElement(documentRef, 'div', {
        text: `${label}: ${value}`,
        style: AGENT_MESSAGE_PART_VIEW_STYLES.row,
      });
      body.appendChild(row);
    });
    details.appendChild(body);
    container.appendChild(details);
  });
  return { count: items.length, items };
};
