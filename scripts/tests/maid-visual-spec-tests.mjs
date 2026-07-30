import assert from 'node:assert/strict';

import {
  buildMaidVisualSpecPromptBlock,
  buildMaidVisualSpecPrompt,
  createMaidVisualSpecLedger,
  freezeMaidVisualSpec,
  normalizeMaidVisualSpecLedger,
  validateMaidVisualAspect,
  validateMaidVisualAttachmentTarget,
} from '../../src/scripts/agent/maid-visual-spec.js';

const baseArgs = {
  prompt: 'yukinoshita_yukino, long black hair, school uniform, anime style',
  subject: '雪之下雪乃',
  subjectAliases: ['yukinoshita_yukino'],
  target: '雪之下雪乃',
  purpose: 'avatar',
  appearance: 'long black hair, blue eyes',
  outfit: 'sobu high school uniform',
  style: 'anime style, clean lineart',
  targetAspectRatio: '1:1',
};

{
  const ledger = createMaidVisualSpecLedger();
  const first = freezeMaidVisualSpec({ ledger, args: baseArgs });
  assert.equal(first.ok, true);
  assert.equal(first.created, true);
  assert.equal(first.spec.subject, '雪之下雪乃');

  const reused = freezeMaidVisualSpec({
    ledger,
    args: {
      ...baseArgs,
      purpose: 'wallpaper',
      targetAspectRatio: '9:16',
    },
  });
  assert.equal(reused.ok, true);
  assert.equal(reused.created, false);
  assert.equal(reused.spec.appearance, baseArgs.appearance);

  const conflict = freezeMaidVisualSpec({
    ledger,
    args: {
      ...baseArgs,
      style: 'photorealistic',
    },
  });
  assert.equal(conflict.ok, false);
  assert.equal(conflict.reason, 'visual_spec_conflict');
  assert.deepEqual(conflict.conflictingFields, ['style']);

  const prompt = buildMaidVisualSpecPrompt({
    prompt: baseArgs.prompt,
    spec: first.spec,
    promptDialect: 'nai_tags',
  });
  assert.match(prompt, /long black hair/);
  assert.match(prompt, /sobu high school uniform/);
  console.log('ok - visual spec freezes character design across avatar and wallpaper generations');
}

{
  const aspect = validateMaidVisualAspect({
    targetAspectRatio: '16:9',
    width: 1344,
    height: 768,
  });
  assert.equal(aspect.ok, true);

  const mismatch = validateMaidVisualAspect({
    targetAspectRatio: '1:1',
    width: 1344,
    height: 768,
  });
  assert.equal(mismatch.ok, false);
  assert.equal(mismatch.reason, 'visual_aspect_mismatch');
  console.log('ok - visual aspect validation rejects a wide preset before avatar writeback');
}

{
  const ledger = createMaidVisualSpecLedger();
  const frozen = freezeMaidVisualSpec({ ledger, args: baseArgs });
  const attachment = {
    source: 'generated',
    visualSpec: {
      ...frozen.spec,
      target: '雪之下雪乃',
      purpose: 'avatar',
      actualWidth: 1024,
      actualHeight: 1024,
    },
  };
  assert.equal(validateMaidVisualAttachmentTarget({
    attachment,
    purpose: 'avatar',
    target: { id: 'room-yukino', name: '雪之下雪乃' },
  }).ok, true);
  assert.equal(validateMaidVisualAttachmentTarget({
    attachment,
    purpose: 'wallpaper',
    target: { id: 'room-yukino', name: '雪之下雪乃' },
  }).reason, 'visual_purpose_mismatch');
  assert.equal(validateMaidVisualAttachmentTarget({
    attachment,
    purpose: 'avatar',
    target: { id: 'room-yui', name: '由比滨结衣' },
  }).reason, 'visual_target_mismatch');
  assert.match(buildMaidVisualSpecPromptBlock(ledger), /雪之下雪乃/);
  assert.match(buildMaidVisualSpecPromptBlock(ledger), /frozen/);
  console.log('ok - generated attachments can only be written to their frozen target and purpose');
}

{
  const specs = {};
  Array.from({ length: 10 }, (_, index) => {
    specs[`subject-${index}`] = {
      subject: `subject-${index}`,
      appearance: 'a'.repeat(500),
      outfit: 'b'.repeat(500),
      style: 'c'.repeat(500),
    };
  });
  const normalized = normalizeMaidVisualSpecLedger({ specs });
  assert.equal(Object.keys(normalized.specs).length, 8);
  assert.equal(normalized.specs['subject-2'].appearance.length, 360);
  assert.equal(normalized.specs['subject-2'].outfit.length, 360);
  assert.equal(normalized.specs['subject-2'].style.length, 360);
  console.log('ok - visual continuation ledger stays bounded for long multi-character tasks');
}

console.log('maid-visual-spec-tests passed');
