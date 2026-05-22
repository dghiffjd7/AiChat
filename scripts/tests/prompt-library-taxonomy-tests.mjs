import assert from 'node:assert/strict';

import {
  PROMPT_LIBRARY_CATEGORIES,
  buildPromptLibraryFacetCounts,
  detectPromptLibraryCategory,
  filterPromptLibraryItems,
  normalizePromptLibraryCategory,
  normalizePromptLibraryItem,
  scorePromptLibraryCategories,
} from '../../src/scripts/ui/prompt-library-taxonomy.js';

{
  assert.equal(normalizePromptLibraryCategory('Image'), PROMPT_LIBRARY_CATEGORIES.image);
  assert.equal(normalizePromptLibraryCategory('advanced'), PROMPT_LIBRARY_CATEGORIES.advanced);
  assert.equal(normalizePromptLibraryCategory('unknown'), PROMPT_LIBRARY_CATEGORIES.unsorted);
  console.log('ok - prompt library category normalization accepts known categories');
}

{
  assert.equal(detectPromptLibraryCategory({
    name: '自动标签生图提示词',
    content: '<image_prompt>cinematic portrait</image_prompt>',
  }), PROMPT_LIBRARY_CATEGORIES.image);
  assert.equal(detectPromptLibraryCategory({
    name: '动态评论模板',
    content: '为朋友圈动态生成评论',
  }), PROMPT_LIBRARY_CATEGORIES.moments);
  assert.equal(detectPromptLibraryCategory({
    name: '章节续写',
    content: '创意写作章节规划',
  }), PROMPT_LIBRARY_CATEGORIES.writing);
  assert.equal(detectPromptLibraryCategory({
    name: 'Provider tool schema',
    content: 'tool call runner schema',
  }), PROMPT_LIBRARY_CATEGORIES.agent);
  assert.equal(detectPromptLibraryCategory({
    name: 'Regex 后处理',
    content: 'post-process slash variable worldbook',
  }), PROMPT_LIBRARY_CATEGORIES.advanced);
  console.log('ok - prompt library category detection separates image moments writing agent advanced prompts');
}

{
  const scores = scorePromptLibraryCategories({
    category: 'chat',
    name: '生图规则',
    content: '<image_prompt>prompt</image_prompt>',
  });
  assert.equal(scores.chat >= 100, true);
  const item = normalizePromptLibraryItem({
    category: 'chat',
    name: '生图规则',
    content: '<image_prompt>prompt</image_prompt>',
  });
  assert.equal(item.category, PROMPT_LIBRARY_CATEGORIES.chat);
  assert.equal(item.detectedCategory, PROMPT_LIBRARY_CATEGORIES.image);
  console.log('ok - explicit prompt library category wins while preserving detected category');
}

{
  const items = [
    { name: '聊天系统提示词', content: 'chat system prompt' },
    { name: '生图规则', content: '<image_prompt>prompt</image_prompt>' },
    { name: '动态模板', content: '动态 评论' },
    { name: '无关键词', content: 'plain text' },
  ];
  const counts = buildPromptLibraryFacetCounts(items);
  assert.equal(counts.chat, 1);
  assert.equal(counts.image, 1);
  assert.equal(counts.moments, 1);
  assert.equal(counts.unsorted, 1);
  assert.equal(filterPromptLibraryItems({ items, category: 'all' }).length, 4);
  assert.deepEqual(filterPromptLibraryItems({ items, category: 'image' }).map(item => item.name), ['生图规则']);
  console.log('ok - prompt library facet counts and filtering are stable');
}
