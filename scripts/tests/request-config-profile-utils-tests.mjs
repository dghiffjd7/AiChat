import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  normalizeRequestConfigUiMode,
  resolveRequestConfigProfileId,
} from '../../src/scripts/ui/chat/request-config-profile-utils.js';

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

const makePresetStore = ({
  sessions = {},
  modes = {},
} = {}) => ({
  getSessionProfileId(type, sessionId) {
    assert.equal(type, 'openai');
    return sessions[sessionId] || '';
  },
  getModeProfileId(type, mode) {
    assert.equal(type, 'openai');
    return modes[mode] || '';
  },
});

test('normalizes creative writing aliases to rp', () => {
  assert.equal(normalizeRequestConfigUiMode('creative'), 'rp');
  assert.equal(normalizeRequestConfigUiMode('', { sessionId: 'rp:abc' }), 'rp');
  assert.equal(normalizeRequestConfigUiMode('dynamic'), 'moments');
  assert.equal(normalizeRequestConfigUiMode('', { taskType: 'moment_comment' }), 'moments');
});

test('session profile overrides mode default profile', () => {
  const store = makePresetStore({
    sessions: { 'rp:1': 'session-claude' },
    modes: { rp: 'mode-gemini' },
  });
  assert.deepEqual(resolveRequestConfigProfileId({
    presetStore: store,
    sessionId: 'rp:1',
    uiMode: 'creative',
  }), {
    profileId: 'session-claude',
    source: 'session',
    sessionId: 'rp:1',
    uiMode: 'rp',
  });
});

test('mode profile is used when session has no explicit profile', () => {
  const store = makePresetStore({
    modes: { rp: 'mode-claude', chat: 'mode-gemini' },
  });
  assert.deepEqual(resolveRequestConfigProfileId({
    presetStore: store,
    sessionId: 'rp:2',
    uiMode: '',
  }), {
    profileId: 'mode-claude',
    source: 'mode',
    sessionId: 'rp:2',
    uiMode: 'rp',
  });
});

test('falls back to global profile when no binding exists', () => {
  assert.deepEqual(resolveRequestConfigProfileId({
    presetStore: makePresetStore(),
    sessionId: 'chat:1',
    uiMode: 'chat',
  }), {
    profileId: '',
    source: 'global',
    sessionId: 'chat:1',
    uiMode: 'chat',
  });
});

test('generation resolves request config before building provider messages', async () => {
  const bridgePath = fileURLToPath(new URL('../../src/scripts/ui/bridge.js', import.meta.url));
  const source = await readFile(bridgePath, 'utf8');
  const start = source.indexOf('async generate(userMessage, context = {})');
  const end = source.indexOf('async backgroundChat(messages, options = {})');
  assert.ok(start >= 0 && end > start, 'bridge generate body should be discoverable');
  const body = source.slice(start, end);
  const resolveIndex = body.indexOf('const requestRuntime = await this.resolveRequestRuntimeConfig(presetContext);');
  const buildIndex = body.indexOf('let messages = this.buildMessages(promptInput, nextContext, {');
  assert.ok(resolveIndex >= 0, 'generate should resolve request runtime config');
  assert.ok(buildIndex >= 0, 'generate should pass request config into buildMessages');
  assert.ok(resolveIndex < buildIndex, 'request config must be resolved before buildMessages');
  assert.match(body, /this\.buildMessages\(promptInput, nextContext,\s*\{\s*requestConfig: config,\s*\}\s*\)/);
  assert.match(source, /buildMessages\(userMessage, context = \{\}, options = \{\}\)/);
});

test('generation applies connection parameter filter to final request options', async () => {
  const bridgePath = fileURLToPath(new URL('../../src/scripts/ui/bridge.js', import.meta.url));
  const source = await readFile(bridgePath, 'utf8');
  const generateStart = source.indexOf('async generate(userMessage, context = {})');
  const backgroundStart = source.indexOf('async backgroundChat(messages, options = {})');
  const streamStart = source.indexOf('async *generateStream(messages, genOptions = {}, originalUserMessage = \'\', streamMeta = {})');
  assert.ok(generateStart >= 0 && backgroundStart > generateStart, 'bridge generate body should be discoverable');
  assert.ok(streamStart > backgroundStart, 'backgroundChat body should be discoverable');

  const generateBody = source.slice(generateStart, backgroundStart);
  assert.match(generateBody, /const applyRuntimeParamFilter = options => applyGenerationParamFilter\(options, config\?\.excludedGenerationParams,\s*\{\s*protectedParams: \['signal', 'nativeRequestId'\]/);
  assert.match(generateBody, /const requestOptions = applyRuntimeParamFilter\(\{\s*...\(genOptions \|\| \{\}\),\s*...\(providerDirectives \|\| \{\}\),\s*...\(providerToolRequestSchema\.requestOptions \|\| \{\}\),\s*...\(webSearchPlan\.requestOptions \|\| \{\}\),\s*signal: abortController\.signal,\s*nativeRequestId,/);
  assert.match(generateBody, /requestOptions: \{\s*...applyRuntimeParamFilter\(\{\s*...\(genOptions \|\| \{\}\),/);

  const backgroundBody = source.slice(backgroundStart, streamStart);
  assert.match(backgroundBody, /const \{ presetContext = null, runtimeConfigOverride = null, \.\.\.requestOverrides \} = options \|\| \{\};/);
  assert.match(backgroundBody, /const hasRuntimeConfigOverride = runtimeConfigOverride && typeof runtimeConfigOverride === 'object';/);
  assert.match(backgroundBody, /const config = hasRuntimeConfigOverride\s*\? \{ \.\.\.baseConfig, \.\.\.runtimeConfigOverride \}\s*: baseConfig;/);
  assert.match(backgroundBody, /canUseAnonymousCustomApi/);
  assert.doesNotMatch(backgroundBody, /if \(!this\.isConfigured\(\)\)/);
  assert.match(backgroundBody, /const genOptions = applyGenerationParamFilter\(\{\s*...this\.getGenerationOptions\(resolvedPresetContext, config\),\s*...requestOverrides,\s*\}, config\?\.excludedGenerationParams,\s*\{\s*protectedParams: \['signal', 'nativeRequestId'\],\s*\}\);/);
});

for (const { name, fn } of tests) {
  await fn();
  console.log(`ok - ${name}`);
}
