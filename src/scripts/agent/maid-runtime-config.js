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
  logger = console,
} = {}) => async () => {
  const profileId = trim(settingsStore?.getBoundProfileId?.());
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
    const config = await configManager?.getRuntimeConfigByProfileId?.(profileId);
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
    const client = ready && typeof createClient === 'function' ? createClient(config) : null;
    return {
      configured: Boolean(client),
      bound: true,
      config,
      client,
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
