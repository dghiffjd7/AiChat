import assert from 'node:assert/strict';

import {
  ingestMomentsForStore,
  normalizeMomentAuthorDisplay,
  resolveMomentAuthorId,
} from '../../src/scripts/ui/chat/moment-ingest-utils.js';

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('normalizeMomentAuthorDisplay resolves placeholders and empty names', () => {
  assert.equal(
    normalizeMomentAuthorDisplay('', { characterName: '角色A' }),
    '角色A',
  );
  assert.equal(
    normalizeMomentAuthorDisplay('作者', { characterName: '角色A' }),
    '角色A',
  );
  assert.equal(
    normalizeMomentAuthorDisplay('我', { userName: '我', characterName: '角色A' }),
    '我',
  );
});

test('resolveMomentAuthorId handles user, placeholders, exact, fuzzy, and substring contact matches', () => {
  const contacts = [
    { id: 'c1', name: '张三' },
    { id: 'c2', name: '李四同学' },
  ];
  const options = {
    userName: '我',
    sessionId: 'chat:1',
    characterName: '角色A',
    normalizeName: value => String(value || '').trim(),
    normalizeLoose: value => String(value || '').replace(/\s+/g, '').trim(),
    getContactById: id => contacts.find(contact => contact.id === id) || null,
    listContacts: () => contacts,
  };
  assert.equal(resolveMomentAuthorId('我', options), 'user');
  assert.equal(resolveMomentAuthorId('作者', options), 'chat:1');
  assert.equal(resolveMomentAuthorId('张三', options), 'c1');
  assert.equal(resolveMomentAuthorId('c1', options), 'c1');
  assert.equal(resolveMomentAuthorId('李四', options), 'c2');
});

test('ingestMomentsForStore injects author metadata, stats, avatar, and session origin', () => {
  const result = ingestMomentsForStore(
    [{ author: '张三', content: 'hi', views: 1, likes: 2 }],
    {
      contactCount: 5,
      userAvatar: 'user.png',
      sessionId: 'chat:1',
      normalizeAuthorDisplay: value => String(value || '').trim(),
      resolveAuthorId: () => 'c1',
      resolveContactAvatar: id => `${id}.png`,
      normalizeStats: (stats, count) => ({ ...stats, count }),
      normalizeMomentRecord: record => ({ ...record, normalized: true }),
    },
  );

  assert.deepEqual(result, [{
    author: '张三',
    content: 'hi',
    views: 1,
    likes: 2,
    count: 5,
    authorId: 'c1',
    authorAvatar: 'c1.png',
    originSessionId: 'chat:1',
    normalized: true,
  }]);
});

let failed = 0;
for (const t of tests) {
  try {
    await t.fn();
    console.log(`ok - ${t.name}`);
  } catch (err) {
    failed += 1;
    console.error(`not ok - ${t.name}`);
    console.error(err);
  }
}

if (failed > 0) {
  process.exit(1);
}
