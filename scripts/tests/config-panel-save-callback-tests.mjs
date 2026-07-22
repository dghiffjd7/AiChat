import assert from 'node:assert/strict';

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

const createLocalStorage = () => {
  const data = new Map();
  return {
    getItem: key => data.get(String(key)) || null,
    setItem: (key, value) => data.set(String(key), String(value)),
    removeItem: key => data.delete(String(key)),
  };
};

test('ConfigPanel calls onSaved with active profile after chat API save', async () => {
  const previousWindow = globalThis.window;
  const previousLocalStorage = globalThis.localStorage;
  const previousSetTimeout = globalThis.setTimeout;
  const timers = [];
  globalThis.window = {};
  globalThis.localStorage = createLocalStorage();
  globalThis.setTimeout = (fn) => {
    timers.push(fn);
    return timers.length;
  };

  try {
    const { ConfigPanel } = await import('../../src/scripts/ui/config-panel.js');
    const profile = { id: 'profile-maid-api', name: 'Maid API' };
    const savedPayloads = [];
    const defaultSavedPayloads = [];
    const panel = new ConfigPanel({
      onSaved: payload => defaultSavedPayloads.push(payload),
    });
    const loadingStates = [];
    const statuses = [];
    const events = [];

    panel.activeTab = 'chat';
    panel.openOptions = {
      onSaved: payload => savedPayloads.push(payload),
    };
    panel.getFormData = () => ({
      provider: 'openai',
      apiKey: 'sk-test',
      baseUrl: '',
      model: 'gpt-test',
      stream: true,
    });
    panel.showStatus = (message, type) => statuses.push([message, type]);
    panel.setLoading = value => loadingStates.push(value);
    panel.emitProfileChanged = () => events.push('profile-changed');
    panel.configManager = {
      getActiveProfile: () => profile,
      getActiveProfileId: () => profile.id,
      get: () => ({ provider: 'openai', model: 'gpt-test' }),
      listKeys: () => [],
      validate: async () => true,
      save: async () => true,
      load: async () => ({ provider: 'openai', apiKey: 'sk-test', model: 'gpt-test' }),
    };

    timers.length = 0;
    await panel.onSave();

    assert.deepEqual(loadingStates, [true, false]);
    assert.deepEqual(statuses.at(-1), ['配置保存成功！', 'success']);
    assert.deepEqual(events, ['profile-changed']);
    assert.equal(savedPayloads.length, 1);
    assert.equal(savedPayloads[0].tab, 'chat');
    assert.equal(savedPayloads[0].profileId, profile.id);
    assert.equal(savedPayloads[0].profile, profile);
    assert.deepEqual(savedPayloads[0].config, { provider: 'openai', model: 'gpt-test' });
    assert.equal(defaultSavedPayloads.length, 1);
    assert.deepEqual(defaultSavedPayloads[0], savedPayloads[0]);
    assert.equal(timers.length, 1);
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
    if (previousLocalStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previousLocalStorage;
    globalThis.setTimeout = previousSetTimeout;
  }
});

let failed = 0;
for (const t of tests) {
  try {
    await t.fn();
    console.log(`ok - ${t.name}`);
  } catch (err) {
    failed += 1;
    console.error(`not ok - ${t.name}`);
    console.error(err);
  }
}

if (failed > 0) process.exit(1);
