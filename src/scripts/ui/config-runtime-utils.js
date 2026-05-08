const getDefaultBridge = () => {
  if (typeof window !== 'undefined') return window.appBridge || null;
  return globalThis?.window?.appBridge || null;
};

const bindBridgeMethod = (bridge, name) => {
  const method = bridge?.[name];
  return typeof method === 'function' ? method.bind(bridge) : null;
};

const resolveConfigRuntimeContext = (bridgeOrContext = null) => {
  return bridgeOrContext?.bridge || bridgeOrContext?.configManager
    ? bridgeOrContext
    : resolveConfigRuntimeBridge({ bridge: bridgeOrContext });
};

export const resolveConfigRuntimeBridge = (options = {}) => {
  const hasBridge = Object.prototype.hasOwnProperty.call(options || {}, 'bridge');
  const bridge = hasBridge ? options.bridge : getDefaultBridge();
  return {
    bridge,
    configManager: options?.configManager || bridge?.config || null,
    getConfig: options?.getConfig || bindBridgeMethod(bridge, 'getConfig'),
    loadConfig: options?.loadConfig || bindBridgeMethod(bridge, 'loadConfig'),
    reloadConfig: options?.reloadConfig || bindBridgeMethod(bridge, 'reloadConfig'),
    ensureConfigStores: options?.ensureConfigStores || bindBridgeMethod(bridge, 'ensureConfigStores'),
    getConfigProfiles: options?.getConfigProfiles || bindBridgeMethod(bridge, 'getConfigProfiles'),
    getConfigProfileById: options?.getConfigProfileById || bindBridgeMethod(bridge, 'getConfigProfileById'),
    getActiveConfigProfile: options?.getActiveConfigProfile || bindBridgeMethod(bridge, 'getActiveConfigProfile'),
    getActiveConfigProfileId: options?.getActiveConfigProfileId || bindBridgeMethod(bridge, 'getActiveConfigProfileId'),
    setActiveConfigProfile: options?.setActiveConfigProfile || bindBridgeMethod(bridge, 'setActiveConfigProfile'),
    createConfigProfile: options?.createConfigProfile || bindBridgeMethod(bridge, 'createConfigProfile'),
    setChatRuntimeConfig: options?.setChatRuntimeConfig || bindBridgeMethod(bridge, 'setChatRuntimeConfig'),
    isConfigured: options?.isConfigured || bindBridgeMethod(bridge, 'isConfigured'),
  };
};

export const getBridgeConfig = (bridgeOrContext = null) => {
  const context = resolveConfigRuntimeContext(bridgeOrContext);
  if (typeof context?.getConfig === 'function') return context.getConfig() || {};
  return context?.configManager?.get?.() || {};
};

export const loadBridgeConfig = async (bridgeOrContext = null) => {
  const context = resolveConfigRuntimeContext(bridgeOrContext);
  if (typeof context?.loadConfig === 'function') return await context.loadConfig() || {};
  const loaded = await context?.configManager?.load?.();
  return context?.configManager?.get?.() || loaded || {};
};

export const reloadBridgeConfig = async (bridgeOrContext = null) => {
  const context = resolveConfigRuntimeContext(bridgeOrContext);
  if (typeof context?.reloadConfig === 'function') return await context.reloadConfig();
  return await context?.configManager?.reload?.();
};

export const ensureConfigStores = async (bridgeOrContext = null) => {
  const context = resolveConfigRuntimeContext(bridgeOrContext);
  if (typeof context?.ensureConfigStores === 'function') return await context.ensureConfigStores();
  return await context?.configManager?.ensureStores?.();
};

export const getConfigProfiles = (bridgeOrContext = null) => {
  const context = resolveConfigRuntimeContext(bridgeOrContext);
  if (typeof context?.getConfigProfiles === 'function') return context.getConfigProfiles() || [];
  return context?.configManager?.getProfiles?.() || [];
};

export const getConfigProfileById = (bridgeOrContext = null, profileId = '') => {
  const context = resolveConfigRuntimeContext(bridgeOrContext);
  const id = String(profileId || '').trim();
  if (!id) return null;
  if (typeof context?.getConfigProfileById === 'function') return context.getConfigProfileById(id) || null;
  return context?.configManager?.getProfileById?.(id) || null;
};

export const getActiveConfigProfile = (bridgeOrContext = null) => {
  const context = resolveConfigRuntimeContext(bridgeOrContext);
  if (typeof context?.getActiveConfigProfile === 'function') return context.getActiveConfigProfile() || null;
  return context?.configManager?.getActiveProfile?.() || null;
};

export const getActiveConfigProfileId = (bridgeOrContext = null) => {
  const context = resolveConfigRuntimeContext(bridgeOrContext);
  if (typeof context?.getActiveConfigProfileId === 'function') {
    return String(context.getActiveConfigProfileId() || '').trim();
  }
  return String(context?.configManager?.getActiveProfileId?.() || '').trim();
};

export const setActiveConfigProfile = async (bridgeOrContext = null, profileId = '') => {
  const context = resolveConfigRuntimeContext(bridgeOrContext);
  if (typeof context?.setActiveConfigProfile === 'function') return await context.setActiveConfigProfile(profileId);
  return await context?.configManager?.setActiveProfile?.(profileId);
};

export const createConfigProfile = async (bridgeOrContext = null, name = '', config = {}) => {
  const context = resolveConfigRuntimeContext(bridgeOrContext);
  if (typeof context?.createConfigProfile === 'function') return await context.createConfigProfile(name, config);
  return await context?.configManager?.createProfile?.(name, config);
};

export const isBridgeConfigured = (bridgeOrContext = null) => {
  const context = resolveConfigRuntimeContext(bridgeOrContext);
  if (typeof context?.isConfigured === 'function') return Boolean(context.isConfigured());
  return true;
};

export const syncChatRuntimeConfigToBridge = ({
  bridge = null,
  runtime = null,
  canInitClient = null,
  createClient = null,
} = {}) => {
  const context = resolveConfigRuntimeBridge({ bridge });
  const config = runtime && typeof runtime === 'object' ? runtime : {};
  if (!context.bridge && !context.configManager) {
    return { ok: false, configured: false, clientReady: false };
  }
  if (typeof context.setChatRuntimeConfig === 'function') {
    const result = context.setChatRuntimeConfig(config);
    return {
      ok: result?.ok !== false,
      configured: Boolean(result?.configured),
      clientReady: Boolean(result?.clientReady ?? result?.configured),
    };
  }
  context.configManager?.set?.(config);
  const configured = typeof canInitClient === 'function' ? canInitClient(config) : false;
  const client = configured && typeof createClient === 'function' ? createClient(config) : null;
  if (context.bridge) context.bridge.client = client;
  return {
    ok: true,
    configured: Boolean(client),
    clientReady: Boolean(client),
  };
};

export const createConfigRuntimeAdapter = (bridgeOrContext = null) => {
  const context = resolveConfigRuntimeContext(bridgeOrContext);
  return {
    ensureStores: () => ensureConfigStores(context),
    getProfiles: () => getConfigProfiles(context),
    getProfileById: profileId => getConfigProfileById(context, profileId),
    getActiveProfile: () => getActiveConfigProfile(context),
    getActiveProfileId: () => getActiveConfigProfileId(context),
    setActiveProfile: profileId => setActiveConfigProfile(context, profileId),
    createProfile: (name, config) => createConfigProfile(context, name, config),
    get: () => getBridgeConfig(context),
    load: () => loadBridgeConfig(context),
    reload: () => reloadBridgeConfig(context),
    set: config => context?.configManager?.set?.(config),
  };
};
