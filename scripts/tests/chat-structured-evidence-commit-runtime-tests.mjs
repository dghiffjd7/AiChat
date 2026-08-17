import assert from 'node:assert/strict';
import { createChatStructuredEvidenceCommitRuntime } from '../../src/scripts/agent/chat-structured-evidence-commit-runtime.js';

const identity = { provider: 'test', model: 'model' };
const outcome = {
  attempted: true,
  ok: true,
  argumentRepairApplied: false,
  canonicalRoundTrip: true,
  frozenTargetMatched: true,
  domainValidated: true,
};

{
  const calls = [];
  const runtime = createChatStructuredEvidenceCommitRuntime({
    store: { record: async (...args) => { calls.push(args); return { action: 'strict_success_recorded' }; } },
  });
  assert.equal(runtime.stage({ requestId: 'req-1', identity, mode: 'provider_fc', outcome }), true);
  assert.equal(calls.length, 0);
  const finalized = await runtime.finalize({ requestId: 'req-1', committed: true });
  assert.equal(finalized.recorded, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][2].committed, true);
  assert.equal(calls[0][2].fallbackUsed, false);
  assert.equal(runtime.getPendingCount(), 0);
  console.log('ok - strict evidence is recorded only after the APP transaction commits');
}

{
  let recordCount = 0;
  const runtime = createChatStructuredEvidenceCommitRuntime({
    store: { record: async () => { recordCount += 1; } },
  });
  runtime.stage({ requestId: 'req-2', identity, mode: 'json_terminal', outcome });
  const rejected = await runtime.finalize({ requestId: 'req-2', committed: false });
  assert.equal(rejected.recorded, false);
  assert.equal(rejected.reason, 'transaction_not_committed');
  assert.equal(recordCount, 0);
  assert.equal((await runtime.finalize({ requestId: 'req-2', committed: true })).reason, 'pending_evidence_missing');
  console.log('ok - parse rejection, cancellation, or failed commit cannot fabricate success evidence');
}

{
  let recordCount = 0;
  const runtime = createChatStructuredEvidenceCommitRuntime({
    store: { record: async () => { recordCount += 1; } },
    maxPending: 2,
  });
  ['old', 'middle', 'new'].forEach(requestId => {
    runtime.stage({ requestId, identity, mode: 'provider_fc', outcome });
  });
  assert.equal(runtime.getPendingCount(), 2);
  assert.equal((await runtime.finalize({ requestId: 'old', committed: true })).recorded, false);
  assert.equal(recordCount, 0);
  console.log('ok - abandoned pending evidence is bounded and never records implicitly');
}

console.log('chat-structured-evidence-commit-runtime-tests passed');
