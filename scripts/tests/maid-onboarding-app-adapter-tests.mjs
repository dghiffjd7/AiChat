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

{
  const richCalls = [];
  const richAdapter = createMaidOnboardingAppAdapter({
    documentRef: { querySelectorAll: () => [] },
    targetSelectors: {
      'settings-general': ['#settings-general'],
      'general-ui-advanced': ['#general-ui-advanced-toggle'],
      'general-rich-iframe-scripts': ['#general-rich-iframe-scripts'],
    },
    isElementVisible: () => false,
    delay: async () => {},
    openSettingsMenu: () => richCalls.push(['settings:open']),
    openGeneralSettings: options => richCalls.push(['general:open', options]),
  });
  await richAdapter.prepareStep({ step: { target: 'settings-general' } });
  await richAdapter.prepareStep({ step: { target: 'general-ui-advanced' } });
  await richAdapter.prepareStep({ step: { target: 'general-rich-iframe-scripts' } });
  assert.deepEqual(richCalls, [
    ['settings:open'],
    ['general:open', { revealRichIframeScripts: false }],
    ['general:open', { revealRichIframeScripts: true }],
  ]);
  console.log('ok - onboarding adapter exposes the general settings fold and rich iframe switch');
}

{
  const backCalls = [];
  const backAdapter = createMaidOnboardingAppAdapter({
    documentRef: { querySelectorAll: () => [] },
    targetSelectors: {
      'settings-api-config': ['#settings-api'],
      'quick-add-friend': ['#quick-add'],
      'add-friend-recommendation': ['#recommendation'],
      'agent-center-entry': ['#agent-entry'],
      'agent-center-detail-close': ['#agent-detail-close'],
    },
    isElementVisible: () => false,
    delay: async ms => backCalls.push(`delay:${ms}`),
    openSettingsMenu: () => backCalls.push('settings:open'),
    openQuickMenu: () => backCalls.push('quick:open'),
    closeMenus: () => backCalls.push('menus:close'),
    closeApiConfig: () => backCalls.push('config:close'),
    closeAddFriend: () => backCalls.push('friend:close'),
    cancelAddFriendConfirm: () => backCalls.push('friend-confirm:cancel'),
    openAgentCenter: () => backCalls.push('agent:open'),
    closeAgentCenter: () => backCalls.push('agent:close'),
    openAgentCenterDetail: () => backCalls.push('agent-detail:open'),
    closeAgentCenterDetail: () => backCalls.push('agent-detail:close'),
    closeMaidCommand: () => backCalls.push('maid:close'),
    switchPage: page => backCalls.push(`page:${page}`),
  });

  await backAdapter.prepareStep({ step: { target: 'settings-api-config' }, meta: { reason: 'prev' } });
  assert.deepEqual(backCalls.splice(0), ['config:close', 'settings:open']);
  await backAdapter.prepareStep({ step: { target: 'quick-add-friend' }, meta: { reason: 'prev' } });
  assert.deepEqual(backCalls.splice(0), [
    'friend-confirm:cancel',
    'friend:close',
    'delay:260',
    'quick:open',
  ]);
  await backAdapter.prepareStep({ step: { target: 'add-friend-recommendation' }, meta: { reason: 'prev' } });
  assert.deepEqual(backCalls.splice(0), ['friend-confirm:cancel', 'delay:220']);
  await backAdapter.prepareStep({ step: { target: 'agent-center-entry' }, meta: { reason: 'prev' } });
  assert.deepEqual(backCalls.splice(0), ['agent:close', 'maid:close', 'settings:open', 'page:moments']);
  await backAdapter.prepareStep({ step: { target: 'agent-center-detail-close' }, meta: { reason: 'prev' } });
  assert.deepEqual(backCalls.splice(0), ['agent:open', 'agent-detail:open']);
  console.log('ok - onboarding previous steps restore their parent surfaces before spotlight rendering');
}

{
  const navigationCalls = [];
  const navigationAdapter = createMaidOnboardingAppAdapter({
    documentRef: { querySelectorAll: () => [] },
    targetSelectors: {},
    isElementVisible: () => false,
    delay: async () => {},
    isChatRoomVisible: () => true,
    exitChatRoom: options => navigationCalls.push(['exit', options]),
    switchPage: (page, options) => navigationCalls.push(['page', page, options]),
    closeContactDetail: () => navigationCalls.push(['contact-detail:close']),
  });

  await navigationAdapter.prepareStep({ step: { target: 'settings-entry' } });
  assert.deepEqual(navigationCalls.splice(0), [
    ['exit', { animate: false, source: 'maid-onboarding' }],
    ['page', 'chat', { animate: false }],
  ]);

  await navigationAdapter.prepareStep({
    flow: { id: 'rich-script-permission' },
    step: { target: 'settings-entry' },
  });
  assert.deepEqual(navigationCalls.splice(0), [], 'the contextual rich-card guide must keep the current room in place');

  await navigationAdapter.prepareStep({ step: { target: 'contact-list-entry' } });
  assert.deepEqual(navigationCalls.splice(0), [
    ['exit', { animate: false, source: 'maid-onboarding' }],
    ['contact-detail:close'],
    ['page', 'contacts', { animate: false }],
  ]);

  await navigationAdapter.prepareStep({ step: { target: 'contact-detail-message' }, meta: { reason: 'prev' } });
  assert.deepEqual(navigationCalls.splice(0), [
    ['exit', { animate: false, source: 'maid-onboarding' }],
    ['page', 'contacts', { animate: false }],
  ]);

  await navigationAdapter.prepareStep({ step: { target: 'chat-list-entry' } });
  assert.deepEqual(navigationCalls.splice(0), []);
  console.log('ok - onboarding exposes settings and first-chat contact surfaces when started or reversed from a room');
}

const vertexAdapter = createMaidOnboardingAppAdapter({
  configManager: {
    getProfiles: () => [{ id: 'vertex', provider: 'vertexai', model: 'gemini-2.5-pro', vertexaiServiceAccount: 'encoded-json' }],
    listKeys: () => [],
  },
});
assert.equal(vertexAdapter.hasConfiguredProfile(), true, 'Vertex service-account profiles are configured without an API key');

const migratedVertexAdapter = createMaidOnboardingAppAdapter({
  configManager: {
    getProfiles: () => [{ id: 'vertex-keyring', provider: 'vertexai', model: 'gemini-2.5-pro', vertexaiAuthMode: 'service_account' }],
    listKeys: () => [],
    hasVertexServiceAccount: profileId => profileId === 'vertex-keyring',
  },
});
assert.equal(migratedVertexAdapter.hasConfiguredProfile(), true, 'keyring-backed Vertex service accounts remain discoverable');

const incompleteVertexAdapters = [
  createMaidOnboardingAppAdapter({
    configManager: {
      getProfiles: () => [{ id: 'vertex-full-key-only', provider: 'vertexai', model: 'gemini-3.5-flash', vertexaiAuthMode: 'service_account', activeKeyId: 'key-1' }],
      listKeys: () => [{ id: 'key-1' }],
      hasVertexServiceAccount: () => false,
    },
  }),
  createMaidOnboardingAppAdapter({
    configManager: {
      getProfiles: () => [{ id: 'vertex-express-sa-only', provider: 'vertexai', model: 'gemini-3.5-flash', vertexaiAuthMode: 'express' }],
      listKeys: () => [],
      hasVertexServiceAccount: () => true,
    },
  }),
];
assert.equal(
  incompleteVertexAdapters.some(adapter => adapter.hasConfiguredProfile()),
  false,
  'onboarding requires the credential selected by the Vertex authentication mode',
);

const keyIdAdapter = createMaidOnboardingAppAdapter({
  configManager: {
    getProfiles: () => [{ id: 'saved', model: 'deepseek-chat', activeKeyId: 'key-1' }],
    listKeys: () => [],
  },
});
assert.equal(keyIdAdapter.hasConfiguredProfile(), true, 'live profile snapshots can prove a saved key by activeKeyId');
console.log('ok - onboarding app adapter resolves live targets, prepares panels, and executes fallbacks');
