import assert from 'node:assert/strict';

import {
  buildProtocolSystemMetaMessage,
  buildProtocolRetryCandidates,
  extractMiPhoneBlock,
  normalizeMiPhoneMarkers,
  normalizeProtocolChatMessage,
  sanitizeThinkingForProtocolParse,
} from '../../src/scripts/ui/chat/protocol-parse-utils.js';

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('sanitizeThinkingForProtocolParse keeps raw text when no closing thinking marker exists', () => {
  assert.equal(
    sanitizeThinkingForProtocolParse('<thinking>abc'),
    '<thinking>abc',
  );
});

test('sanitizeThinkingForProtocolParse strips content before the last closing thinking marker', () => {
  assert.equal(
    sanitizeThinkingForProtocolParse('head</thinking>tail'),
    'tail',
  );
  assert.equal(
    sanitizeThinkingForProtocolParse('a</thinking>b</think>tail'),
    'tail',
  );
});

test('normalizeMiPhoneMarkers normalizes html-escaped and angle-bracket markers', () => {
  assert.equal(
    normalizeMiPhoneMarkers('&lt;MiPhone_start&gt;body&lt;/MiPhone_end&gt;'),
    'MiPhone_startbodyMiPhone_end',
  );
  assert.equal(
    normalizeMiPhoneMarkers('<MiPhone_start>body</MiPhone_end>'),
    'MiPhone_startbodyMiPhone_end',
  );
});

test('extractMiPhoneBlock returns the first bounded block and tolerates missing end markers', () => {
  assert.equal(
    extractMiPhoneBlock('xx MiPhone_start body MiPhone_end yy'),
    'MiPhone_start body MiPhone_end',
  );
  assert.equal(
    extractMiPhoneBlock('prefix <MiPhone_start>body'),
    '<MiPhone_start>body',
  );
  assert.equal(
    extractMiPhoneBlock('no markers'),
    '',
  );
});

test('buildProtocolRetryCandidates composes thinking cleanup and MiPhone block extraction', () => {
  assert.deepEqual(
    buildProtocolRetryCandidates('head</thinking>&lt;MiPhone_start&gt;body&lt;/MiPhone_end&gt;'),
    {
      retryText: '&lt;MiPhone_start&gt;body&lt;/MiPhone_end&gt;',
      miPhoneText: 'MiPhone_startbodyMiPhone_end',
      miPhoneBlock: 'MiPhone_startbodyMiPhone_end',
    },
  );
});

test('normalizeProtocolChatMessage normalizes speaker and converts br tags to newlines', () => {
  assert.deepEqual(
    normalizeProtocolChatMessage(
      { speaker: ' Alice ', content: 'a<br>b', time: ' 09:00 ' },
      { normalizeSpeaker: value => String(value || '').trim().toLowerCase() },
    ),
    {
      speaker: 'alice',
      content: 'a\nb',
      time: '09:00',
    },
  );
});

test('buildProtocolSystemMetaMessage sanitizes content and fills fallback time/name', () => {
  assert.deepEqual(
    buildProtocolSystemMetaMessage({
      content: 'a',
      fallbackTime: '09:00',
      sanitizeContent: value => `[${value}]`,
    }),
    {
      role: 'system',
      type: 'meta',
      content: '[a]',
      name: '系统',
      time: '09:00',
    },
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
