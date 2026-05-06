import assert from 'node:assert/strict';

import { parseGroupSystemOps } from '../../src/scripts/ui/chat/group-system-ops-utils.js';

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('parseGroupSystemOps extracts invite and remove batches from system text', () => {
  assert.deepEqual(
    parseGroupSystemOps('系统消息：邀请小王、小李加入群聊，并将老张移出群聊'),
    [
      { type: 'invite', names: ['小王', '小李'] },
      { type: 'remove', names: ['老张'] },
    ],
  );
});

test('parseGroupSystemOps extracts direct join events only when they are not invite notices', () => {
  assert.deepEqual(
    parseGroupSystemOps('阿明、阿华加入群聊'),
    [
      { type: 'join', names: ['阿明', '阿华'] },
    ],
  );
  assert.deepEqual(
    parseGroupSystemOps('系统消息：邀请阿明加入群聊'),
    [
      { type: 'invite', names: ['阿明'] },
    ],
  );
});

test('parseGroupSystemOps supports alternate remove phrasings and ignores empty input', () => {
  assert.deepEqual(
    parseGroupSystemOps('把小赵移除群聊'),
    [
      { type: 'remove', names: ['小赵'] },
    ],
  );
  assert.deepEqual(
    parseGroupSystemOps('踢出小孙本群'),
    [
      { type: 'remove', names: ['小孙'] },
    ],
  );
  assert.deepEqual(parseGroupSystemOps('  '), []);
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
