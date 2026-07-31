import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const resultFiles = [
  'results-v4f-v2-pilot-0731.jsonl',
  'results-v4f-v2-core-0731.jsonl',
  'results-v4f-v2-capabilities-0731.jsonl',
  'results-v4f-v2-complex-0731.jsonl',
  'results-v4f-v2-media-0731.jsonl',
  'results-v4f-v2-media-recovery-0731.jsonl',
  'results-v4f-v2-chat-memory-a-0731.jsonl',
  'results-v4f-v2-chat-retry-0731.jsonl',
  'results-v4f-v2-chat-natural-0731.jsonl',
  'results-v4f-v2-format-repair-0731.jsonl',
  'results-v4f-v2-memory-management-0731.jsonl',
];

const missAttribution = new Map(Object.entries({
  'v4f-v2-pilot-0731-001|react|app.state.read': {
    category: 'secondary_cross_domain',
    reason: '主读取完成后的 APP 状态核对不在候选集；候选只覆盖会话与资源读取。',
  },
  'v4f-v2-core-0731-003|react_recovery|chat.send_message': {
    category: 'primary_history_query',
    reason: '恢复阶段仍需发送消息，但候选被先前创建／读取历史污染，发送能力未进入 Top-K。',
  },
  'v4f-v2-core-0731-017|planner|app.resource.read': {
    category: 'secondary_cross_domain',
    reason: '会话世界书绑定前的会话事实核对跨到通用资源读取，世界书候选集未覆盖。',
  },
  'v4f-v2-core-0731-035|planner|worldbook.list': {
    category: 'secondary_cross_domain',
    reason: '批量绑定前的世界书解析／核对步骤未进入以 bind_sessions 为主的候选集。',
  },
  'v4f-v2-core-0731-036|planner|app.resource.read': {
    category: 'secondary_cross_domain',
    reason: '绑定结果的会话侧读回跨到通用资源读取，世界书候选集未覆盖。',
  },
  'v4f-v2-capabilities-0731-005|react|session.create': {
    category: 'primary_history_query',
    reason: '先 list 再按缺项创建的条件动作没有保留到 ReAct 候选，只有查询能力命中。',
  },
  'v4f-v2-capabilities-0731-007|planner|session.list': {
    category: 'primary_history_query',
    reason: '批删预览／取消的自然话术没有召回会话列表前置步骤，落入通用候选集。',
  },
  'v4f-v2-capabilities-0731-008|react|session.list': {
    category: 'secondary_cross_domain',
    reason: '取消批删后的只读复验未进入以 delete_many 为主的候选集。',
  },
  'v4f-v2-capabilities-0731-020|planner|maid.memory.list': {
    category: 'memory_new_sequential',
    reason: '新的女仆语义记忆列出能力尚缺自然话术覆盖，候选只出现通用 memory.open。',
  },
  'v4f-v2-capabilities-0731-021|planner|maid.memory.archive': {
    category: 'memory_new_sequential',
    reason: '新的女仆语义记忆归档能力尚缺“清理／忘掉测试记忆”话术覆盖。',
  },
  'v4f-v2-complex-0731-016|react|session.open': {
    category: 'primary_history_query',
    reason: '长链最后“只打开主要结果”的动作被先前审计历史与 sticky 候选挤出 Top-K。',
  },
  'v4f-v2-media-0731-002|react|config.model.switch': {
    category: 'secondary_cross_domain',
    reason: '生图尺寸预检失败后读取配置能力跨域；候选仍集中于生图与壁纸写入。',
  },
  'v4f-v2-media-0731-003|react|session.list': {
    category: 'secondary_cross_domain',
    reason: '媒体结果读回前的会话解析步骤未进入以资源读取／媒体写入为主的候选集。',
  },
  'v4f-v2-media-0731-003|react_recovery|app.resource.read': {
    category: 'secondary_cross_domain',
    reason: '恢复阶段需要通用资源读回，但候选漂移到头像／壁纸写入能力。',
  },
  'v4f-v2-media-recovery-0731-001|react|app.resource.read': {
    category: 'secondary_cross_domain',
    reason: '壁纸写入后的最终状态读回未进入媒体写入候选集。',
  },
  'v4f-v2-memory-management-0731-002|react|maid.memory.archive': {
    category: 'memory_new_sequential',
    reason: '同一轮先 list 后 archive，第二个语义记忆能力没有随顺序目标保留。',
  },
}));

function readJsonl(file) {
  return readFileSync(join(here, file), 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function percentile(values, ratio) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(sorted.length * ratio) - 1];
}

const batches = [];
const tasks = [];
for (const file of resultFiles) {
  const rows = readJsonl(file);
  const batchTasks = rows.filter((row) => row.recordType === 'task_result');
  tasks.push(...batchTasks);
  batches.push({
    file,
    batch: rows.find((row) => row.recordType === 'batch_start')?.batch || file,
    taskCount: batchTasks.length,
    statusCounts: Object.fromEntries(
      [...new Set(batchTasks.map((task) => task.result?.status || 'unknown'))]
        .map((status) => [status, batchTasks.filter((task) => (task.result?.status || 'unknown') === status).length]),
    ),
  });
}

const statusCounts = {};
const durations = [];
let promptTokens = 0;
let completionTokens = 0;
let totalTokens = 0;
let modelCallCount = 0;
let toolCallCount = 0;
const misses = [];

for (const task of tasks) {
  const status = task.result?.status || 'unknown';
  statusCounts[status] = (statusCounts[status] || 0) + 1;
  durations.push(Number(task.durationMs) || 0);

  for (const run of task.runs || []) {
    promptTokens += Number(run.usage?.promptTokens) || 0;
    completionTokens += Number(run.usage?.completionTokens) || 0;
    totalTokens += Number(run.usage?.totalTokens) || 0;
    modelCallCount += Number(run.usage?.modelCallCount) || 0;
    toolCallCount += Number(run.usage?.toolCallCount) || 0;
  }

  for (const snapshot of task.snapshots || []) {
    if (!snapshot.validSelection || snapshot.candidateHit) continue;
    const selected = snapshot.selectedCapabilityId || snapshot.selectedToolName || '';
    const key = `${task.taskId}|${snapshot.phase}|${selected}`;
    const attribution = missAttribution.get(key);
    misses.push({
      taskId: task.taskId,
      snapshotId: snapshot.id,
      phase: snapshot.phase,
      selected,
      candidates: (snapshot.candidates || []).map((candidate) => candidate.id),
      category: attribution?.category || 'unattributed',
      reason: attribution?.reason || '',
    });
  }
}

const validSelections = tasks.reduce(
  (sum, task) => sum + (task.snapshots || []).filter((snapshot) => snapshot.validSelection).length,
  0,
);
const hitCount = tasks.reduce(
  (sum, task) => sum + (task.snapshots || []).filter(
    (snapshot) => snapshot.validSelection && snapshot.candidateHit,
  ).length,
  0,
);
const missCategoryCounts = Object.fromEntries(
  [...new Set(misses.map((miss) => miss.category))]
    .map((category) => [category, misses.filter((miss) => miss.category === category).length]),
);

const analysis = {
  generatedAt: new Date().toISOString(),
  model: 'deepseek-v4-flash',
  resultFiles,
  batches,
  totals: {
    tasks: tasks.length,
    statusCounts,
    durationMs: durations.reduce((sum, value) => sum + value, 0),
    durationMedianMs: percentile(durations, 0.5),
    durationP95Ms: percentile(durations, 0.95),
    durationMaxMs: Math.max(...durations),
    usage: {
      promptTokens,
      completionTokens,
      totalTokens,
      modelCallCount,
      toolCallCount,
    },
    shadow: {
      validSelections,
      hitCount,
      missCount: validSelections - hitCount,
      hitRate: validSelections ? hitCount / validSelections : 0,
      missCategoryCounts,
      unattributedCount: misses.filter((miss) => miss.category === 'unattributed').length,
    },
  },
  misses,
};

if (analysis.totals.tasks !== 103) {
  throw new Error(`expected 103 tasks, got ${analysis.totals.tasks}`);
}
if (analysis.totals.shadow.missCount !== 16 || misses.length !== 16) {
  throw new Error(`expected 16 Shadow misses, got ${misses.length}`);
}
if (analysis.totals.shadow.unattributedCount !== 0) {
  throw new Error(`unattributed Shadow misses: ${analysis.totals.shadow.unattributedCount}`);
}

const outputPath = join(here, 'v4f-v2-analysis-20260731.json');
writeFileSync(outputPath, `${JSON.stringify(analysis, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ ok: true, outputPath, totals: analysis.totals }, null, 2));
