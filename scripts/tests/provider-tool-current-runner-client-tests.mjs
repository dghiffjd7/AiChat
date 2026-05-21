import assert from 'node:assert/strict';

import { resolveProviderToolCurrentRunnerClient } from '../../src/scripts/agent/provider-tool-current-runner-client.js';

const armedGate = Object.freeze({
  enabled: true,
  networkAllowed: true,
  realRunnerAllowed: true,
  writesChat: false,
});

{
  let created = false;
  const result = await resolveProviderToolCurrentRunnerClient({
    enabled: false,
    allowCurrentProviderRunner: true,
    allowRunnerNetwork: true,
    sessionGate: armedGate,
    createClient: () => {
      created = true;
      return {};
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 'disabled');
  assert.equal(result.providerClient, null);
  assert.equal(created, false);
  console.log('ok - provider tool current runner client stays disabled by default');
}

{
  let resolved = false;
  const result = await resolveProviderToolCurrentRunnerClient({
    enabled: true,
    allowCurrentProviderRunner: true,
    allowRunnerNetwork: true,
    sessionGate: {
      enabled: true,
      networkAllowed: false,
      realRunnerAllowed: true,
    },
    bridge: {
      resolveRequestRuntimeConfig: async () => {
        resolved = true;
        return {};
      },
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 'blocked');
  assert.equal(result.reason, 'current provider runner blocked by session gate');
  assert.equal(resolved, false);
  console.log('ok - provider tool current runner client requires armed session gate before resolving config');
}

{
  const result = await resolveProviderToolCurrentRunnerClient({
    enabled: true,
    allowCurrentProviderRunner: false,
    allowRunnerNetwork: true,
    sessionGate: armedGate,
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 'blocked');
  assert.equal(result.reason, 'current provider runner requires explicit runner and network allowance');
  console.log('ok - provider tool current runner client requires explicit current-provider allowance');
}

{
  const configs = [];
  const llmClient = {
    streamChat: async function* () {
      yield 'ok';
    },
  };
  const result = await resolveProviderToolCurrentRunnerClient({
    enabled: true,
    allowCurrentProviderRunner: true,
    allowRunnerNetwork: true,
    sessionGate: armedGate,
    sessionId: 's1',
    uiMode: 'chat',
    bridge: {
      resolveRequestRuntimeConfig: async context => ({
        config: {
          provider: 'openai',
          model: 'gpt-current',
          apiKey: 'secret-key',
          baseUrl: 'https://api.example.test/v1',
          stream: true,
        },
        profileId: 'profile-1',
        bindingSource: 'session',
        bound: true,
        sessionId: context.sessionId,
        uiMode: context.uiMode,
      }),
    },
    createClient: (config) => {
      configs.push(config);
      return llmClient;
    },
    now: () => 1000,
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, 'ready');
  assert.equal(result.providerClient, llmClient);
  assert.equal(result.diagnostics.clientKind, 'llmclient_stream_chat');
  assert.equal(result.diagnostics.provider, 'openai');
  assert.equal(result.diagnostics.config.apiKey, undefined);
  assert.equal(result.diagnostics.config.configured, true);
  assert.equal(result.diagnostics.runtime.profileId, 'profile-1');
  assert.equal(result.runnerRequestOptions.configProfileId, 'profile-1');
  assert.equal(configs.length, 1);
  console.log('ok - provider tool current runner client builds OpenAI streamChat client from resolved config');
}

{
  const llmClient = {
    provider: {
      requestJson: async () => ({ content: [{ type: 'text', text: 'unused' }] }),
    },
  };
  const result = await resolveProviderToolCurrentRunnerClient({
    enabled: true,
    allowCurrentProviderRunner: true,
    allowRunnerNetwork: true,
    sessionGate: armedGate,
    bridge: {
      resolveRequestRuntimeConfig: async () => ({
        config: {
          provider: 'anthropic',
          model: 'claude-current',
          apiKey: 'secret-key',
        },
        client: llmClient,
      }),
    },
    createClient: () => {
      throw new Error('runtime client should be reused');
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.diagnostics.clientKind, 'llmclient_native_shim');
  assert.equal(typeof result.providerClient.runProviderToolRequest, 'function');
  console.log('ok - provider tool current runner client wraps Anthropic current client with native shim');
}

{
  const result = await resolveProviderToolCurrentRunnerClient({
    enabled: true,
    allowCurrentProviderRunner: true,
    allowRunnerNetwork: true,
    sessionGate: armedGate,
    bridge: {
      resolveRequestRuntimeConfig: async () => ({
        config: {
          provider: 'openai',
          model: 'missing-key',
        },
      }),
    },
    createClient: () => ({ streamChat: async function* () {} }),
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 'blocked');
  assert.equal(result.reason, 'current provider config is not ready');
  assert.equal(result.providerClient, null);
  console.log('ok - provider tool current runner client blocks incomplete current config');
}
