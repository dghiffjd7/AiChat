import assert from 'node:assert/strict';

import { createMaidRuntimeConfigResolver } from '../../src/scripts/agent/maid-runtime-config.js';

{
  const resolver = createMaidRuntimeConfigResolver({
    settingsStore: {
      getBoundProfileId: () => '',
      getPersonaPrompt: () => 'test persona',
    },
    configManager: {
      ensureStores: async () => {
        throw new Error('should not load config without binding');
      },
    },
  });
  const runtime = await resolver();
  assert.equal(runtime.configured, false);
  assert.equal(runtime.bound, false);
  assert.equal(runtime.reason, 'maid_profile_not_bound');
  assert.equal(runtime.maidPrompt, 'test persona');
  assert.equal(runtime.personaPrompt, 'test persona');
  console.log('ok - maid runtime config resolver refuses unbound current config fallback');
}

{
  const resolver = createMaidRuntimeConfigResolver({
    settingsStore: {
      getBoundProfileId: () => 'maid-profile',
      getMaidPrompt: () => 'quiet',
    },
    configManager: {
      ensureStores: async () => {},
      getRuntimeConfigByProfileId: async (profileId) => ({
        provider: 'openai',
        model: 'gpt-4.1-mini',
        apiKey: profileId === 'maid-profile' ? 'key' : '',
      }),
    },
    isConfigReady: config => Boolean(config?.apiKey),
    createClient: config => ({ chat: async () => config.model }),
  });
  const runtime = await resolver();
  assert.equal(runtime.configured, true);
  assert.equal(runtime.bound, true);
  assert.equal(runtime.profileId, 'maid-profile');
  assert.equal(runtime.maidPrompt, 'quiet');
  assert.equal(runtime.personaPrompt, 'quiet');
  assert.equal(typeof runtime.client.chat, 'function');
console.log('ok - maid runtime config resolver uses explicit maid profile');
}

{
  const resolver = createMaidRuntimeConfigResolver({
    settingsStore: {
      getBoundProfileId: () => 'vision-main',
      getFallbackProfileId: () => 'text-fallback',
    },
    configManager: {
      ensureStores: async () => {},
      getRuntimeConfigByProfileId: async profileId => (profileId === 'vision-main'
        ? { provider: 'openai', model: 'gpt-4o', apiKey: 'main-key' }
        : { provider: 'deepseek', model: 'deepseek-chat', apiKey: 'fallback-key' }),
    },
    isConfigReady: config => Boolean(config?.apiKey),
    createClient: config => ({ chat: async () => config.model }),
  });
  const runtime = await resolver();
  assert.equal(runtime.fallbackConfig.provider, 'deepseek');
  assert.equal(runtime.fallbackConfig.model, 'deepseek-chat');
  assert.equal(runtime.fallbackProfileId, 'text-fallback');
  assert.equal(typeof runtime.fallbackClient.chat, 'function');
  console.log('ok - maid runtime config exposes fallback capability metadata');
}
