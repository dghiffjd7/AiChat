import assert from 'node:assert/strict';

import {
  buildFormatPatchReviewCandidate,
  createFormatPatchReviewSelection,
  updateFormatPatchReviewSelection,
} from '../../src/scripts/ui/chat/format-patch-review-utils.js';

const originalText = [
  '<rule>',
  'alpha',
  'beta',
  '</rul',
].join('\n');
const linePatches = [{
  startLine: 2,
  endLine: 2,
  originalLines: ['alpha'],
  replacementLines: ['ALPHA'],
  reason: 'first',
}, {
  startLine: 4,
  endLine: 4,
  originalLines: ['</rul'],
  replacementLines: ['</rule>'],
  reason: 'close',
}];

{
  const selection = createFormatPatchReviewSelection(linePatches);
  assert.deepEqual(Array.from(selection), [0, 1]);
  const all = buildFormatPatchReviewCandidate({
    originalText,
    linePatches,
    acceptedPatchIndexes: selection,
  });
  assert.equal(all.ok, true);
  assert.equal(all.candidateText, '<rule>\nALPHA\nbeta\n</rule>');
  console.log('ok - review selection accepts all verified hunks by default');
}

{
  let selection = createFormatPatchReviewSelection(linePatches);
  selection = updateFormatPatchReviewSelection(selection, 0, false);
  const partial = buildFormatPatchReviewCandidate({
    originalText,
    linePatches,
    acceptedPatchIndexes: selection,
  });
  assert.equal(partial.candidateText, '<rule>\nalpha\nbeta\n</rule>');
  assert.deepEqual(partial.acceptedIndexes, [1]);
  console.log('ok - rejecting one hunk builds candidate only from accepted patches');
}

{
  const none = buildFormatPatchReviewCandidate({
    originalText,
    linePatches,
    acceptedPatchIndexes: [],
  });
  assert.equal(none.ok, true);
  assert.equal(none.changed, false);
  assert.equal(none.candidateText, originalText);
  console.log('ok - no accepted hunks preserves original snapshot without a write candidate');
}
