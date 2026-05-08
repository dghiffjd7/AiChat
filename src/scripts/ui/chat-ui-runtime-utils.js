const getDefaultBridge = () => {
  if (typeof window !== 'undefined') return window.appBridge || null;
  return globalThis?.window?.appBridge || null;
};

const resolveChatUiBridge = (bridge = null) => bridge || getDefaultBridge();

export const getChatUI = (bridge = null) => {
  const runtime = resolveChatUiBridge(bridge);
  if (typeof runtime?.getChatUI === 'function') return runtime.getChatUI() || null;
  return runtime?.['chatUI'] || null;
};
