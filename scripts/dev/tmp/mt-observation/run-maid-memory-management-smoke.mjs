import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { evaluateInApp } from '../../cdp-client.mjs';

const outputIndex = process.argv.indexOf('--output');
const outputPath = resolve(
  outputIndex >= 0
    ? process.argv[outputIndex + 1]
    : 'scripts/dev/tmp/mt-observation/maid-memory-management-smoke-20260730.json',
);

const runPrompt = async (prompt, { confirmText = '' } = {}) => evaluateInApp(`(async () => {
  const actions = window.appBridge?.debugUiRegistry?.actions || {};
  if (!actions.runMaidAssistantPrompt) return { ok: false, reason: 'maid_action_missing' };
  const visible = node => {
    if (!node?.isConnected) return false;
    const style = getComputedStyle(node);
    const rect = node.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
  };
  const clicked = [];
  const expected = ${JSON.stringify(confirmText)};
  const timer = expected ? setInterval(() => {
    const button = [...document.querySelectorAll('button')]
      .find(item => visible(item) && String(item.textContent || '').trim() === expected);
    if (!button) return;
    clicked.push({
      at: Date.now(),
      text: String(button.textContent || '').trim(),
      title: String(button.closest('.app-confirm-modal')?.querySelector('.app-confirm-title')?.textContent || '').trim(),
    });
    button.click();
  }, 200) : null;
  try {
    const result = await actions.runMaidAssistantPrompt({ input: ${JSON.stringify(prompt)} });
    return {
      ok: result?.ok !== false,
      status: result?.status || '',
      responseType: result?.responseType || '',
      message: String(result?.message || '').slice(0, 1200),
      failureCode: result?.failureCode || '',
      steps: (result?.steps || []).map(step => ({
        toolName: step?.toolName || '',
        featureId: step?.featureId || '',
        status: step?.status || '',
        summary: String(step?.summary || '').slice(0, 500),
        output: step?.output || null,
      })),
      clicked,
    };
  } finally {
    if (timer) clearInterval(timer);
  }
})()`, { timeoutMs: 300000 });

const rememberPrompt = '请记住，这是主人明确且长期有效的固定偏好：今后你完成后台操作时，回复先用一句话给结论，再列出最多三项摘要。现在只确认你记住了，不要操作任何 APP 资源，也不要调用工具。';
const listPrompt = '请查看你自己的长期记忆里目前记住了什么，只列出生效中的记忆；请使用女仆长期记忆工具，不要打开聊天室的记忆表格。';
const archivePrompt = '请把刚才那条“后台操作后先给一句结论、再列最多三项摘要”的测试偏好归档。先用 maid.memory.list 找到明确 ID，再调用 maid.memory.archive；不要物理删除。';

const report = {
  schemaVersion: 1,
  startedAt: Date.now(),
  prompts: {},
  lifecycle: null,
  beforeArchive: null,
  afterArchive: null,
  uiRestore: null,
};

report.prompts.remember = await runPrompt(rememberPrompt);

report.lifecycle = await evaluateInApp(`(async () => {
  const stores = window.appBridge?.debugUiRegistry?.stores || {};
  const conversation = stores.maidConversationStore;
  const semantic = stores.maidSemanticMemoryStore;
  if (!conversation?.appendTurn || !semantic?.exportState) {
    return { ok: false, reason: 'maid_memory_runtime_missing' };
  }
  for (let index = 1; index <= 12; index += 1) {
    await conversation.appendTurn({
      input: \`轮次推进 \${index}：本轮没有新增长期事项。\`,
      status: 'succeeded',
      responseType: 'chat',
      message: '收到，本轮没有新增长期事项。',
      context: { source: 'memory_management_smoke_aging' },
    });
  }
  await conversation.flushPendingExtractions?.();
  const state = conversation.exportState();
  const semanticState = semantic.exportState();
  return {
    ok: true,
    turns: state.turns?.length || 0,
    activeTurns: (state.turns || []).filter(turn => !turn.compacted).length,
    compactedTurns: (state.turns || []).filter(turn => turn.compacted).length,
    memoryRows: state.memoryRows?.length || 0,
    extractionBatches: (state.extractionBatches || []).map(batch => ({
      id: batch.id,
      status: batch.status,
      attempts: batch.attempts,
      extractedCount: batch.extractedCount,
      lastError: batch.lastError || '',
    })),
    semanticMemories: (semanticState.memories || []).map(memory => ({
      id: memory.id,
      kind: memory.kind,
      key: memory.key,
      content: memory.content,
      confidence: memory.confidence,
      status: memory.status,
      sourceTurnIds: memory.sourceTurnIds || [],
    })),
  };
})()`, { timeoutMs: 300000 });

report.prompts.list = await runPrompt(listPrompt);

report.beforeArchive = await evaluateInApp(`(async () => {
  const stores = window.appBridge?.debugUiRegistry?.stores || {};
  const semantic = stores.maidSemanticMemoryStore;
  const conversation = stores.maidConversationStore;
  const memories = semantic?.listMemories?.({ status: 'active' }) || [];
  const target = memories.find(memory => /后台操作|一句话给结论|三项摘要/.test(String(memory?.content || ''))) || null;
  const context = await conversation?.getContextSnapshotAsync?.({
    query: '后台操作完成后的回复顺序与摘要数量',
  });
  return {
    target: target ? {
      id: target.id,
      kind: target.kind,
      key: target.key,
      content: target.content,
      confidence: target.confidence,
      status: target.status,
    } : null,
    selectedMemoryIds: context?.selectedMemoryIds || [],
    semanticMemoryTokenCount: context?.semanticMemoryTokenCount || 0,
  };
})()`, { timeoutMs: 30000 });

report.prompts.archive = await runPrompt(archivePrompt, { confirmText: '确认归档' });

report.afterArchive = await evaluateInApp(`(async () => {
  const stores = window.appBridge?.debugUiRegistry?.stores || {};
  const semantic = stores.maidSemanticMemoryStore;
  const conversation = stores.maidConversationStore;
  const all = semantic?.listMemories?.() || [];
  const target = all.find(memory => /后台操作|一句话给结论|三项摘要/.test(String(memory?.content || ''))) || null;
  const context = await conversation?.getContextSnapshotAsync?.({
    query: '后台操作完成后的回复顺序与摘要数量',
  });
  return {
    target: target ? {
      id: target.id,
      kind: target.kind,
      key: target.key,
      content: target.content,
      confidence: target.confidence,
      status: target.status,
    } : null,
    selectedMemoryIds: context?.selectedMemoryIds || [],
    semanticMemoryTokenCount: context?.semanticMemoryTokenCount || 0,
  };
})()`, { timeoutMs: 30000 });

report.uiRestore = await evaluateInApp(`(async () => {
  const registry = window.appBridge?.debugUiRegistry || {};
  const actions = registry.actions || {};
  const semantic = registry.stores?.maidSemanticMemoryStore;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  await actions.openMaidCommandInput?.();
  await sleep(200);
  const settingsButton = document.querySelector('.maid-command-input-settings');
  settingsButton?.click();
  await sleep(500);
  document.querySelector('#maid-settings-tab-prompt')?.click();
  await sleep(120);
  document.querySelector('#maid-settings-prompt-tab-semanticMemory')?.click();
  await sleep(180);
  const cards = [...document.querySelectorAll('.maid-memory-card')];
  const card = cards.find(item => /后台操作|一句话给结论|三项摘要/.test(String(item.textContent || ''))) || null;
  const before = {
    panelOpen: document.querySelector('.maid-settings-overlay')?.classList.contains('is-open') === true,
    cardCount: cards.length,
    targetFound: Boolean(card),
    statusText: String(card?.querySelector('.maid-memory-status')?.textContent || '').trim(),
    actionText: String(card?.querySelector('.maid-memory-status-action')?.textContent || '').trim(),
  };
  card?.querySelector('.maid-memory-status-action')?.click();
  await sleep(700);
  const target = (semantic?.listMemories?.() || [])
    .find(memory => /后台操作|一句话给结论|三项摘要/.test(String(memory?.content || ''))) || null;
  const refreshedCard = [...document.querySelectorAll('.maid-memory-card')]
    .find(item => /后台操作|一句话给结论|三项摘要/.test(String(item.textContent || ''))) || null;
  document.querySelector('.maid-settings-close')?.click();
  return {
    before,
    after: {
      status: target?.status || '',
      statusText: String(refreshedCard?.querySelector('.maid-memory-status')?.textContent || '').trim(),
      actionText: String(refreshedCard?.querySelector('.maid-memory-status-action')?.textContent || '').trim(),
    },
  };
})()`, { timeoutMs: 30000 });

report.finishedAt = Date.now();
report.ok = Boolean(
  report.prompts.remember?.ok &&
  report.lifecycle?.semanticMemories?.length &&
  report.prompts.list?.steps?.some(step => step.toolName === 'maid.memory.list') &&
  report.prompts.archive?.steps?.some(step => step.toolName === 'maid.memory.archive') &&
  report.afterArchive?.target?.status === 'archived' &&
  !report.afterArchive?.selectedMemoryIds?.includes(report.afterArchive?.target?.id) &&
  report.uiRestore?.after?.status === 'active'
);

writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  ok: report.ok,
  outputPath,
  remember: {
    ok: report.prompts.remember?.ok,
    status: report.prompts.remember?.status,
    steps: report.prompts.remember?.steps?.map(step => step.toolName),
  },
  lifecycle: report.lifecycle,
  list: {
    ok: report.prompts.list?.ok,
    steps: report.prompts.list?.steps?.map(step => step.toolName),
    message: report.prompts.list?.message,
  },
  archive: {
    ok: report.prompts.archive?.ok,
    steps: report.prompts.archive?.steps?.map(step => step.toolName),
    clicked: report.prompts.archive?.clicked,
    message: report.prompts.archive?.message,
  },
  beforeArchive: report.beforeArchive,
  afterArchive: report.afterArchive,
  uiRestore: report.uiRestore,
}, null, 2));

process.exit(report.ok ? 0 : 1);
