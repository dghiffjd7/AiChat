import assert from 'node:assert/strict';

import { createMaidOnboardingAppAdapter } from '../../src/scripts/ui/maid-onboarding-app-adapter.js';

const calls = [];
const emissions = [];
const keyInput = { focus: () => calls.push('focus:key') };
const documentRef = {
  querySelectorAll: selector => selector === '#key' ? [keyInput] : [],
};
const adapter = createMaidOnboardingAppAdapter({
  documentRef,
  targetSelectors: {
    'config-api-key-input': ['#key'],
    'settings-api-config': ['#settings-api'],
  },
  isElementVisible: () => true,
  delay: async () => {},
  openSettingsMenu: () => calls.push('settings'),
  openApiConfig: () => calls.push('config'),
  openQuickMenu: () => calls.push('quick'),
  openAddFriend: () => calls.push('friend'),
  openAgentCenter: () => calls.push('agent:open'),
  closeMaidCommand: () => calls.push('maid:close'),
  switchPage: page => calls.push(`page:${page}`),
  emit: (event, payload) => {
    calls.push(`emit:${event}`);
    emissions.push({ event, payload });
  },
  configManager: {
    getProfiles: () => [{ id: 'p1', model: 'm1' }],
    listKeys: () => ['key-1'],
  },
});

await adapter.prepareStep({ step: { target: 'settings-api-config' } });
assert.deepEqual(calls, ['settings']);
await adapter.runFallback({ step: { target: 'settings-entry', fallback: { kind: 'open-settings-menu' } } });
await adapter.runFallback({ step: { target: 'settings-api-config', fallback: { kind: 'open-api-config' } } });
await adapter.runFallback({ step: { target: 'top-plus-entry', fallback: { kind: 'open-quick-menu' } } });
await adapter.runFallback({ step: { target: 'quick-add-friend', fallback: { kind: 'open-add-friend' } } });
assert.deepEqual(calls, [
  'settings',
  'settings', 'emit:target-click',
  'config', 'emit:target-click',
  'quick', 'emit:target-click',
  'friend', 'emit:target-click',
]);
assert.deepEqual(emissions, [
  { event: 'target-click', payload: { target: 'settings-entry' } },
  { event: 'target-click', payload: { target: 'settings-api-config' } },
  { event: 'target-click', payload: { target: 'top-plus-entry' } },
  { event: 'target-click', payload: { target: 'quick-add-friend' } },
]);
assert.equal(await adapter.runFallback({ step: { target: 'config-api-key-input', fallback: { kind: 'focus-target' } } }), true);
assert.equal(calls.at(-1), 'focus:key');
assert.equal(await adapter.runFallback({
  step: {
    target: 'config-connection-fields',
    fallback: { kind: 'focus-target', target: 'config-api-key-input' },
  },
}), true);
assert.deepEqual(calls.slice(-2), ['focus:key', 'focus:key']);
await adapter.prepareStep({ step: { target: 'agent-center-entry' } });
assert.deepEqual(calls.slice(-3), ['maid:close', 'settings', 'page:moments']);
await adapter.runFallback({ step: { fallback: { kind: 'open-agent-center' } } });
assert.deepEqual(calls.slice(-3), ['maid:close', 'agent:open', 'emit:agent-center-opened']);
assert.equal(adapter.hasConfiguredProfile(), true);

const vertexAdapter = createMaidOnboardingAppAdapter({
  configManager: {
    getProfiles: () => [{ id: 'vertex', model: 'gemini-2.5-pro', vertexaiServiceAccount: 'encoded-json' }],
    listKeys: () => [],
  },
});
assert.equal(vertexAdapter.hasConfiguredProfile(), true, 'Vertex service-account profiles are configured without an API key');

const keyIdAdapter = createMaidOnboardingAppAdapter({
  configManager: {
    getProfiles: () => [{ id: 'saved', model: 'deepseek-chat', activeKeyId: 'key-1' }],
    listKeys: () => [],
  },
});
assert.equal(keyIdAdapter.hasConfiguredProfile(), true, 'live profile snapshots can prove a saved key by activeKeyId');
console.log('ok - onboarding app adapter resolves live targets, prepares panels, and executes fallbacks');
