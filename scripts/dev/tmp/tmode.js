(() => ({
  bodyThemeMode: document.body.dataset.themeMode,
  bodyThemePreset: document.body.dataset.themePreset,
  surfacePanel: getComputedStyle(document.documentElement).getPropertyValue('--app-surface-panel').trim(),
  textPrimary: getComputedStyle(document.documentElement).getPropertyValue('--app-text-primary').trim()
}))()
