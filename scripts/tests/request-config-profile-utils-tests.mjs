import assert from 'node:assert/strict';
import {
  normalizeRequestConfigUiMode,
  resolveRequestConfigProfileId,
} from '../../src/scripts/ui/chat/request-config-profile-utils.js';

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

const makePresetStore = ({
  sessions = {},
  modes = {},
} = {}) => ({
  getSessionProfileId(type, sessionId) {
    assert.equal(type, 'openai');
    return sessions[sessionId] || '';
  },
  getModeProfileId(type, mode) {
    assert.equal(type, 'openai');
    return modes[mode] || '';
  },
});

test('normalizes creative writing aliases to rp', () => {
  assert.equal(normalizeRequestConfigUiMode('creative'), 'rp');
  assert.equal(normalizeRequestConfigUiMode('', { sessionId: 'rp:abc' }), 'rp');
  assert.equal(normalizeRequestConfigUiMode('dynamic'), 'moments');
  assert.equal(normalizeRequestConfigUiMode('', { taskType: 'moment_comment' }), 'moments');
});

test('session profile overrides mode default profile', () => {
  const store = makePresetStore({
    sessions: { 'rp:1': 'session-claude' },
    modes: { rp: 'mode-gemini' },
  });
  assert.deepEqual(resolveRequestConfigProfileId({
    presetStore: store,
    sessionId: 'rp:1',
    uiMode: 'creative',
  }), {
    profileId: 'session-claude',
    source: 'session',
    sessionId: 'rp:1',
    uiMode: 'rp',
  });
});

test('mode profile is used when session has no explicit profile', () => {
  const store = makePresetStore({
    modes: { rp: 'mode-claude', chat: 'mode-gemini' },
  });
  assert.deepEqual(resolveRequestConfigProfileId({
    presetStore: store,
    sessionId: 'rp:2',
    uiMode: '',
  }), {
    profileId: 'mode-claude',
    source: 'mode',
    sessionId: 'rp:2',
    uiMode: 'rp',
  });
});

test('falls back to global profile when no binding exists', () => {
  assert.deepEqual(resolveRequestConfigProfileId({
    presetStore: makePresetStore(),
    sessionId: 'chat:1',
    uiMode: 'chat',
  }), {
    profileId: '',
    source: 'global',
    sessionId: 'chat:1',
    uiMode: 'chat',
  });
});

for (const { name, fn } of tests) {
  await fn();
  console.log(`ok - ${name}`);
}
