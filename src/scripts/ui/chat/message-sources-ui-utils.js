import { normalizeWebSources } from '../../api/web-search-runtime.js';

const isPlainObject = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));

export const MESSAGE_SOURCES_STYLES = Object.freeze({
  root: `
    width:min(100%, 520px);
    box-sizing:border-box;
    border:1px solid var(--app-border-subtle);
    border-radius:9px;
    background:color-mix(in srgb, var(--app-surface-subtle) 72%, transparent);
    overflow:hidden;
    font-size:11px;
    color:var(--app-text-muted);
  `,
  summary: `
    min-height:30px;
    display:flex;
    align-items:center;
    padding:5px 9px;
    box-sizing:border-box;
    cursor:pointer;
    list-style:none;
    color:var(--app-text-secondary);
    font-weight:700;
  `,
  list: `
    display:grid;
    gap:5px;
    padding:0 9px 8px;
  `,
  link: `
    display:block;
    min-width:0;
    overflow:hidden;
    color:var(--app-accent-strong);
    line-height:1.35;
    text-decoration:none;
    text-overflow:ellipsis;
    white-space:nowrap;
  `,
});

export const getMessageSources = (message = {}) => {
  const meta = isPlainObject(message?.meta) ? message.meta : {};
  return normalizeWebSources(meta.sources || []);
};

export const buildMessageSourcesSignature = (message = {}) => {
  const sources = getMessageSources(message);
  if (!sources.length) return '';
  return JSON.stringify(sources.map(source => ({
    url: source.url,
    title: source.title,
    snippet: source.snippet || '',
    provider: source.provider || '',
  })));
};

export const buildMessageSourcesElement = ({
  documentLike = globalThis.document,
  message = {},
} = {}) => {
  if (!documentLike?.createElement || message?.role !== 'assistant') return null;
  const sources = getMessageSources(message);
  if (!sources.length) return null;

  const root = documentLike.createElement('details');
  root.className = 'chat-message-sources';
  if (root.style) root.style.cssText = MESSAGE_SOURCES_STYLES.root;
  root.dataset.sourcesCount = String(sources.length);

  const summary = documentLike.createElement('summary');
  summary.textContent = `来源 · ${sources.length}`;
  if (summary.style) summary.style.cssText = MESSAGE_SOURCES_STYLES.summary;
  root.appendChild(summary);

  const list = documentLike.createElement('div');
  list.className = 'chat-message-sources-list';
  if (list.style) list.style.cssText = MESSAGE_SOURCES_STYLES.list;
  sources.forEach((source) => {
    const link = documentLike.createElement('a');
    link.href = source.url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = source.title;
    link.title = source.snippet ? `${source.url}\n${source.snippet}` : source.url;
    if (link.style) link.style.cssText = MESSAGE_SOURCES_STYLES.link;
    list.appendChild(link);
  });
  root.appendChild(list);
  return root;
};

