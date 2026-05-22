import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const panelPath = resolve(__dirname, '../../src/scripts/ui/preset-panel.js');
const source = readFileSync(panelPath, 'utf8');

{
  assert.match(source, /from '\.\/prompt-library-taxonomy\.js'/);
  assert.match(source, /renderPromptLibrarySummary\(items = \[\]\)/);
  assert.match(source, /dataset\.promptLibrarySummary = 'chatprompts'/);
  assert.match(source, /dataset\.promptLibraryFilter = 'all'/);
  assert.match(source, /pp-prompt-library-summary/);
  console.log('ok - preset panel imports and renders prompt library summary');
}

{
  assert.match(source, /PROMPT_LIBRARY_CATEGORIES\.image[\s\S]*自动标签生图提示词/);
  assert.match(source, /PROMPT_LIBRARY_CATEGORIES\.moments[\s\S]*动态发布决策提示词/);
  assert.match(source, /PROMPT_LIBRARY_CATEGORIES\.moments[\s\S]*动态评论回复提示词/);
  assert.match(source, /PROMPT_LIBRARY_CATEGORIES\.chat[\s\S]*私聊提示词/);
  console.log('ok - mixed chat prompt entries are classified for library migration');
}

{
  const descIndex = source.indexOf('当前仍统一编辑聊天提示词预设');
  const summaryIndex = source.indexOf('const promptLibrarySummary = this.renderPromptLibrarySummary(promptLibraryItems);');
  const listIndex = source.indexOf("list.style.cssText = 'display:flex; flex-direction:column; gap:10px;'");
  assert.ok(descIndex > -1);
  assert.ok(summaryIndex > descIndex);
  assert.ok(listIndex > summaryIndex);
  console.log('ok - prompt library summary appears before prompt blocks');
}

{
  assert.match(source, /card\.dataset\.promptLibraryCategory = libraryItem\.category/);
  assert.match(source, /card\.hidden = normalizedCategory !== 'all'/);
  assert.match(source, /promptLibrarySummary\.addEventListener\('click'/);
  console.log('ok - prompt library chips filter visible prompt blocks without removing fields');
}
