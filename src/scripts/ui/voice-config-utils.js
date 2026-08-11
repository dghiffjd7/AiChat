const VOICE_CONNECTION_MODES = new Set(['shared', 'split']);
const VOICE_CAPABILITIES = new Set(['tts', 'stt']);

const VOICE_PROVIDERS = Object.freeze([
    Object.freeze({
        value: 'openai',
        label: 'OpenAI',
        capabilities: Object.freeze(['tts', 'stt']),
    }),
    Object.freeze({
        value: 'elevenlabs',
        label: 'ElevenLabs',
        capabilities: Object.freeze(['tts', 'stt']),
    }),
    Object.freeze({
        value: 'groq',
        label: 'Groq（仅 STT）',
        capabilities: Object.freeze(['stt']),
    }),
    Object.freeze({
        value: 'qwen_local',
        label: 'Qwen 本地（TTS + STT）',
        capabilities: Object.freeze(['tts', 'stt']),
    }),
    Object.freeze({
        value: 'custom',
        label: '自定义 OpenAI 兼容 API',
        capabilities: Object.freeze(['tts', 'stt']),
    }),
]);

const VOICE_PROVIDER_DEFAULTS = Object.freeze({
    openai: Object.freeze({
        baseUrl: 'https://api.openai.com/v1',
        ttsModel: 'gpt-4o-mini-tts',
        sttModel: 'gpt-transcribe',
        ttsVoice: 'marin',
        urlHelp: 'OpenAI Audio API 基础 URL',
    }),
    elevenlabs: Object.freeze({
        baseUrl: 'https://api.elevenlabs.io/v1',
        ttsModel: 'eleven_flash_v2_5',
        sttModel: 'scribe_v2',
        ttsVoice: 'JBFqnCBsd6RMkjVDRZzb',
        urlHelp: 'ElevenLabs API 基础 URL',
    }),
    groq: Object.freeze({
        baseUrl: 'https://api.groq.com/openai/v1',
        ttsModel: '',
        sttModel: 'whisper-large-v3-turbo',
        ttsVoice: '',
        urlHelp: 'Groq OpenAI 兼容 Audio API 基础 URL',
    }),
    qwen_local: Object.freeze({
        baseUrl: 'http://127.0.0.1:8765/v1',
        ttsModel: 'Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice',
        sttModel: 'Qwen/Qwen3-ASR-0.6B',
        ttsVoice: 'Serena',
        urlHelp: '独立 Qwen 本地语音服务地址；Android 连接电脑时请改成电脑局域网 IP',
    }),
    custom: Object.freeze({
        baseUrl: 'http://localhost:8000/v1',
        ttsModel: 'tts-model',
        sttModel: 'stt-model',
        ttsVoice: 'alloy',
        urlHelp: '需兼容 OpenAI audio/speech 与 audio/transcriptions 协议',
    }),
});

export const normalizeVoiceConnectionMode = (value) => {
    const mode = String(value || '').trim().toLowerCase();
    return VOICE_CONNECTION_MODES.has(mode) ? mode : 'shared';
};

export const normalizeVoiceCapability = (value) => {
    const capability = String(value || '').trim().toLowerCase();
    return VOICE_CAPABILITIES.has(capability) ? capability : 'tts';
};

export const getVoiceConfigScope = ({ mode = 'shared', capability = 'tts' } = {}) => {
    const normalizedMode = normalizeVoiceConnectionMode(mode);
    if (normalizedMode === 'shared') return 'voice_shared';
    return normalizeVoiceCapability(capability) === 'stt' ? 'voice_stt' : 'voice_tts';
};

export const getVoiceProviderOptions = ({ mode = 'shared', capability = 'tts' } = {}) => {
    const normalizedMode = normalizeVoiceConnectionMode(mode);
    const normalizedCapability = normalizeVoiceCapability(capability);
    return VOICE_PROVIDERS
        .filter(provider => normalizedMode === 'shared'
            ? provider.capabilities.includes('tts') && provider.capabilities.includes('stt')
            : provider.capabilities.includes(normalizedCapability))
        .map(provider => ({
            value: provider.value,
            label: provider.label,
            capabilities: [...provider.capabilities],
        }));
};

export const getVoiceProviderDefaults = (provider) => {
    const normalized = String(provider || '').trim().toLowerCase();
    return { ...(VOICE_PROVIDER_DEFAULTS[normalized] || VOICE_PROVIDER_DEFAULTS.openai) };
};
