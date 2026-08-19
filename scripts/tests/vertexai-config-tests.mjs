import assert from 'node:assert/strict';

const createLocalStorage = () => {
  const values = new Map();
  return {
    values,
    getItem: key => (values.has(String(key)) ? values.get(String(key)) : null),
    setItem: (key, value) => values.set(String(key), String(value)),
    removeItem: key => values.delete(String(key)),
  };
};

const previousStorage = globalThis.localStorage;
const previousTauri = globalThis.__TAURI__;
const local = createLocalStorage();
globalThis.localStorage = local;
delete globalThis.__TAURI__;

try {
  const { ConfigManager } = await import('../../src/scripts/storage/config.js');
  const scope = `vertex_config_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const manager = new ConfigManager({ scope });
  await manager.ensureStores();
  await manager.createProfile('Vertex Full', {
    provider: 'vertexai',
    baseUrl: 'https://aiplatform.googleapis.com',
    model: 'gemini-2.5-flash',
    vertexaiAuthMode: 'service_account',
    vertexaiRegion: 'global',
  });

  const serviceAccount = JSON.stringify({
    type: 'service_account',
    project_id: 'vertex-project',
    client_email: 'vertex@example.com',
    private_key: 'private-key-material',
  });
  await manager.save({
    provider: 'vertexai',
    baseUrl: 'https://aiplatform.googleapis.com',
    model: 'gemini-2.5-flash',
    vertexaiAuthMode: 'service_account',
    vertexaiRegion: 'global',
    vertexaiServiceAccount: serviceAccount,
  });

  assert.equal(manager.get().vertexaiAuthMode, 'service_account');
  assert.equal(manager.get().vertexaiServiceAccount, serviceAccount);
  assert.equal(manager.getActiveProfile().vertexaiServiceAccount, undefined);
  assert.equal(
    [...local.values.values()].some(value => String(value).includes('private-key-material')),
    false,
    'service account plaintext must not be persisted',
  );

  const reloaded = new ConfigManager({ scope });
  const runtime = await reloaded.load();
  assert.equal(runtime.vertexaiAuthMode, 'service_account');
  assert.equal(runtime.vertexaiServiceAccount, serviceAccount);

  const legacyScope = `${scope}_legacy`;
  const profileStoreKey = `llm_profiles_${legacyScope}_v1`;
  local.setItem(profileStoreKey, JSON.stringify({
    activeProfileId: 'legacy-vertex',
    savedAt: 1,
    profiles: {
      'legacy-vertex': {
        id: 'legacy-vertex',
        name: 'Legacy Vertex',
        provider: 'vertexai',
        baseUrl: 'https://us-central1-aiplatform.googleapis.com',
        model: 'gemini-2.5-flash',
        vertexaiRegion: 'us-central1',
        vertexaiServiceAccount: btoa(serviceAccount),
        _saEncrypted: true,
        createdAt: 1,
        updatedAt: 1,
      },
    },
  }));
  const legacyManager = new ConfigManager({ scope: legacyScope });
  const migrated = await legacyManager.load();
  assert.equal(migrated.vertexaiAuthMode, 'service_account');
  assert.equal(migrated.vertexaiServiceAccount, serviceAccount);
  assert.equal(legacyManager.getActiveProfile().vertexaiServiceAccount, undefined);
  assert.equal(String(local.getItem(profileStoreKey)).includes('private-key-material'), false);

  const expressLegacyScope = `${scope}_express_legacy`;
  const expressProfileStoreKey = `llm_profiles_${expressLegacyScope}_v1`;
  local.setItem(expressProfileStoreKey, JSON.stringify({
    activeProfileId: 'express-vertex',
    savedAt: 1,
    profiles: {
      'express-vertex': {
        id: 'express-vertex',
        name: 'Express Vertex',
        provider: 'vertexai',
        baseUrl: 'https://aiplatform.googleapis.com',
        model: 'gemini-3.5-flash',
        vertexaiAuthMode: 'express',
        vertexaiRegion: 'global',
        vertexaiServiceAccount: btoa(serviceAccount),
        _saEncrypted: true,
        createdAt: 1,
        updatedAt: 1,
      },
    },
  }));
  const expressLegacyManager = new ConfigManager({ scope: expressLegacyScope });
  const expressMigrated = await expressLegacyManager.load();
  assert.equal(expressMigrated.vertexaiAuthMode, 'express');
  assert.equal(expressLegacyManager.getActiveProfile().vertexaiServiceAccount, undefined);

  console.log('vertexai-config-tests passed');
} finally {
  if (previousStorage === undefined) delete globalThis.localStorage;
  else globalThis.localStorage = previousStorage;
  if (previousTauri === undefined) delete globalThis.__TAURI__;
  else globalThis.__TAURI__ = previousTauri;
}
