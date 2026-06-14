import assert from 'node:assert/strict';

import {
  AGENT_FEATURE_IDS,
  AGENT_FEATURE_TRIGGER_MODES,
  buildAgentFeatureList,
  createAgentFeatureSettingsStore,
  isAgentFeatureEnabled,
  mergeAgentFeatureSettings,
  normalizeAgentFeatureSettings,
  readAgentFeatureSettings,
  readAgentFeatureSettingsKv,
  setAgentFeatureEnabled,
  setAgentFeatureModel,
  setAgentFeatureTriggerMode,
  writeAgentFeatureSettingsKv,
  writeAgentFeatureSettings,
} from '../../src/scripts/agent/agent-feature-settings.js';

const createStorage = () => {
  const data = new Map();
  return {
    getItem: key => data.get(key) || null,
    setItem: (key, value) => data.set(key, String(value)),
  };
};

{
  const settings = normalizeAgentFeatureSettings();
  assert.equal(settings.features[AGENT_FEATURE_IDS.replyCheck].enabled, false);
  assert.equal(settings.features[AGENT_FEATURE_IDS.writePreview].enabled, false);
  assert.equal(settings.features[AGENT_FEATURE_IDS.textCompletion].enabled, false);
  assert.equal(settings.features[AGENT_FEATURE_IDS.replyCheck].modelMode, 'none');
  assert.equal(settings.features[AGENT_FEATURE_IDS.replyCheck].triggerMode, AGENT_FEATURE_TRIGGER_MODES.auto);
  assert.equal(settings.features[AGENT_FEATURE_IDS.writePreview].modelMode, 'none');
  console.log('ok - agent feature settings default every user-facing agent to disabled');
}

{
  const settings = setAgentFeatureEnabled({}, AGENT_FEATURE_IDS.replyCheck, true, { now: () => 123 });
  assert.equal(isAgentFeatureEnabled(settings, AGENT_FEATURE_IDS.replyCheck), true);
  assert.equal(settings.features[AGENT_FEATURE_IDS.replyCheck].updatedAt, 123);
  const unchanged = setAgentFeatureEnabled(settings, 'unknown_agent', true, { now: () => 456 });
  assert.equal(unchanged.features.unknown_agent, undefined);
  assert.equal(unchanged.features[AGENT_FEATURE_IDS.replyCheck].updatedAt, 123);
  console.log('ok - agent feature settings toggles known agents without accepting unknown ids');
}

{
  const settings = setAgentFeatureModel({}, AGENT_FEATURE_IDS.replyCheck, {
    modelMode: 'profile',
    modelProfileId: 'profile-a',
  }, { now: () => 456 });
  assert.equal(settings.features[AGENT_FEATURE_IDS.replyCheck].modelMode, 'profile');
  assert.equal(settings.features[AGENT_FEATURE_IDS.replyCheck].modelProfileId, 'profile-a');
  assert.equal(settings.features[AGENT_FEATURE_IDS.replyCheck].updatedAt, 456);
  const next = setAgentFeatureModel(settings, AGENT_FEATURE_IDS.replyCheck, {
    modelMode: 'none',
  }, { now: () => 789 });
  assert.equal(next.features[AGENT_FEATURE_IDS.replyCheck].modelMode, 'none');
  assert.equal(next.features[AGENT_FEATURE_IDS.replyCheck].modelProfileId, '');
  console.log('ok - agent feature settings updates model mode and profile');
}

{
  const settings = setAgentFeatureTriggerMode({}, AGENT_FEATURE_IDS.replyCheck, AGENT_FEATURE_TRIGGER_MODES.manualOnly, { now: () => 654 });
  assert.equal(settings.features[AGENT_FEATURE_IDS.replyCheck].triggerMode, AGENT_FEATURE_TRIGGER_MODES.manual);
  assert.equal(settings.features[AGENT_FEATURE_IDS.replyCheck].updatedAt, 654);
  const next = setAgentFeatureTriggerMode(settings, AGENT_FEATURE_IDS.replyCheck, 'unknown', { now: () => 777 });
  assert.equal(next.features[AGENT_FEATURE_IDS.replyCheck].triggerMode, AGENT_FEATURE_TRIGGER_MODES.manual);
  console.log('ok - agent feature settings updates trigger mode');
}

{
  const settings = normalizeAgentFeatureSettings({
    features: {
      [AGENT_FEATURE_IDS.replyCheck]: { triggerMode: 'local_only' },
    },
  });
  assert.equal(settings.features[AGENT_FEATURE_IDS.replyCheck].triggerMode, AGENT_FEATURE_TRIGGER_MODES.auto);
  console.log('ok - agent feature settings migrates legacy local-only trigger to automatic');
}

{
  const storage = createStorage();
  const written = writeAgentFeatureSettings(
    setAgentFeatureEnabled({}, AGENT_FEATURE_IDS.writePreview, true, { now: () => 222 }),
    { storage },
  );
  const read = readAgentFeatureSettings({ storage });
  assert.deepEqual(read, written);
  assert.equal(read.features[AGENT_FEATURE_IDS.writePreview].enabled, true);
  console.log('ok - agent feature settings read and write local storage snapshots');
}

{
  const local = setAgentFeatureEnabled({}, AGENT_FEATURE_IDS.replyCheck, true, { now: () => 100 });
  const disk = setAgentFeatureEnabled({}, AGENT_FEATURE_IDS.replyCheck, false, { now: () => 200 });
  const merged = mergeAgentFeatureSettings(local, disk);
  assert.equal(merged.features[AGENT_FEATURE_IDS.replyCheck].enabled, false);
  assert.equal(merged.features[AGENT_FEATURE_IDS.replyCheck].updatedAt, 200);
  console.log('ok - agent feature settings merge keeps latest feature state');
}

{
  const calls = [];
  const disk = setAgentFeatureEnabled({}, AGENT_FEATURE_IDS.replyCheck, true, { now: () => 300 });
  const read = await readAgentFeatureSettingsKv({
    loadKv: async (cmd, args) => {
      calls.push([cmd, args.name]);
      return disk;
    },
  });
  assert.equal(read.features[AGENT_FEATURE_IDS.replyCheck].enabled, true);
  const saved = await writeAgentFeatureSettingsKv(read, {
    saveKv: async (cmd, args) => {
      calls.push([cmd, args.name, args.data.features[AGENT_FEATURE_IDS.replyCheck].enabled]);
    },
  });
  assert.equal(saved, true);
  assert.deepEqual(calls, [
    ['load_kv', 'agent_feature_settings_v1'],
    ['save_kv', 'agent_feature_settings_v1', true],
  ]);
  console.log('ok - agent feature settings read and write Tauri KV snapshots');
}

{
  const store = createAgentFeatureSettingsStore({ storage: createStorage() });
  assert.equal(store.isEnabled(AGENT_FEATURE_IDS.replyCheck), false);
  store.setEnabled(AGENT_FEATURE_IDS.replyCheck, true, { now: () => 333 });
  store.setModel(AGENT_FEATURE_IDS.replyCheck, { modelMode: 'none' }, { now: () => 444 });
  store.setTriggerMode(AGENT_FEATURE_IDS.replyCheck, AGENT_FEATURE_TRIGGER_MODES.manual, { now: () => 555 });
  assert.equal(store.isEnabled(AGENT_FEATURE_IDS.replyCheck), true);
  assert.equal(store.getSettings().features[AGENT_FEATURE_IDS.replyCheck].updatedAt, 555);
  assert.equal(store.getSettings().features[AGENT_FEATURE_IDS.replyCheck].modelMode, 'none');
  assert.equal(store.getSettings().features[AGENT_FEATURE_IDS.replyCheck].triggerMode, AGENT_FEATURE_TRIGGER_MODES.manual);
  assert.equal(store.listFeatures().find(item => item.id === AGENT_FEATURE_IDS.replyCheck).enabled, true);
  console.log('ok - agent feature settings store exposes list and toggle helpers');
}

{
  const storage = createStorage();
  const disk = setAgentFeatureEnabled({}, AGENT_FEATURE_IDS.replyCheck, true, { now: () => 333 });
  const saved = [];
  const store = createAgentFeatureSettingsStore({
    storage,
    loadKv: async () => disk,
    saveKv: async (cmd, args) => saved.push([cmd, args.name, args.data.features[AGENT_FEATURE_IDS.replyCheck].enabled]),
  });
  await store.hydrate();
  assert.equal(store.isEnabled(AGENT_FEATURE_IDS.replyCheck), true);
  store.setEnabled(AGENT_FEATURE_IDS.replyCheck, false, { now: () => 444 });
  await store.flush();
  assert.deepEqual(saved, [
    ['save_kv', 'agent_feature_settings_v1', true],
    ['save_kv', 'agent_feature_settings_v1', false],
  ]);
  console.log('ok - agent feature settings store hydrates from KV and persists changes');
}

{
  const list = buildAgentFeatureList({
    features: {
      [AGENT_FEATURE_IDS.textCompletion]: { enabled: true, modelMode: 'profile', modelProfileId: 'profile-a' },
    },
  });
  const replyCheck = list.find(item => item.id === AGENT_FEATURE_IDS.replyCheck);
  const textCompletion = list.find(item => item.id === AGENT_FEATURE_IDS.textCompletion);
  assert.equal(replyCheck.title, '检查回复格式');
  assert.match(replyCheck.summary, /格式问题/);
  assert.equal(replyCheck.state.triggerMode, AGENT_FEATURE_TRIGGER_MODES.auto);
  assert.equal(replyCheck.state.modelMode, 'none');
  assert.equal(textCompletion.title, '文本补全');
  assert.equal(textCompletion.enabled, true);
  assert.equal(textCompletion.state.modelMode, 'profile');
  assert.equal(textCompletion.state.modelProfileId, 'profile-a');
  assert.equal(textCompletion.implemented, false);
  console.log('ok - agent feature list merges product copy with saved state');
}
