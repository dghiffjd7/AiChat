import assert from 'node:assert/strict';

if (!globalThis.atob) {
  globalThis.atob = value => Buffer.from(String(value), 'base64').toString('binary');
}

import {
  buildZipEntryMap,
  decodeZipEntryBase64Text,
  findZipEntryByName,
  normalizeZipEntryName,
  readZipEntryJson,
  readZipEntryText,
} from '../../src/scripts/ui/zip-entry-utils.js';

const encodeBase64 = value => Buffer.from(String(value), 'utf8').toString('base64');

{
  assert.equal(normalizeZipEntryName('dir\\manifest.json'), 'dir/manifest.json');
  assert.equal(normalizeZipEntryName('  manifest.json  '), '  manifest.json  ');
  assert.equal(normalizeZipEntryName('  manifest.json  ', { trim: true }), 'manifest.json');
  console.log('ok - normalizeZipEntryName normalizes Windows separators and preserves trim policy');
}

{
  const text = '{"name":"测试"}';
  assert.equal(decodeZipEntryBase64Text(encodeBase64(text)), text);
  assert.equal(
    readZipEntryText({ text: '  ', base64: encodeBase64(text) }),
    text,
  );
  assert.equal(
    readZipEntryText({ text: '{"preferred":true}', base64: encodeBase64(text) }),
    '{"preferred":true}',
  );
  console.log('ok - zip entry text decoding preserves text-first and base64 fallback behavior');
}

{
  const entries = [
    { name: 'chat\\session.json', text: '{"old":true}' },
    { name: 'chat/session.json', text: '{"new":true}' },
    { name: '' },
  ];
  const map = buildZipEntryMap(entries);
  assert.equal(map.size, 1);
  assert.deepEqual(readZipEntryJson(map.get('chat/session.json')), { new: true });
  assert.equal(findZipEntryByName(entries, 'chat/session.json')?.text, '{"old":true}');
  console.log('ok - buildZipEntryMap normalizes names and keeps latest duplicate entry contract');
}

{
  assert.deepEqual(
    readZipEntryJson({ base64: encodeBase64('{"format":"chatapp.custom-bundle.v1"}') }),
    { format: 'chatapp.custom-bundle.v1' },
  );
  assert.equal(readZipEntryJson(null, { fallback: 'fallback' }), 'fallback');
  assert.throws(() => readZipEntryJson({ text: '{broken' }), SyntaxError);
  console.log('ok - readZipEntryJson parses base64 json returns fallback for missing and throws invalid json');
}
