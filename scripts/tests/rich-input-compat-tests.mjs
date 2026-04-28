import test from 'node:test';
import assert from 'node:assert/strict';

import {
  mergeRichCompatInputText,
  normalizeRichCompatInputMode,
  parseRichCompatSlashCommand,
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
    mode: 'replace',
    text: 'hello world',
  });
  assert.deepEqual(parseRichCompatSlashCommand('/input hello'), {
    mode: 'replace',
    text: 'hello',
  });
  assert.deepEqual(parseRichCompatSlashCommand('/addinput hello'), {
    mode: 'append',
    text: 'hello',
  });
  assert.deepEqual(parseRichCompatSlashCommand('/appendinput hello'), {
    mode: 'append',
    text: 'hello',
  });
  assert.equal(parseRichCompatSlashCommand('/unknown hello'), null);
  assert.equal(parseRichCompatSlashCommand('plain text'), null);
});
