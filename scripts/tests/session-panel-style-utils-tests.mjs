import assert from 'node:assert/strict';

import {
  buildSessionAvatarButtonStyle,
  buildSessionBlockButtonStyle,
  buildSessionCheckboxInputStyle,
  buildSessionCheckboxLabelStyle,
  buildSessionColumnStackStyle,
  buildSessionCompactInputStyle,
  buildSessionCoverImageStyle,
  buildSessionFooterStyle,
  buildSessionFieldLabelStyle,
  buildSessionFlexRowStyle,
  buildSessionHeaderStyle,
  buildSessionHelperTextStyle,
  buildSessionIconButtonStyle,
  buildSessionListContainerStyle,
  buildSessionOverlayStyle,
  buildSessionPanelStyle,
  buildSessionSectionStyle,
  buildSessionSurfaceBoxStyle,
  buildSessionSummaryRowStyle,
  buildSessionTextInputStyle,
  buildSessionTextActionButtonStyle,
  buildSessionUtilityButtonStyle,
  buildSessionWideActionButtonStyle,
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

{
  const section = buildSessionSectionStyle({ marginTop: 18, paddingTop: 12 });
  const wideAction = buildSessionWideActionButtonStyle({ accent: true, marginBottom: 10 });
  const textAction = buildSessionTextActionButtonStyle({ danger: true });
  const iconAction = buildSessionIconButtonStyle({ danger: true, width: 34, height: 30, fontSize: 18 });
  const list = buildSessionListContainerStyle({ maxHeight: 220, radius: 10, background: 'var(--app-surface-subtle)' });
  const utility = buildSessionUtilityButtonStyle({ padding: '8px 12px', fontSize: 12, whiteSpace: 'nowrap' });
  const avatar = buildSessionAvatarButtonStyle({ size: 72, radius: 18 });
  const blockButton = buildSessionBlockButtonStyle({ fontWeight: 700, radius: 12 });
  const coverImage = buildSessionCoverImageStyle();
  const flexRow = buildSessionFlexRowStyle({ justify: 'space-between', gap: 14, wrap: true, margin: '0 0 14px' });
  const stack = buildSessionColumnStackStyle({ gap: 10, margin: '10px 0 0' });
  const fieldLabel = buildSessionFieldLabelStyle({ weight: 800, marginBottom: 8 });
  const textInput = buildSessionTextInputStyle({ fontSize: 15 });
  const compactInput = buildSessionCompactInputStyle({ width: 96, fontSize: 13 });
  const helperText = buildSessionHelperTextStyle({ marginTop: 6, marginBottom: 8, color: 'var(--app-text-secondary)' });
  const checkboxLabel = buildSessionCheckboxLabelStyle({ justify: 'space-between', fontSize: 12, color: 'var(--app-text-secondary)', margin: '10px 0 0' });
  const checkboxInput = buildSessionCheckboxInputStyle({ size: 20 });
  const surfaceBox = buildSessionSurfaceBoxStyle({ display: 'none', margin: '14px 0 0', padding: 12, borderStyle: 'dashed', background: 'var(--app-surface-subtle)' });
  const footer = buildSessionFooterStyle({ safeAreaBottom: true, alignItems: 'center' });
  const row = buildSessionSummaryRowStyle({ clickable: true });

  assert.equal(section.includes('margin-top:18px;'), true);
  assert.equal(wideAction.includes('color:#019aff;'), true);
  assert.equal(textAction.includes('color:#ef4444;'), true);
  assert.equal(iconAction.includes('border:1px solid #fecaca;'), true);
  assert.equal(iconAction.includes('font-size:18px;'), true);
  assert.equal(list.includes('max-height:220px;'), true);
  assert.equal(list.includes('border-radius:10px;'), true);
  assert.equal(utility.includes('white-space:nowrap;'), true);
  assert.equal(avatar.includes('width:72px;'), true);
  assert.equal(avatar.includes('border-radius:18px;'), true);
  assert.equal(blockButton.includes('font-weight:700;'), true);
  assert.equal(coverImage.includes('object-fit:cover;'), true);
  assert.equal(flexRow.includes('justify-content:space-between;'), true);
  assert.equal(flexRow.includes('flex-wrap:wrap;'), true);
  assert.equal(stack.includes('flex-direction:column;'), true);
  assert.equal(fieldLabel.includes('font-weight:800;'), true);
  assert.equal(textInput.includes('font-size:15px;'), true);
  assert.equal(compactInput.includes('width:96px;'), true);
  assert.equal(helperText.includes('margin-top:6px;'), true);
  assert.equal(helperText.includes('color:var(--app-text-secondary);'), true);
  assert.equal(checkboxLabel.includes('justify-content:space-between;'), true);
  assert.equal(checkboxInput.includes('width:20px;'), true);
  assert.equal(surfaceBox.includes('border:1px dashed var(--app-border-default);'), true);
  assert.equal(surfaceBox.includes('display:none;'), true);
  assert.equal(footer.includes('calc(14px + env(safe-area-inset-bottom, 0px))'), true);
  assert.equal(footer.includes('align-items:center;'), true);
  assert.equal(row.includes('cursor:pointer;'), true);
  console.log('ok - session panel style builders cover shared section form layout checkbox list footer and row variants');
}
