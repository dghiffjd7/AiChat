import assert from 'node:assert/strict';

import {
  buildSelectedSummaryEntries,
  normalizeSummaryItems,
  parseEditedSummaryLines,
  resolveCompactedSummaryViewModel,
} from '../../src/scripts/ui/session-summary-utils.js';

{
  const result = normalizeSummaryItems([
    { text: 'first', at: 10 },
    '',
    { text: 'second', at: 20 },
    { text: '   ' },
  ]);
  assert.equal(result.length, 2);
  assert.equal(result[0].text, 'second');
  assert.equal(result[0].key, '20|second');
  assert.equal(result[1].text, 'first');
  assert.equal(result[1].key, '10|first');
  console.log('ok - normalizeSummaryItems reverses trims and filters empty summaries');
}

{
  const result = buildSelectedSummaryEntries(['12|hello', '0|a|b']);
  assert.deepEqual(result, [
    { at: 12, text: 'hello' },
    { at: 0, text: 'a|b' },
  ]);
  console.log('ok - buildSelectedSummaryEntries restores timestamp and text from selection keys');
}

{
  assert.deepEqual(parseEditedSummaryLines('- a\n- b\n'), ['a', 'b']);
  assert.deepEqual(parseEditedSummaryLines('a\n \n b '), ['a', 'b']);
  console.log('ok - parseEditedSummaryLines supports bullet mode and plain-line mode');
}

{
  assert.equal(resolveCompactedSummaryViewModel({ text: '   ' }), null);
  const result = resolveCompactedSummaryViewModel({ text: 'hello', at: 123 });
  assert.equal(result.text, 'hello');
  assert.equal(result.at, 123);
  console.log('ok - resolveCompactedSummaryViewModel trims text and rejects empty compacted summaries');
}
