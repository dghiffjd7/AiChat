const trim = (value, fallback = '') => {
  const text = String(value ?? '').trim();
  return text || fallback;
};

const isPlainObject = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));

export const createMaidRuntimeConfigResolver = ({
  settingsStore = null,
  configManager = null,
  createClient = null,
  isConfigReady = () => false,
  // Phase B：Sub-agent 来源改由统一 Agent Registry 提供（投影为 planner 兼容形状）；
  // 缺省回退到直接读 settingsStore，保持既有行为与单测不变。
  getSubAgents = null,
  logger = console,
} = {}) => async () => {
  const profileId = trim(settingsStore?.getBoundProfileId?.());
  const modelOverride = trim(settingsStore?.getBoundModelOverride?.());
  const fallbackProfileId = trim(settingsStore?.getFallbackProfileId?.());
  const rawSubAgents = typeof getSubAgents === 'function'
    ? (getSubAgents() || [])
    : (settingsStore?.listSubAgents?.() || []);
  const subAgents = rawSubAgents.filter(item => item?.enabled !== false);
  const maidPrompt = trim(settingsStore?.getMaidPrompt?.() || settingsStore?.getPersonaPrompt?.());
  if (!profileId) {
    return {
      configured: false,
      bound: false,
      profileId: '',
      maidPrompt,
      personaPrompt: maidPrompt,
      reason: 'maid_profile_not_bound',
    };
  }

  try {
    await configManager?.ensureStores?.();
    let config = await configManager?.getRuntimeConfigByProfileId?.(profileId);
    if (isPlainObject(config) && modelOverride) {
      config = { ...config, model: modelOverride };
    }
    if (!isPlainObject(config)) {
      return {
        configured: false,
        bound: true,
        profileId,
        maidPrompt,
        personaPrompt: maidPrompt,
        reason: 'maid_profile_missing',
      };
    }
    const ready = Boolean(isConfigReady(config));
    // 女仆 planner/ReAct 输出为小 JSON，超时不应继承聊天档的超长配置（如 100 分钟）——
    // 上限 240s 走 Rust 请求层，不受窗口后台 timer 冻结影响。
    const cappedConfig = {
      ...config,
      timeout: Math.min(Number(config.timeout) > 0 ? Number(config.timeout) : 240000, 240000),
    };
    const client = ready && typeof createClient === 'function' ? createClient(cappedConfig) : null;
    // 主档故障降级：配置了 fallback 档时提供备用 client（调用方在主档请求失败时重试一次）
    let fallbackClient = null;
    let fallbackConfig = null;
    if (fallbackProfileId && fallbackProfileId !== profileId) {
      try {
        const rawFallbackConfig = await configManager?.getRuntimeConfigByProfileId?.(fallbackProfileId);
        if (isPlainObject(rawFallbackConfig) && isConfigReady(rawFallbackConfig) && typeof createClient === 'function') {
          fallbackConfig = {
            ...rawFallbackConfig,
            timeout: Math.min(Number(rawFallbackConfig.timeout) > 0 ? Number(rawFallbackConfig.timeout) : 240000, 240000),
          };
          fallbackClient = createClient(fallbackConfig);
        }
      } catch {}
    }
    return {
      configured: Boolean(client),
      bound: true,
      config,
      client,
      fallbackClient,
      fallbackConfig,
      fallbackProfileId: fallbackClient ? fallbackProfileId : '',
      subAgents,
      profileId,
      maidPrompt,
      personaPrompt: maidPrompt,
      bindingSource: 'maid',
      reason: client ? '' : 'maid_profile_incomplete',
    };
  } catch (error) {
    logger?.warn?.('maid runtime config resolve failed', error);
    return {
      configured: false,
      bound: true,
      profileId,
      maidPrompt,
      personaPrompt: maidPrompt,
      reason: error?.message || 'maid_profile_error',
      error,
    };
  }
};

export const isMaidRuntimeConfigured = async (resolveRuntimeConfig = null) => {
  if (typeof resolveRuntimeConfig !== 'function') return false;
  const runtime = await resolveRuntimeConfig();
  return Boolean(runtime?.configured && runtime?.client);
};
