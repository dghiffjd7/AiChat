(async () => {
  const registry = window.appBridge?.debugUiRegistry || {};
  const store = registry.stores?.maidSettingsStore;
  const actions = registry.actions || {};
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const readPersistedModes = async () => {
    let localMode = '';
    let kvMode = '';
    try {
      localMode = JSON.parse(localStorage.getItem('maid_settings_store_v1') || '{}')
        .memoryExtractionMode || '';
    } catch {}
    try {
      const kv = await window.__TAURI_INTERNALS__?.invoke?.('load_kv', {
        name: 'maid_settings_store_v1',
      });
      kvMode = kv?.memoryExtractionMode || '';
    } catch {}
    return { localMode, kvMode };
  };
  const report = {
    ready: Boolean(
      store &&
      typeof store.getMemoryExtractionSettings === 'function' &&
      typeof store.setMemoryExtractionSettings === 'function'
    ),
  };
  if (!report.ready) return report;

  const original = store.getMemoryExtractionSettings();
  report.original = { ...original };
  try {
    await actions.openMaidCommandInput?.();
    await sleep(180);
    document.querySelector('.maid-command-input-settings')?.click();
    await sleep(350);
    document.querySelector('#maid-settings-tab-api')?.click();
    await sleep(150);

    const nav = document.querySelector('[data-api-nav="memory"]');
    report.navigation = {
      panelOpen: document.querySelector('.maid-settings-overlay')?.classList.contains('is-open') === true,
      found: Boolean(nav),
      text: String(nav?.textContent || '').replace(/\s+/g, ' ').trim(),
    };
    nav?.click();
    await sleep(180);

    const initialModeSelect = document.querySelector('[data-memory-extraction-mode]');
    report.initialPage = {
      mode: initialModeSelect?.value || '',
      titleVisible: /记忆提取模型/.test(String(document.querySelector('.maid-api-group')?.textContent || '')),
      customFieldsVisible: Boolean(document.querySelector('[data-memory-extraction-profile]')),
      fallbackVisible: Boolean(document.querySelector('[data-memory-extraction-fallback]')),
    };

    const probeMode = original.mode === 'custom' ? 'follow_main' : 'custom';
    if (initialModeSelect) {
      initialModeSelect.value = probeMode;
      initialModeSelect.dispatchEvent(new Event('change', { bubbles: true }));
    }
    await sleep(450);
    report.changed = {
      requestedMode: probeMode,
      storeMode: store.getMemoryExtractionSettings().mode,
      selectMode: document.querySelector('[data-memory-extraction-mode]')?.value || '',
      customFieldsVisible: Boolean(document.querySelector('[data-memory-extraction-profile]')),
      fallbackVisible: Boolean(document.querySelector('[data-memory-extraction-fallback]')),
      fallbackChecked: document.querySelector('[data-memory-extraction-fallback]')?.checked === true,
      persisted: await readPersistedModes(),
    };
  } finally {
    await store.setMemoryExtractionSettings(original);
    await sleep(180);
    report.restored = {
      store: store.getMemoryExtractionSettings(),
      persisted: await readPersistedModes(),
    };
    document.querySelector('.maid-settings-close')?.click();
  }
  report.ok = Boolean(
    report.navigation?.found &&
    report.initialPage?.titleVisible &&
    report.changed?.storeMode === report.changed?.requestedMode &&
    report.changed?.selectMode === report.changed?.requestedMode &&
    report.changed?.persisted?.localMode === report.changed?.requestedMode &&
    report.changed?.persisted?.kvMode === report.changed?.requestedMode &&
    (report.changed?.requestedMode !== 'custom' || (
      report.changed?.fallbackVisible &&
      report.changed?.fallbackChecked === original.fallbackToMain
    )) &&
    report.restored?.store?.mode === original.mode &&
    report.restored?.persisted?.localMode === original.mode &&
    report.restored?.persisted?.kvMode === original.mode
  );
  return report;
})()
