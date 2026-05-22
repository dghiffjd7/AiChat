import assert from 'node:assert/strict';

import {
  classifyUiEntry,
  extractUiEntriesFromText,
  renderUiEntryInventoryMarkdown,
} from '../ui-entry-inventory.mjs';

{
  const entry = classifyUiEntry({
    filePath: 'src/scripts/ui/preset-panel.js',
    value: 'image_prompt template',
  });
  assert.equal(entry.surfaces.includes('prompt'), true);
  assert.equal(entry.surfaces.includes('image'), true);
  assert.equal(entry.flags.includes('prompt_surface_mixed'), true);
  console.log('ok - UI entry inventory flags prompt/image surface mixing');
}

{
  const entry = classifyUiEntry({
    filePath: 'src/scripts/ui/debug-panel.js',
    value: 'run real provider runner',
  });
  assert.equal(entry.surfaces.includes('debug'), true);
  assert.equal(entry.surfaces.includes('agent'), true);
  assert.equal(entry.risk, 'high');
  console.log('ok - UI entry inventory classifies debug agent runner entries');
}

{
  const entries = extractUiEntriesFromText({
    filePath: 'src/index.html',
    text: `
      <button data-action="generate-image" aria-label="生成图片">生成</button>
      <button id="agent-center-button">Agent</button>
      const item = { label: '聊天提示词预设' };
    `,
  });
  assert.equal(entries.some(entry => entry.value === 'generate-image'), true);
  assert.equal(entries.some(entry => entry.value === 'agent-center-button'), true);
  assert.equal(entries.some(entry => entry.value === '聊天提示词预设'), true);
  assert.equal(entries.some(entry => entry.risk === 'high'), true);
  console.log('ok - UI entry inventory extracts DOM and JS label candidates');
}

{
  const markdown = renderUiEntryInventoryMarkdown({
    generatedAt: '2026-05-22T00:00:00.000Z',
    fileCount: 1,
    entries: [
      {
        filePath: 'src/index.html',
        lineNumber: 1,
        value: 'generate-image',
        surfaces: ['image'],
        roles: ['action'],
        risk: 'high',
        frequency: 'high',
        flags: ['high_risk_high_frequency'],
      },
    ],
  });
  assert.match(markdown, /UI Entrance Inventory/);
  assert.match(markdown, /高风险高频入口/);
  assert.match(markdown, /generate-image/);
  console.log('ok - UI entry inventory renders markdown report');
}
