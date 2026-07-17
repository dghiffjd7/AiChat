(async () => {
  const { themeManager } = await import('/scripts/ui/theme-manager.js');
  const previous = window.__lineageThemeRestore || themeManager.resolveCurrentTheme();
  themeManager.applyThemePreset(previous);
  delete window.__lineageThemeRestore;
  window.appBridge?.debugUiRegistry?.actions?.hidePromptPreviewModal?.();
  await new Promise(resolve => setTimeout(resolve, 200));
  return {
    mode: document.body.getAttribute('data-theme-mode'),
    page: getComputedStyle(document.body).getPropertyValue('--app-surface-page').trim(),
  };
})()
