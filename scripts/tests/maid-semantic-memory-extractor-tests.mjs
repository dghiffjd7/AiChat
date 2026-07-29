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

console.log('maid-semantic-memory-extractor-tests passed');
