(async () => {
  const registry = window.appBridge?.debugUiRegistry || {};
  const stores = registry.stores || {};
  const visible = (node) => {
    if (!node?.isConnected) return false;
    const style = getComputedStyle(node);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) {
      return false;
    }
    const rect = node.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };
  const describeNode = (node) => {
    if (!node) return null;
    const rect = node.getBoundingClientRect?.() || {};
    const style = getComputedStyle(node);
    return {
      tag: String(node.tagName || '').toLowerCase(),
      id: node.id || '',
      classes: String(node.className || '').slice(0, 300),
      text: String(node.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 300),
      ariaBusy: node.getAttribute?.('aria-busy') || '',
      pointerEvents: style.pointerEvents,
      position: style.position,
      zIndex: style.zIndex,
      rect: {
        left: Math.round(Number(rect.left || 0)),
        top: Math.round(Number(rect.top || 0)),
        width: Math.round(Number(rect.width || 0)),
        height: Math.round(Number(rect.height || 0)),
      },
    };
  };
  const personaStore = stores.personaStore;
  const activePersona = personaStore?.getActive?.() || null;
  const personas = (personaStore?.getAll?.() || []).map(item => ({
    id: item.id,
    name: item.name,
    source: item.source || {},
    hasAvatar: Boolean(item.avatar),
  }));
  let debugLogs = [];
  try {
    const module = await import('/scripts/ui/debug-panel.js');
    debugLogs = (module.getDebugPanel?.()?.logs || []).slice(-120);
  } catch (error) {
    debugLogs = [{ type: 'inspect_error', message: String(error?.message || error) }];
  }
  const loadingNodes = Array.from(document.querySelectorAll([
    '#app-splash',
    '[aria-busy="true"]',
    '.loading',
    '.is-loading',
    '.skeleton',
    '[class*="loading"]',
    '[class*="skeleton"]',
  ].join(','))).filter(visible).slice(0, 80).map(describeNode);
  const visibleLayers = Array.from(document.querySelectorAll([
    '.overlay',
    '.modal',
    '.sheet',
    '[role="dialog"]',
    '[class*="overlay"]',
    '[class*="modal"]',
  ].join(','))).filter(visible).slice(0, 80).map(describeNode);
  const centerNode = document.elementFromPoint(
    Math.max(0, Math.floor(window.innerWidth / 2)),
    Math.max(0, Math.floor(window.innerHeight / 2)),
  );
  const localStorageSizes = Object.keys(localStorage)
    .filter(key => /persona|chat|contact|group|moment|memory|checkpoint|variable|script/i.test(key))
    .map(key => ({ key, chars: String(localStorage.getItem(key) || '').length }))
    .sort((a, b) => b.chars - a.chars)
    .slice(0, 40);
  return {
    ok: true,
    at: Date.now(),
    document: {
      readyState: document.readyState,
      title: document.title,
      bodyClasses: String(document.body?.className || ''),
      bodyDataset: { ...(document.body?.dataset || {}) },
      activeElement: describeNode(document.activeElement),
      centerNode: describeNode(centerNode),
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
        devicePixelRatio: window.devicePixelRatio,
      },
    },
    activePersona: activePersona
      ? { id: activePersona.id, name: activePersona.name, source: activePersona.source || {} }
      : null,
    fanrenPersonas: personas.filter(item => /凡人|修仙|韩立/.test(`${item.name} ${JSON.stringify(item.source)}`)),
    personaCount: personas.length,
    stores: {
      chat: {
        scopeId: stores.chatStore?.scopeId || '',
        storeKey: stores.chatStore?.storeKey || '',
        currentId: stores.chatStore?.getCurrent?.() || '',
        sessionIds: stores.chatStore?.listSessions?.() || [],
      },
      contacts: {
        scopeId: stores.contactsStore?.scopeId || '',
        storeKey: stores.contactsStore?.storeKey || '',
        ids: (stores.contactsStore?.listContacts?.() || []).map(item => item.id),
      },
      group: {
        scopeId: stores.groupStore?.scopeId || '',
        storeKey: stores.groupStore?.storeKey || '',
        count: Number(stores.groupStore?.list?.()?.length || 0),
      },
      rp: {
        scopeId: stores.rpSessionStore?.scopeId || '',
        storeKey: stores.rpSessionStore?.storeKey || '',
      },
      memoryTable: {
        scopeId: stores.memoryTableStore?.scopeId || '',
        storeKey: stores.memoryTableStore?.storeKey || '',
      },
      memoryTemplate: {
        scopeId: stores.memoryTemplateStore?.scopeId || '',
        storeKey: stores.memoryTemplateStore?.storeKey || '',
      },
      contactProfile: {
        scopeId: stores.contactProfileStore?.scopeId || '',
        storeKey: stores.contactProfileStore?.storeKey || '',
      },
    },
    bridge: {
      activeSessionId: window.appBridge?.activeSessionId || '',
      personaScope: window.appBridge?.personaScope || '',
      uiMode: window.appBridge?.getUiModeContext?.() || '',
    },
    loadingNodes,
    visibleLayers,
    debugLogs,
    localStorageSizes,
  };
})()
