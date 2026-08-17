import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const bridgeSource = await readFile(
  new URL('../../src/scripts/ui/bridge.js', import.meta.url),
  'utf8',
);
const configPanelSource = await readFile(
  new URL('../../src/scripts/ui/config-panel.js', import.meta.url),
  'utf8',
);

assert.doesNotMatch(
  bridgeSource,
  /prepareProviderFcCapabilities\s*\(/u,
  'ordinary send/buildPrompt must not run provider capability probes',
);
assert.match(
  configPanelSource,
  /refreshModels[\s\S]*prepareProviderFcCapabilities\s*\(/u,
  'capability metadata refresh must live behind the explicit model refresh action',
);
assert.match(
  bridgeSource,
  /chatFcLocalCapabilityStore\.recordAttempt\s*\(/u,
  'ordinary FC results must feed the local-only deterministic circuit breaker',
);
assert.match(
  bridgeSource,
  /async init\s*\(\)\s*\{[\s\S]*?chatFcLocalCapabilityStore\.load\s*\(\)/u,
  'AppBridge startup must hydrate the authoritative local-rule KV before ordinary sends',
);

console.log('chat-fc-no-send-probe-source-tests passed');
