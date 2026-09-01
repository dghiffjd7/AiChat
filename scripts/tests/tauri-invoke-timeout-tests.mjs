import assert from 'node:assert/strict';

import { resolveInvokeTimeoutMs } from '../../src/scripts/utils/tauri.js';

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('default commands keep 20s IPC hang guard', () => {
  assert.equal(resolveInvokeTimeoutMs('save_kv', {}), 20000);
  assert.equal(resolveInvokeTimeoutMs('read_zip_entries', {}), 20000);
});

test('http_request uses its own timeoutMs plus buffer', () => {
  assert.equal(resolveInvokeTimeoutMs('http_request', { timeoutMs: 60000 }), 90000);
  assert.equal(resolveInvokeTimeoutMs('public_http_request', {}), 270000);
  assert.equal(resolveInvokeTimeoutMs('http_request', { timeoutMs: -5 }), 270000);
});

test('data bundle export/import are unlimited (0 disables the IPC hang guard)', () => {
  assert.equal(resolveInvokeTimeoutMs('export_data_bundle', {}), 0);
  assert.equal(resolveInvokeTimeoutMs('export_data_bundle', { path: 'D:/x.zip' }), 0);
  assert.equal(resolveInvokeTimeoutMs('import_data_bundle', { path: 'D:/x.zip', mode: 'replace' }), 0);
  assert.equal(resolveInvokeTimeoutMs('import_data_bundle_bytes', { data: '', mode: 'replace' }), 0);
});

test('native microphone permission prompt is not cut off by the IPC timeout', () => {
  assert.equal(resolveInvokeTimeoutMs('prepare_microphone_permission_retry', {}), 0);
});

let failed = 0;
for (const { name, fn } of tests) {
  try {
    fn();
  } catch (error) {
    failed += 1;
    console.error(`FAIL ${name}`);
    console.error(error);
  }
}
if (failed) {
  console.error(`tauri-invoke-timeout-tests failed: ${failed}/${tests.length}`);
  process.exit(1);
}
console.log('tauri-invoke-timeout-tests passed');
