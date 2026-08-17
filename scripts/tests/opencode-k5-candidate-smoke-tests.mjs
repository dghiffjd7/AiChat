import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(
  new URL('../dev/opencode-k5-candidate-smoke.js', import.meta.url),
  'utf8',
);
const surfaceSource = await readFile(
  new URL('../dev/opencode-k5-candidate-surface-smoke.js', import.meta.url),
  'utf8',
);
const cohortSource = await readFile(
  new URL('../dev/opencode-k5-candidate-cohort.js', import.meta.url),
  'utf8',
);
const boundarySource = await readFile(
  new URL('../dev/opencode-k5-candidate-boundary-smoke.js', import.meta.url),
  'utf8',
);
const realSessionSource = await readFile(
  new URL('../dev/provider-h4-real-session-gray.js', import.meta.url),
  'utf8',
);
const matrixCatalogSource = await readFile(
  new URL('../dev/opencode-fc-matrix-catalog.js', import.meta.url),
  'utf8',
);
const matrixRunnerSource = await readFile(
  new URL('../dev/run-opencode-fc-matrix.mjs', import.meta.url),
  'utf8',
);

assert.match(source, /const DEFAULT_CANDIDATE = 'glm-5\.2';/u);
assert.match(source, /isOpenCodeGoChatCompletionsModel\(candidateModel\)/u);
assert.match(source, /catalogExactMatch/u);
assert.match(
  source,
  /if \(!catalogExactMatch\) return buildResult\([\s\S]*?\);/u,
  'a missing catalog entry must stop before paid inference',
);
assert.match(source, /localRuleOverride: localRule/u);
assert.match(source, /const probes = \[/u);
assert.match(source, /id: 'named_stream'/u);
assert.match(source, /id: 'required_nonstream'/u);
assert.match(
  source,
  /rows\.push\(row\);\s*if \(!row\.pass\) break;/u,
  'the first failed probe must stop the remaining paid calls',
);
assert.match(source, /paidCallUpperBound: probes\.length/u);
assert.match(source, /ok: catalogExactMatch/u);
assert.match(source, /__opencodeK5MatrixCatalogModels/u);
assert.match(source, /persistentWrites: 0/u);
assert.match(source, /rawTextRetained: false/u);
assert.match(source, /toolArgumentsRetained: false/u);
assert.doesNotMatch(source, /localStorage\.|\.setItem\(|chatStore|momentsStore|worldStore/u);

assert.match(surfaceSource, /const DEFAULT_CANDIDATE = 'glm-5\.2';/u);
assert.match(surfaceSource, /runChatFcZeroWriteCompatibilityTest/u);
assert.match(surfaceSource, /localRuleOverride/u);
assert.match(surfaceSource, /modelCallUpperBound: 3/u);
assert.match(surfaceSource, /persistentWrites: 0/u);
assert.match(surfaceSource, /rawTextRetained: false/u);
assert.match(surfaceSource, /toolArgumentsRetained: false/u);
assert.doesNotMatch(surfaceSource, /localStorage\.|\.setItem\(|chatStore|momentsStore|worldStore/u);

assert.match(cohortSource, /const DEFAULT_CANDIDATE = 'glm-5\.2';/u);
assert.match(cohortSource, /const MAX_REPETITIONS = 10;/u);
assert.match(cohortSource, /__opencodeK5CohortStartRepetition/u);
assert.match(cohortSource, /__opencodeK5CohortRepetitions/u);
assert.match(cohortSource, /fixtureToken: `K5-\$\{fixtureModelToken\}-/u);
assert.match(cohortSource, /runChatFcZeroWriteCompatibilityTest/u);
assert.match(cohortSource, /rule: localRuleOverride/u);
assert.match(cohortSource, /if \(!round\.ok\) break;/u);
assert.match(cohortSource, /modelCallUpperBound: expectedSamples/u);
assert.match(cohortSource, /persistentWrites: 0/u);
assert.match(cohortSource, /rawTextRetained: false/u);
assert.match(cohortSource, /toolArgumentsRetained: false/u);
assert.doesNotMatch(cohortSource, /localStorage\.|\.setItem\(|chatStore|momentsStore|worldStore/u);

assert.match(boundarySource, /runPrivateChatGenerationWithFallback/u);
assert.match(boundarySource, /__opencodeK5CandidateModel/u);
assert.match(boundarySource, /isOpenCodeGoChatCompletionsModel\(candidateModel\)/u);
assert.match(boundarySource, /controller\.abort\(\)/u);
assert.match(boundarySource, /safeInvoke\('http_abort_request'/u);
assert.match(boundarySource, /localRuleOverride/u);
assert.match(boundarySource, /realPaidCallUpperBound: 1/u);
assert.match(boundarySource, /persistentWrites: 0/u);
assert.match(boundarySource, /rawTextRetained: false/u);
assert.doesNotMatch(boundarySource, /localStorage\.|\.setItem\(|chatStore|momentsStore|worldStore/u);

assert.match(realSessionSource, /__stageH4OpenCodeModelOverride/u);
assert.match(realSessionSource, /resolveChatProviderFcRelease\(runtime\)/u);
assert.match(
  realSessionSource,
  /usesCandidateLocalRule = providerFilter === 'opencode'[\s\S]*?releaseBeforeOverride\.enabled !== true/u,
);
assert.match(realSessionSource, /replaceChatFcLocalCapabilityRules/u);
assert.match(realSessionSource, /candidateLocalRuleScope = 'in_memory_only'/u);
assert.match(
  realSessionSource,
  /capabilitySourceMatched: trim\(transport\.capabilitySource\) === candidateCapabilitySource/u,
);
assert.match(realSessionSource, /streamMetricsPolicyCorrect/u);
assert.doesNotMatch(
  realSessionSource,
  /Number\.isFinite\(Number\(providerCall\.(?:firstMeaningfulDeltaLatencyMs|outputDurationMs|tokensPerSecond)\)\)/u,
);
assert.doesNotMatch(realSessionSource, /chatFcLocalCapabilityStore\.(?:replace|upsert)/u);

assert.match(matrixCatalogSource, /inferenceCallsMade: 0/u);
assert.match(matrixCatalogSource, /credentialsRetained: false/u);
assert.match(matrixCatalogSource, /isOpenCodeGoChatCompletionsModel/u);
assert.match(matrixCatalogSource, /BUNDLED_CHAT_FC_CAPABILITY_CATALOG/u);
assert.doesNotMatch(matrixCatalogSource, /chatStore|momentsStore|worldStore|localStorage\./u);

assert.match(matrixRunnerSource, /Paid execution requires --models or an explicit --all/u);
assert.match(matrixRunnerSource, /positive --max-paid-calls hard cap/u);
assert.match(matrixRunnerSource, /Paid execution requires --report for atomic checkpoints/u);
assert.match(matrixRunnerSource, /beginOpenCodeMatrixStep/u);
assert.match(matrixRunnerSource, /await writeReportAtomic\(options\.reportPath, report\);/u);
assert.match(matrixRunnerSource, /buildOpenCodeBundledCandidateProposal/u);
assert.doesNotMatch(
  matrixRunnerSource,
  /writeFile\([^\n]*(?:chat-fc-capability-catalog|provider-fc-transport)/u,
);

console.log('opencode-k5-candidate-smoke-tests passed');
