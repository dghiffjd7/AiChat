import assert from 'node:assert/strict';

import { getVisionInputCapability } from '../../src/scripts/api/vision-capabilities.js';

{
  const gemini = getVisionInputCapability({ provider: 'gemini', model: 'gemini-2.0-flash' });
  assert.equal(gemini.supported, true);
  assert.equal(gemini.status, 'supported');

  const openai = getVisionInputCapability({ provider: 'openai', model: 'gpt-4o-mini' });
  assert.equal(openai.supported, true);

  const deepseek = getVisionInputCapability({ provider: 'deepseek', model: 'deepseek-chat' });
  assert.equal(deepseek.supported, false);
  assert.equal(deepseek.status, 'unsupported');

  const custom = getVisionInputCapability({ provider: 'custom', model: 'my-model' });
  assert.equal(custom.supported, true);
  assert.equal(custom.status, 'unknown');
  console.log('ok - vision capability helper gates known text-only models and allows unknown custom configs');
}
