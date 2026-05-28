import assert from 'node:assert/strict';

import { OpenAIProvider } from '../../src/scripts/api/providers/openai.js';
import { GeminiProvider } from '../../src/scripts/api/providers/gemini.js';
import { MakersuiteProvider } from '../../src/scripts/api/providers/makersuite.js';
import { VertexAIProvider } from '../../src/scripts/api/providers/vertexai.js';
import { createProviderToolCallDeltaAccumulator } from '../../src/scripts/agent/provider-tool-call-delta-adapter.js';
import { normalizeProviderToolCall } from '../../src/scripts/agent/provider-tool-call-parts.js';
import {
  PROVIDER_TOOL_REQUEST_FORMATS,
  buildProviderToolRequestSchema,
} from '../../src/scripts/agent/provider-tool-request-schema.js';

const contactListTool = {
  name: 'contact_profile.list',
  title: 'List contact profiles',
  description: 'List stored contact profiles in the current scope.',
  permissions: ['storage'],
  riskLevel: 'low',
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      limit: { type: 'integer', minimum: 0, maximum: 1000 },
    },
  },
};

const contactGetTool = {
  name: 'contact_profile.get',
  title: 'Get contact profile',
  description: 'Get a stored contact profile by contact id.',
  permissions: ['storage'],
  riskLevel: 'low',
  schema: {
    type: 'object',
    required: ['contactId'],
    additionalProperties: false,
    properties: {
      contactId: { type: 'string', minLength: 1 },
    },
  },
};

const createRegistry = ({
  gate = { enabled: true, allowedTools: ['contact_profile.list'], source: 'test' },
  tools = [contactListTool],
} = {}) => ({
  actions: {
    getProviderToolSessionGate: () => gate,
    getAgentTool: name => tools.find(tool => tool.name === name) || null,
    listAgentTools: () => tools.slice(),
  },
});

{
  const schema = buildProviderToolRequestSchema({
    debugUiRegistry: createRegistry({ gate: { enabled: false, allowedTools: ['contact_profile.list'] } }),
    provider: 'openai',
    model: 'gpt-tool',
    sessionId: 's1',
  });

  assert.equal(schema.enabled, false);
  assert.equal(schema.diagnostics.reason, 'provider tool session gate is disabled');
  assert.deepEqual(schema.requestOptions, {});
  console.log('ok - provider tool request schema stays disabled until the session gate is enabled');
}

{
  const schema = buildProviderToolRequestSchema({
    debugUiRegistry: createRegistry(),
    provider: 'openai',
    model: 'gpt-tool',
    sessionId: 's1',
  });

  assert.equal(schema.enabled, true);
  assert.equal(schema.diagnostics.format, PROVIDER_TOOL_REQUEST_FORMATS.openai);
  assert.deepEqual(schema.diagnostics.internalToolNames, ['contact_profile.list']);
  assert.deepEqual(schema.diagnostics.providerToolNames, ['contact_profile_list']);
  assert.equal(schema.requestOptions.tool_choice, 'auto');
  assert.equal(schema.requestOptions.tools[0].function.name, 'contact_profile_list');
  assert.equal(schema.requestOptions.tools[0].function.parameters.properties.limit.type, 'integer');
  console.log('ok - provider tool request schema builds OpenAI-compatible function tools');
}

{
  const schema = buildProviderToolRequestSchema({
    debugUiRegistry: createRegistry({
      gate: { enabled: true, allowedTools: ['contact_profile.list', 'contact_profile.get'] },
      tools: [contactListTool, contactGetTool],
    }),
    provider: 'openai',
    model: 'gpt-tool',
    sessionId: 's1',
  });

  assert.equal(schema.enabled, true);
  assert.deepEqual(schema.diagnostics.internalToolNames, ['contact_profile.list', 'contact_profile.get']);
  assert.deepEqual(schema.diagnostics.providerToolNames, ['contact_profile_list', 'contact_profile_get']);
  const getTool = schema.requestOptions.tools.find(tool => tool.function.name === 'contact_profile_get');
  assert.equal(getTool.function.parameters.required[0], 'contactId');
  assert.equal(getTool.function.parameters.properties.contactId.type, 'string');
  console.log('ok - provider tool request schema exposes contact_profile_get with provider-safe name');
}

{
  const schema = buildProviderToolRequestSchema({
    debugUiRegistry: createRegistry(),
    provider: 'anthropic',
    model: 'claude-tool',
    sessionId: 's1',
  });

  assert.equal(schema.enabled, true);
  assert.equal(schema.diagnostics.format, PROVIDER_TOOL_REQUEST_FORMATS.anthropic);
  assert.equal(schema.requestOptions.tools[0].name, 'contact_profile_list');
  assert.equal(schema.requestOptions.tools[0].input_schema.properties.limit.maximum, 1000);
  console.log('ok - provider tool request schema builds Anthropic tool schemas');
}

{
  const schema = buildProviderToolRequestSchema({
    debugUiRegistry: createRegistry(),
    provider: 'gemini',
    model: 'gemini-tool',
    sessionId: 's1',
  });

  const declaration = schema.requestOptions.tools[0].functionDeclarations[0];
  assert.equal(schema.enabled, true);
  assert.equal(schema.diagnostics.format, PROVIDER_TOOL_REQUEST_FORMATS.gemini);
  assert.equal(declaration.name, 'contact_profile_list');
  assert.equal(declaration.parameters.type, 'OBJECT');
  assert.equal(declaration.parameters.properties.limit.type, 'INTEGER');
  assert.equal(Object.hasOwn(declaration.parameters, 'additionalProperties'), false);
  console.log('ok - provider tool request schema builds Gemini function declarations');
}

{
  const schema = buildProviderToolRequestSchema({
    debugUiRegistry: createRegistry(),
    provider: 'openai',
    model: 'gpt-tool',
    sessionId: 's1',
    existingOptions: [{ tools: [{ type: 'function' }] }],
  });

  assert.equal(schema.enabled, false);
  assert.equal(schema.diagnostics.reason, 'request already contains provider tool options');
  console.log('ok - provider tool request schema does not merge over existing provider tool options');
}

{
  const normalized = normalizeProviderToolCall({
    id: 'call-1',
    name: 'contact_profile_list',
    arguments: { limit: 1 },
  });

  assert.equal(normalized.toolName, 'contact_profile.list');
  assert.equal(normalized.toolCallId, 'call-1');
  assert.deepEqual(normalized.arguments, { limit: 1 });
  console.log('ok - provider-safe tool names map back to internal agent tool names');
}

{
  const accumulator = createProviderToolCallDeltaAccumulator({
    provider: 'openai',
    model: 'gpt-tool',
  });
  accumulator.push({
    choices: [{
      delta: {
        tool_calls: [{
          index: 0,
          id: 'call-2',
          function: {
            name: 'contact_profile_list',
            arguments: '{"limit":1}',
          },
        }],
      },
    }],
  });
  const done = accumulator.push({
    choices: [{ finish_reason: 'tool_calls' }],
  });

  assert.equal(done.completed[0].toolName, 'contact_profile.list');
  assert.deepEqual(done.completed[0].arguments, { limit: 1 });
  console.log('ok - provider-safe streaming tool names complete as internal agent tool calls');
}

{
  const accumulator = createProviderToolCallDeltaAccumulator({
    provider: 'openai',
    model: 'gpt-tool',
  });
  accumulator.push({
    choices: [{
      delta: {
        tool_calls: [{
          index: 0,
          id: 'call-get-1',
          function: {
            name: 'contact_profile_get',
            arguments: '{"contactId":"c1"}',
          },
        }],
      },
    }],
  });
  const done = accumulator.push({
    choices: [{ finish_reason: 'tool_calls' }],
  });

  assert.equal(done.completed[0].toolName, 'contact_profile.get');
  assert.deepEqual(done.completed[0].arguments, { contactId: 'c1' });
  console.log('ok - provider-safe contact_profile_get delta maps back to internal tool');
}

{
  const schema = buildProviderToolRequestSchema({
    debugUiRegistry: createRegistry(),
    provider: 'openai',
    model: 'gpt-tool',
    sessionId: 's1',
  });
  const provider = new OpenAIProvider({
    provider: 'openai',
    apiKey: 'test-key',
    model: 'gpt-tool',
  });
  const prepared = provider.prepareChatRequest([
    { role: 'user', content: 'hello' },
  ], schema.requestOptions);

  assert.equal(prepared.payload.tools[0].function.name, 'contact_profile_list');
  assert.equal(prepared.payload.tool_choice, 'auto');
  console.log('ok - OpenAI provider preserves provider tool request options in payloads');
}

{
  const schema = buildProviderToolRequestSchema({
    debugUiRegistry: createRegistry(),
    provider: 'gemini',
    model: 'gemini-tool',
    sessionId: 's1',
  });
  const messages = [{ role: 'user', content: 'hello' }];
  const geminiBody = new GeminiProvider({
    apiKey: 'test-key',
    model: 'gemini-tool',
  }).buildRequestBody(messages, schema.requestOptions);
  const makersuiteBody = new MakersuiteProvider({
    apiKey: 'test-key',
    model: 'gemini-tool',
  }).buildRequestBody(messages, schema.requestOptions);
  const vertexBody = new VertexAIProvider({
    apiKey: 'test-key',
    model: 'gemini-tool',
    vertexaiProjectId: 'test-project',
  }).buildRequestBody(messages, schema.requestOptions);

  assert.equal(geminiBody.tools[0].functionDeclarations[0].name, 'contact_profile_list');
  assert.equal(makersuiteBody.tools[0].functionDeclarations[0].name, 'contact_profile_list');
  assert.equal(vertexBody.tools[0].functionDeclarations[0].name, 'contact_profile_list');
  console.log('ok - Gemini-family providers preserve function declarations in request bodies');
}
