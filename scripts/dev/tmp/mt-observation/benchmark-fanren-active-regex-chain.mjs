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
  const cardPath = process.argv[2];
  const storePath = process.argv[3];
  if (!cardPath || !storePath) {
    throw new Error('usage: node benchmark-fanren-active-regex-chain.mjs <card-json> <regex-store-json>');
  }
  const card = JSON.parse(fs.readFileSync(cardPath, 'utf8'));
  const store = JSON.parse(fs.readFileSync(storePath, 'utf8'));
  const cardRule = card.data.extensions.regex_scripts.find(
    rule => String(rule?.replaceString || '').length > 1_000_000,
  );
  const expanded = String(cardRule?.replaceString || '');
  const presetSet = store.local.sets['re-set-recovered-preset-openai-1782701186187-0ea2ab-1'];
  const rules = (presetSet?.rules || []).filter(
    rule => (
      rule
      && rule.disabled !== true
      && rule.markdownOnly === true
      && Array.isArray(rule.placement)
      && rule.placement.includes(2)
    ),
  );

  const runWithTimeout = (rule, input, timeoutMs = 2500) => new Promise((resolve) => {
    const startedAt = performance.now();
    const worker = new Worker(new URL(import.meta.url), {
      workerData: {
        findRegex: rule.findRegex,
        replaceString: rule.replaceString,
        input,
      },
    });
    let settled = false;
    const settle = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        id: String(rule.id || ''),
        name: String(rule.scriptName || ''),
        inputLength: input.length,
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

  const report = {
    cardRule: {
      id: String(cardRule?.id || ''),
      replacementLength: expanded.length,
    },
    tokenControl: await runWithTimeout(rules[0], 'lucklyjkop'),
    expandedResults: [],
  };
  for (const rule of rules) {
    report.expandedResults.push(await runWithTimeout(rule, expanded));
  }
  console.log(JSON.stringify(report, null, 2));
}
