import assert from 'node:assert/strict';

import { createContactProfileAgentTools } from '../../src/scripts/agent/tools/contact-profile-tools.js';

{
  const savedProfiles = new Map([
    ['alice', {
      contactId: 'alice',
      displayName: 'Alice',
      trigger_keywords: ['tea'],
    }],
  ]);
  const tools = createContactProfileAgentTools({
    contactProfileStore: {
      getProfile: contactId => savedProfiles.get(contactId) || null,
      listProfiles: () => Array.from(savedProfiles.values()),
      upsertProfile: (profile) => {
        const saved = {
          ...profile,
          contactId: profile.contactId || profile.id,
        };
        savedProfiles.set(saved.contactId, saved);
        return saved;
      },
    },
  });
  assert.deepEqual(tools.map(tool => tool.name), [
    'contact_profile.read',
    'contact_profile.get',
    'contact_profile.list',
    'contact_profile.upsert',
  ]);

  const read = await tools[0].execute({ contactId: 'alice' });
  assert.equal(read.found, true);
  assert.equal(read.profile.displayName, 'Alice');
  assert.equal(tools[0].capabilities.modelContext, 'none');

  const got = await tools[1].execute({ contactId: 'alice' });
  assert.equal(got.found, true);
  assert.equal(got.profile.displayName, 'Alice');
  assert.equal(tools[1].capabilities.modelContext, 'allowlist');

  const listed = await tools[2].execute({ limit: 1 });
  assert.equal(listed.count, 1);
  assert.equal(listed.profiles.length, 1);

  const upserted = await tools[3].execute({
    profile: {
      contactId: 'bob',
      displayName: 'Bob',
      trigger_keywords: ['exam'],
    },
  });
  assert.equal(upserted.saved, true);
  assert.equal(upserted.contactId, 'bob');
  assert.equal(savedProfiles.get('bob').displayName, 'Bob');
  console.log('ok - contact profile agent tools read get list and upsert store profiles');
}

{
  const [readTool] = createContactProfileAgentTools();
  await assert.rejects(
    () => readTool.execute({ contactId: 'missing' }),
    /contact profile store not available/,
  );
  console.log('ok - contact profile agent tools require a store dependency');
}

{
  let revision = 1;
  let profile = {
    contactId: 'alice',
    displayName: 'Base Alice',
  };
  const store = {
    scopeId: 'scope-a',
    getProfileSnapshot: contactId => ({
      contactId,
      scopeId: 'scope-a',
      scopeToken: 0,
      exists: Boolean(profile),
      revision,
      profile: profile ? { ...profile } : null,
    }),
    upsertProfileIfUnchanged: (nextProfile, expected = {}) => {
      if (expected.revision !== revision) {
        return {
          ok: false,
          saved: false,
          conflict: true,
          reason: 'profile_changed_during_operation',
        };
      }
      revision += 1;
      profile = { ...nextProfile };
      return { ok: true, saved: true, profile: { ...profile } };
    },
    upsertProfile: (nextProfile) => {
      revision += 1;
      profile = { ...nextProfile };
      return { ...profile };
    },
  };
  const upsertTool = createContactProfileAgentTools({ contactProfileStore: store })
    .find(tool => tool.name === 'contact_profile.upsert');
  const args = {
    profile: {
      contactId: 'alice',
      displayName: 'Maid Alice',
    },
  };

  const preflight = await upsertTool.safety.preflight(args);
  assert.equal(preflight.requiresConfirmation, true);
  store.upsertProfile({ contactId: 'alice', displayName: 'User Alice' });
  const result = await upsertTool.execute(args);

  assert.equal(result.saved, false);
  assert.equal(result.conflict, true);
  assert.equal(result.reason, 'profile_changed_during_operation');
  assert.equal(profile.displayName, 'User Alice');
  console.log('ok - contact profile upsert confirmation snapshot rejects a later user edit');
}
