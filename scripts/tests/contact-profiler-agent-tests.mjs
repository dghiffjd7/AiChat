import assert from 'node:assert/strict';

import { createContactProfilerAgent } from '../../src/scripts/agent/contact-profiler-agent.js';
import { createAgentTaskRuntime } from '../../src/scripts/agent/agent-task-runtime.js';
import { normalizeContactProfile } from '../../src/scripts/memory/contact-profile-utils.js';
import { AgentRunStore } from '../../src/scripts/storage/agent-run-store.js';

const makeStore = (settings = {}) => {
  const profiles = new Map();
  const revisions = new Map();
  const pendingUpdates = [];
  const store = {
    scopeId: 'scope-a',
    scopeToken: 0,
    getSettings: () => ({ ...settings }),
    getProfile: contactId => profiles.get(String(contactId || '').trim()) || null,
    getProfileSnapshot: (contactId) => {
      const id = String(contactId || '').trim();
      const profile = profiles.get(id) || null;
      return {
        contactId: id,
        scopeId: store.scopeId,
        scopeToken: store.scopeToken,
        exists: Boolean(profile),
        revision: revisions.get(id) || 0,
        profile,
      };
    },
    upsertProfile: (profile) => {
      const normalized = normalizeContactProfile(profile);
      if (!normalized) return null;
      profiles.set(normalized.contactId, normalized);
      revisions.set(normalized.contactId, (revisions.get(normalized.contactId) || 0) + 1);
      return normalized;
    },
    upsertProfileIfUnchanged: (profile, expected = {}) => {
      const normalized = normalizeContactProfile(profile);
      if (!normalized) return { ok: false, saved: false, reason: 'missing_contact_id' };
      if (expected.scopeId !== store.scopeId || expected.scopeToken !== store.scopeToken) {
        return { ok: false, saved: false, conflict: true, reason: 'target_scope_changed' };
      }
      if ((revisions.get(normalized.contactId) || 0) !== expected.revision) {
        return { ok: false, saved: false, conflict: true, reason: 'profile_changed_during_operation' };
      }
      const saved = store.upsertProfile(normalized);
      return { ok: true, saved: true, profile: saved };
    },
    addPendingUpdate: (update) => {
      const saved = {
        id: `pending-${pendingUpdates.length + 1}`,
        ...update,
        profile: normalizeContactProfile(update.profile),
      };
      pendingUpdates.push(saved);
      return saved;
    },
    addPendingUpdateIfCurrent: (update, expected = {}) => {
      if (expected.scopeId !== store.scopeId || expected.scopeToken !== store.scopeToken) {
        return { ok: false, conflict: true, reason: 'target_scope_changed', pending: null };
      }
      const current = store.getProfileSnapshot(update.contactId);
      if (expected.revision !== current.revision || expected.exists !== current.exists) {
        return {
          ok: false,
          conflict: true,
          reason: 'profile_changed_during_operation',
          pending: null,
        };
      }
      const pending = store.addPendingUpdate(update);
      return { ok: Boolean(pending), conflict: false, reason: '', pending };
    },
    listPendingUpdates: () => pendingUpdates.slice(),
    listProfiles: () => Array.from(profiles.values()),
  };
  return store;
};

{
  const store = makeStore({ backgroundUpdateEnabled: false });
  const runtime = createAgentTaskRuntime({
    store: new AgentRunStore(),
    logger: { warn: () => {} },
  });
  const agent = createContactProfilerAgent({
    agentTaskRuntime: runtime,
    contactProfileStore: store,
    getCurrentSessionId: () => 'alice',
    logger: { debug: () => {} },
  });
  const result = await agent.runProfileUpdate();
  assert.deepEqual(result, {
    status: 'skipped',
    skipped: true,
    reason: 'disabled',
    contactId: 'alice',
  });
  assert.equal(runtime.listRuns({ kind: 'contact_profile_update' }).length, 0);
  console.log('ok - ContactProfilerAgent skips background updates when disabled');
}

{
  const store = makeStore({ backgroundUpdateEnabled: true });
  const runStore = new AgentRunStore();
  const runtime = createAgentTaskRuntime({
    store: runStore,
    logger: { warn: () => {} },
    now: () => 10_000,
  });
  const agent = createContactProfilerAgent({
    agentTaskRuntime: runtime,
    contactProfileStore: store,
    getContact: contactId => ({ id: contactId, name: 'Alice' }),
    getMessages: () => [
      { id: 'm1', role: 'user', content: 'Alice mentioned ramen and hiking.' },
      { id: 'm2', role: 'assistant', content: 'Remember Alice likes ramen.' },
    ],
    now: () => 10_000,
    logger: { debug: () => {} },
  });
  const result = await agent.runProfileUpdate({
    contactId: 'alice',
    sessionId: 'alice',
    reason: 'test',
  });
  const pending = store.listPendingUpdates();
  const run = runtime.listRuns({ kind: 'contact_profile_update' })[0];
  assert.equal(result.status, 'pending_confirmation');
  assert.equal(result.contactId, 'alice');
  assert.equal(pending.length, 1);
  assert.equal(pending[0].contactId, 'alice');
  assert.equal(pending[0].profile.displayName, 'Alice');
  assert.ok(pending[0].profile.trigger_keywords.includes('ramen'));
  assert.deepEqual(run.steps.map(step => step.type), [
    'contact_profile.collect_context',
    'contact_profile.prepare_update',
    'contact_profile.persist_update',
  ]);
  assert.equal(run.status, 'succeeded');
  console.log('ok - ContactProfilerAgent records a pending profile update through agent runtime');
}

{
  const store = makeStore({
    backgroundUpdateEnabled: true,
    backgroundAutoSave: true,
    backgroundRequireConfirm: false,
  });
  const runtime = createAgentTaskRuntime({
    store: new AgentRunStore(),
    logger: { warn: () => {} },
  });
  const agent = createContactProfilerAgent({
    agentTaskRuntime: runtime,
    contactProfileStore: store,
    getContact: contactId => ({ id: contactId, name: 'Bob' }),
    getMessages: () => [
      { id: 'm3', role: 'user', content: 'Bob cares about project planning.' },
    ],
    now: () => 20_000,
    logger: { debug: () => {} },
  });
  const result = await agent.runProfileUpdate({
    contactId: 'bob',
    sessionId: 'bob',
  });
  assert.equal(result.status, 'saved');
  assert.equal(store.listPendingUpdates().length, 0);
  assert.equal(store.listProfiles()[0].contactId, 'bob');
  assert.equal(store.listProfiles()[0].displayName, 'Bob');
  console.log('ok - ContactProfilerAgent autosaves when confirmation is disabled');
}

{
  let release;
  let builds = 0;
  const store = makeStore({ backgroundUpdateEnabled: true });
  const runtime = createAgentTaskRuntime({
    store: new AgentRunStore(),
    logger: { warn: () => {} },
  });
  const agent = createContactProfilerAgent({
    agentTaskRuntime: runtime,
    contactProfileStore: store,
    getContact: contactId => ({ id: contactId, name: 'Carol' }),
    getMessages: () => [{ id: 'm4', content: 'Carol likes structured notes.' }],
    buildProfileCandidate: async ({ contactId }) => {
      builds += 1;
      await new Promise((resolve) => {
        release = resolve;
      });
      return { contactId, displayName: 'Carol' };
    },
    logger: { debug: () => {} },
  });
  const first = agent.runProfileUpdate({ contactId: 'carol', sessionId: 'carol' });
  const second = agent.runProfileUpdate({ contactId: 'carol', sessionId: 'carol' });
  assert.equal(first, second);
  for (let i = 0; i < 10 && typeof release !== 'function'; i += 1) {
    await Promise.resolve();
  }
  assert.equal(typeof release, 'function');
  release();
  await second;
  assert.equal(builds, 1);
  assert.equal(runtime.listRuns({ kind: 'contact_profile_update' }).length, 1);
  console.log('ok - ContactProfilerAgent coalesces duplicate contact update runs');
}

{
  let releaseCandidate = () => {};
  let candidateStartedResolve = () => {};
  const candidateStarted = new Promise(resolve => { candidateStartedResolve = resolve; });
  const candidateGate = new Promise(resolve => { releaseCandidate = resolve; });
  const store = makeStore({
    backgroundUpdateEnabled: true,
    backgroundAutoSave: true,
    backgroundRequireConfirm: false,
  });
  store.upsertProfile({ contactId: 'alice', displayName: 'Base Alice' });
  const runtime = createAgentTaskRuntime({
    store: new AgentRunStore(),
    logger: { warn: () => {} },
  });
  const agent = createContactProfilerAgent({
    agentTaskRuntime: runtime,
    contactProfileStore: store,
    getContact: contactId => ({ id: contactId, name: 'Alice' }),
    getMessages: () => [{ id: 'm5', content: 'Alice likes careful edits.' }],
    buildProfileCandidate: async ({ existingProfile }) => {
      candidateStartedResolve();
      await candidateGate;
      return { ...existingProfile, contactId: 'alice', displayName: 'Maid Alice' };
    },
    logger: { debug: () => {} },
  });

  const running = agent.runProfileUpdate({ contactId: 'alice', sessionId: 'alice' });
  await candidateStarted;
  store.upsertProfile({ contactId: 'alice', displayName: 'User Alice' });
  releaseCandidate();
  const result = await running;

  assert.equal(result.status, 'conflict');
  assert.equal(result.reason, 'profile_changed_during_operation');
  assert.equal(store.getProfile('alice').displayName, 'User Alice');
  console.log('ok - ContactProfilerAgent autosave rejects a concurrent user profile edit');
}

{
  let releaseCandidate = () => {};
  let candidateStartedResolve = () => {};
  const candidateStarted = new Promise(resolve => { candidateStartedResolve = resolve; });
  const candidateGate = new Promise(resolve => { releaseCandidate = resolve; });
  const store = makeStore({ backgroundUpdateEnabled: true });
  store.upsertProfile({ contactId: 'alice', displayName: 'Base Alice' });
  const runtime = createAgentTaskRuntime({
    store: new AgentRunStore(),
    logger: { warn: () => {} },
  });
  const agent = createContactProfilerAgent({
    agentTaskRuntime: runtime,
    contactProfileStore: store,
    getContact: contactId => ({ id: contactId, name: 'Alice' }),
    getMessages: () => [{ id: 'm6', content: 'Alice likes safe candidates.' }],
    buildProfileCandidate: async ({ existingProfile }) => {
      candidateStartedResolve();
      await candidateGate;
      return { ...existingProfile, contactId: 'alice', displayName: 'Candidate Alice' };
    },
    logger: { debug: () => {} },
  });

  const running = agent.runProfileUpdate({ contactId: 'alice', sessionId: 'alice' });
  await candidateStarted;
  store.upsertProfile({ contactId: 'alice', displayName: 'User Alice' });
  releaseCandidate();
  const result = await running;

  assert.equal(result.status, 'conflict');
  assert.equal(result.reason, 'profile_changed_during_operation');
  assert.equal(store.listPendingUpdates().length, 0);
  assert.equal(store.getProfile('alice').displayName, 'User Alice');
  console.log('ok - ContactProfilerAgent skips a stale pending candidate after user edit');
}
