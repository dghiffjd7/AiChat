const toKey = (value) => String(value || '').trim().toLowerCase();

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const clampInt = (value, min, max, fallback) => {
  const raw = Math.trunc(Number(value));
  if (!Number.isFinite(raw)) return fallback;
  return Math.min(max, Math.max(min, raw));
};

const optionValues = (field) => new Set((field?.options || []).map(item => String(item.value)));
const AUTO_OPTION_OMIT_KEYS = new Set(['quality', 'size', 'background', 'moderation']);

const makeSelect = (key, label, options, fallback, help = '') => ({
  key,
  label,
  type: 'select',
  options,
  defaultValue: fallback,
  help,
});

const makeNumber = (key, label, { min, max, step = 1, fallback, help = '' } = {}) => ({
  key,
  label,
  type: 'number',
  min,
  max,
  step,
  defaultValue: fallback,
  help,
});

const makeText = (key, label, fallback = '', help = '') => ({
  key,
  label,
  type: 'text',
  defaultValue: fallback,
  help,
});

export const IMAGE_GENERATION_PARAM_STORE_KEY = 'image_generation_params_v1';

export const DEFAULT_IMAGE_GENERATION_PRESET_ID = 'default';

export const createDefaultImageGenerationPreset = () => ({
  id: DEFAULT_IMAGE_GENERATION_PRESET_ID,
  name: '默认图片参数',
  paramsByProvider: {
    openai: {
      n: 1,
      quality: 'auto',
      size: 'auto',
      output_format: 'png',
      output_compression: 100,
      background: 'auto',
      moderation: 'auto',
      response_format: '',
      style: '',
    },
    makersuite: {
      n: 1,
      aspectRatio: '1:1',
      negativePrompt: '',
      responseMimeType: 'image/png',
      outputCompression: 100,
    },
    vertexai: {
      n: 1,
      aspectRatio: '1:1',
      negativePrompt: '',
      responseMimeType: 'image/png',
      outputCompression: 100,
    },
    custom: {
      n: 1,
      size: '',
      quality: '',
      style: '',
      response_format: '',
    },
  },
});

export const normalizeImageProviderKey = (provider = '') => {
  const p = toKey(provider);
  if (p === 'gemini') return 'makersuite';
  if (p === 'vertexai') return 'vertexai';
  if (p === 'openai') return 'openai';
  if (p === 'custom') return 'custom';
  return p || 'custom';
};

export const resolveImageGenerationParamSchema = (config = {}) => {
  const provider = normalizeImageProviderKey(config?.provider);
  const model = toKey(config?.model);

  if (provider === 'openai') {
    const isGptImage = model.startsWith('gpt-image');
    const isDalle3 = model.includes('dall-e-3');
    const isDalle2 = model.includes('dall-e-2');
    if (isGptImage) {
      return {
        provider,
        model,
        title: 'OpenAI GPT Image 参数',
        fields: [
          makeNumber('n', '生成张数', { min: 1, max: 10, fallback: 1, help: '多数入口只会使用第一张图；保留多张用于后续扩展。' }),
          makeSelect('quality', '质量', [
            { value: 'auto', label: '自动' },
            { value: 'low', label: '低' },
            { value: 'medium', label: '中' },
            { value: 'high', label: '高' },
          ], 'auto', '质量越高，延迟和成本通常越高。'),
          makeSelect('size', '尺寸', [
            { value: 'auto', label: '自动' },
            { value: '1024x1024', label: '1024 x 1024' },
            { value: '1536x1024', label: '1536 x 1024' },
            { value: '1024x1536', label: '1024 x 1536' },
          ], 'auto'),
          makeSelect('output_format', '输出格式', [
            { value: 'png', label: 'PNG' },
            { value: 'jpeg', label: 'JPEG' },
            { value: 'webp', label: 'WebP' },
          ], 'png'),
          makeNumber('output_compression', '压缩质量', { min: 0, max: 100, fallback: 100, help: '仅 JPEG/WebP 适用。' }),
          makeSelect('background', '背景', [
            { value: 'auto', label: '自动' },
            { value: 'opaque', label: '不透明' },
          ], 'auto', 'gpt-image-2 当前不支持 transparent。'),
          makeSelect('moderation', '审核强度', [
            { value: 'auto', label: '自动' },
            { value: 'low', label: '低' },
          ], 'auto'),
        ],
      };
    }
    if (isDalle3) {
      return {
        provider,
        model,
        title: 'OpenAI DALL·E 3 参数',
        fields: [
          makeNumber('n', '生成张数', { min: 1, max: 1, fallback: 1 }),
          makeSelect('quality', '质量', [
            { value: '', label: '默认' },
            { value: 'standard', label: 'standard' },
            { value: 'hd', label: 'hd' },
          ], ''),
          makeSelect('size', '尺寸', [
            { value: '', label: '默认' },
            { value: '1024x1024', label: '1024 x 1024' },
            { value: '1792x1024', label: '1792 x 1024' },
            { value: '1024x1792', label: '1024 x 1792' },
          ], ''),
          makeSelect('style', '风格', [
            { value: '', label: '默认' },
            { value: 'vivid', label: 'vivid' },
            { value: 'natural', label: 'natural' },
          ], ''),
          makeSelect('response_format', '返回格式', [
            { value: '', label: '默认' },
            { value: 'url', label: 'URL' },
            { value: 'b64_json', label: 'Base64' },
          ], ''),
        ],
      };
    }
    return {
      provider,
      model,
      title: isDalle2 ? 'OpenAI DALL·E 2 参数' : 'OpenAI 图片参数',
      fields: [
        makeNumber('n', '生成张数', { min: 1, max: 10, fallback: 1 }),
        makeSelect('size', '尺寸', [
          { value: '', label: '默认' },
          { value: '256x256', label: '256 x 256' },
          { value: '512x512', label: '512 x 512' },
          { value: '1024x1024', label: '1024 x 1024' },
        ], ''),
        makeSelect('response_format', '返回格式', [
          { value: '', label: '默认' },
          { value: 'url', label: 'URL' },
          { value: 'b64_json', label: 'Base64' },
        ], ''),
      ],
    };
  }

  if (provider === 'makersuite' || provider === 'vertexai') {
    const isImagen = model.includes('imagen') || model.startsWith('imagegeneration');
    return {
      provider,
      model,
      title: isImagen ? 'Google Imagen 参数' : 'Gemini 图片参数',
      fields: [
        makeNumber('n', '生成张数', { min: 1, max: 8, fallback: 1 }),
        makeSelect('aspectRatio', '比例', [
          { value: '1:1', label: '1:1' },
          { value: '3:4', label: '3:4' },
          { value: '4:3', label: '4:3' },
          { value: '9:16', label: '9:16' },
          { value: '16:9', label: '16:9' },
        ], '1:1'),
        makeText('negativePrompt', '负面提示词', '', isImagen ? 'Imagen 链路会传递 negativePrompt；Gemini 预览模型可能忽略。' : '部分 Gemini 图片模型可能忽略。'),
        makeSelect('responseMimeType', '输出格式', [
          { value: 'image/png', label: 'PNG' },
          { value: 'image/jpeg', label: 'JPEG' },
          { value: 'image/webp', label: 'WebP' },
        ], 'image/png'),
        makeNumber('outputCompression', '压缩质量', { min: 1, max: 100, fallback: 100, help: 'Imagen 预测链路使用；其他模型可能忽略。' }),
      ],
    };
  }

  if (provider === 'custom') {
    return {
      provider,
      model,
      title: '自定义 OpenAI 兼容图片参数',
      fields: [
        makeNumber('n', '生成张数', { min: 1, max: 10, fallback: 1 }),
        makeText('size', '尺寸', '', '例如 1024x1024；留空则不传。'),
        makeText('quality', '质量', '', '仅在你的兼容端点支持时填写。'),
        makeText('style', '风格', '', '仅在你的兼容端点支持时填写。'),
        makeSelect('response_format', '返回格式', [
          { value: '', label: '不传' },
          { value: 'url', label: 'URL' },
          { value: 'b64_json', label: 'Base64' },
        ], ''),
      ],
    };
  }

  return {
    provider,
    model,
    title: '图片生成参数',
    fields: [
      makeNumber('n', '生成张数', { min: 1, max: 4, fallback: 1 }),
    ],
  };
};

export const normalizeImageGenerationPreset = (preset = {}) => {
  const fallback = createDefaultImageGenerationPreset();
  const source = isObject(preset) ? preset : {};
  return {
    id: String(source.id || fallback.id).trim() || fallback.id,
    name: String(source.name || fallback.name).trim() || fallback.name,
    paramsByProvider: {
      ...fallback.paramsByProvider,
      ...(isObject(source.paramsByProvider) ? source.paramsByProvider : {}),
    },
    createdAt: Number.isFinite(Number(source.createdAt)) ? Number(source.createdAt) : Date.now(),
    updatedAt: Number.isFinite(Number(source.updatedAt)) ? Number(source.updatedAt) : Date.now(),
  };
};

export const sanitizeImageGenerationParams = (params = {}, config = {}) => {
  const schema = resolveImageGenerationParamSchema(config);
  const raw = isObject(params) ? params : {};
  const out = {};
  schema.fields.forEach((field) => {
    const value = raw[field.key];
    if (field.type === 'number') {
      const safe = clampInt(value, field.min ?? Number.MIN_SAFE_INTEGER, field.max ?? Number.MAX_SAFE_INTEGER, field.defaultValue ?? 0);
      if (Number.isFinite(safe)) out[field.key] = safe;
      return;
    }
    if (field.type === 'select') {
      const safe = String(value ?? field.defaultValue ?? '');
      const values = optionValues(field);
      const next = values.has(safe) ? safe : String(field.defaultValue ?? '');
      if (next !== '') out[field.key] = next;
      if (AUTO_OPTION_OMIT_KEYS.has(field.key) && out[field.key] === 'auto') delete out[field.key];
      return;
    }
    const text = String(value ?? field.defaultValue ?? '').trim();
    if (text) out[field.key] = text;
  });

  if (out.output_format && out.output_format === 'png') {
    delete out.output_compression;
  }
  if (out.responseMimeType && out.responseMimeType === 'image/png') {
    delete out.outputCompression;
  }
  return out;
};

export const getParamsForImageConfig = (preset = {}, config = {}) => {
  const normalized = normalizeImageGenerationPreset(preset);
  const provider = normalizeImageProviderKey(config?.provider);
  const params = normalized.paramsByProvider?.[provider] || {};
  return sanitizeImageGenerationParams(params, config);
};

export const mergeImageGenerationRequestOptions = ({
  config = {},
  preset = null,
  overrides = {},
  extra = {},
} = {}) => {
  const base = preset ? getParamsForImageConfig(preset, config) : {};
  const merged = sanitizeImageGenerationParams({ ...base, ...(isObject(overrides) ? overrides : {}) }, config);
  return {
    ...merged,
    ...(isObject(extra) ? extra : {}),
  };
};
