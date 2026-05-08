import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const packageJson = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8'));
const releaseScript = await readFile(new URL('../release.ps1', import.meta.url), 'utf8');
const scripts = packageJson.scripts || {};

const splitScriptSteps = script =>
  String(script || '')
    .split('&&')
    .map(step => step.trim())
    .filter(Boolean);

{
  assert.equal(typeof scripts.dev, 'string');
  assert.equal(typeof scripts.build, 'string');
  assert.equal(typeof scripts['check:fast'], 'string');
  assert.equal(typeof scripts['test:rust:zip'], 'string');
  assert.equal(scripts.dev.includes('tauri dev'), true);
  assert.equal(scripts.build.includes('tauri build'), true);
  assert.equal(scripts['check:fast'].includes('cargo check --manifest-path src-tauri/Cargo.toml'), true);
  assert.equal(scripts['test:rust:zip'], 'cargo test --manifest-path src-tauri/Cargo.toml zip -- --nocapture');
  console.log('ok - release gate scripts preserve dev build and cargo check entry points');
}

{
  assert.match(releaseScript, /\[switch\]\$SkipPreflight/);
  const preflightIndex = releaseScript.indexOf('npm run test:all');
  const rustZipIndex = releaseScript.indexOf('npm run test:rust:zip');
  const buildIndex = releaseScript.indexOf('npm run android:build');
  const releaseIndex = releaseScript.indexOf('gh release');
  assert.ok(preflightIndex >= 0, 'release.ps1 should run npm run test:all by default');
  assert.ok(rustZipIndex > preflightIndex, 'rust zip contract should run after test:all');
  assert.ok(buildIndex > rustZipIndex, 'release preflight should run before android build');
  assert.ok(releaseIndex > buildIndex, 'android build should run before gh release');
  console.log('ok - release.ps1 runs test:all and rust zip preflight before android build and gh release');
}

{
  const steps = splitScriptSteps(scripts['test:all']);
  assert.deepEqual(steps, [
    'npm run test:chat',
    'npm run test:memory',
    'npm run test:variables',
    'npm run test:cancel',
    'npm run test:moments',
    'npm run test:sessions',
    'npm run test:integration',
    'npm run test:transfer',
    'npm run test:migration',
    'npm run test:release',
    'npm run test:theme',
  ]);
  console.log('ok - test:all keeps chat memory variables cancel moments sessions integration transfer migration release and theme gates');
}

{
  const integrationSteps = splitScriptSteps(scripts['test:integration']);
  assert.deepEqual(integrationSteps, [
    'node scripts/tests/lifecycle-trace-integration.mjs',
    'node scripts/tests/session-enter-lifecycle-integration.mjs',
    'node scripts/tests/send-cancel-regenerate-integration.mjs',
    'node scripts/tests/memory-lifecycle-integration.mjs',
    'node scripts/tests/settings-lifecycle-integration.mjs',
    'node scripts/tests/moments-lifecycle-integration.mjs',
  ]);
  console.log('ok - test:integration preserves the six high-risk lifecycle regression scripts');
}

{
  const chatUiSteps = splitScriptSteps(scripts['test:chat-ui']);
  assert.equal(chatUiSteps.includes('node scripts/tests/app-bridge-contract-tests.mjs'), true);
  assert.equal(chatUiSteps.includes('node scripts/tests/app-bridge-inventory-tests.mjs'), true);
  const contractIndex = chatUiSteps.indexOf('node scripts/tests/app-bridge-contract-tests.mjs');
  const inventoryIndex = chatUiSteps.indexOf('node scripts/tests/app-bridge-inventory-tests.mjs');
  assert.ok(inventoryIndex > contractIndex, 'bridge inventory should run after bridge contract tests');
  console.log('ok - chat-ui gate keeps bridge contract and inventory audits together');
}

{
  const chatGenerationSteps = splitScriptSteps(scripts['test:chat-generation']);
  assert.equal(chatGenerationSteps.includes('node scripts/tests/lifecycle-trace-utils-tests.mjs'), true);
  assert.equal(chatGenerationSteps.includes('node scripts/tests/send-flow-utils-tests.mjs'), true);
  assert.equal(chatGenerationSteps.includes('node scripts/tests/generation-state-utils-tests.mjs'), true);
  assert.equal(chatGenerationSteps.includes('node scripts/tests/continuation-message-utils-tests.mjs'), true);
  assert.equal(chatGenerationSteps.includes('node scripts/tests/plugin-message-bridge-utils-tests.mjs'), true);

  const chatMemorySteps = splitScriptSteps(scripts['test:chat-memory']);
  assert.equal(chatMemorySteps.includes('node scripts/tests/memory-update-runtime-tests.mjs'), true);
  assert.equal(chatMemorySteps.includes('node scripts/tests/memory-table-action-utils-tests.mjs'), true);

  const chatMomentsSteps = splitScriptSteps(scripts['test:chat-moments']);
  assert.equal(chatMomentsSteps.includes('node scripts/tests/moments-runtime-utils-tests.mjs'), true);

  const sessionEnterSteps = splitScriptSteps(scripts['test:session-enter']);
  assert.equal(sessionEnterSteps.includes('node scripts/tests/session-enter-runtime-tests.mjs'), true);

  console.log('ok - Phase C lifecycle domain gates keep unit coverage wired');
}

{
  const transferSteps = splitScriptSteps(scripts['test:transfer']);
  assert.deepEqual(transferSteps, [
    'node scripts/tests/regex-transfer-tests.mjs',
    'node scripts/tests/zip-entry-utils-tests.mjs',
    'node scripts/tests/import-package-kind-utils-tests.mjs',
    'node scripts/tests/transfer-worldbook-utils-tests.mjs',
    'node scripts/tests/experience-pack-export-utils-tests.mjs',
    'node scripts/tests/experience-pack-import-utils-tests.mjs',
    'node scripts/tests/custom-bundle-worldbook-utils-tests.mjs',
    'node scripts/tests/custom-bundle-manifest-utils-tests.mjs',
    'node scripts/tests/custom-bundle-room-entry-utils-tests.mjs',
    'node scripts/tests/custom-bundle-conversation-utils-tests.mjs',
    'node scripts/tests/custom-bundle-import-room-utils-tests.mjs',
    'node scripts/tests/custom-bundle-import-preview-utils-tests.mjs',
    'node scripts/tests/custom-bundle-import-diagnostics-utils-tests.mjs',
    'node scripts/tests/custom-bundle-rp-greeting-utils-tests.mjs',
    'node scripts/tests/transfer-package-contract-tests.mjs',
  ]);
  assert.equal(scripts['test:migration'], 'node scripts/tests/storage-migration-contracts-tests.mjs');
  console.log('ok - transfer and migration release gates preserve package and storage contract tests');
}
