import assert from 'node:assert/strict';

import {
  bindImportedPresetToSession,
  buildRestoredPresetUpsertPayload,
  findPresetIdByName,
  getImportedPresetName,
  resolveImportedPresetIdByName,
} from '../../src/scripts/ui/preset-import-dedupe-utils.js';

{
  assert.equal(
    getImportedPresetName({
      presetPayload: { name: '  Default   Chat  ', data: { name: 'Ignored' } },
      type: 'context',
    }),
    'Default Chat',
  );
  assert.equal(getImportedPresetName({ presetPayload: { data: { name: ' Data Name ' } } }), 'Data Name');
  assert.equal(getImportedPresetName({ type: 'reasoning' }), 'reasoning');
  console.log('ok - imported preset names prefer source names and normalize whitespace');
}

{
  const presetStore = {
    getState: () => ({
      presets: {
        context: {
          preset_context_default: { name: ' Default ' },
        },
        sysprompt: {
          preset_sysprompt_default: { name: 'Default' },
        },
      },
    }),
  };
  assert.equal(
    findPresetIdByName({ presetStore, type: 'context', presetName: 'default' }),
    'preset_context_default',
  );
  assert.equal(
    findPresetIdByName({ presetStore, type: 'sysprompt', presetName: 'default' }),
    'preset_sysprompt_default',
  );
  console.log('ok - imported preset lookup dedupes by type and normalized name');
}

{
  let upsertCount = 0;
  const presetStore = {
    getState: () => ({
      presets: {
        context: {
          preset_context_default: { name: 'Default' },
        },
      },
    }),
    upsert: async () => {
      upsertCount += 1;
      return 'should-not-create';
    },
  };
  const presetId = await resolveImportedPresetIdByName({
    presetStore,
    type: 'context',
    presetPayload: { name: 'default', data: { name: 'default' } },
    cache: new Map(),
  });
  assert.equal(presetId, 'preset_context_default');
  assert.equal(upsertCount, 0);
  console.log('ok - imported preset resolver reuses existing same-name presets');
}

{
  let nextIndex = 1;
  const upserts = [];
  const presetStore = {
    getState: () => ({ presets: { openai: {} } }),
    upsert: async (type, payload) => {
      upserts.push({ type, payload });
      return `created-${nextIndex++}`;
    },
  };
  const cache = new Map();
  const firstId = await resolveImportedPresetIdByName({
    presetStore,
    type: 'openai',
    presetPayload: { name: 'Model', data: { temperature: 0.7 } },
    cache,
  });
  const secondId = await resolveImportedPresetIdByName({
    presetStore,
    type: 'openai',
    presetPayload: { name: ' Model ', data: { temperature: 0.9 } },
    cache,
  });
  assert.equal(firstId, 'created-1');
  assert.equal(secondId, 'created-1');
  assert.equal(upserts.length, 1);
  assert.deepEqual(upserts[0], {
    type: 'openai',
    payload: {
      name: 'Model',
      data: { temperature: 0.7 },
      appScope: 'creative',
      makeActive: false,
    },
  });
  console.log('ok - imported preset resolver caches same-name presets during one package import');
}

{
  const upserts = [];
  const presetStore = {
    getState: () => ({
      presets: {
        openai: {
          existing: { name: 'Shared Model', app_scope: 'creative' },
        },
      },
    }),
    upsert: async (type, payload) => {
      upserts.push({ type, payload });
      return 'restored-all';
    },
  };
  const presetId = await resolveImportedPresetIdByName({
    presetStore,
    type: 'openai',
    presetPayload: { name: 'Shared Model', data: { temperature: 0.8 } },
    requiredAppScope: 'all',
    upsertPayloadBuilder: buildRestoredPresetUpsertPayload,
  });
  assert.equal(presetId, 'restored-all');
  assert.equal(upserts.length, 1);
  assert.equal(upserts[0].payload.appScope, 'all');
  console.log('ok - room restore never reuses a same-name creative-only preset for chat binding');
}

{
  const bindings = { sessions: {} };
  const presetStore = {
    setSessionBinding: async (_type, sessionId, presetId) => {
      bindings.sessions[sessionId] = presetId;
      return bindings;
    },
    getSessionBindingId: (_type, sessionId) => bindings.sessions[sessionId] || null,
  };
  const bound = await bindImportedPresetToSession({
    presetStore,
    type: 'openai',
    sessionId: 'chat-a',
    presetId: 'restored-all',
  });
  assert.deepEqual(bound, {
    ok: true,
    reason: '',
    actualPresetId: 'restored-all',
  });

  presetStore.setSessionBinding = async () => bindings;
  const rejected = await bindImportedPresetToSession({
    presetStore,
    type: 'openai',
    sessionId: 'chat-b',
    presetId: 'creative-only',
  });
  assert.equal(rejected.ok, false);
  assert.equal(rejected.reason, 'preset_session_binding_rejected');
  console.log('ok - restored preset bindings are verified instead of treating a silent no-op as success');
}
