import assert from 'node:assert/strict';

import { canInitClient } from '../../src/scripts/api/client-config-utils.js';

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('canInitClient accepts non-empty api keys', () => {
  assert.equal(canInitClient({ apiKey: 'sk-test' }), true);
  assert.equal(canInitClient({ apiKey: '   ' }), false);
});

test('canInitClient accepts vertex ai service account without api key', () => {
  assert.equal(
    canInitClient({
      provider: 'vertexai',
      vertexaiServiceAccount: '{"client_email":"demo@example.com"}',
    }),
    true,
  );
  assert.equal(
    canInitClient({
      provider: 'openai',
      vertexaiServiceAccount: '{"client_email":"demo@example.com"}',
    }),
    false,
  );
});

test('canInitClient follows the selected vertex authentication mode', () => {
  assert.equal(canInitClient({
    provider: 'vertexai',
    vertexaiAuthMode: 'express',
    apiKey: 'vertex-express-key',
  }), true);
  assert.equal(canInitClient({
    provider: 'vertexai',
    vertexaiAuthMode: 'express',
    vertexaiServiceAccount: '{"project_id":"demo"}',
  }), false);
  assert.equal(canInitClient({
    provider: 'vertexai',
    vertexaiAuthMode: 'service_account',
    apiKey: 'unrelated-key',
  }), false);
  assert.equal(canInitClient({
    provider: 'vertexai',
    vertexaiAuthMode: 'service_account',
    vertexaiServiceAccount: '{"project_id":"demo"}',
  }), true);
});

test('canInitClient rejects empty configs', () => {
  assert.equal(canInitClient(null), false);
  assert.equal(canInitClient({}), false);
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
