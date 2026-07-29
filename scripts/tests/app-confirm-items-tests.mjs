import assert from 'node:assert/strict';

import { normalizeAppConfirmItems } from '../../src/scripts/ui/app-confirm.js';

{
  const items = normalizeAppConfirmItems([
    {
      id: 'room-a',
      label: '名称很长但资料层仍需保留完整内容的聊天室',
      avatar: 'data:image/png;base64,AAAA',
      showAvatar: true,
      meta: '私聊',
      status: 'planned',
    },
    {
      id: 'world-a',
      label: '世界书标题',
      status: 'protected',
      reason: 'builtin_worldbook_protected',
    },
  ]);
  assert.deepEqual(items, [
    {
      id: 'room-a',
      label: '名称很长但资料层仍需保留完整内容的聊天室',
      avatar: 'data:image/png;base64,AAAA',
      showAvatar: true,
      meta: '私聊',
      status: 'planned',
      reason: '',
    },
    {
      id: 'world-a',
      label: '世界书标题',
      avatar: '',
      showAvatar: false,
      meta: '',
      status: 'protected',
      reason: 'builtin_worldbook_protected',
    },
  ]);
  console.log('ok - app confirmation items retain exact labels and resource-specific avatar presentation');
}

console.log('app-confirm-items-tests passed');
