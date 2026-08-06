import assert from 'node:assert/strict';

import {
  classifyCompatGapRuntimeError,
  CompatGapCorrelationTracker,
  resolveCompatGapMessage,
} from '../../src/scripts/ui/chat/compat-gap-report-runtime.js';

const sourceA = {};
const sourceB = {};
const iframeA = {
  contentWindow: sourceA,
  dataset: {
    iframeId: 'iframe-a',
    sessionId: 'rp:card-a',
    msgId: 'message-a',
    compatRevision: 'revision-a',
  },
};
const iframeB = {
  contentWindow: sourceB,
  dataset: {
    iframeId: 'iframe-b',
    sessionId: 'rp:card-b',
    msgId: 'message-b',
    compatRevision: 'revision-b',
  },
};

const acceptedA = resolveCompatGapMessage({
  event: {
    source: sourceA,
    data: { type: 'chatapp:compat-miss', id: 'iframe-a', api: '_.camelCase', tag: 'forged-tag' },
  },
  iframes: [iframeA, iframeB],
});
const acceptedB = resolveCompatGapMessage({
  event: {
    source: sourceB,
    data: { type: 'chatapp:compat-miss', id: 'iframe-b', api: '_.camelCase' },
  },
  iframes: [iframeA, iframeB],
});
assert.equal(acceptedA.accepted, true);
assert.equal(acceptedB.accepted, true);
assert.notEqual(acceptedA.report.scopeFingerprint, acceptedB.report.scopeFingerprint);
assert.equal(acceptedA.report.revisionFingerprint, 'revision-a');
assert.equal(Object.prototype.hasOwnProperty.call(acceptedA.report, 'tag'), false, 'untrusted iframe tags must not enter reports');

assert.equal(resolveCompatGapMessage({
  event: {
    source: sourceA,
    data: { type: 'chatapp:compat-miss', id: 'iframe-b', api: '_.camelCase' },
  },
  iframes: [iframeA, iframeB],
}).reason, 'iframe-id-mismatch');
assert.equal(resolveCompatGapMessage({
  event: {
    source: {},
    data: { type: 'chatapp:compat-miss', id: 'iframe-a', api: '_.camelCase' },
  },
  iframes: [iframeA, iframeB],
}).reason, 'untrusted-source');
assert.equal(resolveCompatGapMessage({
  event: {
    source: sourceA,
    data: { type: 'chatapp:compat-miss', id: 'iframe-a', api: '_.secret value' },
  },
  iframes: [iframeA, iframeB],
}).reason, 'invalid-api');
console.log('ok - compat gap host context is source-bound, card-scoped, and ignores untrusted metadata');

{
  let now = 1000;
  const tracker = new CompatGapCorrelationTracker({ now: () => now, windowMs: 3000 });
  tracker.remember(acceptedA);
  const confirmed = tracker.confirm({
    iframeId: 'iframe-a',
    error: 'TypeError: _.camelCase is not a function',
  });
  assert.equal(confirmed?.status, 'confirmed');
  assert.equal(confirmed?.errorCategory, 'api_shape');
  assert.ok(confirmed?.errorFingerprint);
  assert.equal(tracker.confirm({
    iframeId: 'iframe-a',
    error: 'TypeError: unrelated is not a function',
  }), null);

  tracker.remember(acceptedB);
  now += 4000;
  assert.equal(tracker.confirm({
    iframeId: 'iframe-b',
    error: 'TypeError: _.camelCase is not a function',
  }), null, 'stale property probes must not be promoted to confirmed causes');
  console.log('ok - compat gap candidates become confirmed only for correlated runtime errors');
}


{
  let now = 1000;
  const tracker = new CompatGapCorrelationTracker({ now: () => now, windowMs: 3000 });
  tracker.remember(acceptedA);
  now += 4000;
  tracker.remember(acceptedB);
  assert.equal(tracker.pending.has('iframe-a'), false, 'sweep must drop stale keys of destroyed iframes');
  assert.equal(tracker.pending.has('iframe-b'), true);
  now += 4000;
  tracker.confirm({ iframeId: 'iframe-b', error: 'TypeError: x is not a function' });
  assert.equal(tracker.pending.size, 0, 'confirm sweep clears fully-expired pending map');
  console.log('ok - correlation tracker sweeps stale iframes on any activity');
}

{
  assert.equal(
    classifyCompatGapRuntimeError("Cannot read properties of undefined (reading 'stat_data')"),
    'missing_value',
  );
  assert.equal(
    classifyCompatGapRuntimeError('await is only valid in async functions and the top level bodies of modules'),
    'syntax_top_level_await',
  );
  console.log('ok - compat gap classifier is shared with the worker diagnostic classifier');
}
