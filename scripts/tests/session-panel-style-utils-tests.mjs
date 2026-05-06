import assert from 'node:assert/strict';

import {
  buildSessionHeaderStyle,
  buildSessionOverlayStyle,
  buildSessionPanelStyle,
  SESSION_PANEL_STYLES,
} from '../../src/scripts/ui/session-panel-style-utils.js';

{
  const style = buildSessionOverlayStyle({ opacity: 0.4, zIndex: 20000 });
  assert.equal(style.includes('background:rgba(0,0,0,0.4);'), true);
  assert.equal(style.includes('z-index:20000;'), true);
  console.log('ok - buildSessionOverlayStyle keeps expected fullscreen overlay tokens');
}

{
  const style = buildSessionPanelStyle({ inset: 18, zIndex: 23000, radius: 14 });
  assert.equal(style.includes('top: calc(18px + env(safe-area-inset-top, 0px));'), true);
  assert.equal(style.includes('height: calc(100dvh - 36px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px));'), true);
  assert.equal(style.includes('border-radius:14px;'), true);
  assert.equal(style.includes('z-index:23000;'), true);
  console.log('ok - buildSessionPanelStyle preserves inset-based full panel geometry');
}

{
  const style = buildSessionHeaderStyle({
    background: 'linear-gradient(135deg, rgba(25,154,255,0.10), rgba(0,102,204,0.08))',
  });
  assert.equal(style.includes('border-bottom:1px solid rgba(0,0,0,0.06);'), true);
  assert.equal(style.includes('background:linear-gradient(135deg, rgba(25,154,255,0.10), rgba(0,102,204,0.08));'), true);
  console.log('ok - buildSessionHeaderStyle preserves shared header layout and background override');
}

{
  assert.equal(SESSION_PANEL_STYLES.closeButton.includes('font-size:22px;'), true);
  assert.equal(SESSION_PANEL_STYLES.footer.includes('display:flex; gap:10px;'), true);
  assert.equal(SESSION_PANEL_STYLES.primaryActionButton.includes('background:#019aff;'), true);
  assert.equal(SESSION_PANEL_STYLES.secondaryActionButton.includes('border:1px solid var(--app-border-default);'), true);
  console.log('ok - session panel style map keeps shared close and action button tokens');
}
