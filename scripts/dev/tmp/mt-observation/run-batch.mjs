import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { evaluateInApp } from '../../cdp-client.mjs';
import { tasks } from './task-bank.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const readArg = (name, fallback = '') => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? String(process.argv[index + 1] ?? fallback) : fallback;
};

const hasArg = name => process.argv.includes(name);
const batch = readArg('--batch', 'pilot');
const limit = Math.max(0, Number(readArg('--limit', '0')) || 0);
const outputPath = readArg('--output', join(here, `results-${batch}.jsonl`));
const expectedMaidModel = readArg('--expected-maid-model', 'gemini-3.5-flash');
const expectedMaidProfile = readArg('--expected-maid-profile', '');
const expectedMaidProvider = readArg('--expected-maid-provider', '');
const resume = hasArg('--resume');
const selected = tasks
  .filter(task => task.batch === batch)
  .slice(0, limit || undefined);

if (!selected.length) {
  console.error(`no tasks found for batch=${batch}`);
  process.exit(2);
}

mkdirSync(dirname(outputPath), { recursive: true });

const completedIds = new Set();
if (resume && existsSync(outputPath)) {
  for (const line of readFileSync(outputPath, 'utf8').split(/\r?\n/).filter(Boolean)) {
    try {
      const record = JSON.parse(line);
      if (record.recordType === 'task_result' && record.taskId) completedIds.add(record.taskId);
    } catch {}
  }
}

const append = record => {
  appendFileSync(outputPath, `${JSON.stringify(record)}\n`, 'utf8');
};

const setupExpression = `(async () => {
  const registry = window.appBridge?.debugUiRegistry || {};
  const stores = registry.stores || {};
  if (!registry.actions?.runMaidAssistantPrompt) return { ok: false, reason: 'maid_action_missing' };
  if (window.__mtAllowTimer) clearInterval(window.__mtAllowTimer);
  if (window.__testClicker) clearInterval(window.__testClicker);
  if (window.__obsPermissionTimer) clearInterval(window.__obsPermissionTimer);
  window.__mtAllowTimer = null;
  window.__testClicker = null;
  window.__obsPermissionLog = [];
  window.__obsClickedButtons = new WeakSet();
  window.__obsConfirmedDeleteTaskIds = new Set();
  const visible = (node) => {
    if (!node || !node.isConnected) return false;
    const style = getComputedStyle(node);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    const rect = node.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };
  window.__obsPermissionTimer = setInterval(() => {
    try {
      const state = window.__obsTaskState || {};
      if (state.pending !== true) return;
      const deleteTarget = String(state.appConfirmDeleteTarget || '').trim();
      if (deleteTarget) {
        const expectedMessage = \`確認删除：\${deleteTarget}？此操作会删除聊天室与好友记录（不可恢复）。\`;
        const deleteDialog = [...document.querySelectorAll('.app-confirm-modal')]
          .find(item => visible(item) && String(item.querySelector('.app-confirm-body')?.textContent || '').trim() === expectedMessage);
        const deleteButton = deleteDialog?.querySelector?.('.app-confirm-ok');
        if (
          deleteButton
          && visible(deleteButton)
          && !window.__obsConfirmedDeleteTaskIds.has(String(state.taskId || ''))
        ) {
          window.__obsConfirmedDeleteTaskIds.add(String(state.taskId || ''));
          window.__obsPermissionLog.push({
            at: Date.now(),
            taskId: state.taskId || '',
            kind: 'scoped_session_delete_confirmation',
            title: deleteTarget,
            button: String(deleteButton.textContent || '').trim(),
          });
          deleteButton.click();
          return;
        }
      }
      const buttons = [...document.querySelectorAll('button')]
        .filter(item => visible(item) && !window.__obsClickedButtons.has(item));
      let button = null;
      if (state.autoConfirm === true) {
        button = buttons.find(item => String(item.textContent || '').trim() === '允许一次') || null;
      }
      if (!button && state.autoConfirm === true) {
        button = buttons.find(item => ['确认创建', '确认修改'].includes(
          String(item.textContent || '').trim(),
        )) || null;
      }
      const structuredDeleteTaskIds = new Set([
        'memory-system-v4f-b-0730-009',
        'memory-system-v4f-b-0730-010',
        'memory-system-v4f-b-0730-011',
        'memory-system-g35-b-0730-009',
        'memory-system-g35-b-0730-010',
        'memory-system-g35-b-0730-011',
        'one-piece-cleanup-v4f-0730-001',
        'one-piece-cleanup-apply-v4f-0730-001',
      ]);
      if (!button && structuredDeleteTaskIds.has(String(state.taskId || ''))) {
        button = buttons.find(item => String(item.textContent || '').trim() === '确认删除') || null;
      }
      if (!button && state.allowSubAgent === true) {
        button = buttons.find(item => String(item.textContent || '').trim() === '允许') || null;
      }
      if (!button && state.autoDeny === true) {
        button = buttons.find(item => ['取消', '拒绝', '不允许', '用主模型', '新建副本'].includes(
          String(item.textContent || '').trim(),
        )) || null;
      }
      if (button) {
        const dialog = button.closest('[role="dialog"], .app-confirm-dialog, .app-modal, .modal, .overlay')
          || button.parentElement;
        const title = String(
          dialog?.querySelector?.('h1, h2, h3, .app-confirm-title, .modal-title')?.textContent || '',
        ).trim();
        window.__obsClickedButtons.add(button);
        window.__obsPermissionLog.push({
          at: Date.now(),
          taskId: state.taskId || '',
          kind: 'confirmation',
          title: title.slice(0, 120),
          button: String(button.textContent || '').trim(),
        });
        button.click();
      }
      if (state.followGuide !== true) {
        const skipGuideButton = buttons.find(item => (
          item.matches('[data-maid-guide-action="skip"]') ||
          String(item.textContent || '').trim() === '跳过引导'
        )) || null;
        if (skipGuideButton) {
          window.__obsClickedButtons.add(skipGuideButton);
          window.__obsPermissionLog.push({
            at: Date.now(),
            taskId: state.taskId || '',
            kind: 'guide_skip',
            title: '女仆首次功能引导',
            button: String(skipGuideButton.textContent || '').trim(),
          });
          skipGuideButton.click();
          return;
        }
      }
      if (state.followGuide === true) {
        const guideTarget = [...document.querySelectorAll('.maid-guide-step-target')].find(visible);
        if (guideTarget) {
          window.__obsPermissionLog.push({
            at: Date.now(),
            taskId: state.taskId || '',
            kind: 'guide_target',
            title: String(guideTarget.textContent || guideTarget.className || '').slice(0, 120),
          });
          guideTarget.click();
          return;
        }
        const guideButton = [...document.querySelectorAll('button')].filter(visible)
          .find(item => (
            item.matches('[data-maid-guide-action="continue"], [data-maid-guide-action="assist-click"]') ||
            /帮我点|帮主人来|继续|下一步|收入囊中/.test(String(item.textContent || ''))
          ));
        if (guideButton) {
          window.__obsPermissionLog.push({
            at: Date.now(),
            taskId: state.taskId || '',
            kind: 'guide_continue',
            title: String(guideButton.textContent || '').trim().slice(0, 120),
          });
          guideButton.click();
        }
      }
    } catch (error) {
      window.__obsPermissionLog.push({
        at: Date.now(),
        taskId: window.__obsTaskState?.taskId || '',
        kind: 'clicker_error',
        title: String(error?.message || error).slice(0, 160),
      });
    }
  }, 300);
  const maid = stores.maidSettingsStore;
  const profiles = await registry.actions?.listAgentModelProfiles?.() || [];
  const boundProfileId = maid?.getBoundProfileId?.() || '';
  const modelOverride = maid?.getBoundModelOverride?.() || '';
  const boundProfile = profiles.find(item => item.id === boundProfileId) || null;
  const retrievalStore = stores.capabilityRetrievalStore;
  const stats = retrievalStore?.getStats?.() || {};
  const aggregates = Array.isArray(stats.aggregates) ? stats.aggregates : [];
  const sum = key => aggregates.reduce((total, item) => total + Number(item?.[key] || 0), 0);
  window.__obsBatchBaseline = {
    at: Date.now(),
    snapshotCount: Number(stats.snapshotCount || 0),
    validSelectionCount: sum('validSelectionCount'),
    hitCount: sum('hitCount'),
  };
  return {
    ok: true,
    readyState: document.readyState,
    maid: {
      boundProfileId,
      boundProfileName: boundProfile?.name || '',
      boundProvider: boundProfile?.provider || '',
      modelOverride,
      effectiveModel: modelOverride || boundProfile?.model || '',
      fallbackProfileId: maid?.getFallbackProfileId?.() || '',
      subAgents: (maid?.listSubAgents?.() || []).map(item => ({
        id: item.id,
        name: item.name,
        modelProfileId: item.modelProfileId,
        modelOverride: item.modelOverride,
        enabled: item.enabled !== false,
        skills: item.skills || [],
      })),
    },
    routing: stores.maidCapabilityRoutingRuntime?.getConfig?.() || null,
    baseline: window.__obsBatchBaseline,
  };
})()`;

const startExpression = task => `(() => {
  const task = ${JSON.stringify({
    id: task.id,
    prompt: task.prompt,
    autoConfirm: task.autoConfirm === true,
    autoDeny: task.autoDeny === true,
    allowSubAgent: task.allowSubAgent === true,
    followGuide: task.followGuide === true,
    appConfirmDeleteTarget: String(task.appConfirmDeleteTarget || ''),
  })};
  const actions = window.appBridge?.debugUiRegistry?.actions || {};
  if (!actions.runMaidAssistantPrompt) return { started: false, reason: 'maid_action_missing' };
  if (window.__obsTaskState?.pending) return {
    started: false,
    reason: 'previous_task_pending',
    taskId: window.__obsTaskState.taskId,
  };
  const stores = window.appBridge.debugUiRegistry.stores || {};
  const retrievalStore = stores.capabilityRetrievalStore;
  const runStore = stores.agentRunStore;
  const startedAt = Date.now();
  window.__obsTaskState = {
    taskId: task.id,
    prompt: task.prompt,
    startedAt,
    pending: true,
    done: false,
    autoConfirm: task.autoConfirm,
    autoDeny: task.autoDeny,
    allowSubAgent: task.allowSubAgent,
    followGuide: task.followGuide,
    appConfirmDeleteTarget: task.appConfirmDeleteTarget,
    permissionLogStart: (window.__obsPermissionLog || []).length,
    snapshotIdsBefore: (retrievalStore?.listSnapshots?.({ limit: 500 }) || []).map(item => item.id),
    runIdsBefore: (runStore?.listRuns?.({ limit: 500 }) || []).map(item => item.id),
  };
  Promise.resolve(actions.runMaidAssistantPrompt({ input: task.prompt }))
    .then(result => {
      Object.assign(window.__obsTaskState, {
        pending: false,
        done: true,
        finishedAt: Date.now(),
        result,
      });
    })
    .catch(error => {
      Object.assign(window.__obsTaskState, {
        pending: false,
        done: true,
        finishedAt: Date.now(),
        thrown: String(error?.stack || error?.message || error).slice(0, 2000),
      });
    });
  return { started: true, taskId: task.id, startedAt };
})()`;

const pollExpression = `(() => {
  const state = window.__obsTaskState;
  if (!state) return { missing: true };
  if (!state.done) return {
    pending: true,
    taskId: state.taskId,
    elapsedMs: Date.now() - Number(state.startedAt || 0),
    loopProbe: globalThis.__maidLoopProbe || null,
  };
  const stores = window.appBridge?.debugUiRegistry?.stores || {};
  const retrievalStore = stores.capabilityRetrievalStore;
  const runStore = stores.agentRunStore;
  const beforeSnapshots = new Set(state.snapshotIdsBefore || []);
  const beforeRuns = new Set(state.runIdsBefore || []);
  const compact = (value, limit = 1600) => {
    try {
      const text = JSON.stringify(value, (key, item) => {
        if (/api.?key|authorization|secret|access.?token|refresh.?token/i.test(key)) return '[redacted]';
        if (typeof item === 'string' && item.length > 1200) return item.slice(0, 1200) + '…';
        return item;
      });
      return text.length > limit ? text.slice(0, limit) + '…' : text;
    } catch {
      return String(value ?? '').slice(0, limit);
    }
  };
  const result = state.result || {};
  const snapshots = (retrievalStore?.listSnapshots?.({ limit: 500 }) || [])
    .filter(item => !beforeSnapshots.has(item.id) && Number(item.createdAt || 0) >= Number(state.startedAt || 0) - 1000)
    .map(item => ({
      id: item.id,
      requestId: item.requestId,
      phase: item.phase,
      mode: item.mode,
      effectiveMode: item.effectiveMode,
      retrieverVersion: item.retrieverVersion,
      createdAt: item.createdAt,
      latencyMs: item.latencyMs,
      selectedCapabilityId: item.selectedCapabilityId,
      selectedToolName: item.selectedToolName,
      selectedRank: item.selectedRank,
      candidateHit: item.candidateHit,
      candidateViolation: item.candidateViolation,
      metricEligible: item.metricEligible,
      validSelection: item.validSelection,
      policyExcluded: item.policyExcluded,
      candidateCount: item.candidateCount,
      candidates: (item.candidates || []).map(candidate => ({
        id: candidate.id,
        rank: candidate.rank,
        score: candidate.score,
        reasonCodes: candidate.reasonCodes || [],
      })),
      cohort: item.cohort || {},
    }));
  const runs = (runStore?.listRuns?.({ limit: 500 }) || [])
    .filter(item => !beforeRuns.has(item.id) && Number(item.createdAt || 0) >= Number(state.startedAt || 0) - 1000)
    .map(item => ({
      id: item.id,
      kind: item.kind,
      title: item.title,
      status: item.status,
      summary: item.summary,
      errorMessage: item.errorMessage,
      cancelReason: item.cancelReason,
      createdAt: item.createdAt,
      finishedAt: item.finishedAt,
      usage: item.usage || null,
      metadata: {
        failureCode: item.metadata?.failureCode || '',
        model: item.metadata?.model || '',
        provider: item.metadata?.provider || '',
        candidateDecisionCount: item.metadata?.candidateDecisionCount || 0,
        candidateValidSelectionCount: item.metadata?.candidateValidSelectionCount || 0,
        candidateHitCount: item.metadata?.candidateHitCount || 0,
      },
    }));
  return {
    done: true,
    taskId: state.taskId,
    startedAt: state.startedAt,
    finishedAt: state.finishedAt || Date.now(),
    durationMs: Number(state.finishedAt || Date.now()) - Number(state.startedAt || 0),
    thrown: state.thrown || '',
    result: {
      ok: result.ok !== false,
      status: result.status || '',
      responseType: result.responseType || '',
      reason: result.reason || '',
      failureCode: result.failureCode || '',
      partial: result.partial === true,
      continuable: result.continuable === true,
      continueHint: String(result.continueHint || '').slice(0, 1000),
      reactStoppedReason: result.reactStoppedReason || '',
      reactStepBudget: result.reactStepBudget || null,
      message: String(result.message || '').slice(0, 2400),
      usage: result.usage || null,
      capabilityRouting: result.capabilityRouting || null,
      plan: result.plan ? compact(result.plan, 2000) : '',
      output: result.output ? compact(result.output, 2000) : '',
      steps: (result.steps || []).map(step => ({
        id: step.id || step.stepId || '',
        toolName: step.toolName || '',
        featureId: step.featureId || '',
        status: step.status || '',
        failureCode: step.failureCode || '',
        summary: String(step.summary || '').slice(0, 800),
        args: compact(step.args || {}, 1600),
        output: compact(step.output || {}, 2000),
      })),
    },
    snapshots,
    runs,
    permissionEvents: (window.__obsPermissionLog || []).slice(Number(state.permissionLogStart || 0)),
  };
})()`;

const batchStartedAt = Date.now();
const setup = await evaluateInApp(setupExpression, { timeoutMs: 30000 });
if (!setup?.ok) {
  console.error(`observation setup failed: ${JSON.stringify(setup)}`);
  process.exit(2);
}
if (setup.maid?.effectiveModel !== expectedMaidModel) {
  console.error(`unexpected maid model: ${setup.maid?.effectiveModel || '(empty)'}`);
  process.exit(2);
}
if (expectedMaidProfile && setup.maid?.boundProfileName !== expectedMaidProfile) {
  console.error(`unexpected maid profile: ${setup.maid?.boundProfileName || '(empty)'}`);
  process.exit(2);
}
if (expectedMaidProvider && setup.maid?.boundProvider !== expectedMaidProvider) {
  console.error(`unexpected maid provider: ${setup.maid?.boundProvider || '(empty)'}`);
  process.exit(2);
}
const enabledSubAgents = (setup.maid?.subAgents || []).filter(item => item.enabled);
if (!enabledSubAgents.some(item => item.modelOverride === 'deepseek-v4-flash')) {
  console.error(`expected deepseek-v4-flash sub-agent is not enabled`);
  process.exit(2);
}
if (setup.routing?.mode !== 'shadow') {
  console.error(`expected shadow routing mode, got ${setup.routing?.mode || '(empty)'}`);
  process.exit(2);
}

append({
  recordType: 'batch_start',
  schemaVersion: 1,
  batch,
  at: batchStartedAt,
  taskCount: selected.length,
  resume,
  setup,
});
console.log(
  `BATCH ${batch}: ${selected.length} task(s), ` +
  `maid=${setup.maid.boundProfileName}/${setup.maid.boundProvider}/${setup.maid.effectiveModel}, ` +
  `shadow=${setup.routing.mode}`,
);

let completed = 0;
let failed = 0;
let skipped = 0;
for (const task of selected) {
  if (completedIds.has(task.id)) {
    skipped += 1;
    console.log(`SKIP ${task.id} (already logged)`);
    continue;
  }
  console.log(`START ${task.id} [${task.category}] ${task.prompt.slice(0, 70)}`);
  const started = await evaluateInApp(startExpression(task), { timeoutMs: 30000 });
  if (!started?.started) {
    append({
      recordType: 'task_result',
      schemaVersion: 1,
      batch,
      taskId: task.id,
      category: task.category,
      prompt: task.prompt,
      expectedFeatures: task.expectedFeatures || [],
      expectedTools: task.expectedTools || [],
      expectedAnyTools: task.expectedAnyTools || [],
      expectedDisposition: task.expectedDisposition || '',
      testPolicy: {
        autoConfirm: task.autoConfirm === true,
        autoDeny: task.autoDeny === true,
        allowSubAgent: task.allowSubAgent === true,
        followGuide: task.followGuide === true,
      },
      harnessError: started?.reason || 'start_failed',
      at: Date.now(),
    });
    failed += 1;
    console.error(`START_FAIL ${task.id}: ${JSON.stringify(started)}`);
    break;
  }

  const maxMs = Math.max(60000, Number(task.maxMs || 300000));
  let lastHeartbeatAt = 0;
  let result = null;
  while (Date.now() - started.startedAt <= maxMs) {
    await sleep(2000);
    const polled = await evaluateInApp(pollExpression, { timeoutMs: 30000 });
    if (polled?.done) {
      result = polled;
      break;
    }
    if (Date.now() - lastHeartbeatAt >= 15000) {
      lastHeartbeatAt = Date.now();
      console.log(`WAIT ${task.id} ${Math.round(Number(polled?.elapsedMs || 0) / 1000)}s ${polled?.loopProbe?.stage || ''}`);
    }
  }

  if (!result) {
    append({
      recordType: 'task_result',
      schemaVersion: 1,
      batch,
      taskId: task.id,
      category: task.category,
      prompt: task.prompt,
      expectedFeatures: task.expectedFeatures || [],
      expectedTools: task.expectedTools || [],
      expectedAnyTools: task.expectedAnyTools || [],
      expectedDisposition: task.expectedDisposition || '',
      testPolicy: {
        autoConfirm: task.autoConfirm === true,
        autoDeny: task.autoDeny === true,
        allowSubAgent: task.allowSubAgent === true,
        followGuide: task.followGuide === true,
      },
      timeout: true,
      maxMs,
      at: Date.now(),
    });
    failed += 1;
    console.error(`TIMEOUT ${task.id} after ${maxMs}ms; aborting batch to avoid overlapping runs`);
    break;
  }

  const selectedFeatures = result.snapshots
    .filter(item => item.validSelection && !item.policyExcluded)
    .map(item => item.selectedCapabilityId)
    .filter(Boolean);
  const selectedTools = (result.result?.steps || []).map(step => step.toolName).filter(Boolean);
  const expectedFeatureCoverage = (task.expectedFeatures || []).every(feature => selectedFeatures.includes(feature));
  const expectedAllToolCoverage = (task.expectedTools || []).every(tool => selectedTools.includes(tool));
  const expectedAnyToolCoverage = !(task.expectedAnyTools || []).length
    || task.expectedAnyTools.some(tool => selectedTools.includes(tool));
  const expectedToolCoverage = expectedAllToolCoverage && expectedAnyToolCoverage;
  const record = {
    recordType: 'task_result',
    schemaVersion: 1,
    batch,
    taskId: task.id,
    category: task.category,
    prompt: task.prompt,
    expectedFeatures: task.expectedFeatures || [],
    expectedTools: task.expectedTools || [],
    expectedAnyTools: task.expectedAnyTools || [],
    expectedDisposition: task.expectedDisposition || '',
    testPolicy: {
      autoConfirm: task.autoConfirm === true,
      autoDeny: task.autoDeny === true,
      allowSubAgent: task.allowSubAgent === true,
      followGuide: task.followGuide === true,
    },
    observed: {
      selectedFeatures,
      selectedTools,
      expectedFeatureCoverage,
      expectedToolCoverage,
    },
    ...result,
  };
  append(record);
  completed += 1;
  if (
    result.thrown
    || result.result?.ok === false
    || ['failed', 'interrupted', 'cancelled', 'canceled'].includes(result.result?.status || '')
  ) failed += 1;
  console.log(
    `DONE ${task.id} status=${result.result?.status || '-'} ok=${result.result?.ok} ` +
    `steps=${selectedTools.join('>') || '-'} snapshots=${result.snapshots.length} ` +
    `featureCoverage=${expectedFeatureCoverage}`,
  );
}

append({
  recordType: 'batch_end',
  schemaVersion: 1,
  batch,
  at: Date.now(),
  durationMs: Date.now() - batchStartedAt,
  completed,
  failed,
  skipped,
});
console.log(`END ${batch}: completed=${completed}, failed=${failed}, skipped=${skipped}`);
process.exit(failed > 0 ? 1 : 0);
