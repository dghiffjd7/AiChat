import {
  buildVariableTree,
  formatVariableTreeValue,
  getSortedVariableTreeChildren,
  inferVariableValueType,
  isVariableValueFilled,
  resolveNextEnumValue,
  variableTreeNodeMatches,
} from './variable-panel-state-utils.js';

const resolveDocument = documentRef => documentRef || globalThis.document;

const clearElement = (element) => {
  if (!element) return;
  if (typeof element.replaceChildren === 'function') element.replaceChildren();
  else element.innerHTML = '';
};

const setStyleProperty = (element, name, value) => {
  if (!element?.style) return;
  if (typeof element.style.setProperty === 'function') {
    element.style.setProperty(name, value);
  } else {
    element.style[name] = value;
  }
};

const makeElement = (documentRef, tagName, className = '', text = '') => {
  const element = documentRef.createElement(tagName);
  element.className = className;
  if (text !== '') element.textContent = text;
  return element;
};

const makeButton = (documentRef, className, text, onClick, title = '') => {
  const button = makeElement(documentRef, 'button', className, text);
  button.type = 'button';
  if (title) button.title = title;
  button.addEventListener('click', onClick);
  return button;
};

const appendEmptyState = (documentRef, target, hasSession, text = '') => {
  const empty = makeElement(
    documentRef,
    'div',
    'variable-panel-empty',
    text || (hasSession ? '暂无变量' : '未选择会话'),
  );
  target.appendChild(empty);
};

export const formatVariableDisplayValue = (value) => {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

export const getVariablePercent = (value, schema = {}) => {
  const min = Number(schema?.range?.min ?? 0);
  const max = Number(schema?.range?.max ?? 100);
  const number = Number(value);
  if (!Number.isFinite(number) || !Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round(((number - min) / (max - min)) * 100)));
};

const resolveVariableColor = schema => String(schema?.ui?.color || '').trim();

const applyVariableColor = (element, schema) => {
  const color = resolveVariableColor(schema);
  if (color) setStyleProperty(element, '--variable-color', color);
};

const createValueWidget = ({
  documentRef,
  rowModel,
  onChangeValue,
}) => {
  const schema = rowModel.schema || {};
  const type = String(schema.type || inferVariableValueType(rowModel.value)).toLowerCase();
  const filled = rowModel.filled;
  const valueText = formatVariableDisplayValue(rowModel.value);

  if (type === 'number') {
    const widget = makeElement(documentRef, 'div', 'variable-value-widget variable-number-widget');
    const value = makeElement(documentRef, 'span', 'variable-number-value', filled ? valueText : '（空）');
    const track = makeElement(documentRef, 'span', 'variable-number-track');
    const fill = makeElement(documentRef, 'span', 'variable-number-fill');
    setStyleProperty(fill, '--variable-progress', `${getVariablePercent(rowModel.value, schema)}%`);
    applyVariableColor(widget, schema);
    track.appendChild(fill);
    widget.appendChild(value);
    widget.appendChild(track);
    return widget;
  }

  if (type === 'enum') {
    const button = makeButton(
      documentRef,
      'variable-value-widget variable-enum-cycle',
      filled ? valueText : '（空）',
      (event) => {
        event?.stopPropagation?.();
        onChangeValue(
          rowModel.key,
          resolveNextEnumValue(rowModel.value, schema.options),
        );
      },
      '点击切换下一个选项',
    );
    applyVariableColor(button, schema);
    return button;
  }

  if (type === 'boolean') {
    const button = makeButton(
      documentRef,
      'variable-value-widget variable-boolean-cycle',
      valueText || 'false',
      (event) => {
        event?.stopPropagation?.();
        onChangeValue(rowModel.key, !Boolean(rowModel.value));
      },
      '点击切换布尔值',
    );
    applyVariableColor(button, schema);
    return button;
  }

  return makeElement(
    documentRef,
    'div',
    `variable-value-widget variable-text-widget${filled ? '' : ' is-empty'}`,
    filled ? valueText : '（空）',
  );
};

const bindLongPressActions = (row) => {
  let timer = null;
  const cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };
  row.addEventListener('pointerdown', (event) => {
    if (event?.pointerType === 'mouse') return;
    cancel();
    timer = setTimeout(() => {
      row.classList?.add?.('is-actions-visible');
      globalThis.navigator?.vibrate?.(12);
      timer = null;
    }, 480);
  });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach((type) => {
    row.addEventListener(type, cancel);
  });
};

export const renderVariableListView = ({
  documentRef: rawDocument,
  listEl,
  rows = [],
  hasSession = false,
  onConfigure = () => {},
  onEdit = () => {},
  onDelete = () => {},
  onCopy = () => {},
  onChangeValue = () => {},
  onSelect = () => {},
} = {}) => {
  const documentRef = resolveDocument(rawDocument);
  if (!documentRef || !listEl) return { rendered: 0, empty: true };
  clearElement(listEl);
  if (!rows.length) {
    appendEmptyState(documentRef, listEl, hasSession);
    return { rendered: 0, empty: true };
  }

  rows.forEach((rowModel, index) => {
    const row = makeElement(documentRef, 'div', 'var-row-card variable-row');
    row.tabIndex = 0;
    row.setAttribute('role', 'button');
    row.setAttribute('aria-label', `配置变量 ${rowModel.key}`);
    row.dataset.variableKey = rowModel.key;
    if (index < 16) {
      row.className += ' is-entering';
      setStyleProperty(row, '--variable-enter-index', String(index));
    }
    applyVariableColor(row, rowModel.schema);

    const avatar = makeElement(
      documentRef,
      'span',
      'variable-row-avatar',
      Array.from(String(rowModel.key || '?'))[0]?.toUpperCase?.() || '?',
    );
    const meta = makeElement(documentRef, 'div', 'variable-row-meta');
    const title = makeElement(documentRef, 'div', 'variable-row-title');
    const key = makeElement(documentRef, 'span', 'variable-row-name', rowModel.key);
    key.setAttribute('data-i18n-skip', '');
    title.appendChild(key);
    const typeName = String(rowModel.schema?.type || inferVariableValueType(rowModel.value));
    title.appendChild(makeElement(documentRef, 'span', 'variable-type-label', typeName));
    meta.appendChild(title);

    const reference = makeButton(
      documentRef,
      'variable-reference-chip',
      `{{getvar::${rowModel.key}}}`,
      (event) => {
        event?.stopPropagation?.();
        onCopy(rowModel.key);
      },
      '复制变量引用',
    );
    meta.appendChild(reference);

    const valueWidget = createValueWidget({
      documentRef,
      rowModel,
      onChangeValue,
    });
    if (rowModel.filled) valueWidget.setAttribute('data-i18n-skip', '');

    const actions = makeElement(documentRef, 'div', 'variable-row-actions');
    actions.appendChild(makeButton(
      documentRef,
      'var-schema variable-row-action',
      '配置',
      (event) => {
        event?.stopPropagation?.();
        onConfigure(rowModel.key);
      },
    ));
    actions.appendChild(makeButton(
      documentRef,
      'var-edit variable-row-action',
      '编辑',
      (event) => {
        event?.stopPropagation?.();
        onEdit(rowModel.key, rowModel.value);
      },
    ));
    actions.appendChild(makeButton(
      documentRef,
      'var-copy variable-row-action',
      '复制',
      (event) => {
        event?.stopPropagation?.();
        onCopy(rowModel.key);
      },
    ));
    actions.appendChild(makeButton(
      documentRef,
      'var-del variable-row-action is-danger',
      '删除',
      (event) => {
        event?.stopPropagation?.();
        onDelete(rowModel.key);
      },
    ));

    row.appendChild(avatar);
    row.appendChild(meta);
    row.appendChild(valueWidget);
    row.appendChild(actions);
    row.addEventListener('click', () => {
      onSelect(rowModel.key);
      onConfigure(rowModel.key);
    });
    row.addEventListener('keydown', (event) => {
      if (event?.key !== 'Enter' && event?.key !== ' ') return;
      event.preventDefault?.();
      onSelect(rowModel.key);
      onConfigure(rowModel.key);
    });
    bindLongPressActions(row);
    listEl.appendChild(row);
  });
  return { rendered: rows.length, empty: false };
};

const getTreeStats = (node) => {
  let total = node?.hasValue ? 1 : 0;
  let filled = node?.hasValue && isVariableValueFilled(node.value) ? 1 : 0;
  for (const child of node?.children?.values?.() || []) {
    const childStats = getTreeStats(child);
    total += childStats.total;
    filled += childStats.filled;
  }
  return { total, filled };
};

export const renderVariableTreeNode = ({
  documentRef: rawDocument,
  node,
  term = '',
  depth = 0,
  schemas = {},
  onConfigure = () => {},
  onCopy = () => {},
} = {}) => {
  const documentRef = resolveDocument(rawDocument);
  if (!documentRef || !node || !variableTreeNodeMatches(node, term)) return null;
  const children = getSortedVariableTreeChildren(node)
    .filter(child => variableTreeNodeMatches(child, term));
  const hasChildren = children.length > 0;
  const valueText = node.hasValue ? formatVariableTreeValue(node.value) : '';

  if (hasChildren) {
    const wrapper = makeElement(
      documentRef,
      'section',
      `variable-tree-group${depth === 0 ? ' is-root' : ''}`,
    );
    wrapper.dataset.depth = String(depth);
    const stats = getTreeStats(node);
    const header = makeButton(documentRef, 'variable-tree-group-header', '', () => {
      wrapper.classList?.toggle?.('is-collapsed');
      const collapsed = wrapper.classList?.contains?.('is-collapsed');
      header.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    });
    header.setAttribute('aria-expanded', 'true');
    header.appendChild(makeElement(documentRef, 'span', 'variable-tree-chevron', '⌄'));
    const groupName = makeElement(documentRef, 'span', 'variable-tree-group-name', node.name || '(root)');
    groupName.setAttribute('data-i18n-skip', '');
    header.appendChild(groupName);
    if (valueText) {
      const groupValue = makeElement(documentRef, 'span', 'variable-tree-group-value', valueText);
      groupValue.setAttribute('data-i18n-skip', '');
      header.appendChild(groupValue);
    }
    header.appendChild(makeElement(
      documentRef,
      'span',
      'variable-tree-count',
      `${stats.filled}/${stats.total} 已填`,
    ));
    wrapper.appendChild(header);

    const clip = makeElement(documentRef, 'div', 'variable-tree-group-clip');
    const body = makeElement(documentRef, 'div', 'variable-tree-group-body');
    children.forEach((child) => {
      const childElement = renderVariableTreeNode({
        documentRef,
        node: child,
        term,
        depth: depth + 1,
        schemas,
        onConfigure,
        onCopy,
      });
      if (childElement) body.appendChild(childElement);
    });
    clip.appendChild(body);
    wrapper.appendChild(clip);
    return wrapper;
  }

  const row = makeElement(documentRef, 'div', 'variable-tree-leaf');
  row.title = node.path || node.name || '';
  row.dataset.variableKey = node.path || node.name || '';
  const schema = schemas?.[node.path] || null;
  applyVariableColor(row, schema);
  row.appendChild(makeElement(documentRef, 'span', 'variable-tree-dot'));
  const path = makeElement(documentRef, 'span', 'variable-tree-path', node.path || node.name || '');
  path.setAttribute('data-i18n-skip', '');
  row.appendChild(path);
  const value = makeElement(
    documentRef,
    'span',
    `variable-tree-value${isVariableValueFilled(node.value) ? '' : ' is-empty'}`,
    valueText || '（空）',
  );
  if (isVariableValueFilled(node.value)) value.setAttribute('data-i18n-skip', '');
  row.appendChild(value);
  row.appendChild(makeButton(
    documentRef,
    'variable-reference-chip is-compact',
    '复制',
    (event) => {
      event?.stopPropagation?.();
      onCopy(node.path);
    },
  ));
  row.addEventListener('click', () => onConfigure(node.path));
  return row;
};

export const renderVariableTreeView = ({
  documentRef: rawDocument,
  listEl,
  vars = {},
  schemas = {},
  term = '',
  hasSession = false,
  onConfigure = () => {},
  onCopy = () => {},
} = {}) => {
  const documentRef = resolveDocument(rawDocument);
  if (!documentRef || !listEl) return { rendered: 0, empty: true };
  clearElement(listEl);
  const tree = buildVariableTree(vars);
  const matchingNodes = getSortedVariableTreeChildren(tree)
    .filter(node => variableTreeNodeMatches(node, term));
  if (matchingNodes.length === 0) {
    appendEmptyState(documentRef, listEl, hasSession);
    return { rendered: 0, empty: true };
  }
  const fragment = documentRef.createDocumentFragment();
  matchingNodes.forEach((node) => {
    const element = renderVariableTreeNode({
      documentRef,
      node,
      term,
      depth: 0,
      schemas,
      onConfigure,
      onCopy,
    });
    if (element) fragment.appendChild(element);
  });
  listEl.appendChild(fragment);
  return { rendered: matchingNodes.length, empty: false };
};

const applyFormat = (format, valueText) => (
  String(format || '').trim()
    ? String(format).replace(/\{value\}/g, valueText)
    : valueText
);

const createSummaryPreview = ({
  documentRef,
  key,
  schema,
  value,
}) => {
  const display = String(schema?.ui?.display || 'card').toLowerCase();
  const label = String(schema?.ui?.label || schema?.name || key);
  const rawText = formatVariableDisplayValue(value);
  const rendered = applyFormat(schema?.ui?.format, rawText);
  const card = makeElement(
    documentRef,
    'div',
    `var-summary-card variable-summary-${display}`,
  );
  applyVariableColor(card, schema);
  card.appendChild(makeElement(documentRef, 'div', 'variable-summary-label', label));
  card.appendChild(makeElement(
    documentRef,
    'div',
    'variable-summary-value',
    rendered || (display === 'progress' || display === 'ring' ? String(value ?? 0) : '—'),
  ));

  if (display === 'progress') {
    const track = makeElement(documentRef, 'div', 'variable-progress-track');
    const fill = makeElement(documentRef, 'div', 'variable-progress-fill');
    setStyleProperty(fill, '--variable-progress', `${getVariablePercent(value, schema)}%`);
    track.appendChild(fill);
    card.appendChild(track);
  }
  if (display === 'ring') {
    const ring = makeElement(documentRef, 'div', 'variable-summary-ring');
    setStyleProperty(ring, '--variable-percent', `${getVariablePercent(value, schema) * 3.6}deg`);
    ring.setAttribute('aria-label', `${getVariablePercent(value, schema)}%`);
    card.appendChild(ring);
  }
  return card;
};

export const renderVariableSummaryCards = ({
  documentRef: rawDocument,
  cardsEl,
  vars = {},
  schemas = {},
} = {}) => {
  const documentRef = resolveDocument(rawDocument);
  if (!documentRef || !cardsEl) return { rendered: 0, hidden: true };
  clearElement(cardsEl);
  const entries = Object.entries(schemas || {}).filter(([, schema]) => {
    const display = String(schema?.ui?.display || 'card').toLowerCase();
    return display && display !== 'hidden';
  });
  if (!entries.length) {
    cardsEl.style.display = 'none';
    return { rendered: 0, hidden: true };
  }
  cardsEl.style.display = '';
  entries.slice(0, 8).forEach(([key, schema]) => {
    const rawValue = Object.prototype.hasOwnProperty.call(vars || {}, key)
      ? vars[key]
      : schema?.default;
    cardsEl.appendChild(createSummaryPreview({
      documentRef,
      key,
      schema,
      value: rawValue,
    }));
  });
  return { rendered: Math.min(entries.length, 8), hidden: false };
};
