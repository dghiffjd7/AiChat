import assert from 'node:assert/strict';

import {
  VoiceRegistryStore,
  normalizeVoiceRecord,
  normalizeVoiceRegistry,
} from '../../src/scripts/storage/voice-registry-store.js';

{
  const record = normalizeVoiceRecord({
    id: ' voice-serena ',
    label: ' Serena ',
    configRef: { scope: 'voice_shared', profileId: ' profile-a ' },
    providerSnapshot: ' QWEN_LOCAL ',
    voiceId: ' Serena ',
    modelOverride: ' model-a ',
    apiKey: 'must-never-persist',
  });
  assert.deepEqual(record, {
    id: 'voice-serena',
    label: 'Serena',
    configRef: { scope: 'voice_shared', profileId: 'profile-a' },
    providerSnapshot: 'qwen_local',
    voiceId: 'Serena',
    modelOverride: 'model-a',
  });
  assert.equal('apiKey' in record, false);
  console.log('ok - voice registry records persist references and never credentials');
}

{
  const values = new Map();
  const storage = {
    getItem: key => values.get(key) || null,
    setItem: (key, value) => values.set(key, String(value)),
  };
  let releaseLoad;
  const loaded = new Promise(resolve => { releaseLoad = resolve; });
  const saves = [];
  const store = new VoiceRegistryStore({
    storage,
    loadKv: async () => loaded,
    saveKv: async (name, data) => saves.push([name, data]),
  });
  let notifications = 0;
  store.subscribe(() => { notifications += 1; });
  releaseLoad({
    version: 1,
    voices: [{
      id: 'disk-voice',
      label: 'Disk Voice',
      configRef: { scope: 'voice_tts', profileId: 'profile-a' },
      providerSnapshot: 'openai',
      voiceId: 'marin',
    }],
  });
  await store.ready;
  assert.equal(store.list()[0].id, 'disk-voice');
  assert.equal(notifications, 1);
  await store.upsert({
    label: 'Serena',
    configRef: { scope: 'voice_shared', profileId: 'profile-b' },
    providerSnapshot: 'qwen_local',
    voiceId: 'Serena',
    apiKey: 'must-never-persist',
  });
  assert.equal(saves.length, 1);
  assert.equal(JSON.stringify(saves[0][1]).includes('must-never-persist'), false);
  assert.equal(notifications, 2);
  console.log('ok - voice registry hydrates from KV, notifies consumers, and persists sanitized entries');
}

{
  const storage = { value: '', getItem() { return this.value || null; }, setItem(_key, value) { this.value = value; } };
  const store = new VoiceRegistryStore({
    storage,
    loadKv: async () => null,
    saveKv: async () => { throw new Error('disk unavailable'); },
  });
  await store.ready;
  await assert.rejects(() => store.upsert({
    label: 'Rollback',
    configRef: { scope: 'voice_tts', profileId: 'profile-a' },
    providerSnapshot: 'openai',
    voiceId: 'marin',
  }), /disk unavailable/);
  assert.deepEqual(store.list(), []);
  assert.deepEqual(JSON.parse(storage.value).voices, []);
  console.log('ok - voice registry rolls back memory and local cache when authoritative KV save fails');
}

{
  const registry = normalizeVoiceRegistry({
    version: 99,
    voices: [
      { id: 'a', label: 'A', configRef: { scope: 'voice_tts', profileId: 'p1' }, providerSnapshot: 'openai', voiceId: 'v1' },
      { id: 'a', label: 'duplicate', configRef: { scope: 'voice_tts', profileId: 'p2' }, providerSnapshot: 'openai', voiceId: 'v2' },
      { id: 'bad-scope', configRef: { scope: 'voice_stt', profileId: 'p3' }, providerSnapshot: 'openai', voiceId: 'v3' },
      { id: 'missing-provider', configRef: { scope: 'voice_tts', profileId: 'p4' }, voiceId: 'v4' },
    ],
  });
  assert.equal(registry.version, 1);
  assert.equal(registry.voices.length, 1);
  assert.equal(registry.voices[0].id, 'a');
  console.log('ok - voice registry rejects duplicate and non-TTS configuration references');
}

{
  const { VOICE_USAGE_STORE_KEY, readVoiceUsage, markVoiceUsed, listQuickVoices } = await import('../../src/scripts/storage/voice-registry-store.js');
  const makeStorage = () => {
    const map = new Map();
    return {
      getItem: key => (map.has(key) ? map.get(key) : null),
      setItem: (key, value) => map.set(key, String(value)),
    };
  };
  const storage = makeStorage();
  assert.deepEqual(readVoiceUsage(storage), {});
  assert.equal(markVoiceUsed('voice_a', { storage, now: 100 }), true);
  assert.equal(markVoiceUsed('voice_b', { storage, now: 300 }), true);
  assert.equal(markVoiceUsed('', { storage }), false);
  assert.deepEqual(readVoiceUsage(storage), { voice_a: 100, voice_b: 300 });

  const broken = makeStorage();
  broken.setItem(VOICE_USAGE_STORE_KEY, '{invalid');
  assert.deepEqual(readVoiceUsage(broken), {});

  const voices = [
    { id: 'voice_a', label: 'A' },
    { id: 'voice_b', label: 'B' },
    { id: 'voice_c', label: 'C' },
    { id: 'voice_d', label: 'D' },
  ];
  // 最近使用优先，未使用的按库内顺序补位
  assert.deepEqual(
    listQuickVoices(voices, { voice_a: 100, voice_b: 300 }, { limit: 3 }).map(v => v.id),
    ['voice_b', 'voice_a', 'voice_c'],
  );
  assert.deepEqual(listQuickVoices(voices, {}, { limit: 3 }).map(v => v.id), ['voice_a', 'voice_b', 'voice_c']);
  assert.deepEqual(listQuickVoices([], { voice_a: 1 }, { limit: 3 }), []);
  console.log('ok - voice usage bookkeeping and quick-slot ordering are deterministic');
}
