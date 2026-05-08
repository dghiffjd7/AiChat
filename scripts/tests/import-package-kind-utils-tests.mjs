import assert from 'node:assert/strict';

import {
  IMPORT_PACKAGE_KINDS,
  decodeImportBase64Text,
  normalizeImportZipEntryName,
  readImportManifestFromEntries,
  resolveImportKindFromZipEntries,
} from '../../src/scripts/ui/import-package-kind-utils.js';

const encodeBase64 = value => Buffer.from(String(value), 'utf8').toString('base64');

{
  assert.equal(normalizeImportZipEntryName('manifest.json'), 'manifest.json');
  assert.equal(normalizeImportZipEntryName('nested\\manifest.json'), 'nested/manifest.json');
  assert.equal(normalizeImportZipEntryName('  manifest.json  '), 'manifest.json');
  console.log('ok - normalizeImportZipEntryName trims names and normalizes Windows separators');
}

{
  const text = '{"format":"chatapp.experience-pack.v1","name":"体验包"}';
  assert.equal(decodeImportBase64Text(encodeBase64(text)), text);
  const manifest = readImportManifestFromEntries([
    { name: 'manifest.json', base64: encodeBase64(text) },
  ]);
  assert.deepEqual(manifest, {
    format: 'chatapp.experience-pack.v1',
    name: '体验包',
  });
  console.log('ok - readImportManifestFromEntries reads base64 manifest text');
}

{
  const entries = [
    { name: 'manifest.json', text: '{"format":"chatapp.experience-pack.v1"}' },
  ];
  const result = resolveImportKindFromZipEntries(entries);
  assert.equal(result.kind, IMPORT_PACKAGE_KINDS.EXPERIENCE_PACK);
  assert.equal(result.entries, entries);
  console.log('ok - resolveImportKindFromZipEntries detects experience packs');
}

{
  const entries = [
    { name: 'manifest.json', text: '{"format":"chatapp.custom-bundle.v1"}' },
  ];
  const result = resolveImportKindFromZipEntries(entries);
  assert.equal(result.kind, IMPORT_PACKAGE_KINDS.CUSTOM_BUNDLE);
  assert.equal(result.entries, entries);
  console.log('ok - resolveImportKindFromZipEntries detects custom bundles');
}

{
  assert.equal(resolveImportKindFromZipEntries([{ name: 'nested/manifest.json', text: '{}' }]).kind, 'bundle');
  assert.equal(resolveImportKindFromZipEntries([{ name: 'manifest.json', text: '{broken' }]).kind, 'bundle');
  assert.equal(resolveImportKindFromZipEntries([{ name: 'manifest.json', text: '{"format":"unknown"}' }]).kind, 'bundle');
  assert.equal(resolveImportKindFromZipEntries(null).kind, 'bundle');
  console.log('ok - resolveImportKindFromZipEntries falls back to full bundle on missing invalid or unknown manifest');
}
