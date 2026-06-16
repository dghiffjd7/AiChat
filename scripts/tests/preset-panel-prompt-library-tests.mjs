import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const panelPath = resolve(__dirname, '../../src/scripts/ui/preset-panel.js');
const source = readFileSync(panelPath, 'utf8');

{
  assert.doesNotMatch(source, /from '\.\/prompt-library-taxonomy\.js'/);
  assert.doesNotMatch(source, /renderPromptLibrarySummary/);
  assert.doesNotMatch(source, /pp-prompt-library-summary/);
  assert.doesNotMatch(source, /pp-prompt-library-workspace/);
  assert.doesNotMatch(source, /pp-prompt-library-detailbar/);
  assert.doesNotMatch(source, /dataset\.promptLibraryFilter/);
  assert.doesNotMatch(source, /openPromptDetail/);
  console.log('ok - chat prompt editor no longer renders prompt library summary or detail navigation');
}

{
  assert.match(source, /点击区块标题展开编辑/);
  assert.match(source, /const list = document\.createElement\('div'\);/);
  assert.match(source, /list\.style\.cssText = 'display:flex; flex-direction:column; gap:10px;'/);
  assert.match(source, /wrap\.appendChild\(list\);/);
  console.log('ok - chat prompts render as a direct collapsible block list');
}

{
  assert.match(source, /id="\$\{cfg\.idPrefix\}-enabled"/);
  assert.match(source, /this\.renderTextarea\('规则内容', `\$\{cfg\.idPrefix\}-rules`/);
  assert.match(source, /enabledInput\.addEventListener\('change'/);
  assert.match(source, /id = 'ds-format-enabled'/);
  assert.match(source, /id = 'ds-format-rules'/);
  console.log('ok - legacy chat prompt field ids remain available for preset saving');
}

{
  const toggleHandlerCount = (source.match(/header\.addEventListener\('click', \(\) => setCollapsed\(card\.dataset\.collapsed !== 'true'\)\)/g) || []).length;
  assert.ok(toggleHandlerCount >= 2, 'expected reusable prompt blocks and default format block to toggle inline');
  assert.match(source, /card\.dataset\.collapsed = collapsed \? 'true' : 'false'/);
  assert.match(source, /body\.style\.display = collapsed \? 'none' : 'block'/);
  assert.match(source, /setCollapsed\(true\)/);
  console.log('ok - chat prompt blocks use inline expand and collapse behavior');
}
