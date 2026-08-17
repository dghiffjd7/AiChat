import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Stage L invariant guards: the "at most one structured fallback per turn"
// guarantee lives in bridge.js linear control flow (behavioral coverage is the
// dev routing smoke, which needs a live WebView). These source assertions lock
// the load-bearing lines so a refactor cannot silently reintroduce retry loops.

const bridgeSource = await readFile(
  new URL('../../src/scripts/ui/bridge.js', import.meta.url),
  'utf8',
);

const countOf = pattern => (bridgeSource.match(pattern) || []).length;

assert.match(
  bridgeSource,
  /maxRetries: getProviderCalls\(\)\.length > 0 \? 0 :/u,
  'the fallback provider call must never multiply via client-level retries',
);

assert.match(
  bridgeSource,
  /'structured_provider_configuration_error'/u,
  '401/403 structured failures must surface as configuration errors instead of falling back',
);

assert.equal(
  countOf(/assembleLegacyTextRequest\(phoneProviderFcRoute\.semanticSnapshot\)/gu),
  2,
  'exactly two lazy legacy assemblies: one legacy-primary site plus one structured-failure fallback site',
);

assert.equal(
  countOf(/runPhoneReplyJsonAttempt\(/gu),
  1,
  'the JSON terminal attempt must run at most once per turn (no retry loop)',
);

assert.equal(
  countOf(/additionalProviderCalls: 1/gu),
  1,
  'the structured fallback must announce exactly one extra provider call',
);

console.log('chat-structured-single-fallback-source-tests passed');
