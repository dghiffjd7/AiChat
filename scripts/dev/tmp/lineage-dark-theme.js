(async () => {
  const { themeManager } = await import('/scripts/ui/theme-manager.js');
  const { themeStore } = await import('/scripts/storage/theme-store.js');
  const current = themeManager.resolveCurrentTheme();
  window.__lineageThemeRestore = current;
  themeManager.applyThemePreset({
    preset: themeStore.getTheme('classic-dark'),
    appearance: current.appearance,
    mode: 'dark',
  });
  await new Promise(resolve => setTimeout(resolve, 500));
  const graph = document.querySelector('#prompt-lineage-graph');
  const node = graph?.querySelector('.lineage-map-node');
  return {
    mode: document.body.getAttribute('data-theme-mode'),
    page: getComputedStyle(document.body).getPropertyValue('--app-surface-page').trim(),
    card: getComputedStyle(document.body).getPropertyValue('--app-surface-card').trim(),
    text: getComputedStyle(document.body).getPropertyValue('--app-text-primary').trim(),
    graphBackground: graph ? getComputedStyle(graph).backgroundColor : '',
    nodeBackground: node ? getComputedStyle(node).backgroundColor : '',
  };
})()
