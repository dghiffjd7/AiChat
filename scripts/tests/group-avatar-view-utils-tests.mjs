import assert from 'node:assert/strict';

import {
  resolveContactAvatarView,
  resolveGroupCollageLayout,
} from '../../src/scripts/ui/group-avatar-view-utils.js';

const contacts = new Map([
  ['friend:1', { id: 'friend:1', name: '一号', avatar: 'avatar:1' }],
  ['friend:2', { id: 'friend:2', name: '二号', avatar: 'avatar:2' }],
  ['friend:3', { id: 'friend:3', name: '三号', avatar: 'avatar:3' }],
  ['friend:4', { id: 'friend:4', name: '四号', avatar: 'avatar:4' }],
  ['friend:5', { id: 'friend:5', name: '五号', avatar: 'avatar:5' }],
]);
const resolveAvatar = (id, contact) => contact?.avatar || `fallback:${id}`;

{
  const view = resolveContactAvatarView({
    sessionId: 'group:manual',
    contact: {
      id: 'group:manual',
      name: '手动头像群',
      avatar: 'data:image/png;base64,manual',
      isGroup: true,
      members: ['friend:1', 'friend:2'],
    },
    getContact: id => contacts.get(id),
    resolveAvatar,
  });

  assert.deepEqual(view, {
    kind: 'image',
    src: 'data:image/png;base64,manual',
    alt: '手动头像群',
    isGroup: true,
    isManualGroupAvatar: true,
  });
  console.log('ok - a manually selected group avatar overrides the automatic member collage');
}

{
  const view = resolveContactAvatarView({
    sessionId: 'group:auto',
    contact: {
      id: 'group:auto',
      name: '自动拼图群',
      avatar: '',
      isGroup: true,
      members: ['friend:1', 'friend:2', 'friend:1', 'friend:3', 'friend:4', 'friend:5'],
    },
    getContact: id => contacts.get(id),
    resolveAvatar,
  });

  assert.equal(view.kind, 'collage');
  assert.equal(view.layout, 'quad');
  assert.deepEqual(view.cells.map(cell => cell.id), ['friend:1', 'friend:2', 'friend:3', 'friend:4']);
  assert.deepEqual(view.cells.map(cell => cell.src), ['avatar:1', 'avatar:2', 'avatar:3', 'avatar:4']);
  assert.equal(view.totalMembers, 5);
  console.log('ok - automatic group collage de-duplicates members and renders at most four cells');
}

{
  assert.equal(resolveGroupCollageLayout(0), 'empty');
  assert.equal(resolveGroupCollageLayout(1), 'single');
  assert.equal(resolveGroupCollageLayout(2), 'split');
  assert.equal(resolveGroupCollageLayout(3), 'trio');
  assert.equal(resolveGroupCollageLayout(4), 'quad');
  assert.equal(resolveGroupCollageLayout(99), 'quad');
  console.log('ok - group collage exposes the reference 0/1/2/3/4-member layouts');
}

{
  const view = resolveContactAvatarView({
    sessionId: 'friend:1',
    contact: contacts.get('friend:1'),
    getContact: id => contacts.get(id),
    resolveAvatar,
  });
  assert.deepEqual(view, {
    kind: 'image',
    src: 'avatar:1',
    alt: '一号',
    isGroup: false,
    isManualGroupAvatar: false,
  });
  console.log('ok - ordinary contact avatars keep the existing single-image rendering path');
}
