import {
  isVariableRuntimeEnabledForSession,
  VARIABLE_RUNTIME_CHANGED_EVENT,
} from './chat/variable-runtime-policy-utils.js';

const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));

const stringifyValue = (value) => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const truncate = (text, max = 60) => {
  const raw = String(text || '').trim();
  if (raw.length <= max) return raw;
  return `${raw.slice(0, max)}…`;
};

const formatValue = (value, schema = {}) => {
  const ui = schema.ui || {};
  const raw = stringifyValue(value);
  if (typeof ui.format === 'string' && ui.format.includes('{value}')) {
    return ui.format.replace('{value}', raw);
  }
  if (schema.type === 'boolean') return value ? '是' : '否';
  if (schema.type === 'array' && Array.isArray(value)) {
    const preview = value.slice(0, 4).map(v => stringifyValue(v)).join(', ');
    return value.length > 4 ? `${preview}…` : preview;
  }
  if (schema.type === 'object' && value && typeof value === 'object') {
    const keys = Object.keys(value);
    if (keys.length && keys.length <= 3) {
      return keys.map(k => `${k}:${stringifyValue(value[k])}`).join(', ');
    }
    return `对象(${keys.length})`;
  }
  return raw;
};

const resolveProgress = (value, schema = {}) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return { percent: 0, text: '' };
  const range = schema.range || {};
  let min = Number(range.min);
  let max = Number(range.max);
  if (!Number.isFinite(min)) min = 0;
  if (!Number.isFinite(max)) {
    if (num >= 0 && num <= 1) max = 1;
    else max = 100;
  }
  if (max <= min) max = min + 1;
  const percent = clamp((num - min) / (max - min), 0, 1);
  return { percent, text: formatValue(value, schema) || String(num) };
};

const collectEntries = (chatStore, sessionId) => {
  const sid = String(sessionId || '').trim();
  if (!sid) return [];
  if (!isVariableRuntimeEnabledForSession(chatStore, sid)) return [];
  const schemas = chatStore?.listVariableSchemas?.(sid) || {};
  const vars = chatStore?.listVariables?.(sid) || {};
  return Object.entries(schemas)
    .map(([key, schema]) => {
      if (!schema || typeof schema !== 'object') return null;
      const display = String(schema?.ui?.display || 'card');
      if (display === 'hidden') return null;
      const label = String(schema?.ui?.label || schema?.name || key || '').trim();
      if (!label) return null;
      return { key, schema, display, label, value: vars[key] };
    })
    .filter(Boolean);
};

const renderEntriesIntoList = (listEl, entries = []) => {
  if (!listEl) return;
  listEl.innerHTML = '';
  entries.forEach((entry) => {
    const item = document.createElement('div');
    item.className = `variable-status-item var-status-${entry.display}`;
    const color = String(entry.schema?.ui?.color || '').trim();
    if (color) item.style.setProperty('--var-color', color);

    const label = document.createElement('div');
    label.className = 'var-status-label';
    const icon = String(entry.schema?.ui?.icon || '').trim();
    label.textContent = icon ? `${icon} ${entry.label}` : entry.label;

    const valueText = formatValue(entry.value, entry.schema);
    const value = document.createElement('div');
    value.className = 'var-status-value';
    value.textContent = truncate(valueText, 80);
    value.title = valueText;

    item.appendChild(label);
    item.appendChild(value);

    if (entry.display === 'progress') {
      const progress = resolveProgress(entry.value, entry.schema);
      const bar = document.createElement('div');
      bar.className = 'var-status-progress';
      const fill = document.createElement('span');
      fill.style.width = `${Math.round(progress.percent * 100)}%`;
      bar.appendChild(fill);
      item.appendChild(bar);
    }

    listEl.appendChild(item);
  });
};

export const buildVariableStatusSnapshot = ({ chatStore, sessionId, inline = false } = {}) => {
  const entries = collectEntries(chatStore, sessionId);
  if (!entries.length) return null;
  const root = document.createElement('div');
  root.className = inline ? 'variable-status-card inline is-active' : 'variable-status-card is-active';
  const list = document.createElement('div');
  list.className = 'variable-status-list';
  root.appendChild(list);
  renderEntriesIntoList(list, entries);
  return root;
};

export class VariableStatusCard {
  constructor({ chatStore } = {}) {
    this.chatStore = chatStore;
    this.el = null;
    this.listEl = null;
    this.sessionId = '';
    this._bound = false;
  }

  mount({ container, before } = {}) {
    if (this.el || !container) return;
    const root = document.createElement('div');
    root.className = 'variable-status-card';
    root.setAttribute('aria-hidden', 'true');
    const list = document.createElement('div');
    list.className = 'variable-status-list';
    root.appendChild(list);
    if (before) container.insertBefore(root, before);
    else container.appendChild(root);
    this.el = root;
    this.listEl = list;
    this.bindEvents();
  }

  bindEvents() {
    if (this._bound) return;
    this._bound = true;
    window.addEventListener('chatapp-variable-changed', (ev) => {
      const sid = String(ev?.detail?.sessionId || '').trim();
      const scope = String(ev?.detail?.scope || '').trim();
      if (!sid || scope === 'global') return;
      if (sid !== this.sessionId) return;
      this.render(sid);
    });
    window.addEventListener('chatapp-variable-schema-changed', (ev) => {
      const sid = String(ev?.detail?.sessionId || '').trim();
      if (!sid) return;
      if (sid !== this.sessionId) return;
      this.render(sid);
    });
    window.addEventListener(VARIABLE_RUNTIME_CHANGED_EVENT, (ev) => {
      const sid = String(ev?.detail?.sessionId || '').trim();
      if (!sid || sid !== this.sessionId) return;
      this.render(sid);
    });
  }

  setSession(sessionId) {
    const sid = String(sessionId || '').trim();
    if (!sid) return;
    this.sessionId = sid;
    this.render(sid);
  }

  render(sessionId = this.sessionId) {
    if (!this.el || !this.listEl) return;
    const sid = String(sessionId || '').trim();
    if (!sid) {
      this.el.classList.remove('is-active');
      this.el.setAttribute('aria-hidden', 'true');
      this.listEl.innerHTML = '';
      return;
    }
    const entries = collectEntries(this.chatStore, sid);

    if (!entries.length) {
      this.el.classList.remove('is-active');
      this.el.setAttribute('aria-hidden', 'true');
      this.listEl.innerHTML = '';
      return;
    }

    renderEntriesIntoList(this.listEl, entries);

    this.el.classList.add('is-active');
    this.el.setAttribute('aria-hidden', 'false');
  }
}
