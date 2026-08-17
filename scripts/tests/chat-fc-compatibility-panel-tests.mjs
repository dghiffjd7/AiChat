import assert from 'node:assert/strict';

globalThis.localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};

const {
  buildChatFcLocalRuleFromProfile,
  getChatFcLocalRuleIdentityKey,
} = await import(
  '../../src/scripts/agent/chat-fc-local-capability-rules.js'
);
const {
  ChatFcCompatibilityPanel,
  formatChatStructuredEvidenceCellForPanel,
  isChatStructuredEvidenceCoveredByZeroWriteRule,
} = await import(
  '../../src/scripts/ui/chat-fc-compatibility-panel.js'
);

const oldProfile = {
  id: 'profile-same-id',
  name: '本地设置档',
  provider: 'custom',
  baseUrl: 'https://relay.example.test/v1',
  model: 'vendor/model-a',
};
const currentProfile = {
  ...oldProfile,
  model: 'vendor/model-b',
};
const existing = buildChatFcLocalRuleFromProfile(oldProfile, {
  enabled: false,
  lastTest: {
    status: 'passed',
    testedAt: 1786752000000,
    modelCallCount: 3,
  },
}).rule;

const makePanel = (profile, storedRule = existing) => {
  const fields = {
    '[data-fc-field="profile"]': { value: profile.id },
    '[data-fc-field="route"]': { value: '' },
    '[data-fc-field="name"]': { value: '本地规则' },
    '[data-fc-field="enabled"]': { checked: false },
  };
  const panel = new ChatFcCompatibilityPanel({
    configManager: {
      getProfileById: id => id === profile.id ? profile : null,
    },
    store: {
      list: () => [storedRule],
    },
  });
  panel.element = {
    querySelector: selector => fields[selector] || null,
  };
  return panel;
};

{
  const draft = makePanel(oldProfile).buildDraft({ enabled: false });
  assert.equal(draft.ok, true, draft.reason);
  assert.equal(draft.rule.evidence.lastTest.status, 'passed');
  console.log('ok - an unchanged exact identity retains its local zero-write evidence');
}

{
  const localRule = buildChatFcLocalRuleFromProfile(oldProfile, { enabled: true }).rule;
  const baseIdentity = {
    provider: 'custom',
    model: 'vendor/model-a',
    endpoint: 'local_custom_openai_chat_completions',
    adapter: 'openai_chat_completions',
    endpointIdentity: 'https://relay.example.test/v1',
    schemaProfile: 'phone.reply.ir.v1',
  };
  assert.equal(isChatStructuredEvidenceCoveredByZeroWriteRule({
    mode: 'provider_fc',
    identity: {
      ...baseIdentity,
      surface: 'private_chat',
      capabilitySet: ['basic_reply'],
    },
  }, localRule), true);
  assert.equal(isChatStructuredEvidenceCoveredByZeroWriteRule({
    mode: 'provider_fc',
    identity: {
      ...baseIdentity,
      surface: 'group_chat',
      capabilitySet: ['batch_terminal', 'basic_reply'],
    },
  }, localRule), true);
  assert.equal(isChatStructuredEvidenceCoveredByZeroWriteRule({
    mode: 'provider_fc',
    identity: {
      ...baseIdentity,
      surface: 'group_chat',
      capabilitySet: ['batch_terminal', 'basic_reply', 'table_edit'],
    },
  }, localRule), false);
  assert.equal(isChatStructuredEvidenceCoveredByZeroWriteRule({
    mode: 'json_terminal',
    identity: {
      ...baseIdentity,
      surface: 'private_chat',
      capabilitySet: ['basic_reply'],
    },
  }, localRule), false);
  console.log('ok - zero-write recovery only covers exact basic provider-FC evidence cells');
}

{
  const localRule = buildChatFcLocalRuleFromProfile(oldProfile, { enabled: false }).rule;
  const evidenceIdentity = {
    provider: 'custom',
    model: 'vendor/model-a',
    endpoint: 'local_custom_openai_chat_completions',
    adapter: 'openai_chat_completions',
    endpointIdentity: 'https://relay.example.test/v1',
    schemaProfile: 'phone.reply.ir.v1',
    surface: 'private_chat',
    capabilitySet: ['basic_reply'],
  };
  const armedModes = [];
  let savedRule = null;
  const fields = {
    '[data-fc-field="profile"]': { value: oldProfile.id },
    '[data-fc-field="route"]': { value: '' },
    '[data-fc-field="name"]': { value: '本地规则' },
    '[data-fc-field="enabled"]': { checked: false },
  };
  const panel = new ChatFcCompatibilityPanel({
    configManager: { getProfileById: () => oldProfile },
    store: {
      list: () => [savedRule || localRule],
      upsert: async rule => { savedRule = rule; },
    },
    evidenceStore: {
      list: () => [{
        mode: 'provider_fc',
        identity: evidenceIdentity,
        health: { circuitOpen: true, status: 'circuit_open' },
      }, {
        mode: 'provider_fc',
        identity: { ...evidenceIdentity, capabilitySet: ['basic_reply', 'table_edit'] },
        health: { circuitOpen: true, status: 'circuit_open' },
      }],
      armHalfOpen: async (_identity, mode) => {
        armedModes.push(mode);
        return true;
      },
    },
  });
  panel.element = { querySelector: selector => fields[selector] || null };
  panel.draftLastTests.set(getChatFcLocalRuleIdentityKey(localRule), {
    status: 'passed',
    testedAt: 1786752003000,
    modelCallCount: 3,
    reason: '',
  });
  await panel.saveDraftRule();
  assert.equal(savedRule?.evidence?.lastTest?.status, 'passed');
  assert.deepEqual(armedModes, ['provider_fc']);
  console.log('ok - saving a fresh passed test arms only the covered open v2 evidence cell for a real commit-gated retry');
}

{
  const draft = makePanel(currentProfile).buildDraft({ enabled: false });
  assert.equal(draft.ok, true, draft.reason);
  assert.equal(draft.rule.evidence.lastTest.status, 'not_run');
  console.log('ok - changing model or endpoint identity invalidates stale zero-write evidence');
}

{
  const circuitRule = buildChatFcLocalRuleFromProfile(oldProfile, {
    enabled: true,
    lastTest: existing.evidence.lastTest,
    health: {
      consecutiveDeterministicFailures: 2,
      circuitOpen: true,
      lastFailureReason: 'invalid_phone_reply_ir',
      lastFailureAt: 1786752001000,
      openedAt: 1786752001000,
    },
  }).rule;
  const panel = makePanel(oldProfile, circuitRule);
  assert.equal(panel.buildDraft({ enabled: false }).rule.health.circuitOpen, true);
  panel.draftLastTests.set(getChatFcLocalRuleIdentityKey(circuitRule), {
    status: 'passed',
    testedAt: 1786752002000,
    modelCallCount: 3,
    reason: '',
  });
  const recoveredDraft = panel.buildDraft({ enabled: true });
  assert.equal(recoveredDraft.ok, true, recoveredDraft.reason);
  assert.equal(recoveredDraft.rule.health.circuitOpen, false);
  assert.equal(recoveredDraft.rule.health.consecutiveDeterministicFailures, 0);
  assert.equal(recoveredDraft.rule.evidence.lastTest.status, 'passed');
  console.log('ok - only a fresh passed zero-write test prepares a circuit-open rule for manual save recovery');
}

{
  const view = formatChatStructuredEvidenceCellForPanel({
    key: 'cell-1',
    mode: 'json_terminal',
    identity: {
      provider: 'kimi',
      model: 'kimi-k3',
      endpoint: 'official_kimi_chat_completions',
      surface: 'private_chat',
      capabilitySet: ['basic_reply'],
    },
    health: {
      status: 'cooldown',
      strictSuccessCount: 7,
      deterministicFailureCount: 1,
      cooldownUntil: 3000,
    },
  }, { now: 2000 });
  assert.equal(view.modeLabel, 'JSON');
  assert.equal(view.statusLabel, '冷却中');
  assert.equal(view.providerModel, 'kimi · kimi-k3');
  assert.match(view.scope, /private_chat · basic_reply/);
  assert.match(view.cooldownLabel, /冷却至/);
  const drift = formatChatStructuredEvidenceCellForPanel({
    mode: 'provider_fc',
    health: { status: 'identity_drift' },
  });
  assert.equal(drift.statusLabel, '响应身份漂移');
  console.log('ok - advanced UI formats exact local evidence without model content or credentials');
}

console.log('chat-fc-compatibility-panel-tests passed');
