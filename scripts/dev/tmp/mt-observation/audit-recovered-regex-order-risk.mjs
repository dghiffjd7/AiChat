import fs from 'node:fs';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';

const parseRegex = (input) => {
  const str = String(input ?? '');
  const match = str.match(/(\/?)(.+)\1([a-z]*)/i);
  if (!match) return null;
  if (match[3] && !/^(?!.*?(.).*?\1)[gmixXsuUAJ]+$/.test(match[3])) {
    return new RegExp(str);
  }
  return new RegExp(match[2], match[3]);
};

if (!isMainThread) {
  const startedAt = performance.now();
  const regex = parseRegex(workerData.findRegex);
  const output = regex
    ? String(workerData.input || '').replace(regex, String(workerData.replaceString || ''))
    : String(workerData.input || '');
  parentPort.postMessage({
    elapsedMs: Math.round((performance.now() - startedAt) * 100) / 100,
    outputLength: output.length,
  });
} else {
  const storePath = process.argv[2];
  const rawPresetIdFilter = String(process.argv[3] || '').trim();
  const presetIdFilter = rawPresetIdFilter === 'all' ? '' : rawPresetIdFilter;
  const timeoutMs = Math.max(100, Number(process.argv[4]) || 1000);
  const concurrency = Math.max(1, Number(process.argv[5]) || 6);
  if (!storePath) {
    throw new Error('usage: node audit-recovered-regex-order-risk.mjs <regex-store-json> [preset-id] [timeout-ms] [concurrency]');
  }

  const store = JSON.parse(fs.readFileSync(storePath, 'utf8'));
  const sets = store?.local?.sets || {};
  const order = Array.isArray(store?.local?.order) ? store.local.order : [];
  const orderedSets = order.map(id => sets[id]).filter(Boolean);
  const isDisplayRule = rule => (
    rule
    && rule.disabled !== true
    && rule.markdownOnly === true
    && Array.isArray(rule.placement)
    && rule.placement.includes(2)
  );
  const worldSets = orderedSets.filter(set => set?.bind?.type === 'world');
  const presetSets = orderedSets.filter(set => (
    set?.bind?.type === 'preset'
    && (!presetIdFilter || String(set.bind.presetId || '') === presetIdFilter)
  ));
  const payloads = worldSets.flatMap(set => (
    (set.rules || [])
      .filter(isDisplayRule)
      .map(rule => ({
        worldId: String(set.bind.worldId || ''),
        setName: String(set.name || ''),
        ruleId: String(rule.id || ''),
        ruleName: String(rule.scriptName || ''),
        input: String(rule.replaceString || ''),
      }))
      .filter(item => item.input.length >= 4096)
  ));
  const presetRules = presetSets.flatMap(set => (
    (set.rules || [])
      .filter(isDisplayRule)
      .map(rule => ({
        presetId: String(set.bind.presetId || ''),
        setName: String(set.name || ''),
        ruleId: String(rule.id || ''),
        ruleName: String(rule.scriptName || ''),
        findRegex: String(rule.findRegex || ''),
        replaceString: String(rule.replaceString || ''),
      }))
  ));

  const tasks = payloads.flatMap(payload => (
    presetRules.map(rule => ({ payload, rule }))
  ));
  const results = [];

  const runTask = task => new Promise((resolve) => {
    const startedAt = performance.now();
    const worker = new Worker(new URL(import.meta.url), {
      workerData: {
        findRegex: task.rule.findRegex,
        replaceString: task.rule.replaceString,
        input: task.payload.input,
      },
    });
    let settled = false;
    const settle = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        worldId: task.payload.worldId,
        worldRuleId: task.payload.ruleId,
        worldRuleName: task.payload.ruleName,
        inputLength: task.payload.input.length,
        presetId: task.rule.presetId,
        presetRuleId: task.rule.ruleId,
        presetRuleName: task.rule.ruleName,
        wallMs: Math.round((performance.now() - startedAt) * 100) / 100,
        ...result,
      });
    };
    worker.once('message', result => settle({ status: 'completed', ...result }));
    worker.once('error', error => settle({ status: 'error', error: error.message }));
    const timer = setTimeout(async () => {
      await worker.terminate();
      settle({ status: 'timeout', timeoutMs });
    }, timeoutMs);
  });

  let cursor = 0;
  const runners = Array.from({ length: Math.min(concurrency, tasks.length) }, async () => {
    while (cursor < tasks.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await runTask(tasks[index]);
    }
  });
  await Promise.all(runners);

  const worldSummary = worldSets.map(set => {
    const worldId = String(set.bind.worldId || '');
    const ownPayloads = payloads.filter(item => item.worldId === worldId);
    const ownResults = results.filter(item => item.worldId === worldId);
    const completed = ownResults.filter(item => item.status === 'completed');
    const risky = ownResults.filter(item => item.status !== 'completed');
    return {
      worldId,
      displayRuleCount: (set.rules || []).filter(isDisplayRule).length,
      largePayloadCount: ownPayloads.length,
      maxReplacementLength: ownPayloads.reduce((max, item) => Math.max(max, item.input.length), 0),
      testedPairs: ownResults.length,
      timeoutCount: risky.filter(item => item.status === 'timeout').length,
      errorCount: risky.filter(item => item.status === 'error').length,
      maxCompletedMs: completed.reduce((max, item) => Math.max(max, item.elapsedMs || 0), 0),
      slowestCompleted: completed
        .sort((a, b) => Number(b.elapsedMs || 0) - Number(a.elapsedMs || 0))
        .slice(0, 3)
        .map(item => ({
          presetId: item.presetId,
          presetRuleId: item.presetRuleId,
          presetRuleName: item.presetRuleName,
          worldRuleName: item.worldRuleName,
          inputLength: item.inputLength,
          elapsedMs: item.elapsedMs,
        })),
      riskyRules: risky.map(item => ({
        presetId: item.presetId,
        presetRuleId: item.presetRuleId,
        presetRuleName: item.presetRuleName,
        worldRuleName: item.worldRuleName,
        inputLength: item.inputLength,
        status: item.status,
      })),
    };
  });
  const presetSummary = Array.from(new Set(presetRules.map(rule => rule.presetId))).map(presetId => {
    const ownResults = results.filter(item => item.presetId === presetId);
    const completed = ownResults.filter(item => item.status === 'completed');
    return {
      presetId,
      testedPairs: ownResults.length,
      timeoutCount: ownResults.filter(item => item.status === 'timeout').length,
      errorCount: ownResults.filter(item => item.status === 'error').length,
      maxCompletedMs: completed.reduce((max, item) => Math.max(max, item.elapsedMs || 0), 0),
      affectedWorlds: Array.from(new Set(
        ownResults
          .filter(item => item.status !== 'completed')
          .map(item => item.worldId),
      )),
    };
  });

  console.log(JSON.stringify({
    structuralOrder: orderedSets.map(set => set?.bind?.type || 'unbound'),
    presetFilter: presetIdFilter || 'all',
    presetSetCount: presetSets.length,
    presetRuleCount: presetRules.length,
    largePayloadCount: payloads.length,
    testedPairCount: tasks.length,
    timeoutMs,
    presetSummary,
    worldSummary,
  }, null, 2));
}
