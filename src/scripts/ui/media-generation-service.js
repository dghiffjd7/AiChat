const DEFAULT_IMAGE_MIME = 'image/png';

const createId = (prefix = 'media') => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}:${crypto.randomUUID()}`;
  }
  return `${prefix}:${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
};

const abortError = () => {
  const err = new Error('Image generation aborted');
  err.name = 'AbortError';
  return err;
};

const throwIfAborted = (signal) => {
  if (signal?.aborted) throw abortError();
};

export const getImageMimeFromDataUrl = (dataUrl = '') => {
  const match = String(dataUrl || '').match(/^data:([^;,]+)[;,]/i);
  return match ? match[1].toLowerCase() : DEFAULT_IMAGE_MIME;
};

export const getImageExtensionFromMime = (mime = '') => {
  const raw = String(mime || '').toLowerCase();
  if (raw.includes('jpeg') || raw.includes('jpg')) return 'jpg';
  if (raw.includes('webp')) return 'webp';
  if (raw.includes('gif')) return 'gif';
  if (raw.includes('avif')) return 'avif';
  return 'png';
};

export const normalizeGeneratedImageResult = (item = {}) => {
  if (!item || typeof item !== 'object') return null;
  const dataUrl = String(item.dataUrl || item.data_url || '').trim();
  if (dataUrl.startsWith('data:image/')) {
    return {
      dataUrl,
      mime: getImageMimeFromDataUrl(dataUrl),
      index: Number.isFinite(Number(item.index)) ? Number(item.index) : 0,
    };
  }
  const b64 = String(item.b64_json || item.b64 || item.base64 || '').trim();
  if (b64) {
    const mime = String(item.mime || item.mimeType || DEFAULT_IMAGE_MIME).trim() || DEFAULT_IMAGE_MIME;
    return {
      dataUrl: `data:${mime};base64,${b64}`,
      mime,
      index: Number.isFinite(Number(item.index)) ? Number(item.index) : 0,
    };
  }
  const url = String(item.url || item.fileUri || item.file_uri || '').trim();
  if (url) {
    return {
      url,
      mime: String(item.mime || item.mimeType || '').trim(),
      index: Number.isFinite(Number(item.index)) ? Number(item.index) : 0,
    };
  }
  return null;
};

const blobToDataUrl = async (blob) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || ''));
  reader.onerror = () => reject(reader.error || new Error('read generated image failed'));
  reader.readAsDataURL(blob);
});

export const createMediaGenerationService = ({
  createClient,
  saveDataUrl,
  fetchFn = (...args) => fetch(...args),
  now = () => Date.now(),
  logger = console,
} = {}) => {
  const fetchImageAsDataUrl = async (url, signal) => {
    const raw = String(url || '').trim();
    if (!raw || !/^https?:\/\//i.test(raw)) return '';
    throwIfAborted(signal);
    const response = await fetchFn(raw, { signal });
    if (!response?.ok) throw new Error(`图片下载失败：HTTP ${response?.status || 0}`);
    const blob = await response.blob();
    throwIfAborted(signal);
    return blobToDataUrl(blob);
  };

  const persistImage = async ({ normalized, prompt, config, sessionId, signal }) => {
    throwIfAborted(signal);
    let dataUrl = normalized.dataUrl || '';
    let remoteUrl = normalized.url || '';
    let mime = normalized.mime || '';

    if (!dataUrl && remoteUrl) {
      try {
        dataUrl = await fetchImageAsDataUrl(remoteUrl, signal);
        mime = getImageMimeFromDataUrl(dataUrl) || mime;
      } catch (err) {
        logger?.warn?.('generated image url persistence failed; using remote url', err);
      }
    }

    let path = '';
    let bytes = 0;
    if (dataUrl && typeof saveDataUrl === 'function') {
      const ext = getImageExtensionFromMime(getImageMimeFromDataUrl(dataUrl) || mime);
      const fileName = `generated_image_${now()}_${Number(normalized.index || 0) + 1}.${ext}`;
      const saved = await saveDataUrl(dataUrl, fileName, { sessionId, prompt, config });
      if (typeof saved === 'string') {
        path = saved;
      } else if (saved && typeof saved === 'object') {
        path = String(saved.path || '').trim();
        bytes = Number(saved.bytes || 0) || 0;
      }
    }

    return {
      path,
      url: path ? '' : remoteUrl,
      mime: mime || getImageMimeFromDataUrl(dataUrl),
      bytes,
      dataUrl: '',
    };
  };

  const generateImage = async ({
    prompt,
    config,
    sessionId = '',
    scope = {},
    options = {},
    signal,
  } = {}) => {
    const text = String(prompt || '').trim();
    if (!text) throw new Error('图片提示词为空');
    if (!config || typeof config !== 'object') throw new Error('图片生成配置为空');
    if (typeof createClient !== 'function') throw new Error('图片生成客户端未配置');
    throwIfAborted(signal);

    const client = createClient(config);
    const images = await client.generateImage(text, {
      ...options,
      signal,
    });
    throwIfAborted(signal);

    const normalized = (Array.isArray(images) ? images : [])
      .map(normalizeGeneratedImageResult)
      .find(Boolean);
    if (!normalized) throw new Error('图片模型未返回可用图片');

    const output = await persistImage({ normalized, prompt: text, config, sessionId, signal });
    throwIfAborted(signal);
    if (!output.path && !output.url && !output.dataUrl) {
      throw new Error('图片生成成功，但保存结果失败');
    }

    return {
      id: createId('image'),
      kind: 'image',
      provider: String(config.provider || '').trim(),
      model: String(config.model || '').trim(),
      prompt: text,
      output,
      status: 'succeeded',
      scope: {
        surface: 'chat',
        targetId: String(sessionId || '').trim(),
        ...(scope && typeof scope === 'object' ? scope : {}),
      },
      createdAt: now(),
    };
  };

  return {
    generateImage,
  };
};
