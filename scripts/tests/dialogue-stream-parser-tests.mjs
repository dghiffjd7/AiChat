import assert from 'node:assert/strict';
import { DialogueStreamParser } from '../../src/scripts/ui/chat/dialogue-stream-parser.js';

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

const collect = (parser, chunks) => {
  const events = [];
  for (const chunk of chunks) {
    events.push(...(parser.push(chunk) || []));
  }
  events.push(...(parser.flush() || []));
  return events;
};

test('continues after a leading content block and parses following MiPhone private chat', () => {
  const parser = new DialogueStreamParser({ userName: '阿伟' });
  const events = collect(parser, [
    [
      '<content>',
      '[旁白]|前置剧情不应阻断手机协议',
      '</content>',
      '<state_bar><time>11:36</time></state_bar>',
      'MiPhone_start',
      'msg_start',
      '<阿伟和娜美的私聊>',
      '娜美--哈？你谁啊？--11:36',
      '</阿伟和娜美的私聊>',
      'msg_end',
      'MiPhone_end',
    ].join('\n'),
  ]);

  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'private_chat');
  assert.equal(events[0].otherName, '娜美');
  assert.deepEqual(events[0].messages, [
    { speaker: '娜美', content: '哈？你谁啊？', time: '11:36' },
  ]);
});

test('waits for MiPhone markers that arrive after a closed content block in later chunks', () => {
  const parser = new DialogueStreamParser({ userName: '阿伟' });
  const first = parser.push('<content>\n[旁白]|前置剧情\n</content>\n<state_bar><time>11:36</time></state_bar>\n');
  assert.deepEqual(first, []);

  const events = collect(parser, [
    [
      'MiPhone_start',
      'msg_start',
      '<阿伟和娜美的私聊>',
      '娜美--突然发个Hi过来，想搭讪也得看看对象吧？--11:36',
      '</阿伟和娜美的私聊>',
      'msg_end',
      'MiPhone_end',
    ].join('\n'),
  ]);

  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'private_chat');
  assert.equal(events[0].messages[0]?.content, '突然发个Hi过来，想搭讪也得看看对象吧？');
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

if (failed > 0) process.exit(1);
