// 可见界面结构化摘要（计划 16.5 app.ui.inspect）。
// 从 app.js 抽出的可测逻辑：可见性判断、文字摘要，以及按钮/表单字段的结构化读取。
// 敏感字段（API key/token/密码类）只标记 sensitive，不输出值。

const SENSITIVE_FIELD_PATTERN = /api[-_ ]?key|token|secret|password|密钥|金鑰|密码/;

const normalizeLabel = (value = '') => String(value || '').replace(/\s+/g, ' ').trim();

export const readElementSemanticKey = (element = null) => {
  if (!element) return '';
  const candidates = [
    element.getAttribute?.('data-maid-action-key'),
    element.getAttribute?.('data-maid-guide-target'),
    element.getAttribute?.('data-action'),
    element.id,
    element.name,
  ];
  return candidates.map(value => String(value || '').trim()).find(Boolean)?.slice(0, 100) || '';
};

const resolveComputedStyle = (getComputedStyle, element) => {
  try {
    if (typeof getComputedStyle === 'function') return getComputedStyle(element);
    return globalThis?.window?.getComputedStyle?.(element) || null;
  } catch {
    return null;
  }
};

export const isReadableElementVisible = (element = null, { getComputedStyle = null } = {}) => {
  if (!element || element.hidden === true) return false;
  if (element.classList?.contains?.('hidden')) return false;
  const style = element.style || {};
  if (style.display === 'none' || style.visibility === 'hidden') return false;
  const computed = resolveComputedStyle(getComputedStyle, element);
  if (computed && (computed.display === 'none' || computed.visibility === 'hidden' || computed.opacity === '0')) return false;
  const rect = element.getBoundingClientRect?.();
  return !rect || rect.width > 0 || rect.height > 0 || style.display === 'block' || style.display === 'flex';
};

const isSensitiveField = (field = {}) => {
  const type = String(field.type || '').toLowerCase();
  if (type === 'password') return true;
  const name = String(
    field.id || field.name || field.getAttribute?.('aria-label') || field.placeholder || '',
  ).toLowerCase();
  return SENSITIVE_FIELD_PATTERN.test(name);
};

export const readVisibleText = (element = null, maxTextLength = 1800, { getComputedStyle = null } = {}) => {
  if (!element) return '';
  const max = Math.max(120, Math.min(6000, Number(maxTextLength) || 1800));
  const chunks = [];
  const push = (value = '') => {
    const text = normalizeLabel(value);
    if (text) chunks.push(text);
  };
  push(element.innerText || element.textContent || '');
  const fields = Array.from(element.querySelectorAll?.('input, textarea, select') || []);
  fields.slice(0, 80).forEach((field) => {
    if (!isReadableElementVisible(field, { getComputedStyle })) return;
    if (isSensitiveField(field)) return;
    const value = String(field.value || '').trim();
    if (!value) return;
    push(`${field.getAttribute?.('aria-label') || field.placeholder || field.name || field.id || 'field'}: ${value}`);
  });
  const text = Array.from(new Set(chunks)).join(' | ');
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
};

const readVisibleButtons = (element, { maxControls, getComputedStyle, collectRef = null, refPrefix = '' }) => {
  const nodes = Array.from(element.querySelectorAll?.('button, [role="button"]') || []);
  const buttons = [];
  for (const node of nodes) {
    if (buttons.length >= maxControls) break;
    if (!isReadableElementVisible(node, { getComputedStyle })) continue;
    const label = normalizeLabel(node.innerText || node.textContent || node.getAttribute?.('aria-label') || '');
    if (!label) continue;
    const active = node.classList?.contains?.('is-active') ||
      node.classList?.contains?.('active') ||
      node.getAttribute?.('aria-selected') === 'true';
    // ref：供 ui.click_element 以结构化引用点击（禁止坐标点击的安全前提）
    let ref = '';
    if (typeof collectRef === 'function') {
      ref = `${refPrefix}btn-${buttons.length + 1}`;
      collectRef(ref, node);
    }
    buttons.push({
      label: label.slice(0, 60),
      ...(readElementSemanticKey(node) ? { semanticKey: readElementSemanticKey(node) } : {}),
      ...(ref ? { ref } : {}),
      ...(active ? { active: true } : {}),
      ...(node.disabled === true ? { disabled: true } : {}),
    });
  }
  return buttons;
};

const readVisibleFields = (element, { maxControls, getComputedStyle }) => {
  const nodes = Array.from(element.querySelectorAll?.('input, textarea, select') || []);
  const fields = [];
  for (const node of nodes) {
    if (fields.length >= maxControls) break;
    if (!isReadableElementVisible(node, { getComputedStyle })) continue;
    const label = normalizeLabel(
      node.getAttribute?.('aria-label') || node.placeholder || node.name || node.id || 'field',
    );
    const type = String(node.type || node.tagName || '').toLowerCase();
    const sensitive = isSensitiveField(node);
    const value = String(node.value || '').trim();
    fields.push({
      label: label.slice(0, 60),
      ...(readElementSemanticKey(node) ? { semanticKey: readElementSemanticKey(node) } : {}),
      type,
      filled: Boolean(value),
      ...(sensitive
        ? { sensitive: true }
        : (value ? { value: value.slice(0, 80) } : {})),
    });
  }
  return fields;
};

// 返回 { text, buttons, fields }：text 为文字摘要，buttons 含 active/disabled 状态，
// fields 含 label/type/filled；敏感字段只有 sensitive 标记，不含 value。
export const buildElementUiSummary = (element = null, {
  maxTextLength = 1800,
  maxControls = 30,
  getComputedStyle = null,
  collectRef = null,
  refPrefix = '',
} = {}) => {
  if (!element) return { text: '', buttons: [], fields: [] };
  const cap = Math.max(1, Math.min(80, Number(maxControls) || 30));
  return {
    text: readVisibleText(element, maxTextLength, { getComputedStyle }),
    buttons: readVisibleButtons(element, { maxControls: cap, getComputedStyle, collectRef, refPrefix }),
    fields: readVisibleFields(element, { maxControls: cap, getComputedStyle }),
  };
};
