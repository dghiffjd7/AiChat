import assert from 'node:assert/strict';

import {
  applySessionPanelMemoryMode,
  runSessionPanelShowFlow,
} from '../../src/scripts/ui/session-panel-display-runtime-utils.js';

{
  const memoryFeaturesSection = { style: {} };
  const summarySection = { style: {} };
  const memoryTableSection = { style: {} };
  let rendered = 0;
  const result = applySessionPanelMemoryMode({
    memoryMode: 'table',
    memoryFeaturesSection,
    summarySection,
    memoryTableSection,
    renderMemoryTable: () => {
      rendered += 1;
    },
  });

  assert.equal(result.memoryOn, true);
  assert.equal(result.summaryOn, false);
  assert.equal(memoryFeaturesSection.style.display, 'block');
  assert.equal(summarySection.style.display, 'none');
  assert.equal(memoryTableSection.style.display, 'block');
  assert.equal(rendered, 1);
  console.log('ok - applySessionPanelMemoryMode toggles summary/table sections and triggers table render');
}

{
  const steps = [];
  const overlay = { style: {} };
  const panel = { style: {} };
  runSessionPanelShowFlow({
    ensureUi: () => steps.push('ensure'),
    beforeShow: () => steps.push('before'),
    applyMemoryMode: () => steps.push('mode'),
    populate: () => steps.push('populate'),
    renderArchives: () => steps.push('archives'),
    renderSummaries: () => steps.push('summaries'),
    renderCompactedSummary: () => steps.push('compacted'),
    getMemoryMode: () => 'table',
    renderMemoryTable: () => steps.push('table'),
    getOverlayEl: () => overlay,
    getPanelEl: () => panel,
  });

  assert.deepEqual(steps, [
    'ensure',
    'before',
    'mode',
    'populate',
    'archives',
    'summaries',
    'compacted',
    'table',
  ]);
  assert.equal(overlay.style.display, 'block');
  assert.equal(panel.style.display, 'flex');
  console.log('ok - runSessionPanelShowFlow keeps panel show ordering and display toggles');
}
