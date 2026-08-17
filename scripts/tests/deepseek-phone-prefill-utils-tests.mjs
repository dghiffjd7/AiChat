import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { createReasoningStreamEvent } from '../../src/scripts/api/native-reasoning.js';
import {
  DEEPSEEK_PHONE_PREFILL_MODE,
  DEEPSEEK_PHONE_PREFILL_PREFIX,
  applyDeepSeekPrefillToStream,
  hasProviderToolRequestOptions,
  mergeDeepSeekPrefillResponse,
  resolveDeepSeekPhonePrefillPlan,
} from '../../src/scripts/api/deepseek-phone-prefill-utils.js';

const eligibleInput = {
  experimentEnabled: true,
  provider: 'deepseek',
  model: 'deepseek-v4-flash',
  baseUrl: 'https://api.deepseek.com/v1',
  uiMode: 'chat',
  surface: 'private_chat',
  responseTarget: 'assistant',
  assistantContinuation: false,
  hasConfiguredPrefill: false,
  usesDefaultPreset: true,
  usesBuiltinContract: true,
  formatProfileEnabled: false,
  webSearchEnabled: false,
  hasProviderTools: false,
};

{
  const plan = resolveDeepSeekPhonePrefillPlan(eligibleInput);
  assert.equal(plan.enabled, true);
  assert.equal(plan.reason, '');
  assert.equal(plan.mode, DEEPSEEK_PHONE_PREFILL_MODE);
  assert.equal(plan.prefix, DEEPSEEK_PHONE_PREFILL_PREFIX);
  assert.deepEqual(plan.requestOptions, {
    deepseekPrefix: {
      mode: DEEPSEEK_PHONE_PREFILL_MODE,
      prefix: DEEPSEEK_PHONE_PREFILL_PREFIX,
    },
  });
  console.log('ok - eligible official DeepSeek built-in chat gets one phone shell prefill');
}

{
  const cases = [
    ['experiment_disabled', { experimentEnabled: false }],
    ['not_official_deepseek', { provider: 'custom' }],
    ['not_official_deepseek', { baseUrl: 'https://proxy.example/v1' }],
    ['unsupported_ui_mode', { uiMode: 'rp' }],
    ['unsupported_surface', { surface: 'moment_comment' }],
    ['response_target_user', { responseTarget: 'user' }],
    ['assistant_continuation', { assistantContinuation: true }],
    ['configured_prefill', { hasConfiguredPrefill: true }],
    ['non_default_preset', { usesDefaultPreset: false }],
    ['builtin_contract_inactive', { usesBuiltinContract: false }],
    ['custom_format_profile', { formatProfileEnabled: true }],
    ['web_search_enabled', { webSearchEnabled: true }],
    ['provider_tools_present', { hasProviderTools: true }],
  ];
  cases.forEach(([reason, patch]) => {
    const plan = resolveDeepSeekPhonePrefillPlan({ ...eligibleInput, ...patch });
    assert.equal(plan.enabled, false, reason);
    assert.equal(plan.reason, reason);
    assert.deepEqual(plan.requestOptions, {});
  });
  console.log('ok - phone prefill reports deterministic skip reasons for every Stage C gate');
}

{
  assert.equal(hasProviderToolRequestOptions(), false);
  assert.equal(hasProviderToolRequestOptions({}, { temperature: 0.7 }), false);
  assert.equal(hasProviderToolRequestOptions({ tools: [] }), true);
  assert.equal(hasProviderToolRequestOptions({ tool_choice: 'none' }), true);
  assert.equal(hasProviderToolRequestOptions({ toolChoice: 'auto' }), true);
  assert.equal(hasProviderToolRequestOptions({ toolConfig: {} }), true);
  console.log('ok - tool presence gate sees all provider schema spellings, including empty declarations');
}

{
  assert.equal(
    mergeDeepSeekPrefillResponse(DEEPSEEK_PHONE_PREFILL_PREFIX, '雪乃--在。--12:30'),
    `${DEEPSEEK_PHONE_PREFILL_PREFIX}雪乃--在。--12:30`,
  );
  assert.equal(
    mergeDeepSeekPrefillResponse(
      DEEPSEEK_PHONE_PREFILL_PREFIX,
      `${DEEPSEEK_PHONE_PREFILL_PREFIX}msg_start\nmsg_end\nMiPhone_end`,
    ),
    `${DEEPSEEK_PHONE_PREFILL_PREFIX}msg_start\nmsg_end\nMiPhone_end`,
  );
  console.log('ok - terminal response merging never duplicates an echoed phone prefix');
}

{
  const reasoning = createReasoningStreamEvent('internal');
  async function* source() {
    yield reasoning;
    yield 'MiPho';
    yield 'ne_start\nmsg_start\n';
    yield 'msg_end\nMiPhone_end';
  }
  const chunks = [];
  for await (const chunk of applyDeepSeekPrefillToStream(source(), DEEPSEEK_PHONE_PREFILL_PREFIX)) {
    chunks.push(chunk);
  }
  assert.equal(chunks[0], DEEPSEEK_PHONE_PREFILL_PREFIX);
  assert.equal(chunks[1], reasoning);
  assert.equal(chunks.filter(chunk => typeof chunk === 'string').join(''), [
    'MiPhone_start',
    'msg_start',
    'msg_end',
    'MiPhone_end',
  ].join('\n'));
  console.log('ok - streamed echoed prefixes are suppressed across chunk boundaries while reasoning passes through');
}

{
  const abortError = Object.assign(new Error('cancelled'), { name: 'AbortError' });
  async function* cancelledSource() {
    yield 'MiPhone_start\nmsg_start\n';
    throw abortError;
  }
  const chunks = [];
  await assert.rejects(async () => {
    for await (const chunk of applyDeepSeekPrefillToStream(
      cancelledSource(),
      DEEPSEEK_PHONE_PREFILL_PREFIX,
    )) {
      chunks.push(chunk);
    }
  }, error => error === abortError);
  assert.equal(chunks.join(''), 'MiPhone_start\nmsg_start\n');
  console.log('ok - cancellation propagates without duplicating or retaining prefix state');
}

{
  const [bridgeSource, appSource, contextSource] = await Promise.all([
    readFile(new URL('../../src/scripts/ui/bridge.js', import.meta.url), 'utf8'),
    readFile(new URL('../../src/scripts/ui/app.js', import.meta.url), 'utf8'),
    readFile(new URL('../../src/scripts/ui/chat/llm-context-runtime-utils.js', import.meta.url), 'utf8'),
  ]);
  assert.match(bridgeSource, /resolveDeepSeekPhonePrefillPlan\(\{/);
  assert.match(
    bridgeSource,
    /deepSeekPhonePrefill:\s*phoneProviderFcRoute\.eligible\s*\?[\s\S]{0,220}reason:\s*`\$\{phoneStructuredRouteMode\}_active`[\s\S]{0,80}:\s*phonePrefillPlan\.diagnostics/,
  );
  assert.match(bridgeSource, /configuredProviderDirectives/);
  assert.match(appSource, /setDeepSeekPhonePrefillExperimentEnabled/);
  assert.match(contextSource, /formatProfileEnabled:\s*getFormatProfileEnabled/);
  console.log('ok - bridge wiring keeps configured prefill separate and exposes runtime-only experiment diagnostics');
}
