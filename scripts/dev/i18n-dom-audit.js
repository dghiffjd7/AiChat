(() => {
  const excludedSelector = [
    'script',
    'style',
    'code',
    'pre',
    '[contenteditable="true"]',
    '[data-i18n-skip]',
    '#chat-scroll .message-bubble',
    '#chat-scroll .message-content',
    '#chat-scroll .rich-fragment',
    '#prompt-preview-panel .prompt-document-scroll',
    '#preset-preview-body',
    '.prompt-preview-copy-source',
    '.chat-item-preview',
    '.contact-desc[data-i18n-skip]',
    '.group-name-label',
    '#prompt-preview-meta',
    '.lineage-map-node strong',
    '.lineage-map-node small',
    '.user-nickname',
    '.user-status',
    '.moment-content',
    '.moment-username',
    '.moment-text',
    '.moment-detail-text',
    '.pp-custom-select-label[data-i18n-skip]',
    '.variable-row-name',
    '.variable-value-widget[data-i18n-skip]',
    '.variable-tree-group-name',
    '.variable-tree-group-value',
    '.variable-tree-path',
    '.variable-tree-value[data-i18n-skip]',
  ].join(',');
  const excludedTextSelector = [
    excludedSelector,
    'textarea',
    'input',
    '#current-chat-title',
    '#chat-scroll .QQ_chat_msgdiv',
    '#chat-scroll .QQ_chat_sysbubble',
    '.memory-table-cell-value',
    '.memory-table-cell-tag',
  ].join(',');
  const visible = element => {
    if (!element?.isConnected) return false;
    const style = getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };
  const describe = element => {
    if (!element) return '';
    if (element.id) return `#${element.id}`;
    const stable = element.getAttribute?.('data-maid-action-key')
      || element.getAttribute?.('data-maid-guide-target')
      || element.getAttribute?.('data-action');
    if (stable) return `${element.tagName.toLowerCase()}[key="${stable}"]`;
    const classes = Array.from(element.classList || []).slice(0, 2).join('.');
    return `${element.tagName.toLowerCase()}${classes ? `.${classes}` : ''}`;
  };
  const han = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const parent = node.parentElement;
    const text = String(node.nodeValue || '').replace(/\s+/g, ' ').trim();
    if (
      text
      && /\p{Script=Han}/u.test(text)
      && !parent?.closest?.(excludedTextSelector)
      && visible(parent)
    ) {
      han.push({ target: describe(parent), text: text.slice(0, 160) });
    }
    node = walker.nextNode();
  }
  ['aria-label', 'placeholder', 'title', 'data-help', 'data-port-label'].forEach(attribute => {
    document.querySelectorAll(`[${attribute}]`).forEach(element => {
      if (attribute === 'aria-label' && element.matches?.('table.memory-table-data-grid')) return;
      if (attribute === 'aria-label' && element.matches?.('.lineage-map-node')) return;
      if (attribute === 'aria-label' && element.matches?.('.variable-row')) return;
      if (attribute === 'title' && element.matches?.('.variable-tree-leaf')) return;
      if (attribute === 'title' && element.matches?.('.regex-session-scope-chip')) return;
      if (attribute === 'title' && element.matches?.('.session-archive-info')) return;
      const value = String(element.getAttribute(attribute) || '').replace(/\s+/g, ' ').trim();
      if (
        value
        && /\p{Script=Han}/u.test(value)
        && !element.closest(excludedSelector)
        && visible(element)
      ) {
        han.push({ target: `${describe(element)}@${attribute}`, text: value.slice(0, 160) });
      }
    });
  });
  const overflow = Array.from(document.querySelectorAll(
    'button, [role="button"], .general-settings-setting-row, .general-settings-card-title, .world-app-select-btn, .tab-button',
  )).filter(visible).filter(element => {
    if (element.closest('#toast-container')) return false;
    // The preview handle intentionally extends its invisible pointer hit area with ::before.
    if (element.matches('.nav-btn, .mode-switch-btn, .agent-center-agent-card, .agent-center-global-preview-handle, .pp-preview-edge, .pp-pane-handle, .pp-editor-handle, .lineage-map-node, .world-node-port')) return false;
    const style = getComputedStyle(element);
    if (/(auto|scroll)/.test(`${style.overflowX} ${style.overflowY}`)) return false;
    return element.scrollWidth > element.clientWidth + 2 || element.scrollHeight > element.clientHeight + 2;
  }).map(element => ({
    target: describe(element),
    text: String(element.innerText || element.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 120),
    client: [element.clientWidth, element.clientHeight],
    scroll: [element.scrollWidth, element.scrollHeight],
  }));
  const i18nState = window.appI18n?.getState?.() || null;
  return {
    ready: Boolean(window.appBridge),
    locale: document.documentElement.lang,
    bodyLocale: document.body?.dataset?.locale || '',
    languageSetupVisible: Boolean(document.getElementById('first-run-language')),
    fatalError: document.getElementById('chatapp-fatal-error-overlay')?.innerText || '',
    i18n: i18nState ? {
      preference: i18nState.preference,
      requestedLocale: i18nState.requestedLocale,
      locale: i18nState.locale,
      loadError: i18nState.loadError,
    } : null,
    pseudo: /^［/.test(window.appI18n?.t?.('保存') || ''),
    visibleHanCount: han.length,
    visibleHan: han.slice(0, 100),
    overflowCount: overflow.length,
    overflow: overflow.slice(0, 100),
  };
})()
