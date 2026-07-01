import assert from 'node:assert/strict';

import {
  MAID_SETTINGS_STORE_KEY,
  MaidSettingsStore,
  normalizeMaidSettingsState,
} from '../../src/scripts/storage/maid-settings-store.js';
import { DEFAULT_MAID_PROMPT } from '../../src/scripts/agent/maid-prompt-defaults.js';

const createStorage = () => {
  const backing = new Map();
  return {
    backing,
    getItem: key => backing.get(String(key)) ?? null,
    setItem: (key, value) => {
      backing.set(String(key), String(value));
    },
    removeItem: key => {
      backing.delete(String(key));
    },
  };
};

{
  const state = normalizeMaidSettingsState({
    boundProfileId: ' profile-a ',
    maidPrompt: ' maid ',
    updatedAt: 10,
  });
  assert.equal(state.boundProfileId, 'profile-a');
  assert.equal(state.maidPrompt, 'maid');
  assert.equal(state.personaPrompt, 'maid');
  assert.equal(state.updatedAt, 10);
  console.log('ok - maid settings state normalizes binding and persona');
}

{
  const state = normalizeMaidSettingsState({});
  assert.equal(state.maidPrompt, DEFAULT_MAID_PROMPT);
  assert.equal(state.personaPrompt, DEFAULT_MAID_PROMPT);
  console.log('ok - maid settings state exposes current default maid prompt');
}

{
  let now = 1000;
  const storage = createStorage();
  const kv = new Map();
  const store = new MaidSettingsStore({
    storage,
    loadKv: async key => kv.get(key) || null,
    saveKv: async (key, value) => {
      kv.set(key, JSON.parse(JSON.stringify(value)));
    },
    now: () => now,
  });
  await store.load();
  assert.equal(store.getBoundProfileId(), '');
  await store.savePatch({
    boundProfileId: 'profile-a',
    maidPrompt: '稳重女仆',
  });
  store.setLastExchange({
    requestPrompt: 'system:\nsecret prompt',
    appContext: '检索：已执行',
    fullResponse: 'raw response',
    source: 'test',
  });
  await store.setPersonaPrompt('稳重女仆 2');
  assert.match(storage.backing.get(MAID_SETTINGS_STORE_KEY), /profile-a/);
  assert.match(storage.backing.get(MAID_SETTINGS_STORE_KEY), /secret prompt/);
  assert.match(storage.backing.get(MAID_SETTINGS_STORE_KEY), /检索：已执行/);
  assert.match(storage.backing.get(MAID_SETTINGS_STORE_KEY), /raw response/);
  assert.equal(kv.get(MAID_SETTINGS_STORE_KEY).boundProfileId, 'profile-a');
  assert.equal(kv.get(MAID_SETTINGS_STORE_KEY).maidPrompt, '稳重女仆 2');
  assert.equal(kv.get(MAID_SETTINGS_STORE_KEY).personaPrompt, undefined);
  assert.equal(kv.get(MAID_SETTINGS_STORE_KEY).lastRequestPrompt, 'system:\nsecret prompt');
  assert.equal(store.getLastRequestPrompt(), 'system:\nsecret prompt');
  assert.equal(store.getLastAppContext(), '检索：已执行');
  assert.equal(store.getLastFullResponse(), 'raw response');

  now = 1200;
  const restored = new MaidSettingsStore({
    storage,
    loadKv: async key => kv.get(key) || null,
    saveKv: async (key, value) => {
      kv.set(key, JSON.parse(JSON.stringify(value)));
    },
    now: () => now,
  });
  await restored.load();
  assert.equal(restored.getBoundProfileId(), 'profile-a');
  assert.equal(restored.getMaidPrompt(), '稳重女仆 2');
  assert.equal(restored.getPersonaPrompt(), '稳重女仆 2');
  assert.equal(restored.getLastRequestPrompt(), 'system:\nsecret prompt');
  assert.equal(restored.getLastAppContext(), '检索：已执行');
  assert.equal(restored.getLastFullResponse(), 'raw response');
  console.log('ok - MaidSettingsStore persists explicit maid binding and debug exchange to KV and local backup');
}

{
  const storage = createStorage();
  const kv = new Map([
    [MAID_SETTINGS_STORE_KEY, {
      version: 1,
      updatedAt: 3000,
      boundProfileId: 'profile-kv',
      maidPrompt: 'kv maid',
    }],
  ]);
  storage.setItem(MAID_SETTINGS_STORE_KEY, JSON.stringify({
    version: 1,
    updatedAt: 2000,
    boundProfileId: 'profile-local',
    maidPrompt: 'local maid',
  }));
  const restored = new MaidSettingsStore({
    storage,
    loadKv: async key => kv.get(key) || null,
    saveKv: async (key, value) => {
      kv.set(key, JSON.parse(JSON.stringify(value)));
    },
    now: () => 4000,
  });
  await restored.load();
  assert.equal(restored.getBoundProfileId(), 'profile-kv');
  assert.equal(restored.getMaidPrompt(), 'kv maid');
  assert.match(storage.backing.get(MAID_SETTINGS_STORE_KEY), /profile-kv/);
  console.log('ok - MaidSettingsStore restores newer KV binding over local backup');
}

{
  const storage = createStorage();
  const kv = new Map();
  storage.setItem(MAID_SETTINGS_STORE_KEY, JSON.stringify({
    version: 1,
    updatedAt: 5000,
    boundProfileId: 'profile-local-only',
    personaPrompt: 'legacy local',
  }));
  const restored = new MaidSettingsStore({
    storage,
    loadKv: async key => kv.get(key) || null,
    saveKv: async (key, value) => {
      kv.set(key, JSON.parse(JSON.stringify(value)));
    },
    now: () => 6000,
  });
  await restored.load();
  assert.equal(restored.getBoundProfileId(), 'profile-local-only');
  assert.equal(kv.get(MAID_SETTINGS_STORE_KEY).boundProfileId, 'profile-local-only');
  assert.equal(kv.get(MAID_SETTINGS_STORE_KEY).maidPrompt, 'legacy local');
  console.log('ok - MaidSettingsStore migrates local-only binding into KV');
}

{
  const storage = createStorage();
  const kv = new Map([
    [MAID_SETTINGS_STORE_KEY, {
      version: 1,
      updatedAt: 8000,
      boundProfileId: '',
      maidPrompt: 'new prompt only',
    }],
  ]);
  storage.setItem(MAID_SETTINGS_STORE_KEY, JSON.stringify({
    version: 1,
    updatedAt: 7000,
    boundProfileId: 'profile-local-bound',
  }));
  const restored = new MaidSettingsStore({
    storage,
    loadKv: async key => kv.get(key) || null,
    saveKv: async (key, value) => {
      kv.set(key, JSON.parse(JSON.stringify(value)));
    },
    now: () => 9000,
  });
  await restored.load();
  assert.equal(restored.getBoundProfileId(), 'profile-local-bound');
  assert.equal(restored.getMaidPrompt(), 'new prompt only');
  assert.equal(kv.get(MAID_SETTINGS_STORE_KEY).boundProfileId, 'profile-local-bound');
  assert.equal(kv.get(MAID_SETTINGS_STORE_KEY).maidPrompt, 'new prompt only');
  console.log('ok - MaidSettingsStore merges prompt-only KV with older local binding');
}
