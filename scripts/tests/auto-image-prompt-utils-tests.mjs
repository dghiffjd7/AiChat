import assert from 'node:assert/strict';
import {
  buildAutoImagePromptInstruction,
  extractAutoImagePrompts,
  stripAutoImagePromptTags,
} from '../../src/scripts/ui/chat/auto-image-prompt-utils.js';

{
  const prompts = extractAutoImagePrompts('正文\n<image_prompt>blue sky, girl, soft light</image_prompt>');
  assert.deepEqual(prompts, ['blue sky, girl, soft light']);
  console.log('ok - extracts image_prompt tag content');
}

{
  const prompts = extractAutoImagePrompts('&lt;image_prompt&gt;cinematic portrait&lt;/image_prompt&gt;');
  assert.deepEqual(prompts, ['cinematic portrait']);
  console.log('ok - extracts html escaped image_prompt tags');
}

{
  const stripped = stripAutoImagePromptTags('hello\n<image_prompt>secret prompt</image_prompt>\nworld');
  assert.equal(stripped.trim().replace(/\n{2,}/g, '\n'), 'hello\nworld');
  console.log('ok - strips image_prompt tags from display text');
}

{
  const instruction = buildAutoImagePromptInstruction({
    uiMode: 'chat',
    isGroupChat: true,
    modelHint: 'openai / gpt-image-2',
    style: 'natural',
  });
  assert.doesNotMatch(instruction, /<auto_image_generation>/);
  assert.match(instruction, /<image_prompt>/);
  assert.match(instruction, /请严格按以下XML格式输出/);
  assert.match(instruction, /openai \/ gpt-image-2/);
  assert.doesNotMatch(instruction, /<tableEdit>/);
  console.log('ok - builds auto image prompt instruction');
}

{
  const instruction = buildAutoImagePromptInstruction({
    includeTableEdit: true,
    template: '{{image_prompt_position_rule}}\n<image_prompt>prompt</image_prompt>',
  });
  assert.match(instruction, /<tableEdit>\.\.\.<\/tableEdit>/);
  console.log('ok - includes tableEdit position rule for custom placeholder templates');
}

{
  const instruction = buildAutoImagePromptInstruction({
    uiMode: 'rp',
    modelHint: 'gemini / nano banana',
    style: 'auto',
    template: 'surface={{image_prompt_surface}}\nmodel={{image_prompt_model}}\nstyle={{image_prompt_style}}\nwhere={{image_prompt_position_rule}}\ntag={{image_prompt_tag}}',
  });
  assert.match(instruction, /surface=创意写作插图/);
  assert.match(instruction, /model=gemini \/ nano banana/);
  assert.match(instruction, /where=若需要生成图片/);
  assert.match(instruction, /tag=image_prompt/);
  console.log('ok - renders custom preset auto image prompt template');
}
