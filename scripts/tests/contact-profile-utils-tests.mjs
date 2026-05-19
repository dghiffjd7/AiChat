import assert from 'node:assert/strict';

import {
  buildContactProfileWeakTriggerPrompt,
  extractWeakTriggerTerms,
  normalizeContactProfile,
  normalizeContactProfileSettings,
  resolveContactProfileWeakTriggers,
} from '../../src/scripts/memory/contact-profile-utils.js';

{
  const terms = extractWeakTriggerTerms('今天想去拍照喝奶茶');
  assert.equal(terms.includes('拍照'), true);
  assert.equal(terms.includes('奶茶'), true);
  console.log('ok - extractWeakTriggerTerms extracts short Chinese weak trigger terms');
}

{
  const profile = normalizeContactProfile({
    contactId: 'alice',
    displayName: 'Alice',
    aliases: ['小A'],
    relationship: { current: '亲近朋友' },
    stable_traits: [{ label: '喜欢拍照' }],
    interaction_focus: ['外出计划'],
    trigger_keywords: ['奶茶'],
  });
  assert.equal(profile.contactId, 'alice');
  assert.equal(profile.stable_traits[0].label, '喜欢拍照');
  const settings = normalizeContactProfileSettings({
    weakTriggerThreshold: '3',
    maxRowsPerContact: '2',
  });
  assert.equal(settings.weakTriggerThreshold, 3);
  assert.equal(settings.maxRowsPerContact, 2);
  console.log('ok - normalizeContactProfile and settings keep compact profile schema');
}

{
  const resolution = resolveContactProfileWeakTriggers({
    text: '今天想去拍照，顺便买奶茶',
    scopeId: 'persona:1',
    settings: {
      weakTriggerThreshold: 2,
      profileHeaderThreshold: 4,
      maxRowsPerContact: 2,
    },
    profiles: [
      {
        contactId: 'alice',
        displayName: 'Alice',
        relationship: { current: '亲近朋友' },
        stable_traits: [{ label: '喜欢拍照', sourceRefs: ['memory_row:r1'] }],
        trigger_keywords: ['奶茶'],
        sourceRefs: ['memory_table:alice'],
      },
      {
        contactId: 'bob',
        displayName: 'Bob',
        trigger_keywords: ['考试'],
      },
    ],
    records: [
      {
        contactId: 'alice',
        contactName: 'Alice',
        rows: [
          { id: 'r1', tableId: 'events', tableName: '重要事件', rowText: 'Alice 和用户约过周末拍照' },
          { id: 'r2', tableId: 'items', tableName: '重要物品', rowText: 'Alice 喜欢奶茶' },
        ],
      },
      {
        contactId: 'bob',
        contactName: 'Bob',
        rows: [
          { id: 'r3', tableId: 'events', tableName: '重要事件', rowText: 'Bob 准备考试' },
        ],
      },
    ],
  });
  assert.equal(resolution.selectedSources.length, 1);
  assert.equal(resolution.selectedSources[0].contactId, 'alice');
  assert.equal(resolution.selectedSources[0].matchedRows.length, 2);
  assert.equal(resolution.blockedCandidates.some(item => item.contactId === 'bob'), true);
  const prompt = buildContactProfileWeakTriggerPrompt(resolution, {
    settings: { profileHeaderThreshold: 4 },
  });
  assert.match(prompt, /动态弱触发/);
  assert.match(prompt, /Alice/);
  assert.match(prompt, /周末拍照/);
  console.log('ok - resolveContactProfileWeakTriggers selects profile and memory rows with traceable evidence');
}
