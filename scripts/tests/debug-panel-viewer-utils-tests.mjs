import assert from 'node:assert/strict';

import {
  bindDebugViewerRefs,
  createDebugViewerModal,
  setDebugViewerVisibility,
  showDebugViewer,
} from '../../src/scripts/ui/debug-panel-viewer-utils.js';

const createFakeDocument = () => {
  class FakeElement {
    constructor(tagName) {
      this.tagName = tagName;
      this.children = [];
      this.style = { cssText: '' };
      this.id = '';
      this.textContent = '';
      this.type = '';
      this.readOnly = false;
      this.value = '';
      this.listeners = {};
      this.parentNode = null;
      this.onclick = null;
    }
    appendChild(child) {
      child.parentNode = this;
      this.children.push(child);
      return child;
    }
    addEventListener(type, handler) {
      if (!this.listeners[type]) this.listeners[type] = [];
      this.listeners[type].push(handler);
    }
  }
  const body = new FakeElement('body');
  return {
    body,
    createElement(tagName) {
      return new FakeElement(tagName);
    },
  };
};

{
  const calls = [];
  const documentRef = createFakeDocument();
  const viewer = createDebugViewerModal({
    overlayId: 'overlay-a',
    panelId: 'panel-a',
    title: 'Viewer A',
    documentRef,
    onClose: () => calls.push(['close']),
    onRefresh: () => calls.push(['refresh']),
    onExport: () => calls.push(['export']),
  });
  viewer.refreshButton.onclick();
  viewer.exportButton.onclick();
  viewer.closeButton.onclick();
  assert.equal(documentRef.body.children.length, 1);
  assert.equal(viewer.overlay.id, 'overlay-a');
  assert.equal(viewer.panel.id, 'panel-a');
  assert.equal(viewer.copyButton, null);
  assert.deepEqual(calls, [['refresh'], ['export'], ['close']]);
  console.log('ok - createDebugViewerModal builds base diagnostics viewer without copy button');
}

{
  const calls = [];
  const documentRef = createFakeDocument();
  const viewer = createDebugViewerModal({
    overlayId: 'overlay-b',
    panelId: 'panel-b',
    title: 'Viewer B',
    documentRef,
    includeCopyButton: true,
    onClose: () => calls.push(['close']),
    onRefresh: () => calls.push(['refresh']),
    onExport: () => calls.push(['export']),
    onCopy: async () => calls.push(['copy']),
  });
  await viewer.copyButton.onclick();
  assert.equal(Boolean(viewer.copyButton), true);
  assert.deepEqual(calls, [['copy']]);
  console.log('ok - createDebugViewerModal optionally wires copy action for diagnostics viewer');
}

{
  const documentRef = createFakeDocument();
  const viewer = createDebugViewerModal({
    overlayId: 'overlay-c',
    panelId: 'panel-c',
    title: 'Viewer C',
    documentRef,
  });
  const target = {};
  bindDebugViewerRefs({
    target,
    prefix: 'customBundle',
    viewer,
  });
  assert.equal(target.customBundleOverlay, viewer.overlay);
  assert.equal(target.customBundlePanel, viewer.panel);
  assert.equal(target.customBundleMeta, viewer.meta);
  assert.equal(target.customBundleText, viewer.textarea);
  assert.equal(target.customBundleRefresh, viewer.refreshButton);
  assert.equal(target.customBundleExport, viewer.exportButton);
  assert.equal(target.customBundleCopy, null);
  console.log('ok - bindDebugViewerRefs maps diagnostics viewer refs to prefixed instance fields');
}

{
  const documentRef = createFakeDocument();
  const viewer = createDebugViewerModal({
    overlayId: 'overlay-d',
    panelId: 'panel-d',
    title: 'Viewer D',
    documentRef,
  });
  const calls = [];
  assert.equal(setDebugViewerVisibility({ overlay: viewer.overlay, visible: true }), true);
  assert.equal(viewer.overlay.style.display, 'block');
  assert.equal(setDebugViewerVisibility({ overlay: viewer.overlay, visible: false }), true);
  assert.equal(viewer.overlay.style.display, 'none');
  await showDebugViewer({
    overlay: viewer.overlay,
    onShow: async () => {
      calls.push('refresh');
    },
  });
  assert.equal(viewer.overlay.style.display, 'block');
  assert.deepEqual(calls, ['refresh']);
  console.log('ok - diagnostics viewer visibility helpers toggle display and run refresh hook');
}
