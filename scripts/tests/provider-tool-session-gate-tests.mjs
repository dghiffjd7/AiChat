import assert from 'node:assert/strict';

import {
  PROVIDER_TOOL_SESSION_GATE_SETTINGS_KEY,
  normalizeProviderToolSessionGate,
  readProviderToolSessionGate,
  writeProviderToolSessionGate,
} from '../../src/scripts/agent/provider-tool-session-gate.js';

const createChatStore = () => {
  const sessions = new Map();
  let current = 's1';
  return {
    getCurrent: () => current,
    setCurrent: value => {
      current = String(value || '').trim();
    },
    getSessionSettings: sessionId => ({ ...(sessions.get(sessionId) || {}) }),
    setSessionSettings: (sessionId, settings) => {
      sessions.set(sessionId, { ...(settings || {}) });
    },
    readRaw: sessionId => sessions.get(sessionId) || {},
  };
};

{
  const gate = normalizeProviderToolSessionGate(null, {
    sessionId: 's1',
    allowedTools: ['contact_profile.list'],
    now: () => 1000,
  });

  assert.equal(gate.sessionId, 's1');
  assert.equal(gate.enabled, false);
  assert.deepEqual(gate.allowedTools, ['contact_profile.list']);
  assert.equal(gate.networkAllowed, false);
  assert.equal(gate.realRunnerAllowed, false);
  assert.equal(gate.writesChat, false);
  assert.equal(gate.modelContextPolicy, 'allowlist_only');
  assert.equal(gate.nextRequiredAction, 'enable this session gate before provider tool execution');
  assert.equal(gate.rollback, 'disable providerToolSessionGate for this session');
  assert.equal(gate.now, 1000);
  console.log('ok - normalizeProviderToolSessionGate defaults to disabled safe gate');
}

{
  const chatStore = createChatStore();
  const gate = readProviderToolSessionGate({
    chatStore,
    allowedTools: ['contact_profile.list'],
    now: () => 1001,
  });

  assert.equal(gate.sessionId, 's1');
  assert.equal(gate.enabled, false);
  assert.deepEqual(gate.allowedTools, ['contact_profile.list']);
  assert.equal(gate.source, 'session_settings');
  console.log('ok - readProviderToolSessionGate uses current session and safe defaults');
}

{
  const chatStore = createChatStore();
  const first = writeProviderToolSessionGate({
    chatStore,
    sessionId: 's1',
    enabled: true,
    allowedTools: ['contact_profile.list'],
    source: 'test',
    reason: 'enable for bridge smoke',
    now: () => 2000,
  });

  assert.equal(first.enabled, true);
  assert.equal(first.source, 'test');
  assert.equal(first.reason, 'enable for bridge smoke');
  assert.equal(first.createdAt, 2000);
  assert.equal(first.updatedAt, 2000);
  assert.equal(first.nextRequiredAction, 'permission rule still required per tool call');

  const raw = chatStore.readRaw('s1')[PROVIDER_TOOL_SESSION_GATE_SETTINGS_KEY];
  assert.deepEqual(raw, {
    enabled: true,
    allowedTools: ['contact_profile.list'],
    modelContextPolicy: 'allowlist_only',
    networkAllowed: false,
    realRunnerAllowed: false,
    writesChat: false,
    source: 'test',
    reason: 'enable for bridge smoke',
    createdAt: 2000,
    updatedAt: 2000,
  });

  const second = writeProviderToolSessionGate({
    chatStore,
    sessionId: 's1',
    enabled: false,
    allowedTools: ['contact_profile.list'],
    source: 'test',
    reason: 'disable after smoke',
    now: () => 2500,
  });

  assert.equal(second.enabled, false);
  assert.equal(second.createdAt, 2000);
  assert.equal(second.updatedAt, 2500);
  assert.equal(second.nextRequiredAction, 'enable this session gate before provider tool execution');
  console.log('ok - writeProviderToolSessionGate persists reversible session settings');
}

{
  const gate = writeProviderToolSessionGate({
    chatStore: null,
    sessionId: 's1',
    enabled: true,
    allowedTools: ['contact_profile.list'],
    now: () => 3000,
  });

  assert.equal(gate.enabled, false);
  assert.equal(gate.source, 'unavailable');
  assert.equal(gate.reason, 'chat store session settings unavailable');
  console.log('ok - writeProviderToolSessionGate fails closed without chat store settings API');
}
