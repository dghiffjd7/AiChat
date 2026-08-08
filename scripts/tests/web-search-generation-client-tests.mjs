import assert from 'node:assert/strict';

import { createWebSearchGenerationClient } from '../../src/scripts/ui/chat/web-search-generation-client.js';

const fallbackPlan = {
  enabled: true,
  fallback: true,
  fallbackToolNames: {
    web_search: 'web.search',
    web_research: 'web.research',
  },
};

{
  const calls = [];
  const preparedOptions = [];
  const usages = [];
  const sourceReports = [];
  const client = {
    prepareChatRequest(messages, options) {
      preparedOptions.push(options);
      return { messages, normalizedOptions: options, payload: { messages, ...options } };
    },
    async chat(messages, options) {
      calls.push({ messages, options });
      if (calls.length === 1) {
        options.onProviderToolCallDelta?.({
          choices: [{
            message: {
              reasoning_content: 'I need current information.',
              tool_calls: [{
                id: 'call-1',
                type: 'function',
                function: { name: 'web_research', arguments: '{"query":"today news"}' },
              }],
            },
            finish_reason: 'tool_calls',
          }],
        }, { provider: 'deepseek', model: 'deepseek-chat' });
        options.onProviderUsage?.({ promptTokens: 10, completionTokens: 2, totalTokens: 12 });
        return '';
      }
      options.onProviderUsage?.({ promptTokens: 20, completionTokens: 8, totalTokens: 28 });
      return 'grounded answer';
    },
  };
  const runtime = {
    async executeTool(name, args) {
      assert.equal(name, 'web.research');
      assert.deepEqual(args, { query: 'today news' });
      return {
        toolName: name,
        status: 'succeeded',
        result: {
          ok: true,
          query: args.query,
          sources: [{ url: 'https://news.example/a', title: 'News A' }],
          documents: [{ url: 'https://news.example/a', title: 'News A', text: 'facts' }],
        },
        summary: 'done',
      };
    },
  };
  const wrapped = createWebSearchGenerationClient({
    client,
    plan: fallbackPlan,
    toolRuntime: runtime,
    provider: 'deepseek',
    model: 'deepseek-chat',
    sessionId: 's1',
  });
  const prepared = wrapped.prepareChatRequest([{ role: 'user', content: 'Preview' }], {
    tools: [{ type: 'function', function: { name: 'web_research' } }],
  });
  assert.equal(Object.hasOwn(preparedOptions[0], 'deepseekPrefix'), false);
  assert.ok(prepared);
  const result = await wrapped.chat([{ role: 'user', content: 'What happened?' }], {
    tools: [{ type: 'function', function: { name: 'web_research' } }],
    tool_choice: 'auto',
    onProviderUsage: usage => usages.push(usage),
    onProviderSources: sources => sourceReports.push(sources),
  });
  assert.equal(result, 'grounded answer');
  assert.equal(calls.length, 2);
  assert.equal(calls[1].messages.at(-2).role, 'assistant');
  assert.equal(calls[1].messages.at(-2).reasoning_content, 'I need current information.');
  assert.equal(calls[1].messages.at(-2).tool_calls[0].function.name, 'web_research');
  assert.equal(calls[1].messages.at(-1).role, 'tool');
  assert.equal(Object.hasOwn(calls[1].options, 'tools'), false);
  assert.deepEqual(usages, [{
    provider: 'deepseek',
    model: 'deepseek-chat',
    finishReason: '',
    promptTokens: 30,
    completionTokens: 10,
    totalTokens: 40,
    requestCount: 2,
    webSearch: true,
  }]);
  assert.deepEqual(sourceReports.at(-1), [{
    url: 'https://news.example/a',
    title: 'News A',
    provider: 'web.research',
  }]);
}
console.log('ok - fallback chat executes only the allowlisted web tool and performs one bounded continuation');

{
  let turn = 0;
  const statuses = [];
  const calls = [];
  const client = {
    async *streamChat(messages, options) {
      calls.push({ messages, options });
      turn += 1;
      if (turn === 1) {
        options.onProviderToolCallDelta?.({
          choices: [{ delta: { reasoning_content: 'Need live weather. ' } }],
        }, { provider: 'deepseek', model: 'deepseek-reasoner' });
        options.onProviderToolCallDelta?.({
          choices: [{ delta: { tool_calls: [{
            index: 0,
            id: 'call-reasoning',
            function: { name: 'web_search', arguments: '{"query":"weather"}' },
          }] } }],
        }, { provider: 'deepseek', model: 'deepseek-reasoner' });
        options.onProviderToolCallDelta?.({ choices: [{ delta: {}, finish_reason: 'tool_calls' }] }, {
          provider: 'deepseek', model: 'deepseek-reasoner',
        });
        return;
      }
      yield 'sunny';
    },
  };
  const wrapped = createWebSearchGenerationClient({
    client,
    plan: fallbackPlan,
    toolRuntime: {
      executeTool: async () => ({ status: 'succeeded', result: { ok: true, results: [] } }),
    },
    provider: 'deepseek',
    model: 'deepseek-reasoner',
  });
  const chunks = [];
  for await (const chunk of wrapped.streamChat([{ role: 'user', content: 'weather' }], {
    onWebSearchStatus: status => statuses.push(status),
  })) chunks.push(chunk);
  assert.deepEqual(chunks, ['sunny']);
  assert.equal(calls[1].messages.at(-2).reasoning_content, 'Need live weather. ');
  assert.deepEqual(statuses.map(item => item.state), ['searching', 'continuing', 'done']);
}
console.log('ok - fallback stream preserves DeepSeek reasoning and reports visible search progress');

{
  // DeepSeek prefix 前缀补全请求整体绕过联网：前缀原样传递、工具选项剥除、单轮直达
  const calls = [];
  const preparedOptions = [];
  const wrapped = createWebSearchGenerationClient({
    client: {
      prepareChatRequest(messages, options) {
        preparedOptions.push(options);
        return { messages, normalizedOptions: options, responsePrefix: options?.deepseekPrefix?.prefix || '' };
      },
      async chat(messages, options) {
        calls.push({ messages, options });
        return 'prefixed continuation';
      },
      async *streamChat(messages, options) {
        calls.push({ messages, options, stream: true });
        yield 'prefixed stream';
      },
    },
    plan: fallbackPlan,
    toolRuntime: {
      executeTool: async () => {
        throw new Error('prefix request must not execute web tools');
      },
    },
    provider: 'deepseek',
    model: 'deepseek-chat',
  });
  const prepared = wrapped.prepareChatRequest([{ role: 'user', content: 'Preview' }], {
    tools: [{ type: 'function', function: { name: 'web_research' } }],
    deepseekPrefix: { prefix: '<content>' },
  });
  assert.deepEqual(preparedOptions[0].deepseekPrefix, { prefix: '<content>' });
  assert.equal(Object.hasOwn(preparedOptions[0], 'tools'), false);
  assert.equal(prepared.responsePrefix, '<content>');
  const result = await wrapped.chat([{ role: 'user', content: '继续写' }], {
    tools: [{ type: 'function', function: { name: 'web_research' } }],
    tool_choice: 'auto',
    deepseekPrefix: { prefix: '<content>' },
  });
  assert.equal(result, 'prefixed continuation');
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].options.deepseekPrefix, { prefix: '<content>' });
  assert.equal(Object.hasOwn(calls[0].options, 'tools'), false);
  const chunks = [];
  for await (const chunk of wrapped.streamChat([{ role: 'user', content: '继续写' }], {
    tools: [{ type: 'function', function: { name: 'web_research' } }],
    deepseekPrefix: { prefix: '<content>' },
  })) chunks.push(chunk);
  assert.deepEqual(chunks, ['prefixed stream']);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1].options.deepseekPrefix, { prefix: '<content>' });
  assert.equal(Object.hasOwn(calls[1].options, 'tools'), false);
}
console.log('ok - deepseek prefix requests bypass web search with the prefix intact');

{
  let releaseStream;
  const streamGate = new Promise(resolve => { releaseStream = resolve; });
  const wrapped = createWebSearchGenerationClient({
    client: {
      async *streamChat() {
        yield 'first';
        await streamGate;
        yield ' second';
      },
    },
    plan: fallbackPlan,
    toolRuntime: { executeTool: async () => null },
    provider: 'custom',
    model: 'model',
  });
  const iterator = wrapped.streamChat([{ role: 'user', content: 'hello' }], {});
  const firstPending = iterator.next();
  const first = await Promise.race([
    firstPending,
    new Promise(resolve => setTimeout(() => resolve({ timedOut: true }), 40)),
  ]);
  releaseStream();
  if (first?.timedOut) await firstPending;
  assert.equal(first?.timedOut, undefined);
  assert.deepEqual(first, { value: 'first', done: false });
  assert.deepEqual(await iterator.next(), { value: ' second', done: false });
  assert.deepEqual(await iterator.next(), { value: undefined, done: true });
}
console.log('ok - fallback stream forwards ordinary text before the first tool-call delta');

{
  const client = {
    prepareChatRequest(messages, options) {
      return { messages, normalizedOptions: options };
    },
    async *streamChat(_messages, options) {
      options.onProviderToolCallDelta?.({
        choices: [{ delta: { content: 'I will search.' } }],
      }, { provider: 'custom', model: 'model' });
      yield 'I will search.';
      options.onProviderToolCallDelta?.({
        choices: [{
          delta: {
            tool_calls: [{
              index: 0,
              id: 'call-stream',
              function: { name: 'web_search', arguments: '{"query":"weather"}' },
            }],
          },
        }],
      }, { provider: 'custom', model: 'model' });
      options.onProviderToolCallDelta?.({
        choices: [{ delta: {}, finish_reason: 'tool_calls' }],
      }, { provider: 'custom', model: 'model' });
    },
  };
  let turn = 0;
  client.streamChat = async function* (_messages, options) {
    turn += 1;
    if (turn === 1) {
      yield 'I will search.';
      options.onProviderToolCallDelta?.({
        choices: [{ delta: { tool_calls: [{
          index: 0,
          id: 'call-stream',
          function: { name: 'web_search', arguments: '{"query":"weather"}' },
        }] } }],
      }, { provider: 'custom', model: 'model' });
      options.onProviderToolCallDelta?.({ choices: [{ delta: {}, finish_reason: 'tool_calls' }] }, {
        provider: 'custom', model: 'model',
      });
      yield 'hidden after tool call';
      return;
    }
    yield 'final ';
    yield 'weather';
  };
  const wrapped = createWebSearchGenerationClient({
    client,
    plan: fallbackPlan,
    toolRuntime: {
      executeTool: async () => ({
        status: 'succeeded',
        result: { results: [{ url: 'https://weather.example', title: 'Weather' }] },
      }),
    },
    provider: 'custom',
    model: 'model',
  });
  const chunks = [];
  for await (const chunk of wrapped.streamChat([{ role: 'user', content: 'weather' }], {})) chunks.push(chunk);
  assert.deepEqual(chunks, ['I will search.', 'final ', 'weather']);
}
console.log('ok - fallback stream switches to buffering only after the first tool-call delta');

{
  const controller = new AbortController();
  let markToolStarted;
  const toolStarted = new Promise(resolve => { markToolStarted = resolve; });
  const wrapped = createWebSearchGenerationClient({
    client: {
      async chat(_messages, options) {
        options.onProviderToolCallDelta?.({
          choices: [{
            message: {
              tool_calls: [{
                id: 'call-abort',
                type: 'function',
                function: { name: 'web_search', arguments: '{"query":"slow"}' },
              }],
            },
            finish_reason: 'tool_calls',
          }],
        });
        return '';
      },
    },
    plan: fallbackPlan,
    toolRuntime: {
      executeTool: async () => {
        markToolStarted();
        return new Promise(() => {});
      },
    },
    provider: 'custom',
    model: 'model',
  });
  const pending = wrapped.chat([{ role: 'user', content: 'slow' }], { signal: controller.signal });
  await toolStarted;
  controller.abort();
  await Promise.race([
    assert.rejects(pending, error => error?.name === 'AbortError'),
    new Promise((_, reject) => setTimeout(() => reject(new Error('abort did not settle web tool wait')), 100)),
  ]);
}
console.log('ok - fallback web tool wait stops promptly when the generation is aborted');
