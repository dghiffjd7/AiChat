import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

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
      warning: true,
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
      warning: true,
    },
    {
      id: 'world-a',
      label: '世界书标题',
      avatar: '',
      showAvatar: false,
      meta: '',
      status: 'protected',
      reason: 'builtin_worldbook_protected',
      warning: false,
    },
  ]);
  console.log('ok - app confirmation items retain exact labels and resource-specific avatar presentation');
}

console.log('app-confirm-items-tests passed');

{
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const source = await readFile(path.join(root, 'src/scripts/ui/app-confirm.js'), 'utf8');
  assert.match(source, /signal\?\.aborted[\s\S]*resolve\(null\)/,
    '已取消的 signal 不应再打开选择弹窗');
  assert.match(source, /signal\.addEventListener\('abort', onAbort, \{ once: true \}\)/,
    '等待选择期间应响应上层取消信号');
  assert.match(source, /choiceAbortCleanup\?\.\(\)[\s\S]*choiceAbortCleanup = null/,
    '选择弹窗关闭后应清除 abort listener');
  console.log('ok - app choice closes safely when the active maid task is aborted');
}
