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
