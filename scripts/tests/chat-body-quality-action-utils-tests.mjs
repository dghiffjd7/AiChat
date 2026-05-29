import assert from 'node:assert/strict';

import { buildChatBodyQualityApplyPatchPayload } from '../../src/scripts/ui/chat/chat-body-quality-action-utils.js';

{
  const payload = buildChatBodyQualityApplyPatchPayload({
    actionMeta: {
      patchCandidate: {
        id: 'body_quality_deterministic_cleanup',
        summary: '移除 1 行连续重复',
      },
    },
    message: {
      id: 'm-body-apply',
      role: 'assistant',
      rawOriginal: [
        '菲伦把伞往你这边偏了偏。',
        '菲伦把伞往你这边偏了偏。',
        '',
        '',
        '',
        '雨声贴着窗沿落下。',
      ].join('\n'),
      content: 'display text',
    },
  });
  assert.deepEqual(payload, {
    text: [
      '菲伦把伞往你这边偏了偏。',
      '',
      '',
      '雨声贴着窗沿落下。',
    ].join('\n'),
    regexEditMode: false,
    source: 'chat_body_quality_guardian',
    patchKind: 'body_quality_deterministic_cleanup',
    patchSummary: '移除 1 行连续重复；压缩过多空行',
    patchRisk: 'low',
  });
  console.log('ok - chat body quality apply patch payload recomputes safe cleanup from message');
}

{
  const payload = buildChatBodyQualityApplyPatchPayload({
    actionMeta: {
      patchCandidate: {
        id: 'body_quality_deterministic_cleanup',
        replacementText: 'should not be trusted',
      },
    },
    message: {
      id: 'm-body-meta',
      role: 'assistant',
      rawOriginal: [
        '作为AI语言模型，我不能继续。',
        '菲伦看着你。',
        '菲伦看着你。',
      ].join('\n'),
    },
  });
  assert.equal(payload, null);
  console.log('ok - chat body quality apply patch refuses needs-review text even with advertised candidate');
}

{
  assert.equal(buildChatBodyQualityApplyPatchPayload({
    message: {
      id: 'm-body-ready',
      role: 'assistant',
      content: '菲伦把伞往你这边偏了偏。',
    },
  }), null);
  console.log('ok - chat body quality apply patch payload stays empty for ready text');
}
