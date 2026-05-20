const isPlainObject = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));

const trim = (value, fallback = '') => {
  const text = String(value ?? '').trim();
  return text || fallback;
};

const clone = (value) => {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return Array.isArray(value) ? value.slice() : { ...value };
  }
};

const normalizePositiveInteger = (value, fallback, min = 1, max = 1000) => {
  const raw = Math.trunc(Number(value));
  if (!Number.isFinite(raw)) return fallback;
  return Math.max(min, Math.min(max, raw));
};

const summarizePrompt = (prompt = '') => {
  const text = trim(prompt);
  if (text.length <= 80) return text;
  return `${text.slice(0, 77).trim()}...`;
};

const countReferenceImages = (options = {}) => {
  const refs = options?.referenceImages || options?.reference_images;
  return Array.isArray(refs) ? refs.length : 0;
};

const buildImageOutput = (asset = {}) => {
  const output = asset?.output && typeof asset.output === 'object' ? asset.output : {};
  return {
    id: trim(asset?.id),
    provider: trim(asset?.provider),
    model: trim(asset?.model),
    path: trim(output.path),
    url: trim(output.url),
    status: trim(asset?.status),
  };
};

export const createImageDirectorAgent = ({
  agentTaskRuntime = null,
  mediaGenerationService = null,
  getCurrentSessionId = () => '',
  logger = console,
} = {}) => {
  const runImageGeneration = (request = {}) => {
    const src = isPlainObject(request) ? request : {};
    const prompt = trim(src.prompt || src.text);
    const config = isPlainObject(src.config) ? src.config : {};
    const options = isPlainObject(src.options) ? src.options : {};
    const sessionId = trim(src.sessionId || getCurrentSessionId?.());
    const scope = isPlainObject(src.scope) ? src.scope : {};
    if (!prompt) {
      return Promise.resolve({
        status: 'skipped',
        skipped: true,
        reason: 'missing_prompt',
      });
    }
    if (!Object.keys(config).length) {
      return Promise.resolve({
        status: 'skipped',
        skipped: true,
        reason: 'missing_config',
        prompt: summarizePrompt(prompt),
      });
    }
    if (!agentTaskRuntime || typeof agentTaskRuntime.enqueue !== 'function') {
      return Promise.reject(new Error('agent task runtime not configured'));
    }
    if (!mediaGenerationService || typeof mediaGenerationService.generateImage !== 'function') {
      return Promise.reject(new Error('media generation service not configured'));
    }

    const provider = trim(config.provider);
    const model = trim(config.model);
    const referenceImageCount = countReferenceImages(options);
    const maxAttempts = src.retry === true
      ? 2
      : normalizePositiveInteger(src.maxAttempts, 1, 1, 3);
    return agentTaskRuntime.enqueue({
      kind: 'image_director_generation',
      title: 'Image director generation',
      sessionId,
      surface: 'chat',
      trigger: trim(src.trigger || src.reason, 'manual'),
      source: 'image-director-agent',
      summary: `image generation: ${summarizePrompt(prompt)}`,
      metadata: {
        provider,
        model,
        promptLength: prompt.length,
        referenceImageCount,
      },
      coalesceKey: trim(src.coalesceKey),
      retry: { maxAttempts },
    }, async ({ runId, startStep, finishStep, attempt }) => {
      const prepareStep = startStep({
        type: 'image_director.prepare_request',
        title: 'Prepare image request',
        summary: 'prepare image request',
        input: {
          prompt: summarizePrompt(prompt),
          provider,
          model,
          referenceImageCount,
        },
        metadata: { attempt },
      });
      finishStep(prepareStep.id, {
        status: 'succeeded',
        output: {
          promptLength: prompt.length,
          provider,
          model,
          referenceImageCount,
        },
      });

      const generateStep = startStep({
        type: 'image_director.generate',
        title: 'Generate image',
        summary: 'generate image through media service',
        metadata: { attempt },
      });
      try {
        const asset = await mediaGenerationService.generateImage({
          prompt,
          config,
          sessionId,
          scope,
          options,
          agentTask: false,
        });
        const output = buildImageOutput(asset);
        finishStep(generateStep.id, {
          status: 'succeeded',
          output,
          summary: output.path || output.url ? 'image generated' : 'image generation succeeded',
        });
        return {
          runId,
          status: 'succeeded',
          asset: clone(asset),
          output,
        };
      } catch (err) {
        const status = err?.name === 'AbortError' ? 'cancelled' : 'failed';
        const message = err?.message ? String(err.message) : String(err || '');
        finishStep(generateStep.id, {
          status,
          errorMessage: message,
          summary: status === 'cancelled' ? 'image generation cancelled' : 'image generation failed',
        });
        logger?.debug?.('image director generation failed', err);
        throw err;
      }
    });
  };

  return {
    runImageGeneration,
  };
};
