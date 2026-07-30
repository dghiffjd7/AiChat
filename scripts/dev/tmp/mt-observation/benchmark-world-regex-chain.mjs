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
  const input = String(workerData.input || '');
  const startedAt = performance.now();
  const regex = parseRegex(workerData.findRegex);
  const output = regex
    ? input.replace(regex, String(workerData.replaceString || ''))
    : input;
  parentPort.postMessage({
    output,
    elapsedMs: Math.round((performance.now() - startedAt) * 100) / 100,
  });
} else {
  const storePath = process.argv[2];
  const worldId = String(process.argv[3] || '').trim();
  const initialInput = String(process.argv[4] || '');
  const timeoutMs = Math.max(100, Number(process.argv[5]) || 5000);
  if (!storePath || !worldId) {
    throw new Error('usage: node benchmark-world-regex-chain.mjs <regex-store-json> <world-id> <input> [timeout-ms]');
  }
  const store = JSON.parse(fs.readFileSync(storePath, 'utf8'));
  const set = Object.values(store?.local?.sets || {}).find(item => (
    item?.bind?.type === 'world'
    && String(item.bind.worldId || '') === worldId
  ));
  if (!set) throw new Error(`world regex set not found: ${worldId}`);
  const rules = (set.rules || []).filter(rule => (
    rule
    && rule.disabled !== true
    && rule.markdownOnly === true
    && Array.isArray(rule.placement)
    && rule.placement.includes(2)
  ));

  const runRule = (rule, input) => new Promise((resolve) => {
    const wallStartedAt = performance.now();
    const worker = new Worker(new URL(import.meta.url), {
      workerData: {
        input,
        findRegex: rule.findRegex,
        replaceString: rule.replaceString,
      },
    });
    let settled = false;
    const settle = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        wallMs: Math.round((performance.now() - wallStartedAt) * 100) / 100,
        ...result,
      });
    };
    worker.once('message', result => settle({ status: 'completed', ...result }));
    worker.once('error', error => settle({ status: 'error', error: error.message }));
    const timer = setTimeout(async () => {
      await worker.terminate();
      settle({ status: 'timeout' });
    }, timeoutMs);
  });

  let output = initialInput;
  const steps = [];
  for (const rule of rules) {
    const inputLength = output.length;
    const result = await runRule(rule, output);
    steps.push({
      id: String(rule.id || ''),
      name: String(rule.scriptName || ''),
      inputLength,
      outputLength: result.status === 'completed' ? result.output.length : null,
      status: result.status,
      elapsedMs: result.elapsedMs,
      wallMs: result.wallMs,
      error: result.error,
    });
    if (result.status !== 'completed') break;
    output = result.output;
  }
  console.log(JSON.stringify({
    worldId,
    initialInputLength: initialInput.length,
    finalOutputLength: output.length,
    timeoutMs,
    steps,
  }, null, 2));
}
