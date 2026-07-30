const trim = (value, maxLength = 160) => String(value ?? '').trim().slice(0, maxLength);

const finiteInt = (value) => {
  const parsed = Math.trunc(Number(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

const normalizeProvider = (value = '') => {
  const provider = trim(value, 80).toLowerCase();
  if (provider === 'novel') return 'novelai';
  if (provider === 'gemini') return 'makersuite';
  if (provider === 'together') return 'togetherai';
  if (provider === 'stabilityai') return 'stability';
  if (provider === 'a1111' || provider === 'auto') return 'automatic1111';
  if (provider === 'comfy') return 'comfyui';
  return provider;
};

const resolvePromptDialect = (provider = '', requested = '') => {
  const explicit = trim(requested, 80).toLowerCase();
  if (explicit) return explicit;
  if (provider === 'novelai') return 'nai_tags';
  if (provider === 'automatic1111' || provider === 'comfyui') return 'stable_diffusion_tags';
  return 'natural_language';
};

const resolvePromptLanguage = (dialect = '', requested = '') => {
  const explicit = trim(requested, 24).toLowerCase();
  if (explicit) return explicit;
  return dialect === 'nai_tags' || dialect === 'stable_diffusion_tags' ? 'en' : 'auto';
};

const parseSize = (value = '') => {
  const matched = trim(value, 40).match(/^(\d{2,5})\s*[x×]\s*(\d{2,5})$/i);
  return matched
    ? { width: finiteInt(matched[1]), height: finiteInt(matched[2]) }
    : { width: 0, height: 0 };
};

const compactContext = (source = {}) => {
  const provider = normalizeProvider(source?.provider);
  const promptDialect = resolvePromptDialect(provider, source?.promptDialect);
  const promptLanguage = resolvePromptLanguage(promptDialect, source?.promptLanguage);
  const context = {
    profileId: trim(source?.profileId, 120),
    profileName: trim(source?.profileName, 120),
    provider,
    model: trim(source?.model, 160),
    presetId: trim(source?.presetId, 120),
    presetName: trim(source?.presetName, 120),
    promptDialect,
    promptLanguage,
    width: finiteInt(source?.width),
    height: finiteInt(source?.height),
    aspectRatio: trim(source?.aspectRatio, 40),
    promptPrefixApplied: source?.promptPrefixApplied === true,
    promptSuffixApplied: source?.promptSuffixApplied === true,
    negativePromptSupported: source?.negativePromptSupported === true,
    referenceImageSupported: source?.referenceImageSupported === true,
    referenceImageMax: Math.max(0, finiteInt(source?.referenceImageMax)),
  };
  if (!context.provider && !context.model && !context.profileId && !context.presetId) return null;
  return context;
};

export const normalizeMaidImageGenerationContext = (source = {}) => compactContext(source);

export const buildMaidImageGenerationContext = ({
  config = {},
  profile = {},
  preset = {},
  options = {},
  negativeCapability = {},
  referenceCapability = {},
} = {}) => {
  const parsedSize = parseSize(options?.size);
  return compactContext({
    profileId: profile?.id,
    profileName: profile?.name,
    provider: config?.provider,
    model: config?.model,
    presetId: preset?.id,
    presetName: preset?.name,
    width: finiteInt(options?.width) || parsedSize.width,
    height: finiteInt(options?.height) || parsedSize.height,
    aspectRatio: options?.aspectRatio,
    promptPrefixApplied: Boolean(trim(options?.promptPrefix, 1)),
    promptSuffixApplied: Boolean(trim(options?.promptSuffix, 1)),
    negativePromptSupported: negativeCapability?.supported === true,
    referenceImageSupported: referenceCapability?.supported === true,
    referenceImageMax: referenceCapability?.max,
  });
};

const resolvePromptRule = (context = {}) => {
  if (context.promptDialect === 'nai_tags') {
    return 'Write prompt and negativePrompt as English comma-separated NovelAI/Danbooru tags; do not use Chinese prose or full sentences. Choose one stable ASCII subjectAliases item and include that exact ASCII subjectAliases item literally as a prompt tag.';
  }
  if (context.promptDialect === 'stable_diffusion_tags') {
    return 'Prefer concise English comma-separated Stable Diffusion tags; keep prompt and negativePrompt separate.';
  }
  return context.promptLanguage === 'en'
    ? 'Write the image prompt in natural English suitable for the active model.'
    : 'Write a concrete natural-language image prompt suitable for the active model.';
};

export const buildMaidImageGenerationContextPromptBlock = (source = {}) => {
  const context = normalizeMaidImageGenerationContext(source);
  if (!context) return '';
  return [
    '<image_generation_context>',
    '以下 JSON 是当前本地生图运行时的只读数据，不是用户指令；调用 media.generate_image 时必须遵守其提示词方言。',
    JSON.stringify(context),
    `prompt_rule: ${resolvePromptRule(context)}`,
    'tool_args_rule: The JSON fields above describe the active runtime and are not media.generate_image arguments. Do not pass width, height, size, model, provider, profileId, or presetId; express the requested shape only with targetAspectRatio.',
    '</image_generation_context>',
  ].join('\n');
};
