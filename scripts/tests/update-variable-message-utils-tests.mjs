import assert from 'node:assert/strict';

import {
  buildUpdateVariableCommandPreview,
  collectUpdateVariableCommandsFromRaw,
  resolveUpdateVariableRawText,
} from '../../src/scripts/ui/chat/update-variable-message-utils.js';

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('resolveUpdateVariableRawText prefers rawOriginal then rawSource then raw then content', () => {
  assert.equal(resolveUpdateVariableRawText({ rawOriginal: 'orig', rawSource: 'src', raw: 'raw', content: 'content' }), 'orig');
  assert.equal(resolveUpdateVariableRawText({ rawSource: 'src', raw: 'raw', content: 'content' }), 'src');
  assert.equal(resolveUpdateVariableRawText({ raw: 'raw', content: 'content' }), 'raw');
  assert.equal(resolveUpdateVariableRawText({ content: 'content' }), 'content');
  assert.equal(resolveUpdateVariableRawText({}), '');
});

test('collectUpdateVariableCommandsFromRaw merges block, outside, and tavern fallback commands', () => {
  const parseCalls = [];
  const result = collectUpdateVariableCommandsFromRaw('RAW', {
    isTavernMvuSession: true,
    extractBlocks: () => ({
      blocks: ['BLOCK_A', 'BLOCK_B'],
      cleaned: '_.set(hero.hp, 12)',
    }),
    parseCommands: (text) => {
      parseCalls.push(text);
      if (text === 'BLOCK_A') return [{ type: 'set', path: ['a'], value: 1 }];
      if (text === 'BLOCK_B') return [{ type: 'delete', path: ['b'] }];
      if (text === '_.set(hero.hp, 12)') return [{ type: 'set', path: ['hero', 'hp'], value: 12 }];
      if (text === 'RAW') return [{ type: 'add', path: ['fallback'], value: 1 }];
      return [];
    },
  });

  assert.deepEqual(result, {
    blocks: ['BLOCK_A', 'BLOCK_B'],
    outsideUpdateBlocks: '_.set(hero.hp, 12)',
    commands: [
      { type: 'set', path: ['a'], value: 1 },
      { type: 'delete', path: ['b'] },
      { type: 'set', path: ['hero', 'hp'], value: 12 },
    ],
  });
  assert.deepEqual(parseCalls, ['BLOCK_A', 'BLOCK_B', '_.set(hero.hp, 12)']);
});

test('collectUpdateVariableCommandsFromRaw falls back to raw parse only for tavern sessions', () => {
  const tavern = collectUpdateVariableCommandsFromRaw('RAW', {
    isTavernMvuSession: true,
    extractBlocks: () => ({ blocks: [], cleaned: 'plain text' }),
    parseCommands: (text) => (text === 'RAW' ? [{ type: 'add', path: ['hp'], value: 1 }] : []),
  });
  const normal = collectUpdateVariableCommandsFromRaw('RAW', {
    isTavernMvuSession: false,
    extractBlocks: () => ({ blocks: [], cleaned: 'plain text' }),
    parseCommands: (text) => (text === 'RAW' ? [{ type: 'add', path: ['hp'], value: 1 }] : []),
  });

  assert.deepEqual(tavern.commands, [{ type: 'add', path: ['hp'], value: 1 }]);
  assert.deepEqual(normal.commands, []);
});

test('buildUpdateVariableCommandPreview formats common command types', () => {
  assert.equal(
    buildUpdateVariableCommandPreview([
      { type: 'set', path: ['hero', 'hp'], value: 12 },
      { type: 'move', from: ['bag', 0], path: ['stash', 0] },
      { type: 'insert', path: ['inventory'], key: 'slot.a' },
      { type: 'remove', path: ['inventory'], key: 0 },
      { type: 'delete', path: ['old'] },
    ]),
    'set(hero.hp)=12 | move(bag.0=>stash.0) | insert(inventory,slot.a) | remove(inventory,0) | delete(old)',
  );
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
