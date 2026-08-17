import assert from 'node:assert/strict';
import {
  buildChatFcLocalRuleFromProfile,
  replaceChatFcLocalCapabilityRules,
} from '../../src/scripts/agent/chat-fc-local-capability-rules.js';
import {
  buildChatFcZeroWriteTestPlan,
  runChatFcZeroWriteCompatibilityTest,
} from '../../src/scripts/agent/chat-fc-zero-write-compat-test.js';

const profile = {
  id: 'profile-probe',
  name: '零写入测试',
  provider: 'custom',
  baseUrl: 'https://relay.example.test/v1',
  model: 'vendor/tool-model',
};
const built = buildChatFcLocalRuleFromProfile(profile, { enabled: false });
assert.equal(built.ok, true, built.reason);
const rule = built.rule;

const replyForTool = (name, suffix = '') => {
  if (name === 'emit_private_reply') {
    return { messages: [{ content: `私聊兼容测试通过${suffix}` }] };
  }
  return null;
};

const createFixtureClient = ({ failAt = 0, omitRequestedToken = false } = {}) => {
  let calls = 0;
  return {
    get calls() { return calls; },
    async chat(messages, options = {}) {
      calls += 1;
      if (calls === failAt) throw new Error('fixture provider failure');
      const definition = options.tools?.[0];
      const name = definition?.function?.name || '';
      const promptText = messages.map(message => String(message?.content || '')).join('\n');
      const requestedToken = omitRequestedToken
        ? ''
        : (promptText.match(/K5-ROUND-[A-Z0-9-]+/u)?.[0] || '');
      const suffix = requestedToken ? ` ${requestedToken}` : '';
      let args = replyForTool(name, suffix);
      if (!args) {
        const schemaText = JSON.stringify(definition?.function?.parameters || {});
        if (schemaText.includes('moment_comment')) {
          args = { items: [{ kind: 'moment_comment', comments: [{ content: `动态兼容测试通过${suffix}` }] }] };
        } else {
          args = {
            items: [{
              kind: 'chat',
              messages: [{ speakerId: 'contact:fc-probe-a', content: `群聊兼容测试通过${suffix}` }],
            }],
          };
        }
      }
      options.onProviderToolCallDelta?.({
        choices: [{
          message: {
            tool_calls: [{
              id: `call-${calls}`,
              type: 'function',
              function: { name, arguments: JSON.stringify(args) },
            }],
          },
          finish_reason: 'tool_calls',
        }],
      }, { provider: profile.provider, model: profile.model });
      return '';
    },
  };
};

{
  const plan = buildChatFcZeroWriteTestPlan({ rule });
  assert.equal(plan.ok, true, plan.reason);
  assert.equal(plan.modelCallCount, 3);
  assert.deepEqual(plan.surfaces, ['private_chat', 'group_chat', 'moment_comment']);
  assert.equal(plan.persistentWriteCount, 0);
  assert.match(plan.billingNotice, /3/);
  console.log('ok - zero-write test advertises its exact paid request count before execution');
}

{
  replaceChatFcLocalCapabilityRules([]);
  const client = createFixtureClient();
  const result = await runChatFcZeroWriteCompatibilityTest({
    client,
    config: profile,
    rule,
  });
  assert.equal(result.ok, true, result.reason);
  assert.equal(result.modelCallCount, 3);
  assert.equal(client.calls, 3);
  assert.equal(result.persistentWriteCount, 0);
  assert.deepEqual(result.writeOperations, []);
  assert.deepEqual(result.results.map(item => item.surface), [
    'private_chat',
    'group_chat',
    'moment_comment',
  ]);
  assert.equal(result.results.every(item => item.ok), true);
  assert.equal(replaceChatFcLocalCapabilityRules([]).length, 0);
  console.log('ok - private, group, and moment FC contracts run without registering or committing the candidate rule');
}

{
  const client = createFixtureClient();
  const result = await runChatFcZeroWriteCompatibilityTest({
    client,
    config: profile,
    rule,
    fixtureToken: 'K5-ROUND-01',
  });
  assert.equal(result.ok, true, result.reason);
  assert.equal(result.results.every(item => item.strictSemanticPass), true);
  assert.equal(result.results.every(item => item.checks.signalsCorrect), true);
  assert.equal(result.results.find(item => item.surface === 'group_chat')?.checks.speakersCorrect, true);
  assert.equal(result.results.find(item => item.surface === 'moment_comment')?.checks.commentAuthorsCorrect, true);
  console.log('ok - unique fixture tokens verify semantic content and frozen identities without retaining prose');
}

{
  const client = createFixtureClient({ omitRequestedToken: true });
  const result = await runChatFcZeroWriteCompatibilityTest({
    client,
    config: profile,
    rule,
    fixtureToken: 'K5-ROUND-02',
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'semantic_contract_failed');
  assert.equal(result.modelCallCount, 1);
  assert.equal(result.results[0].providerFcAccepted, true);
  assert.equal(result.results[0].checks.signalsCorrect, false);
  console.log('ok - semantically wrong but schema-valid output fails and stops later paid calls');
}

{
  const client = createFixtureClient({ failAt: 2 });
  const result = await runChatFcZeroWriteCompatibilityTest({ client, config: profile, rule });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'provider_request_failed');
  assert.equal(result.modelCallCount, 2);
  assert.equal(result.persistentWriteCount, 0);
  assert.deepEqual(result.writeOperations, []);
  console.log('ok - compatibility failure stops before later paid calls and remains zero-write');
}

{
  const client = createFixtureClient();
  const result = await runChatFcZeroWriteCompatibilityTest({
    client,
    config: { ...profile, model: 'vendor/different-model' },
    rule,
  });
  assert.equal(result.ok, false);
  assert.equal(client.calls, 0);
  assert.equal(result.modelCallCount, 0);
  console.log('ok - compatibility results count only requests that reached the provider');
}

{
  const controller = new AbortController();
  controller.abort();
  const client = createFixtureClient();
  await assert.rejects(
    runChatFcZeroWriteCompatibilityTest({
      client,
      config: profile,
      rule,
      signal: controller.signal,
    }),
    error => error?.name === 'AbortError',
  );
  assert.equal(client.calls, 0);
  console.log('ok - cancellation performs no provider call and no fallback');
}

console.log('chat-fc-zero-write-compat-test-tests passed');
