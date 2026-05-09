import assert from 'node:assert/strict';

import {
  buildTemplateInjectRegex,
  parseTemplateInjectTags,
} from '../../src/scripts/ui/template-inject-tag-utils.js';

{
  const tags = parseTemplateInjectTags([
    'prefix',
    '[GENERATE:before]',
    '[GENERATE: 2 : after]',
    '[GENERATE:REGEX:/<tag>.*?<\\/tag>/is]',
    '[RENDER:before]',
    '[RENDER:after]',
    '[RENDER:middle]',
    '[GENERATE:bad:index]',
  ].join(' '));
  assert.deepEqual(tags, [
    { stage: 'generate', type: 'edge', mode: 'before' },
    { stage: 'generate', type: 'index', index: 2, mode: 'after' },
    { stage: 'generate', type: 'regex', pattern: '/<tag>.*?<\\/tag>/is', mode: 'before' },
    { stage: 'render', type: 'edge', mode: 'before' },
    { stage: 'render', type: 'edge', mode: 'after' },
  ]);
  console.log('ok - parseTemplateInjectTags extracts generate and render template tags');
}

{
  assert.deepEqual(parseTemplateInjectTags('no tags here'), []);
  assert.deepEqual(parseTemplateInjectTags('[GENERATE:] [RENDER:]'), []);
  console.log('ok - parseTemplateInjectTags ignores missing and invalid tags');
}

{
  const slashRegex = buildTemplateInjectRegex('/hello\\s+world/i');
  assert.ok(slashRegex instanceof RegExp);
  assert.equal(slashRegex.test('HELLO world'), true);

  const plainRegex = buildTemplateInjectRegex('memory update');
  assert.ok(plainRegex instanceof RegExp);
  assert.equal(plainRegex.test('Memory Update'), true);
  assert.equal(buildTemplateInjectRegex('/bad(/'), null);
  console.log('ok - buildTemplateInjectRegex supports slash and plain patterns');
}
