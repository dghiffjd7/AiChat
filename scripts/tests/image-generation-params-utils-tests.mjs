import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  combineImageNegativePrompts,
  createDefaultImageGenerationPreset,
  mergeImageGenerationRequestOptions,
  resolveImageGenerationParamSchema,
  resolveImageNegativePromptDraft,
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
  assert.match(field.help, /弹窗中的编辑只覆盖本次生成/);
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

assert.equal(
  resolveImageNegativePromptDraft('', { negativePrompt: ' low quality, blurry ' }),
  'low quality, blurry',
  'a new generation dialog should show the fixed preset prompt',
);
assert.equal(
  resolveImageNegativePromptDraft(' custom one-shot prompt ', { negativePrompt: 'fixed prompt' }),
  'custom one-shot prompt',
  'an explicit one-shot prompt should take priority over the fixed preset',
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

{
  const config = { provider: 'novelai', model: 'nai-diffusion-4-5-full' };
  const preset = createDefaultImageGenerationPreset();
  preset.paramsByProvider.novelai.negativePrompt = 'low quality, blurry';
  const replaced = mergeImageGenerationRequestOptions({
    config,
    preset,
    extra: { negativePrompt: 'bad hands' },
    negativePromptMode: 'replace',
  });
  const cleared = mergeImageGenerationRequestOptions({
    config,
    preset,
    extra: { negativePrompt: '' },
    negativePromptMode: 'replace',
  });
  assert.equal(replaced.negativePrompt, 'bad hands');
  assert.equal(Object.hasOwn(cleared, 'negativePrompt'), false);
  assert.equal(preset.paramsByProvider.novelai.negativePrompt, 'low quality, blurry');
}

{
  const appSource = await readFile(new URL('../../src/scripts/ui/app.js', import.meta.url), 'utf8');
  assert.match(
    appSource,
    /negativeTextarea\.value = resolveImageNegativePromptDraft\(initialNegativePrompt, generationParamBase\)/,
  );
  assert.match(appSource, /negativePromptMode: 'replace'/);
  assert.match(appSource, /编辑只影响本次生成，不会修改生图设定/);
}

console.log('ok - fixed image negative prompts support visible one-shot replacement without mutating presets');
