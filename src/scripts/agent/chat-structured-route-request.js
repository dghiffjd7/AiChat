import {
  CHAT_STRUCTURED_CONTRACT_REVISION,
  CHAT_STRUCTURED_ROUTE_MODES,
  buildChatStructuredEvidenceIdentity,
} from './chat-structured-route-evidence.js';
import { resolveProviderFcTransport } from './provider-fc-transport.js';

const trim = (value, fallback = '') => String(value ?? '').trim() || fallback;
const trimLower = value => trim(value).toLowerCase();

const TEXT_TRANSPORTS = Object.freeze({
  openai: ['official_openai_chat_completions', 'openai_chat_completions'],
  deepseek: ['official_deepseek_chat_completions', 'openai_chat_completions'],
  anthropic: ['official_anthropic_messages', 'anthropic_messages'],
  opencode: ['official_opencode_go_chat_completions', 'openai_chat_completions'],
  kimi: ['official_kimi_chat_completions', 'openai_chat_completions'],
  zhipu: ['official_zhipu_chat_completions', 'openai_chat_completions'],
  openrouter: ['official_openrouter_chat_completions', 'openai_chat_completions'],
  ollama: ['official_ollama_chat_completions', 'openai_chat_completions'],
  makersuite: ['official_gemini_generate_content', 'gemini_generate_content'],
  gemini: ['official_gemini_generate_content', 'gemini_generate_content'],
  vertexai: ['official_vertexai_generate_content', 'gemini_generate_content'],
  custom: ['custom_openai_chat_completions', 'openai_chat_completions'],
});

const normalizeCapabilities = (surface, input = {}, adapter = '') => {
  const set = new Set(['basic_reply']);
  if (adapter === 'phone_batch') set.add('batch_terminal');
  if (surface === 'moment_comment') set.add('moment_comment');
  [
    ['momentPost', 'moment_post'],
    ['momentCommentSideChats', 'side_chats'],
    ['imagePrompt', 'image_prompt'],
    ['tableEdit', 'table_edit'],
    ['variableUpdate', 'variable_update'],
    ['summary', 'summary'],
  ].forEach(([key, label]) => {
    if (input?.[key] === true) set.add(label);
  });
  return Array.from(set).sort();
};

const schemaProfileFor = ({ mode, config, adapter }) => {
  if (mode === CHAT_STRUCTURED_ROUTE_MODES.jsonTerminal) return 'phone.reply.ir.v1';
  const provider = trimLower(config?.provider);
  const model = trimLower(config?.model);
  if (provider === 'openrouter' && /^google\/gemini-/u.test(model)) {
    return 'phone.reply.openrouter-gemini-flat.v1';
  }
  if (['makersuite', 'gemini', 'vertexai'].includes(provider)) {
    return adapter === 'phone_batch'
      ? 'phone.reply.batch.gemini-flat.v1'
      : 'phone.reply.private.gemini-flat.v1';
  }
  return 'phone.reply.ir.v1';
};

export const resolveChatStructuredTextTransport = (config = {}, {
  preferProviderFc = false,
} = {}) => {
  const provider = trimLower(config?.provider);
  const known = TEXT_TRANSPORTS[provider];
  if (!known) return { supported: false, reason: 'unknown_text_adapter', endpoint: '', adapter: '' };
  const fcTransport = preferProviderFc ? resolveProviderFcTransport(config) : null;
  if (fcTransport?.supported) {
    const adapter = fcTransport.family === 'anthropic'
      ? 'anthropic_messages'
      : (fcTransport.family === 'gemini'
          ? 'gemini_generate_content'
          : (String(fcTransport.endpoint || '').includes('responses')
              ? 'openai_responses'
              : 'openai_chat_completions'));
    return {
      supported: true,
      reason: '',
      endpoint: fcTransport.endpoint,
      adapter,
    };
  }
  return {
    supported: true,
    reason: '',
    endpoint: known[0],
    adapter: known[1],
  };
};

export const buildChatStructuredRequestEvidenceIdentity = ({
  config = {},
  mode = CHAT_STRUCTURED_ROUTE_MODES.providerFc,
  adapter = 'private_reply',
  surface = 'private_chat',
  capabilities = {},
  transport = null,
  contractRevision = CHAT_STRUCTURED_CONTRACT_REVISION,
} = {}) => {
  const resolvedTransport = transport?.endpoint && transport?.adapter
    ? transport
    : resolveChatStructuredTextTransport(config, {
        preferProviderFc: mode === CHAT_STRUCTURED_ROUTE_MODES.providerFc,
      });
  if (!resolvedTransport?.supported) {
    return { ok: false, reason: resolvedTransport?.reason || 'unknown_text_adapter', identity: null };
  }
  const provider = trimLower(config?.provider);
  const route = trimLower(config?.providerRoute || config?.route);
  return buildChatStructuredEvidenceIdentity({
    provider,
    endpoint: resolvedTransport.endpoint,
    adapter: resolvedTransport.adapter,
    model: config?.model,
    baseUrl: config?.baseUrl,
    route,
    autoRouted: provider === 'openrouter' && !route,
    schemaProfile: schemaProfileFor({ mode, config, adapter }),
    surface,
    capabilitySet: normalizeCapabilities(surface, capabilities, adapter),
    contractRevision,
    ollamaVersion: config?.ollamaVersion,
    modelDigest: config?.modelDigest,
  });
};

export const resolveChatStructuredHardBoundary = ({
  enabled = false,
  context = {},
} = {}) => {
  if (enabled !== true) return 'feature_disabled';
  if (context?.compatibilityModeEnabled === true) return 'compatibility_mode';
  if (trimLower(context?.uiMode, 'chat') === 'rp') return 'creative_mode';
  if (context?.assistantContinuation === true) return 'assistant_continuation';
  if (context?.webSearchEnabled === true) return 'web_search_enabled';
  if (context?.hasProviderTools === true) return 'provider_tools_present';
  if (context?.hasAssistantPrefill === true) return 'assistant_prefill_present';
  if (context?.usesDefaultPreset !== true) return 'custom_preset';
  if (context?.usesBuiltinFormat !== true) return 'custom_format';
  if (context?.formatProfileEnabled === true) return 'custom_format_profile';
  if (context?.protocolParserEnabled !== true) return 'protocol_parser_disabled';
  if (context?.hasUnsupportedSideEffects === true) return 'unsupported_side_effects';
  return '';
};
