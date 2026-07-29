import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const isPlainObject = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const trim = value => String(value ?? '').trim();

const toTokenCount = (value) => {
  if (value == null) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? Math.trunc(numeric) : null;
};

const findMaidRun = (record = {}) => {
  if (isPlainObject(record.run)) return record.run;
  const runs = Array.isArray(record.runs) ? record.runs : [];
  return runs.find(run => run?.kind === 'maid_assistant') || (runs.length === 1 ? runs[0] : null);
};

const resolveBoolean = (...values) => {
  for (const value of values) {
    if (typeof value === 'boolean') return value;
  }
  return null;
};

const normalizeObservation = (record = {}, expectedArm = '') => {
  const result = isPlainObject(record.result) ? record.result : {};
  const run = findMaidRun(record);
  const usage = [run?.usage, result.usage, record.usage].find(isPlainObject) || {};
  const routing = [result.capabilityRouting, record.capabilityRouting].find(isPlainObject) || {};
  const promptTokens = toTokenCount(usage.promptTokens ?? usage.prompt_tokens);
  const completionTokens = toTokenCount(usage.completionTokens ?? usage.completion_tokens);
  const totalTokens = toTokenCount(usage.totalTokens ?? usage.total_tokens)
    ?? (promptTokens != null || completionTokens != null
      ? (promptTokens || 0) + (completionTokens || 0)
      : null);
  const prompt = trim(record.prompt);

  return {
    caseId: trim(record.comparisonKey || record.caseId || record.taskId || record.id),
    provider: trim(usage.provider),
    model: trim(usage.model),
    retrieverVersion: trim(
      routing.retrieverVersion
      || record.retrieverVersion
      || run?.metadata?.retrieverVersion,
    ),
    maidContextVersion: trim(
      run?.metadata?.maidContextVersion
      || result.maidContextVersion
      || record.maidContextVersion,
    ),
    effectiveMode: trim(
      routing.effectiveMode
      || record.effectiveMode
      || run?.metadata?.candidateEffectiveMode,
    ),
    expectedArm,
    usage: {
      status: trim(usage.status).toLowerCase(),
      promptTokens,
      completionTokens,
      totalTokens,
      modelCallCount: toTokenCount(usage.modelCallCount ?? usage.model_call_count),
    },
    success: resolveBoolean(
      result.ok,
      record.ok,
      run?.status ? run.status === 'succeeded' : null,
    ),
    verified: resolveBoolean(
      record.verified,
      result.verified,
      result.verification?.ok,
      run?.metadata?.verified,
    ),
    promptFingerprint: prompt
      ? createHash('sha256').update(prompt).digest('hex').slice(0, 16)
      : '',
    harnessError: trim(record.harnessError || record.thrown),
  };
};

const validateObservation = (observation = {}) => {
  if (!observation.caseId) return 'missing_case_id';
  if (observation.harnessError) return 'harness_error';
  if (
    observation.expectedArm === 'shadow'
    && observation.effectiveMode !== 'shadow'
  ) {
    return 'unexpected_shadow_mode';
  }
  if (
    observation.expectedArm === 'candidate'
    && !['candidate', 'full_fallback'].includes(observation.effectiveMode)
  ) {
    return 'not_candidate_routed';
  }
  if (
    observation.usage.status !== 'recorded'
    || observation.usage.totalTokens == null
  ) {
    return 'usage_unknown';
  }
  if (observation.usage.modelCallCount == null) return 'model_call_count_unknown';
  if (!observation.provider || !observation.model) return 'missing_provider_model';
  if (!observation.retrieverVersion) return 'missing_retriever_version';
  if (!observation.maidContextVersion) return 'missing_maid_context_version';
  return '';
};

const addExclusion = (exclusions, caseId, reason) => {
  exclusions.push({
    caseId: trim(caseId),
    reason: trim(reason) || 'not_comparable',
  });
};

const summarizeTokenPairs = (pairs = [], key = 'totalTokens') => {
  const known = pairs.filter(pair => (
    pair.shadow.usage[key] != null
    && pair.candidate.usage[key] != null
  ));
  const shadowTotal = known.reduce((sum, pair) => sum + pair.shadow.usage[key], 0);
  const candidateTotal = known.reduce((sum, pair) => sum + pair.candidate.usage[key], 0);
  const divisor = known.length || 1;
  const shadowMean = known.length ? shadowTotal / divisor : null;
  const candidateMean = known.length ? candidateTotal / divisor : null;
  return {
    pairCount: known.length,
    shadowTotal,
    candidateTotal,
    shadowMean,
    candidateMean,
    meanDelta: known.length ? candidateMean - shadowMean : null,
    reductionPercent: known.length && shadowMean > 0
      ? ((shadowMean - candidateMean) / shadowMean) * 100
      : null,
  };
};

const summarizeBooleanPairs = (pairs = [], key = 'success') => {
  const known = pairs.filter(pair => (
    typeof pair.shadow[key] === 'boolean'
    && typeof pair.candidate[key] === 'boolean'
  ));
  const shadowPositive = known.filter(pair => pair.shadow[key]).length;
  const candidatePositive = known.filter(pair => pair.candidate[key]).length;
  const shadowRate = known.length ? shadowPositive / known.length : null;
  const candidateRate = known.length ? candidatePositive / known.length : null;
  return {
    pairCount: known.length,
    shadowPositive,
    candidatePositive,
    shadowRate,
    candidateRate,
    rateDelta: known.length ? candidateRate - shadowRate : null,
  };
};

const countReasons = (exclusions = []) => exclusions.reduce((counts, item) => {
  counts[item.reason] = (counts[item.reason] || 0) + 1;
  return counts;
}, {});

const taskRecords = records => (Array.isArray(records) ? records : [])
  .filter(record => isPlainObject(record) && (!record.recordType || record.recordType === 'task_result'));

const groupByCase = (items = []) => items.reduce((groups, item) => {
  const list = groups.get(item.caseId) || [];
  list.push(item);
  groups.set(item.caseId, list);
  return groups;
}, new Map());

export const compareMaidCandidateUsage = ({
  shadowRecords = [],
  candidateRecords = [],
  minPairs = 1,
} = {}) => {
  const requiredPairs = Math.max(1, Math.trunc(Number(minPairs)) || 1);
  const shadow = taskRecords(shadowRecords).map(record => normalizeObservation(record, 'shadow'));
  const candidate = taskRecords(candidateRecords).map(record => normalizeObservation(record, 'candidate'));
  const shadowByCase = groupByCase(shadow);
  const candidateByCase = groupByCase(candidate);
  const caseIds = new Set([...shadowByCase.keys(), ...candidateByCase.keys()]);
  const exclusions = [];
  const pairs = [];

  caseIds.forEach((caseId) => {
    const shadowItems = shadowByCase.get(caseId) || [];
    const candidateItems = candidateByCase.get(caseId) || [];
    if (!caseId) {
      [...shadowItems, ...candidateItems].forEach(() => addExclusion(exclusions, '', 'missing_case_id'));
      return;
    }
    if (shadowItems.length !== 1 || candidateItems.length !== 1) {
      addExclusion(
        exclusions,
        caseId,
        shadowItems.length === 0 || candidateItems.length === 0 ? 'missing_pair' : 'duplicate_case',
      );
      return;
    }

    const shadowItem = shadowItems[0];
    const candidateItem = candidateItems[0];
    const shadowIssue = validateObservation(shadowItem);
    const candidateIssue = validateObservation(candidateItem);
    if (shadowIssue || candidateIssue) {
      addExclusion(exclusions, caseId, shadowIssue || candidateIssue);
      return;
    }
    if (
      shadowItem.promptFingerprint
      && candidateItem.promptFingerprint
      && shadowItem.promptFingerprint !== candidateItem.promptFingerprint
    ) {
      addExclusion(exclusions, caseId, 'prompt_mismatch');
      return;
    }
    if (
      shadowItem.provider !== candidateItem.provider
      || shadowItem.model !== candidateItem.model
      || shadowItem.retrieverVersion !== candidateItem.retrieverVersion
      || shadowItem.maidContextVersion !== candidateItem.maidContextVersion
    ) {
      addExclusion(exclusions, caseId, 'cohort_mismatch');
      return;
    }
    pairs.push({ shadow: shadowItem, candidate: candidateItem });
  });

  const candidateRouted = candidate.filter(item => (
    item.effectiveMode === 'candidate'
    || item.effectiveMode === 'full_fallback'
  ));
  const fullFallbackCount = candidateRouted.filter(item => item.effectiveMode === 'full_fallback').length;
  const taskCompletion = summarizeBooleanPairs(pairs, 'success');
  const verification = summarizeBooleanPairs(pairs, 'verified');
  const hasCompleteQuality = (
    taskCompletion.pairCount === pairs.length
    && verification.pairCount === pairs.length
  );

  return {
    schemaVersion: 1,
    method: 'same_task_paired',
    measurementReady: pairs.length >= requiredPairs && hasCompleteQuality,
    canaryDecision: 'not_evaluated',
    criteria: {
      minPairs: requiredPairs,
      actualProviderUsageRequired: true,
      modelCallCountRequired: true,
      sameProviderModelRetrieverRequired: true,
      sameMaidContextVersionRequired: true,
      taskCompletionRequired: true,
      verificationRequired: true,
    },
    input: {
      shadowTaskCount: shadow.length,
      candidateTaskCount: candidate.length,
    },
    comparison: {
      pairCount: pairs.length,
      excludedCount: exclusions.length,
      exclusionReasons: countReasons(exclusions),
      exclusions,
    },
    candidateRouting: {
      routedCount: candidateRouted.length,
      directCandidateCount: candidateRouted.length - fullFallbackCount,
      fullFallbackCount,
      fallbackRate: candidateRouted.length ? fullFallbackCount / candidateRouted.length : null,
    },
    usage: {
      promptTokens: summarizeTokenPairs(pairs, 'promptTokens'),
      completionTokens: summarizeTokenPairs(pairs, 'completionTokens'),
      totalTokens: summarizeTokenPairs(pairs, 'totalTokens'),
      modelCallCount: summarizeTokenPairs(pairs, 'modelCallCount'),
    },
    quality: {
      complete: hasCompleteQuality,
      taskCompletion,
      verification,
    },
  };
};

export const readMaidCandidateUsageRecords = (filePath = '') => {
  const text = readFileSync(resolve(filePath), 'utf8').trim();
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return text.split(/\r?\n/)
      .filter(line => line.trim())
      .map((line, index) => {
        try {
          return JSON.parse(line);
        } catch (error) {
          throw new Error(`${filePath}:${index + 1} 不是有效 JSONL：${error.message}`);
        }
      });
  }
};

const parseCliArgs = (argv = []) => {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (key === '--shadow' || key === '--candidate' || key === '--min-pairs') {
      args[key.slice(2)] = argv[index + 1];
      index += 1;
    }
  }
  return args;
};

const isDirectRun = Boolean(
  process.argv[1]
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href,
);

if (isDirectRun) {
  const args = parseCliArgs(process.argv.slice(2));
  if (!args.shadow || !args.candidate) {
    console.error('用法：node scripts/dev/maid-candidate-usage-ab.mjs --shadow <shadow.jsonl> --candidate <candidate.jsonl> [--min-pairs 1]');
    process.exitCode = 2;
  } else {
    try {
      const report = compareMaidCandidateUsage({
        shadowRecords: readMaidCandidateUsageRecords(args.shadow),
        candidateRecords: readMaidCandidateUsageRecords(args.candidate),
        minPairs: args['min-pairs'],
      });
      console.log(JSON.stringify(report, null, 2));
      if (!report.measurementReady) process.exitCode = 1;
    } catch (error) {
      console.error(error?.message || String(error));
      process.exitCode = 2;
    }
  }
}
