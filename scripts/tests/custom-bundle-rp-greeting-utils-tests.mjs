import assert from 'node:assert/strict';

const {
  buildCustomBundleRpGreetingPayload,
  normalizeCustomBundleImportedRpGreetings,
} = await import('../../src/scripts/ui/custom-bundle-rp-greeting-utils.js');

{
  const payload = buildCustomBundleRpGreetingPayload({
    greetings: [
      { id: ' intro ', title: ' Opening ', content: ' hello ' },
      { id: ' empty ', title: ' Empty ', content: '   ' },
    ],
    activeGreetingId: ' intro ',
  });
  assert.deepEqual(payload, {
    greetings: [
      { id: 'intro', title: 'Opening', content: 'hello' },
      { id: 'empty', title: 'Empty', content: '' },
    ],
    activeGreetingId: 'intro',
  });
  console.log('ok - buildCustomBundleRpGreetingPayload trims fields without filtering export greetings');
}

{
  const payload = normalizeCustomBundleImportedRpGreetings({
    greetings: [
      { id: ' intro ', title: ' Opening ', content: ' hello ' },
      { id: ' empty ', title: ' Empty ', content: '   ' },
      null,
    ],
    activeGreetingId: ' intro ',
  });
  assert.deepEqual(payload, {
    greetings: [
      { id: 'intro', title: 'Opening', content: 'hello' },
    ],
    activeId: 'intro',
  });
  console.log('ok - normalizeCustomBundleImportedRpGreetings trims fields and filters empty imports');
}
