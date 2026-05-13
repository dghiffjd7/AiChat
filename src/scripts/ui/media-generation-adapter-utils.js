export const getGeneratedImageOutputRef = (asset = {}) => {
  const output = asset?.output && typeof asset.output === 'object' ? asset.output : {};
  return String(output.path || output.url || output.dataUrl || '').trim();
};

export const buildGeneratedImageToken = (asset = {}) => {
  const ref = getGeneratedImageOutputRef(asset);
  return ref ? `[img-${ref}]` : '';
};

export const buildMomentContentWithGeneratedImages = (text = '', assets = []) => {
  const body = String(text || '').trim();
  const tokens = (Array.isArray(assets) ? assets : [])
    .map(buildGeneratedImageToken)
    .filter(Boolean);
  return [body, ...tokens].filter(Boolean).join('\n');
};

export const normalizeGeneratedImageAssetFromMessage = (message = {}) => {
  const meta = message?.meta && typeof message.meta === 'object' ? message.meta : {};
  const generated = meta.generatedMedia && typeof meta.generatedMedia === 'object' ? meta.generatedMedia : null;
  if (!generated || generated.kind !== 'image' || generated.status !== 'succeeded') return null;
  const output = generated.output && typeof generated.output === 'object' ? generated.output : {};
  const path = String(output.path || meta.localPath || '').trim();
  const url = String(output.url || '').trim();
  const dataUrl = String(output.dataUrl || '').trim();
  if (!path && !url && !dataUrl) return null;
  return {
    id: String(generated.id || message.id || '').trim(),
    kind: 'image',
    provider: String(generated.provider || '').trim(),
    model: String(generated.model || '').trim(),
    prompt: String(generated.prompt || '').trim(),
    negativePrompt: String(generated.negativePrompt || generated.negative_prompt || generated.generationParams?.negativePrompt || generated.generationParams?.negative_prompt || '').trim(),
    generationParams: generated.generationParams && typeof generated.generationParams === 'object'
      ? { ...generated.generationParams }
      : {},
    output: {
      path,
      url,
      dataUrl,
      mime: String(output.mime || '').trim(),
      bytes: Number(output.bytes || meta.localBytes || 0) || 0,
    },
    status: 'succeeded',
    scope: {
      surface: String(generated.surface || generated.scope?.surface || '').trim(),
      targetId: String(generated.targetId || generated.scope?.targetId || message.sessionId || '').trim(),
      sourceMessageId: String(generated.sourceMessageId || '').trim(),
    },
    messageId: String(message.id || '').trim(),
    createdAt: Number(generated.createdAt || message.timestamp || 0) || 0,
  };
};

export const collectGeneratedImageAssetsFromMessages = (messages = [], { surface = '' } = {}) => {
  const targetSurface = String(surface || '').trim();
  const seen = new Set();
  return (Array.isArray(messages) ? messages : [])
    .map(normalizeGeneratedImageAssetFromMessage)
    .filter((asset) => {
      if (!asset) return false;
      if (targetSurface && asset.scope.surface && asset.scope.surface !== targetSurface) return false;
      const key = asset.id || getGeneratedImageOutputRef(asset);
      if (key && seen.has(key)) return false;
      if (key) seen.add(key);
      return true;
    });
};

export const buildGeneratedImageMessagePatch = (asset = {}, {
  sourceMessageId = '',
  surface = 'chat',
  targetId = '',
  now = () => Date.now(),
} = {}) => {
  const output = asset?.output && typeof asset.output === 'object' ? asset.output : {};
  const path = String(output.path || '').trim();
  const url = String(output.url || output.dataUrl || '').trim();
  return {
    role: 'assistant',
    type: 'image',
    content: path ? '[binary omitted]' : url,
    meta: {
      localPath: path,
      localBytes: Number(output.bytes || 0) || undefined,
      savedAt: now(),
      generatedMedia: {
        id: asset.id,
        kind: 'image',
        status: 'succeeded',
        provider: asset.provider,
        model: asset.model,
        prompt: asset.prompt,
        negativePrompt: String(asset.negativePrompt || asset.negative_prompt || '').trim(),
        generationParams: asset.generationParams && typeof asset.generationParams === 'object'
          ? { ...asset.generationParams }
          : {},
        surface,
        targetId,
        sourceMessageId: String(sourceMessageId || '').trim(),
        createdAt: asset.createdAt || now(),
        output: {
          path,
          url: String(output.url || '').trim(),
          mime: String(output.mime || '').trim(),
          bytes: Number(output.bytes || 0) || undefined,
        },
      },
    },
  };
};
