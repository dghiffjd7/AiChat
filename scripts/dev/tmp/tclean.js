(() => {
  const b = document.body;
  const cs = getComputedStyle(document.documentElement);
  return {
    themeMode: b.dataset.themeMode,
    themePreset: b.dataset.themePreset,
    colorScheme: b.style.colorScheme,
    surface_page: cs.getPropertyValue('--app-surface-page').trim(),
    surface_panel: cs.getPropertyValue('--app-surface-panel').trim(),
    text_primary: cs.getPropertyValue('--app-text-primary').trim()
  };
})()
