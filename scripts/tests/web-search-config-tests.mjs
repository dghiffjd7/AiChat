import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const localSettings = new Map([
  ['app_settings_v1', JSON.stringify({
    webSearchProvider: 'brave',
    webSearchApiKey: 'legacy-search-secret',
  })],
]);
globalThis.localStorage = {
  getItem: key => localSettings.get(String(key)) || null,
  setItem: (key, value) => localSettings.set(String(key), String(value)),
  removeItem: key => localSettings.delete(String(key)),
};

const { ConfigManager } = await import('../../src/scripts/storage/config.js');
const { appSettings } = await import('../../src/scripts/storage/app-settings.js');

const manager = new ConfigManager();
assert.equal(manager.getDefault().webSearchEnabled, false);

manager.profileStore = {
  activeProfileId: 'profile-on',
  profiles: {
    'profile-on': {
      id: 'profile-on',
      name: '联网档',
      provider: 'openrouter',
      baseUrl: 'https://openrouter.ai/api/v1',
      model: 'openrouter/auto',
      webSearchEnabled: true,
    },
  },
};
manager.storesEnsured = true;
const profile = manager.getActiveProfile();
assert.equal(profile.webSearchEnabled, true);
const runtime = await manager.buildRuntimeConfig(profile);
assert.equal(runtime.webSearchEnabled, true);
console.log('ok - unified web search switch is profile-scoped and defaults off');

manager.keyringStore = { keysByProfile: {} };
manager.cryptoKey = null;
manager.persistKeyring = async (next = manager.keyringStore) => {
  manager.keyringStore = next;
};
await manager.setWebSearchApiKey('brave', 'brave-secret');
await manager.setWebSearchApiKey('tavily', 'tavily-secret');
assert.equal(await manager.getWebSearchApiKey('brave'), 'brave-secret');
assert.equal(await manager.getWebSearchApiKey('tavily'), 'tavily-secret');
await manager.setWebSearchApiKey('brave', '');
assert.equal(await manager.getWebSearchApiKey('brave'), '');
assert.equal(await manager.getWebSearchApiKey('tavily'), 'tavily-secret');
console.log('ok - search credentials are isolated per provider in the encrypted keyring');

assert.equal(appSettings.get().webSearchApiKey, 'legacy-search-secret');
appSettings.update({ uiThemeFontScale: 1.1 });
assert.equal(
  appSettings.get().webSearchApiKey,
  'legacy-search-secret',
  'unrelated settings updates must preserve a legacy key until migration succeeds',
);
appSettings.update({ webSearchApiKey: 'must-not-be-written-as-plaintext' });
assert.equal(
  appSettings.get().webSearchApiKey,
  'legacy-search-secret',
  'normal settings updates must reject new plaintext search keys',
);
const failedMigrationManager = new ConfigManager({
  scope: 'web_search_credentials',
  credentialsOnly: true,
});
failedMigrationManager.storesEnsured = true;
failedMigrationManager.profileStore = { activeProfileId: null, profiles: {} };
failedMigrationManager.keyringStore = { keysByProfile: {} };
failedMigrationManager.cryptoKey = null;
failedMigrationManager.persistKeyring = async () => {
  throw new Error('simulated keyring persistence failure');
};
await assert.rejects(
  failedMigrationManager.migrateLegacyWebSearchApiKey('brave', 'legacy-search-secret'),
  /simulated keyring persistence failure/,
);
appSettings.update({ memoryTableEnabledChat: false });
assert.equal(
  appSettings.get().webSearchApiKey,
  'legacy-search-secret',
  'a failed keyring migration must survive later settings updates for startup retry',
);
assert.equal(appSettings.clearLegacyWebSearchApiKey('different-secret'), false);
assert.equal(appSettings.get().webSearchApiKey, 'legacy-search-secret');
assert.equal(appSettings.clearLegacyWebSearchApiKey('legacy-search-secret'), true);
assert.equal(appSettings.get().webSearchApiKey, '');
console.log('ok - legacy search key survives ordinary settings updates and has a guarded clear path');

const existingKeyManager = new ConfigManager({
  scope: 'web_search_credentials',
  credentialsOnly: true,
});
existingKeyManager.storesEnsured = true;
existingKeyManager.profileStore = { activeProfileId: null, profiles: {} };
existingKeyManager.keyringStore = { keysByProfile: {} };
existingKeyManager.cryptoKey = null;
existingKeyManager.persistKeyring = async (next = existingKeyManager.keyringStore) => {
  existingKeyManager.keyringStore = next;
};
await existingKeyManager.setWebSearchApiKey('brave', 'fresh-user-secret');
const migrationResult = await existingKeyManager.migrateLegacyWebSearchApiKey(
  'brave',
  'stale-legacy-secret',
);
assert.equal(migrationResult.status, 'existing');
assert.equal(await existingKeyManager.getWebSearchApiKey('brave'), 'fresh-user-secret');
console.log('ok - legacy migration never overwrites an existing provider credential');

appSettings.update({ webSearchProvider: 'bing', webSearchApiKey: 'retired-key' });
assert.equal(appSettings.get().webSearchProvider, 'duckduckgo');
assert.equal(appSettings.get().webSearchApiKey, '', 'new writes must not persist search secrets in app settings');
console.log('ok - retired Bing Search API is no longer a selectable fallback provider');

const { ConfigPanel } = await import('../../src/scripts/ui/config-panel.js');
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};
const braveLoad = deferred();
const tavilyLoad = deferred();
const panel = Object.create(ConfigPanel.prototype);
panel.webSearchCredentialLoadSequence = 0;
panel.webSearchCredentialManager = {
  getWebSearchApiKey: provider => (
    provider === 'brave' ? braveLoad.promise : tavilyLoad.promise
  ),
};
const providerElement = { value: 'brave' };
const keyElement = { value: '', disabled: false, dataset: {} };
const firstLoad = panel.loadWebSearchCredentialForProvider('brave', {
  providerElement,
  keyElement,
});
providerElement.value = 'tavily';
const secondLoad = panel.loadWebSearchCredentialForProvider('tavily', {
  providerElement,
  keyElement,
});
tavilyLoad.resolve('tavily-secret');
assert.equal(await secondLoad, true);
braveLoad.resolve('brave-secret');
assert.equal(await firstLoad, false);
assert.equal(keyElement.value, 'tavily-secret');
assert.equal(keyElement.dataset.webSearchProvider, 'tavily');
assert.equal(keyElement.disabled, false);
console.log('ok - stale provider credential loads cannot overwrite the current search provider');

const panelSource = await readFile('src/scripts/ui/config-panel.js', 'utf8');
assert.match(panelSource, /id="config-web-search"/);
assert.match(panelSource, /联网可能产生额外费用/);
assert.match(panelSource, /webSearchEnabled:\s*Boolean\(panel\.querySelector\('#config-web-search'\)/);
console.log('ok - API profile UI owns the network switch and warns on first enable');

const appSource = await readFile('src/scripts/ui/app.js', 'utf8');
const commandsSource = await readFile('src-tauri/src/commands.rs', 'utf8');
assert.match(appSource, /registerWebSearchAgentTools[\s\S]*?safeInvoke\('public_http_request'/);
assert.match(commandsSource, /pub async fn public_http_request/);
assert.match(commandsSource, /resolve_to_addrs\(host, &resolved\)/);
assert.match(commandsSource, /MAX_PUBLIC_HTTP_RESPONSE_BYTES/);
assert.match(commandsSource, /\.no_proxy\(\)/);
console.log('ok - web tools use the DNS-pinned, size-capped public-only native transport');
