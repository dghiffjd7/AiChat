import assert from 'node:assert/strict';

import {
  AGENT_PERMISSION_DECISIONS,
  createAgentPermissionEvaluator,
} from '../../src/scripts/agent/agent-permissions.js';
import { createAgentToolRegistry } from '../../src/scripts/agent/agent-tool-registry.js';
import { createMaidMemoryTools } from '../../src/scripts/agent/tools/maid-memory-tools.js';

const getTool = (tools, name) => tools.find(tool => tool.name === name);

const createMemoryStore = () => {
  const memories = new Map([
    ['pref-explicit', {
      id: 'pref-explicit',
      kind: 'preference',
      key: 'presentation.default',
      content: `普通操作默认后台执行，明确要求查看时才打开主要结果。${'补充'.repeat(120)}`,
      confidence: 'explicit',
      status: 'active',
      tags: ['呈现'],
      sourceTurnIds: ['turn-secret-a'],
      updatedAt: 5000,
    }],
    ['decision-active', {
      id: 'decision-active',
      kind: 'decision',
      key: 'workflow.confirmation',
      content: '批量删除必须先展示确认清单。',
      confidence: 'verified',
      status: 'active',
      sourceTurnIds: ['turn-secret-b'],
      updatedAt: 4000,
    }],
    ['task-active', {
      id: 'task-active',
      kind: 'task_state',
      key: 'task.memory_test',
      content: '正在验证女仆记忆归档。',
      confidence: 'verified',
      status: 'active',
      updatedAt: 3000,
    }],
    ['already-archived', {
      id: 'already-archived',
      kind: 'important_event',
      key: 'event.old_probe',
      content: '旧测试探针。',
      confidence: 'inferred',
      status: 'archived',
      updatedAt: 2000,
    }],
    ['resolved-item', {
      id: 'resolved-item',
      kind: 'task_state',
      key: 'task.finished_probe',
      content: '已完成的测试任务。',
      confidence: 'verified',
      status: 'resolved',
      updatedAt: 1000,
    }],
  ]);
  const statusCalls = [];
  return {
    memories,
    statusCalls,
    listMemories(options = {}) {
      const kinds = new Set(
        (Array.isArray(options.kind) ? options.kind : [options.kind])
          .map(value => String(value || '').trim())
          .filter(Boolean),
      );
      const statuses = new Set(
        (Array.isArray(options.statuses) ? options.statuses : [options.status])
          .map(value => String(value || '').trim())
          .filter(Boolean),
      );
      const needle = String(options.query || '').trim();
      return Array.from(memories.values())
        .filter(memory => !kinds.size || kinds.has(memory.kind))
        .filter(memory => !statuses.size || statuses.has(memory.status))
        .filter(memory => !needle || `${memory.key} ${memory.content}`.includes(needle))
        .sort((left, right) => right.updatedAt - left.updatedAt)
        .slice(0, options.limit || undefined)
        .map(memory => structuredClone(memory));
    },
    getMemory(id) {
      const memory = memories.get(id);
      return memory ? structuredClone(memory) : null;
    },
    async setMemoryStatus(id, status) {
      const memory = memories.get(id);
      if (!memory) return null;
      statusCalls.push([id, status]);
      memory.status = status;
      memory.updatedAt += 1;
      return structuredClone(memory);
    },
  };
};

{
  const store = createMemoryStore();
  const tools = createMaidMemoryTools({ semanticMemoryStore: store });
  const listed = await getTool(tools, 'maid.memory.list').execute({});
  assert.equal(listed.ok, true);
  assert.equal(listed.count, 3, '缺省只列出 active 长期记忆');
  assert.deepEqual(listed.items.map(item => item.id), [
    'pref-explicit',
    'decision-active',
    'task-active',
  ]);
  assert.ok(listed.items[0].contentSummary.length <= 240);
  assert.equal(Object.hasOwn(listed.items[0], 'sourceTurnIds'), false);
  assert.equal(JSON.stringify(listed).includes('turn-secret-a'), false);

  const archived = await getTool(tools, 'maid.memory.list').execute({
    status: 'archived',
    kind: 'important_event',
    query: '测试',
    limit: 5,
  });
  assert.deepEqual(archived.items.map(item => item.id), ['already-archived']);
  console.log('ok - maid.memory.list defaults to active and returns bounded summaries without source turns');
}

{
  const store = createMemoryStore();
  const tools = createMaidMemoryTools({ semanticMemoryStore: store });
  const registry = createAgentToolRegistry({
    permissionEvaluator: createAgentPermissionEvaluator({
      defaultDecision: AGENT_PERMISSION_DECISIONS.allow,
    }),
    logger: { warn() {} },
  });
  registry.registerMany(tools);
  let confirmation = null;
  const output = await registry.executeTool('maid.memory.archive', {
    memoryIds: [
      'pref-explicit',
      'decision-active',
      'task-active',
      'already-archived',
      'resolved-item',
      'missing-item',
      'pref-explicit',
    ],
  }, {
    operationIntentPolicy: { mode: 'write_allowed' },
    requestToolConfirmation: request => {
      confirmation = request;
      store.memories.delete('decision-active');
      return true;
    },
  });

  assert.equal(output.status, 'succeeded');
  assert.equal(confirmation.kind, 'maid.memory.archive');
  assert.equal(confirmation.allowAlways, false);
  assert.equal(confirmation.danger, false);
  assert.equal(
    confirmation.details.items.find(item => item.id === 'pref-explicit').warning,
    true,
    '用户明确的偏好应在确认列表中醒目标警',
  );
  assert.equal(
    confirmation.details.items.find(item => item.id === 'task-active').reason,
    'active_task_state_protected',
  );
  assert.match(
    confirmation.details.items.find(item => item.id === 'pref-explicit').label,
    /普通操作默认后台执行/,
  );
  assert.deepEqual(store.statusCalls, [['pref-explicit', 'archived']]);
  assert.equal(output.result.archivedCount, 1);
  assert.equal(output.result.protectedCount, 1);
  assert.equal(output.result.skippedCount, 5);
  assert.equal(
    output.result.results.find(item => item.id === 'decision-active').reason,
    'memory_not_found',
    '确认期间消失的目标应按 TOCTOU 幂等跳过',
  );
  assert.equal(JSON.stringify(output.result).includes('普通操作默认后台执行'), false);
  assert.equal(JSON.stringify(output.result).includes('turn-secret'), false);
  console.log('ok - maid.memory.archive confirms frozen ids, protects active tasks, and keeps UI details out of model output');
}

{
  const store = createMemoryStore();
  const tools = createMaidMemoryTools({ semanticMemoryStore: store });
  const registry = createAgentToolRegistry({
    permissionEvaluator: createAgentPermissionEvaluator({
      defaultDecision: AGENT_PERMISSION_DECISIONS.allow,
    }),
    logger: { warn() {} },
  });
  registry.registerMany(tools);
  let confirmation = null;
  const cancelled = await registry.executeTool('maid.memory.archive', {
    memoryIds: ['pref-explicit'],
  }, {
    operationIntentPolicy: { mode: 'write_allowed' },
    requestToolConfirmation: request => {
      confirmation = request;
      return false;
    },
  });
  assert.equal(cancelled.status, 'skipped');
  assert.equal(cancelled.result.reason, 'maid_memory_archive_cancelled');
  assert.equal(confirmation.allowAlways, false);
  assert.equal(store.getMemory('pref-explicit').status, 'active');

  const preview = await getTool(tools, 'maid.memory.archive').execute({
    memoryIds: ['pref-explicit', 'task-active'],
    preview: true,
  });
  assert.equal(preview.preview, true);
  assert.equal(preview.plannedCount, 1);
  assert.equal(preview.protectedCount, 1);
  assert.deepEqual(store.statusCalls, []);
  console.log('ok - maid.memory.archive cancellation and preview are non-mutating');
}

console.log('maid-memory-tools-tests passed');
