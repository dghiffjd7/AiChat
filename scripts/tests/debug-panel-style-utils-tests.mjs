import assert from 'node:assert/strict';

import {
  buildDebugPanelButtonStyle,
  DEBUG_PANEL_BUTTON_STYLE,
  DEBUG_PANEL_STYLES,
  DEBUG_VIEWER_STYLES,
} from '../../src/scripts/ui/debug-panel-style-utils.js';

{
  const base = buildDebugPanelButtonStyle();
  const withExtra = buildDebugPanelButtonStyle({ extra: 'opacity: 0.9;' });
  assert.equal(base, DEBUG_PANEL_BUTTON_STYLE);
  assert.equal(withExtra.includes('opacity: 0.9;'), true);
  assert.equal(withExtra.includes('border: 1px solid #00ff00;'), true);
  console.log('ok - buildDebugPanelButtonStyle reuses shared base button style and appends overrides');
}

{
  assert.equal(DEBUG_PANEL_STYLES.panel.includes('max-height: 250px;'), true);
  assert.equal(DEBUG_PANEL_STYLES.toggleButton.includes('font-weight: bold;'), true);
  assert.equal(DEBUG_PANEL_STYLES.filterInput.includes("placeholder"), false);
  assert.equal(DEBUG_VIEWER_STYLES.overlay.includes('z-index: 22050;'), true);
  assert.equal(DEBUG_VIEWER_STYLES.actionButton.includes('border-radius:10px;'), true);
  assert.equal(DEBUG_VIEWER_STYLES.textarea.includes('white-space: pre;'), true);
  console.log('ok - debug panel and viewer style maps keep expected layout and action styling tokens');
}
