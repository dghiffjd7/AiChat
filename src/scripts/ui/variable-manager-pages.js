import {
  buildRuleConditionDiagnostics,
  formatUnsupportedExpressionMessage,
} from '../variables/expression-compat-diagnostics.js';
import {
  formatVariableDisplayValue,
  getVariablePercent,
} from './variable-panel-views.js';

const resolveDocument = documentRef => documentRef || globalThis.document;

const clearElement = (element) => {
  if (typeof element?.replaceChildren === 'function') element.replaceChildren();
  else if (element) element.innerHTML = '';
};

const makeElement = (documentRef, tagName, className = '', text = '') => {
  const element = documentRef.createElement(tagName);
  element.className = className;
  if (text !== '') element.textContent = String(text);
  return element;
};

const makeButton = (documentRef, className, text, onClick) => {
  const button = makeElement(documentRef, 'button', className, text);
  button.type = 'button';
  button.addEventListener('click', onClick);
  return button;
};

const setVariableColor = (element, color) => {
  const value = String(color || '').trim();
  if (value) element?.style?.setProperty?.('--variable-color', value);
};

const renderTemplatePreview = ({
  documentRef,
  template,
  vars,
}) => {
  const first = template?.variables?.[0] || null;
  if (!first) return null;
  const key = String(first.id || first.name || '');
  const schema = first.schema || {};
  const hasCurrent = Object.prototype.hasOwnProperty.call(vars || {}, key);
  const value = hasCurrent ? vars[key] : first.default;
  const preview = makeElement(
    documentRef,
    'div',
    `variable-template-preview is-${schema?.ui?.display || 'card'}`,
  );
  setVariableColor(preview, schema?.ui?.color);
  preview.appendChild(makeElement(
    documentRef,
    'span',
    'variable-template-preview-label',
    schema?.ui?.label || first.name || key,
  ));
  preview.appendChild(makeElement(
    documentRef,
    'strong',
    'variable-template-preview-value',
    formatVariableDisplayValue(value) || '（空）',
  ));
  if (schema?.ui?.display === 'progress') {
    const track = makeElement(documentRef, 'span', 'variable-number-track');
    const fill = makeElement(documentRef, 'span', 'variable-number-fill');
    fill.style.setProperty('--variable-progress', `${getVariablePercent(value, schema)}%`);
    track.appendChild(fill);
    preview.appendChild(track);
  }
  return preview;
};

export const renderVariableTemplatesPage = ({
  documentRef: rawDocument,
  container,
  templates = [],
  vars = {},
  term = '',
  onApply = () => {},
} = {}) => {
  const documentRef = resolveDocument(rawDocument);
  if (!documentRef || !container) return { rendered: 0 };
  clearElement(container);
  const query = String(term || '').trim().toLowerCase();
  const list = (Array.isArray(templates) ? templates : []).filter((template) => {
    if (!query) return true;
    const haystack = [
      template?.name,
      template?.desc,
      ...(template?.variables || []).flatMap(variable => [variable?.id, variable?.name]),
    ].join(' ').toLowerCase();
    return haystack.includes(query);
  });
  if (!list.length) {
    container.appendChild(makeElement(
      documentRef,
      'div',
      'variable-panel-empty',
      query ? '没有匹配的模板' : '暂无变量模板',
    ));
    return { rendered: 0 };
  }

  list.forEach((template, index) => {
    const keys = (template.variables || [])
      .map(variable => String(variable?.id || variable?.name || '').trim())
      .filter(Boolean);
    const applied = keys.length > 0
      && keys.every(key => Object.prototype.hasOwnProperty.call(vars || {}, key));
    const card = makeElement(
      documentRef,
      'article',
      `var-template-card variable-template-card${applied ? ' is-applied' : ''}`,
    );
    if (index < 16) {
      card.className += ' is-entering';
      card.style.setProperty('--variable-enter-index', String(index));
    }
    const header = makeElement(documentRef, 'div', 'variable-template-card-header');
    const icon = makeElement(
      documentRef,
      'span',
      'variable-template-icon',
      Array.from(String(template.name || '模'))[0] || '模',
    );
    const meta = makeElement(documentRef, 'div', 'variable-template-meta');
    meta.appendChild(makeElement(documentRef, 'h3', '', template.name || template.id));
    meta.appendChild(makeElement(documentRef, 'p', '', template.desc || '变量组合模板'));
    const apply = makeButton(
      documentRef,
      `variable-template-apply${applied ? ' is-applied' : ''}`,
      applied ? '已添加' : '应用',
      () => onApply(template),
    );
    header.appendChild(icon);
    header.appendChild(meta);
    header.appendChild(apply);
    card.appendChild(header);

    const preview = renderTemplatePreview({ documentRef, template, vars });
    if (preview) card.appendChild(preview);
    const chips = makeElement(documentRef, 'div', 'variable-template-chips');
    (template.variables || []).forEach((variable) => {
      const key = String(variable?.id || variable?.name || '').trim();
      const chip = makeElement(documentRef, 'span', 'variable-template-chip', key);
      setVariableColor(chip, variable?.schema?.ui?.color);
      chips.appendChild(chip);
    });
    chips.appendChild(makeElement(
      documentRef,
      'span',
      'variable-template-count',
      `${keys.length} 个变量`,
    ));
    card.appendChild(chips);
    container.appendChild(card);
  });
  return { rendered: list.length };
};

const createRuleLine = (documentRef, label, text, className = '') => {
  const row = makeElement(documentRef, 'div', `variable-rule-line ${className}`.trim());
  row.appendChild(makeElement(documentRef, 'span', 'variable-rule-line-label', label));
  row.appendChild(makeElement(documentRef, 'span', 'variable-rule-line-value', text));
  return row;
};

export const renderVariableRulesPage = ({
  documentRef: rawDocument,
  container,
  rules = [],
  normalizeRule = rule => rule,
  describeTrigger = () => '',
  describeAction = () => '',
  onToggle = () => {},
  onEdit = () => {},
  onDelete = () => {},
  onRun = () => {},
} = {}) => {
  const documentRef = resolveDocument(rawDocument);
  if (!documentRef || !container) return { rendered: 0, enabled: 0 };
  clearElement(container);
  const list = (Array.isArray(rules) ? rules : []).map(normalizeRule);
  const diagnostics = buildRuleConditionDiagnostics(list);
  if (!list.length) {
    container.appendChild(makeElement(
      documentRef,
      'div',
      'variable-panel-empty',
      '暂无规则，点击上方「新建规则」开始',
    ));
    return { rendered: 0, enabled: 0 };
  }

  list.forEach((rule, index) => {
    const diagnostic = diagnostics[rule.id] || null;
    const card = makeElement(
      documentRef,
      'article',
      `var-rule-card variable-rule-card${rule.enabled ? '' : ' is-disabled'}`,
    );
    if (index < 16) {
      card.className += ' is-entering';
      card.style.setProperty('--variable-enter-index', String(index));
    }
    const header = makeElement(documentRef, 'div', 'variable-rule-card-header');
    const title = makeElement(documentRef, 'div', 'variable-rule-card-title');
    title.appendChild(makeElement(documentRef, 'h3', '', rule.name || rule.id));
    title.appendChild(makeElement(
      documentRef,
      'span',
      'variable-rule-priority',
      `优先级 ${Number(rule.priority || 0)}`,
    ));
    if (diagnostic) {
      const warning = makeElement(documentRef, 'span', 'variable-rule-warning', '条件需改写');
      warning.title = diagnostic.error || '';
      title.appendChild(warning);
    }
    const toggle = makeButton(
      documentRef,
      `variable-rule-toggle${rule.enabled ? ' is-on' : ''}`,
      '',
      (event) => {
        event?.stopPropagation?.();
        onToggle(rule.id, !rule.enabled);
      },
    );
    toggle.setAttribute('role', 'switch');
    toggle.setAttribute('aria-checked', rule.enabled ? 'true' : 'false');
    toggle.setAttribute('aria-label', `${rule.enabled ? '停用' : '启用'}规则 ${rule.name || rule.id}`);
    toggle.appendChild(makeElement(documentRef, 'span', 'variable-rule-toggle-knob'));
    header.appendChild(title);
    header.appendChild(toggle);
    card.appendChild(header);

    card.appendChild(createRuleLine(documentRef, 'WHEN', describeTrigger(rule), 'is-trigger'));
    if (String(rule?.trigger?.type || '') === 'condition') {
      card.appendChild(createRuleLine(
        documentRef,
        'IF',
        String(rule?.trigger?.expr || '未设置条件'),
        'is-condition',
      ));
    }
    card.appendChild(createRuleLine(documentRef, 'THEN', describeAction(rule), 'is-action'));
    if (diagnostic) {
      const warningText = makeElement(
        documentRef,
        'div',
        'variable-rule-diagnostic',
        formatUnsupportedExpressionMessage(diagnostic, { prefix: '这条规则的条件需要改写' }),
      );
      card.appendChild(warningText);
    }

    const actions = makeElement(documentRef, 'div', 'variable-rule-actions');
    if (String(rule?.trigger?.type || '') === 'manual') {
      actions.appendChild(makeButton(
        documentRef,
        'variable-secondary-button',
        '运行',
        () => onRun(rule.id),
      ));
    }
    actions.appendChild(makeButton(
      documentRef,
      'variable-secondary-button',
      '编辑',
      () => onEdit(rule),
    ));
    actions.appendChild(makeButton(
      documentRef,
      'variable-secondary-button is-danger',
      '删除',
      () => onDelete(rule.id),
    ));
    card.appendChild(actions);
    container.appendChild(card);
  });
  return {
    rendered: list.length,
    enabled: list.filter(rule => rule.enabled).length,
  };
};
