const trim = value => String(value ?? '').trim();
const normalizeProvider = value => trim(value).toLowerCase();

export const resolveMessageVoiceContact = ({
  message = null,
  sessionId = '',
  getContact = () => null,
  resolveGroupSpeakerContact = () => null,
} = {}) => {
  const sid = trim(sessionId);
  if (!message || !sid) return null;
  if (!sid.startsWith('group:')) return getContact(sid) || null;
  const stableSpeakerId = trim(message?.meta?.speakerContactId);
  if (stableSpeakerId) {
    const stableContact = getContact(stableSpeakerId);
    if (stableContact) return stableContact;
  }
  const resolved = resolveGroupSpeakerContact(message?.name, sid);
  return (typeof resolved === 'string' ? getContact(resolved) : resolved) || null;
};

export const resolveMessageVoiceRef = (options = {}) => {
  const contact = resolveMessageVoiceContact(options);
  return trim(contact?.voiceRef);
};

export const createVoiceBindingConfigResolver = ({
  resolveGlobalConfig = async () => null,
  getVoiceRecord = () => null,
  getConfigManager = () => null,
  warnInvalidBinding = () => {},
} = {}) => {
  const warned = new Set();
  const warnOnce = (voiceRef, reason) => {
    const key = trim(voiceRef);
    if (!key || warned.has(key)) return;
    warned.add(key);
    warnInvalidBinding(key, reason);
  };
  const resolveWithMeta = async (voiceRef = '') => {
    const key = trim(voiceRef);
    let globalConfig;
    let globalResolved = false;
    const getGlobalConfig = async () => {
      if (!globalResolved) {
        globalConfig = await resolveGlobalConfig?.();
        globalResolved = true;
      }
      return globalConfig ? { ...globalConfig } : null;
    };
    if (!key) return {
      config: await getGlobalConfig(),
      voiceRef: '',
      valid: true,
      fallback: true,
      reason: 'global_default',
    };
    const record = getVoiceRecord?.(key);
    if (!record) {
      warnOnce(key, 'voice_missing');
      return {
        config: await getGlobalConfig(),
        voiceRef: key,
        valid: false,
        fallback: true,
        reason: 'voice_missing',
      };
    }
    const scope = trim(record?.configRef?.scope);
    const profileId = trim(record?.configRef?.profileId);
    const manager = getConfigManager?.(scope);
    const runtime = await manager?.getRuntimeConfigByProfileId?.(profileId);
    if (!runtime) {
      warnOnce(key, 'profile_missing');
      return {
        config: await getGlobalConfig(),
        voiceRef: key,
        valid: false,
        fallback: true,
        reason: 'profile_missing',
      };
    }
    const provider = normalizeProvider(runtime.provider);
    const expectedProvider = normalizeProvider(record.providerSnapshot);
    if (expectedProvider && provider !== expectedProvider) {
      warnOnce(key, 'provider_changed');
      return {
        config: await getGlobalConfig(),
        voiceRef: key,
        valid: false,
        fallback: true,
        reason: 'provider_changed',
      };
    }
    const modelOverride = trim(record.modelOverride);
    const resolved = {
      ...runtime,
      ttsVoice: trim(record.voiceId),
    };
    if (scope === 'voice_shared') {
      resolved.ttsModel = modelOverride || trim(runtime.ttsModel);
      resolved.model = resolved.ttsModel;
    } else {
      resolved.model = modelOverride || trim(runtime.model);
    }
    return {
      config: resolved,
      voiceRef: key,
      valid: true,
      fallback: false,
      reason: '',
      record,
    };
  };
  const resolve = async voiceRef => (await resolveWithMeta(voiceRef)).config;
  resolve.resolveWithMeta = resolveWithMeta;
  resolve.clearWarnings = () => warned.clear();
  return resolve;
};
