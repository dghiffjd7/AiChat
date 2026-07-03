import assert from 'node:assert/strict';

import {
  AGENT_TOOL_SAFETY_ALLOW_STORAGE_KEY,
  buildAgentToolSafetyAllowKey,
  createAgentToolSafetyAllowStore,
} from '../../src/scripts/agent/agent-tool-safety-allow-store.js';

const createMemoryStorage = (initial = {}) => {
  const data = new Map(Object.entries(initial));
  return {
    getItem: key => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: key => data.delete(key),
    dump: () => Object.fromEntries(data.entries()),
  };
};

{
  const request = {
    toolName: 'worldbook.create',
    kind: 'worldbook.replace',
    operationType: 'replace_existing',
  };
  assert.equal(
    buildAgentToolSafetyAllowKey(request),
    'worldbook.create|worldbook.replace|replace_existing',
  );
  assert.equal(buildAgentToolSafetyAllowKey({ toolName: 'a', operationType: 'b' }), 'a|b');
  assert.equal(buildAgentToolSafetyAllowKey({}), '');
  console.log('ok - agent tool safety allow keys are scoped by tool, kind, and operation');
}

{
  const storage = createMemoryStorage();
  const nowValues = [1000, 2000, 3000];
  const store = createAgentToolSafetyAllowStore({
    storage,
    now: () => nowValues.shift() || 4000,
  });
  const request = {
    toolName: 'worldbook.create',
    kind: 'worldbook.replace',
    operationType: 'replace_existing',
    title: 'Replace worldbook',
    source: 'maid-app-content',
    riskLevel: 'medium',
  };
  assert.equal(store.isAllowed(request), false);
  const rule = store.allowAlways(request);
  assert.equal(rule.key, 'worldbook.create|worldbook.replace|replace_existing');
  assert.equal(store.isAllowed(request), true);
  assert.equal(store.isAllowed({ ...request, kind: 'persona.avatar.replace' }), false);
  assert.deepEqual(store.list().map(entry => entry.key), [rule.key]);

  const reloaded = createAgentToolSafetyAllowStore({ storage });
  assert.equal(reloaded.isAllowed(request), true);
  console.log('ok - agent tool safety allow store persists always-allowed rules');
}

{
  const storage = createMemoryStorage({
    [AGENT_TOOL_SAFETY_ALLOW_STORAGE_KEY]: '{invalid',
  });
  const store = createAgentToolSafetyAllowStore({ storage, now: () => 5000 });
  assert.deepEqual(store.list(), []);
  const request = {
    toolName: 'session.set_wallpaper',
    kind: 'session.wallpaper.replace',
    operationType: 'replace_existing',
  };
  store.allowAlways(request);
  assert.equal(store.isAllowed(request), true);
  console.log('ok - agent tool safety allow store tolerates invalid persisted data');
}

{
  const store = createAgentToolSafetyAllowStore({ storage: null, now: () => 6000 });
  const request = {
    toolName: 'persona.set_avatar',
    kind: 'persona.avatar.replace',
    operationType: 'replace_existing',
  };
  store.allowAlways(request);
  assert.equal(store.isAllowed(request), true);
  store.clear();
  assert.equal(store.isAllowed(request), false);
  console.log('ok - agent tool safety allow store works without browser storage');
}

{
  const store = createAgentToolSafetyAllowStore({ storage: null, now: () => 7000 });
  const keep = {
    toolName: 'persona.set_avatar',
    kind: 'persona.avatar.replace',
    operationType: 'replace_existing',
  };
  const target = {
    toolName: 'worldbook.delete_entries',
    kind: 'worldbook.delete',
    operationType: 'write',
  };
  store.allowAlways(keep);
  const rule = store.allowAlways(target);
  assert.equal(store.revoke(rule.key), true);
  assert.equal(store.isAllowed(target), false);
  assert.equal(store.isAllowed(keep), true, '撤销单条规则不应影响其他规则');
  assert.equal(store.revoke(rule.key), false, '重复撤销应返回 false');
  assert.equal(store.revoke(''), false);
  console.log('ok - agent tool safety allow store revokes single rules');
}
