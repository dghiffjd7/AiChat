import assert from 'node:assert/strict';

import {
  combineImageNegativePrompts,
  createDefaultImageGenerationPreset,
  mergeImageGenerationRequestOptions,
  resolveImageGenerationParamSchema,
  sanitizeImageGenerationParams,
} from '../../src/scripts/ui/image-generation-params-utils.js';

const findNegativeField = (config) => resolveImageGenerationParamSchema(config)
  .fields
  .find(field => field.key === 'negativePrompt');

for (const config of [
  { provider: 'novelai', model: 'nai-diffusion-4-5-full' },
  { provider: 'stability', model: 'stable-image-ultra' },
  { provider: 'togetherai', model: 'black-forest-labs/FLUX.1-schnell-Free' },
  { provider: 'pollinations', model: 'flux' },
  { provider: 'automatic1111', model: 'local' },
  { provider: 'comfyui', model: 'local' },
  { provider: 'vertexai', model: 'imagen-4.0-generate-001' },
]) {
  const field = findNegativeField(config);
  assert.ok(field, `${config.provider} should expose a fixed negative prompt field`);
  assert.equal(field.type, 'textarea');
  assert.equal(field.variant, 'persistent-negative');
  assert.equal(field.fullWidth, true);
}

assert.equal(findNegativeField({ provider: 'vertexai', model: 'gemini-2.5-flash-image' }), undefined);
assert.equal(findNegativeField({ provider: 'openai', model: 'gpt-image-2' }), undefined);

{
  const config = { provider: 'novelai', model: 'nai-diffusion-4-5-full' };
  const sanitized = sanitizeImageGenerationParams({
    width: 1024,
    negativePrompt: ' low quality, blurry ',
  }, config);
  assert.equal(sanitized.negativePrompt, 'low quality, blurry');
}

assert.equal(combineImageNegativePrompts('low quality', 'bad hands'), 'low quality, bad hands');
assert.equal(combineImageNegativePrompts('low quality', ''), 'low quality');
assert.equal(combineImageNegativePrompts('', 'bad hands'), 'bad hands');
assert.equal(
  combineImageNegativePrompts('low quality', 'low quality, bad hands'),
  'low quality, bad hands',
  'regenerating with an effective prompt must not duplicate the fixed prefix',
);

{
  const config = { provider: 'novelai', model: 'nai-diffusion-4-5-full' };
  const preset = createDefaultImageGenerationPreset();
  preset.paramsByProvider.novelai.negativePrompt = 'low quality, blurry';
  const options = mergeImageGenerationRequestOptions({
    config,
    preset,
    extra: { negativePrompt: 'bad hands' },
  });
  assert.equal(options.negativePrompt, 'low quality, blurry, bad hands');
}

console.log('ok - fixed image negative prompts are capability-gated, persisted, and appended to per-run prompts');
