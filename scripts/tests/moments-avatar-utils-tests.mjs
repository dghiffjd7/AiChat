import assert from 'node:assert/strict';

const previousDocument = globalThis.document;
if (previousDocument === undefined) {
  globalThis.document = {
    body: {
      dataset: {
        themeMode: 'dark',
      },
    },
  };
}

const {
  getMomentAvatarByName,
  resolveMomentAvatar,
  resolveMomentContactAvatar,
} = await import('../../src/scripts/ui/moments-avatar-utils.js');

{
  const url = resolveMomentContactAvatar({
    id: 'c1',
    name: 'Alice',
    avatar: 'https://example.com/alice.png',
  });
  assert.equal(url, 'https://example.com/alice.png');
  console.log('ok - resolveMomentContactAvatar preserves explicit contact avatar urls');
}

{
  const contactsStore = {
    getContact(id) {
      if (id === 'alice') return { id: 'alice', name: 'Alice', avatar: 'https://example.com/alice.png' };
      return null;
    },
    listContacts() {
      return [
        { id: 'alice', name: 'Alice', avatar: 'https://example.com/alice.png' },
        { id: 'bob-01', name: 'Bob 01', avatar: 'https://example.com/bob.png' },
      ];
    },
  };
  assert.equal(getMomentAvatarByName('我', {
    contactsStore,
    defaultAvatar: 'https://example.com/default.png',
    userAvatar: 'https://example.com/me.png',
  }), 'https://example.com/me.png');
  assert.equal(getMomentAvatarByName('alice', {
    contactsStore,
    defaultAvatar: 'https://example.com/default.png',
  }), 'https://example.com/alice.png');
  assert.equal(getMomentAvatarByName('Bob01', {
    contactsStore,
    defaultAvatar: 'https://example.com/default.png',
  }), 'https://example.com/bob.png');
  console.log('ok - getMomentAvatarByName resolves self exact and fuzzy contact avatars');
}

{
  const contactsStore = {
    getContact(id) {
      if (id === 'speaker-1') return { id: 'speaker-1', name: 'Speaker', avatar: 'https://example.com/speaker.png' };
      return null;
    },
  };
  assert.equal(resolveMomentAvatar({
    author: '角色',
    authorAvatar: 'https://example.com/snapshot.png',
  }, {
    contactsStore,
    defaultAvatar: 'https://example.com/default.png',
    userAvatar: 'https://example.com/me.png',
  }), 'https://example.com/snapshot.png');
  assert.equal(resolveMomentAvatar({
    author: '我',
    authorId: 'user',
  }, {
    contactsStore,
    defaultAvatar: 'https://example.com/default.png',
    userAvatar: 'https://example.com/me.png',
  }), 'https://example.com/me.png');
  assert.equal(resolveMomentAvatar({
    author: 'Speaker',
    authorId: 'speaker-1',
  }, {
    contactsStore,
    defaultAvatar: 'https://example.com/default.png',
    userAvatar: 'https://example.com/me.png',
  }), 'https://example.com/speaker.png');
  console.log('ok - resolveMomentAvatar prefers snapshot then self then contact session avatars');
}

if (previousDocument === undefined) {
  delete globalThis.document;
} else {
  globalThis.document = previousDocument;
}
