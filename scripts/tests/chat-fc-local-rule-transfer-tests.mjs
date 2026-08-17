import assert from 'node:assert/strict';
import {
  buildChatFcLocalRuleFromProfile,
  buildChatFcLocalRulesExport,
  parseChatFcLocalRulesImport,
} from '../../src/scripts/agent/chat-fc-local-capability-rules.js';

const fixedNow = () => 1786752000000;
const profile = {
  id: 'profile-export',
  name: '导出设置档',
  provider: 'custom',
  baseUrl: 'https://transfer.example.test/v1',
  model: 'vendor/tool-model',
  apiKey: 'must-never-export',
};
const rule = buildChatFcLocalRuleFromProfile(profile, {
  enabled: true,
  lastTest: {
    status: 'passed',
    testedAt: 1786751999000,
    modelCallCount: 3,
  },
  now: fixedNow,
}).rule;

{
  const payload = buildChatFcLocalRulesExport([rule], { now: fixedNow });
  assert.equal(payload.type, 'miphone.chat-fc.local-rules');
  assert.equal(payload.schemaVersion, 1);
  assert.equal(payload.rules.length, 1);
  assert.equal(JSON.stringify(payload).includes('must-never-export'), false);
  console.log('ok - local FC export is versioned and contains no connection secret');
}

{
  const payload = buildChatFcLocalRulesExport([{
    ...rule,
    health: {
      consecutiveDeterministicFailures: 2,
      circuitOpen: true,
      lastFailureReason: 'no_tool_call',
      lastFailureAt: 1786751999500,
      openedAt: 1786751999500,
    },
  }], { now: fixedNow });
  const parsed = parseChatFcLocalRulesImport(JSON.stringify(payload), { now: fixedNow });
  assert.equal(parsed.ok, true, parsed.reason);
  assert.equal(parsed.rules.length, 1);
  assert.equal(parsed.rules[0].enabled, false);
  assert.equal(parsed.rules[0].profileId, '');
  assert.equal(parsed.rules[0].evidence.lastTest.status, 'not_run');
  assert.equal(parsed.rules[0].health.circuitOpen, false);
  assert.equal(parsed.rules[0].health.consecutiveDeterministicFailures, 0);
  assert.notEqual(parsed.rules[0].ruleId, rule.ruleId);
  console.log('ok - imported rules are re-identified, unbound, disabled, untested, and circuit-clean');
}

{
  for (const [input, reason] of [
    [{ type: 'wrong', schemaVersion: 1, rules: [] }, 'import_type_unsupported'],
    [{ type: 'miphone.chat-fc.local-rules', schemaVersion: 99, rules: [] }, 'import_schema_unsupported'],
    [{ type: 'miphone.chat-fc.local-rules', schemaVersion: 1, rules: 'bad' }, 'import_rules_invalid'],
  ]) {
    const parsed = parseChatFcLocalRulesImport(input, { now: fixedNow });
    assert.equal(parsed.ok, false);
    assert.equal(parsed.reason, reason);
  }
  const injected = parseChatFcLocalRulesImport({
    type: 'miphone.chat-fc.local-rules',
    schemaVersion: 1,
    rules: [{
      ...rule,
      identity: {
        ...rule.identity,
        transportAdapter: 'attacker_adapter',
      },
    }],
  }, { now: fixedNow });
  assert.equal(injected.ok, false);
  assert.equal(injected.reason, 'transport_adapter_mismatch');
  console.log('ok - imports reject unknown versions, malformed collections, and arbitrary transport templates');
}

console.log('chat-fc-local-rule-transfer-tests passed');
