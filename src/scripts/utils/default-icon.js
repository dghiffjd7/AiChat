export const getDefaultAppIcon = () => {
  const mode = document.body?.dataset?.themeMode || 'dark';
  return mode === 'light'
    ? './assets/external/app-icon-light.png'
    : './assets/external/app-icon-dark.png';
};
