import { isReasoningStreamEvent } from './native-reasoning.js';

export const DEEPSEEK_PHONE_PREFILL_MODE = 'phone_format_fallback';
export const DEEPSEEK_PHONE_PREFILL_PREFIX = 'MiPhone_start\n';

const value = input => String(input ?? '').trim().toLowerCase();

const isOfficialDeepSeekApi = ({ provider = '', baseUrl = '' } = {}) => {
  if (value(provider) !== 'deepseek') return false;
  const rawUrl = String(baseUrl || '').trim();
  if (!rawUrl) return true;
  try {
    return new URL(rawUrl).hostname.toLowerCase() === 'api.deepseek.com';
  } catch {
    return false;
  }
};

export const hasProviderToolRequestOptions = (...sources) => sources.some((source) => {
  if (!source || typeof source !== 'object' || Array.isArray(source)) return false;
  return ['tools', 'tool_choice', 'toolChoice', 'toolConfig']
    .some(key => Object.prototype.hasOwnProperty.call(source, key));
});

export const resolveDeepSeekPhonePrefillPlan = ({
  experimentEnabled = false,
  provider = '',
  model = '',
  baseUrl = '',
  uiMode = '',
  surface = '',
  responseTarget = 'assistant',
  assistantContinuation = false,
  hasConfiguredPrefill = false,
  usesDefaultPreset = false,
  usesBuiltinContract = false,
  formatProfileEnabled = false,
  webSearchEnabled = false,
  hasProviderTools = false,
} = {}) => {
  const facts = {
    experimentEnabled: experimentEnabled === true,
    officialDeepSeekApi: isOfficialDeepSeekApi({ provider, baseUrl }),
    model: String(model || '').trim(),
    uiMode: value(uiMode),
    surface: value(surface),
    responseTarget: value(responseTarget) || 'assistant',
    assistantContinuation: assistantContinuation === true,
    hasConfiguredPrefill: hasConfiguredPrefill === true,
    usesDefaultPreset: usesDefaultPreset === true,
    usesBuiltinContract: usesBuiltinContract === true,
    formatProfileEnabled: formatProfileEnabled === true,
    webSearchEnabled: webSearchEnabled === true,
    hasProviderTools: hasProviderTools === true,
  };
  let reason = '';
  if (!facts.experimentEnabled) reason = 'experiment_disabled';
  else if (!facts.officialDeepSeekApi) reason = 'not_official_deepseek';
  else if (facts.uiMode !== 'chat') reason = 'unsupported_ui_mode';
  else if (!['private_chat', 'group_chat'].includes(facts.surface)) reason = 'unsupported_surface';
  else if (facts.responseTarget === 'user') reason = 'response_target_user';
  else if (facts.assistantContinuation) reason = 'assistant_continuation';
  else if (facts.hasConfiguredPrefill) reason = 'configured_prefill';
  else if (!facts.usesDefaultPreset) reason = 'non_default_preset';
  else if (!facts.usesBuiltinContract) reason = 'builtin_contract_inactive';
  else if (facts.formatProfileEnabled) reason = 'custom_format_profile';
  else if (facts.webSearchEnabled) reason = 'web_search_enabled';
  else if (facts.hasProviderTools) reason = 'provider_tools_present';

  const enabled = !reason;
  const requestOptions = enabled
    ? {
        deepseekPrefix: {
          mode: DEEPSEEK_PHONE_PREFILL_MODE,
          prefix: DEEPSEEK_PHONE_PREFILL_PREFIX,
        },
      }
    : {};
  return {
    enabled,
    eligible: enabled,
    reason,
    mode: enabled ? DEEPSEEK_PHONE_PREFILL_MODE : '',
    prefix: enabled ? DEEPSEEK_PHONE_PREFILL_PREFIX : '',
    requestOptions,
    diagnostics: {
      enabled,
      eligible: enabled,
      reason,
      mode: enabled ? DEEPSEEK_PHONE_PREFILL_MODE : '',
      prefixLength: enabled ? DEEPSEEK_PHONE_PREFILL_PREFIX.length : 0,
      ...facts,
    },
  };
};

export const mergeDeepSeekPrefillResponse = (prefix = '', response = '') => {
  const prefill = String(prefix ?? '');
  const text = String(response ?? '');
  if (!prefill) return text;
  if (!text) return prefill;
  return text.startsWith(prefill) ? text : `${prefill}${text}`;
};

export async function* applyDeepSeekPrefillToStream(stream, prefix = '') {
  const prefill = String(prefix ?? '');
  if (!prefill) {
    yield* stream;
    return;
  }
  yield prefill;
  let candidate = '';
  let comparingEcho = true;
  let completed = false;
  try {
    for await (const chunk of stream) {
      if (isReasoningStreamEvent(chunk)) {
        yield chunk;
        continue;
      }
      const chunkText = String(chunk ?? '');
      if (!chunkText) continue;
      if (!comparingEcho) {
        yield chunkText;
        continue;
      }
      let output = '';
      for (let index = 0; index < chunkText.length; index += 1) {
        candidate += chunkText[index];
        if (prefill.startsWith(candidate)) {
          if (candidate === prefill) {
            candidate = '';
            comparingEcho = false;
            output += chunkText.slice(index + 1);
            break;
          }
          continue;
        }
        output += candidate;
        candidate = '';
        comparingEcho = false;
        output += chunkText.slice(index + 1);
        break;
      }
      if (output) yield output;
    }
    completed = true;
  } finally {
    if (completed && comparingEcho && candidate) yield candidate;
  }
}

