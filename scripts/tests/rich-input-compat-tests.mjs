import test from 'node:test';
import assert from 'node:assert/strict';

import {
  mergeRichCompatInputText,
  normalizeRichCompatInputMode,
  parseRichCompatSlashCommand,
  parseRichCompatSlashArgs,
  splitRichCompatSlashPipeline,
  tokenizeRichCompatSlashArgs,
} from '../../src/scripts/ui/chat/rich-input-compat.js';

test('normalizeRichCompatInputMode resolves append and replace modes', () => {
  assert.equal(normalizeRichCompatInputMode({ mode: 'append' }), 'append');
  assert.equal(normalizeRichCompatInputMode({ append: true }), 'append');
  assert.equal(normalizeRichCompatInputMode({ mode: 'replace' }), 'replace');
  assert.equal(normalizeRichCompatInputMode({}), 'replace');
});

test('mergeRichCompatInputText replaces by default', () => {
  assert.equal(mergeRichCompatInputText('before', 'after'), 'after');
});

test('mergeRichCompatInputText appends with newline separator by default', () => {
  assert.equal(
    mergeRichCompatInputText('alpha', 'beta', { mode: 'append' }),
    'alpha\nbeta',
  );
});

test('mergeRichCompatInputText supports custom separators and empty operands', () => {
  assert.equal(
    mergeRichCompatInputText('alpha', 'beta', { mode: 'append', separator: ' ' }),
    'alpha beta',
  );
  assert.equal(
    mergeRichCompatInputText('', 'beta', { mode: 'append' }),
    'beta',
  );
  assert.equal(
    mergeRichCompatInputText('alpha', '', { mode: 'append' }),
    'alpha',
  );
});

test('parseRichCompatSlashCommand parses supported input commands', () => {
  assert.deepEqual(parseRichCompatSlashCommand('/setinput hello world'), {
    command: 'setinput',
    name: 'setinput',
    argsText: 'hello world',
    tokens: ['hello', 'world'],
    named: {},
    positional: ['hello', 'world'],
    mode: 'replace',
    text: 'hello world',
  });
  assert.deepEqual(parseRichCompatSlashCommand('/input hello'), {
    command: 'input',
    name: 'input',
    argsText: 'hello',
    tokens: ['hello'],
    named: {},
    positional: ['hello'],
    text: 'hello',
  });
  assert.deepEqual(parseRichCompatSlashCommand('/addinput hello'), {
    command: 'setinput',
    name: 'addinput',
    argsText: 'hello',
    tokens: ['hello'],
    named: {},
    positional: ['hello'],
    mode: 'append',
    text: 'hello',
  });
  assert.deepEqual(parseRichCompatSlashCommand('/appendinput hello'), {
    command: 'setinput',
    name: 'appendinput',
    argsText: 'hello',
    tokens: ['hello'],
    named: {},
    positional: ['hello'],
    mode: 'append',
    text: 'hello',
  });
  assert.equal(parseRichCompatSlashCommand('/unknown hello'), null);
  assert.equal(parseRichCompatSlashCommand('plain text'), null);
});

test('parseRichCompatSlashCommand parses send and trigger commands', () => {
  assert.deepEqual(parseRichCompatSlashCommand('/send hello world'), {
    command: 'send',
    name: 'send',
    argsText: 'hello world',
    tokens: ['hello', 'world'],
    named: {},
    positional: ['hello', 'world'],
    mode: 'replace',
    text: 'hello world',
  });
  assert.deepEqual(parseRichCompatSlashCommand('/trigger'), {
    command: 'trigger',
    name: 'trigger',
    argsText: '',
    tokens: [],
    named: {},
    positional: [],
    text: '',
  });
});

test('tokenizeRichCompatSlashArgs supports quotes, named args, and escapes', () => {
  assert.deepEqual(tokenizeRichCompatSlashArgs('name="A B" hello\\|world'), ['name=A B', 'hello|world']);
  assert.deepEqual(parseRichCompatSlashArgs('key=i value="1 2" tail'), {
    tokens: ['key=i', 'value=1 2', 'tail'],
    named: { key: 'i', value: '1 2' },
    positional: ['tail'],
    text: 'tail',
  });
});

test('splitRichCompatSlashPipeline splits only slash command pipelines', () => {
  assert.deepEqual(
    splitRichCompatSlashPipeline('/audioselect type=bgm url|/audiomode type=bgm mode=single|/audioplay type=bgm'),
    [
      '/audioselect type=bgm url',
      '/audiomode type=bgm mode=single',
      '/audioplay type=bgm',
    ],
  );
  assert.deepEqual(splitRichCompatSlashPipeline('/send alpha|beta'), ['/send alpha|beta']);
  assert.deepEqual(splitRichCompatSlashPipeline('/echo title="a|b"|/echo c\\|d'), ['/echo title="a|b"', '/echo c|d']);
});
