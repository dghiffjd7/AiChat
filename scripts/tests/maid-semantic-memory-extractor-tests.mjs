import assert from 'node:assert/strict';

import {
  buildMaidSemanticMemoryCandidateKeys,
  createMaidSemanticMemoryExtractor,
  projectMaidStructuredMemoriesFromResult,
} from '../../src/scripts/agent/maid-semantic-memory-extractor.js';

{
  const memories = projectMaidStructuredMemoriesFromResult({
    status: 'interrupted',
    continuable: true,
    continueHint: '继续绑定剩余聊天室',
    steps: [
      {
        toolName: 'worldbook.create',
        title: '创建世界书',
        args: { name: '雾港设定' },
        status: 'succeeded',
        summary: '已创建雾港设定',
        output: { worldbookId: 'wb-fog', name: '雾港设定' },
      },
      {
        toolName: 'worldbook.bind_sessions',
        args: { worldbookId: 'wb-fog', preview: true },
        status: 'succeeded',
        summary: '预览完成',
        output: { worldbookId: 'wb-fog' },
      },
      {
        toolName: 'worldbook.read',
        args: { worldbookId: 'wb-fog' },
        status: 'succeeded',
        summary: '读取成功',
        output: { id: 'wb-fog' },
      },
    ],
  });
  assert.equal(memories.some(memory => memory.kind === 'resource_state' && memory.resourceRef.id === 'wb-fog'), true);
  assert.equal(memories.some(memory => memory.kind === 'task_state' && memory.status === 'active'), true);
  assert.equal(memories.filter(memory => memory.kind === 'resource_state').length, 1, 'preview/read 不得制造资源长期记忆');
  console.log('ok - structured memory projection keeps verified writes and skips preview/read noise');
}

{
  const memories = projectMaidStructuredMemoriesFromResult({
    status: 'succeeded',
    steps: [
      {
        toolName: 'worldbook.delete_entries',
        args: { worldbookId: 'wb-fog', entryIds: ['entry-1'] },
        status: 'succeeded',
        summary: '已删除一个重复条目',
        output: { ok: true, worldbookId: 'wb-fog', deletedCount: 1 },
      },
    ],
  });
  assert.equal(memories.length, 1);
  assert.equal(memories[0].resourceRef.id, 'wb-fog');
  assert.equal(memories[0].status, 'active', '删除条目只会修改世界书，不得把整本世界书标成 stale');
  console.log('ok - worldbook entry deletion keeps the parent worldbook resource active');
}

{
  const keys = buildMaidSemanticMemoryCandidateKeys([
    {
      id: 'turn-1',
      input: '普通操作以后默认后台执行；我明确要求查看时再打开主要界面。',
      message: '好的',
    },
    {
      id: 'turn-2',
      input: '回复尽量简洁一些。',
      message: '明白',
    },
  ]);
  assert.equal(keys.includes('presentation.default'), true);
  assert.equal(keys.includes('response.style'), true);
  assert.equal(buildMaidSemanticMemoryCandidateKeys([{ input: '你好呀' }]).length, 0);
  console.log('ok - natural memory extraction only offers deterministic controlled candidate keys');
}

{
  const repeatedPreference = buildMaidSemanticMemoryCandidateKeys([{
    id: 'turn-repeat',
    input: '再次确认：普通资源操作默认后台，回复保持简洁。',
  }]);
  assert.equal(repeatedPreference.includes('presentation.default'), true);
  assert.equal(repeatedPreference.includes('response.style'), true);
  assert.equal(
    repeatedPreference.includes('workflow.confirmation'),
    false,
    '普通对话里的“再次确认”不得被误判为执行确认偏好',
  );

  const executionConfirmation = buildMaidSemanticMemoryCandidateKeys([{
    id: 'turn-confirmation',
    input: '危险操作都必须在执行前让我确认，不能直接执行。',
  }]);
  assert.equal(executionConfirmation.includes('workflow.confirmation'), true);
  console.log('ok - confirmation candidate distinguishes conversational confirmation from execution policy');
}

{
  const calls = [];
  const extractor = createMaidSemanticMemoryExtractor({
    resolveRuntimeConfig: async () => ({
      configured: true,
      client: {
        chat: async (messages, options) => {
          calls.push({ messages, options });
          return [
            '```json',
            JSON.stringify({
              memories: [
                {
                  kind: 'preference',
                  key: 'presentation.default',
                  content: '普通操作默认后台执行；明确要求查看时再打开主要界面。',
                  confidence: 'explicit',
                  tags: ['呈现'],
                  sourceTurnIds: ['turn-1'],
                },
                {
                  kind: 'preference',
                  key: '模型自由发挥的键',
                  content: '不应通过',
                  confidence: 'explicit',
                  sourceTurnIds: ['turn-1'],
                },
                {
                  kind: 'decision',
                  key: 'presentation.default',
                  content: '来源不存在',
                  confidence: 'explicit',
                  sourceTurnIds: ['turn-missing'],
                },
              ],
            }),
            '```',
          ].join('\n');
        },
      },
      config: {},
    }),
    isConfigReady: () => true,
  });
  const result = await extractor({
    scopeId: 'maid_default',
    turns: [{
      id: 'turn-1',
      input: '普通操作以后默认后台执行；我明确要求查看时再打开主要界面。',
      message: '好的',
    }],
  });
  assert.equal(calls.length, 1);
  assert.equal(result.memories.length, 1);
  assert.equal(result.memories[0].key, 'presentation.default');
  assert.deepEqual(result.memories[0].sourceTurnIds, ['turn-1']);
  assert.equal(result.candidateKeys.includes('presentation.default'), true);
  assert.match(calls[0].messages[0].content, /允许输出 0 条/);

  const noCandidate = await extractor({
    scopeId: 'maid_default',
    turns: [{ id: 'turn-2', input: '你好呀', message: '你好' }],
  });
  assert.deepEqual(noCandidate, { memories: [], candidateKeys: [] });
  assert.equal(calls.length, 1, '没有候选 key 时不应调用模型');
  console.log('ok - model extractor validates keys and source turns, and skips calls with no durable candidates');
}

{
  const calls = [];
  const extractor = createMaidSemanticMemoryExtractor({
    resolveRuntimeConfig: async () => ({
      configured: true,
      client: {
        chat: async (_messages, options) => {
          calls.push('custom');
          options.onProviderUsage?.({
            provider: 'pioneer',
            model: 'memory-custom',
            promptTokens: 90,
            completionTokens: 10,
          });
          return 'not-json';
        },
      },
      config: { model: 'memory-custom' },
      memoryExtractionMode: 'custom',
      memoryExtractionModelSource: 'custom',
      extractionFallbackClient: {
        chat: async (_messages, options) => {
          calls.push('main');
          options.onProviderUsage?.({
            provider: 'deepseek',
            model: 'maid-main',
            promptTokens: 80,
            completionTokens: 20,
          });
          return JSON.stringify({
            memories: [{
              kind: 'preference',
              key: 'response.style',
              content: '回复保持简洁。',
              confidence: 'explicit',
              sourceTurnIds: ['turn-fallback'],
            }],
          });
        },
      },
      extractionFallbackConfig: { model: 'maid-main' },
    }),
    isConfigReady: () => true,
    logger: { warn() {} },
  });
  const result = await extractor({
    scopeId: 'maid_default',
    turns: [{
      id: 'turn-fallback',
      input: '今后回复保持简洁。',
      message: '好的',
    }],
  });
  assert.deepEqual(calls, ['custom', 'main']);
  assert.equal(result.memories.length, 1);
  assert.equal(result.fallbackUsed, true);
  assert.equal(result.modelSource, 'maid_main_fallback');
  assert.equal(result.model, 'maid-main');
  assert.equal(result.usageEntries.length, 2);
  assert.deepEqual(
    result.usageEntries.map(entry => ({
      provider: entry.provider,
      model: entry.model,
      totalTokens: entry.totalTokens,
      modelCallCount: entry.modelCallCount,
      degraded: entry.degraded,
      source: entry.source,
    })),
    [
      {
        provider: 'pioneer',
        model: 'memory-custom',
        totalTokens: 100,
        modelCallCount: 1,
        degraded: false,
        source: 'custom',
      },
      {
        provider: 'deepseek',
        model: 'maid-main',
        totalTokens: 100,
        modelCallCount: 1,
        degraded: true,
        source: 'maid_main_fallback',
      },
    ],
  );
  console.log('ok - invalid custom extraction JSON falls back to the maid main model once');
}

{
  let mainCalls = 0;
  const extractor = createMaidSemanticMemoryExtractor({
    resolveRuntimeConfig: async () => ({
      configured: true,
      client: { chat: async () => 'not-json' },
      config: { model: 'memory-custom' },
      extractionFallbackClient: null,
    }),
    logger: { warn() {} },
  });
  await assert.rejects(
    () => extractor({
      turns: [{
        id: 'turn-no-fallback',
        input: '今后回复保持简洁。',
        message: '好的',
      }],
    }),
    /invalid JSON/,
  );
  assert.equal(mainCalls, 0);
  console.log('ok - disabled maid-main fallback leaves custom extraction failure to bounded batch retry');
}

console.log('maid-semantic-memory-extractor-tests passed');
