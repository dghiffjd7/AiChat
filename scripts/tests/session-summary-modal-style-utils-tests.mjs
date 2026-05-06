import assert from 'node:assert/strict';

import {
  buildSessionSummaryTextareaStyle,
  SESSION_SUMMARY_MODAL_STYLES,
} from '../../src/scripts/ui/session-summary-modal-style-utils.js';

{
  const editable = buildSessionSummaryTextareaStyle({
    minHeight: '180px',
    readOnly: false,
  });
  const readonly = buildSessionSummaryTextareaStyle({
    minHeight: '220px',
    readOnly: true,
  });
  assert.equal(editable.includes('min-height:180px;'), true);
  assert.equal(editable.includes('white-space:pre-wrap;'), false);
  assert.equal(readonly.includes('min-height:220px;'), true);
  assert.equal(readonly.includes('white-space:pre-wrap;'), true);
  console.log('ok - buildSessionSummaryTextareaStyle preserves min-height and readonly wrapping rules');
}

{
  assert.equal(SESSION_SUMMARY_MODAL_STYLES.overlay.includes('z-index:22000;'), true);
  assert.equal(SESSION_SUMMARY_MODAL_STYLES.panel.includes('border-radius:14px;'), true);
  assert.equal(SESSION_SUMMARY_MODAL_STYLES.footer.includes('display:flex;'), true);
  assert.equal(SESSION_SUMMARY_MODAL_STYLES.primaryButton.includes('background:#019aff;'), true);
  assert.equal(SESSION_SUMMARY_MODAL_STYLES.secondaryButton.includes('border:1px solid var(--app-border-default);'), true);
  console.log('ok - session summary modal style map keeps expected shell and action styling tokens');
}
