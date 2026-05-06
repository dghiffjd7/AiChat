import assert from 'node:assert/strict';

import { createSessionPanelShell } from '../../src/scripts/ui/session-panel-shell-utils.js';

const createFakeDocument = () => {
  class FakeElement {
    constructor(tagName) {
      this.tagName = tagName;
      this.children = [];
      this.style = { cssText: '' };
      this.className = '';
      this.id = '';
      this.textContent = '';
      this.type = '';
      this.listeners = {};
      this.parentNode = null;
    }
    appendChild(child) {
      this.children.push(child);
      child.parentNode = this;
      return child;
    }
    addEventListener(type, handler) {
      if (!this.listeners[type]) this.listeners[type] = [];
      this.listeners[type].push(handler);
    }
  }
  return {
    createElement(tagName) {
      return new FakeElement(tagName);
    },
  };
};

{
  const documentRef = createFakeDocument();
  const shell = createSessionPanelShell({
    documentRef,
    overlayId: 'contact-settings-overlay',
    panelId: 'contact-settings-panel',
    titleId: 'contact-settings-title',
    subtitleId: 'contact-settings-sub',
    closeId: 'contact-settings-close',
    title: '好友设置',
    overlayOpacity: 0.4,
    overlayZIndex: 20000,
    panelZIndex: 21000,
    inset: 10,
    radius: 12,
  });
  assert.equal(shell.overlay.id, 'contact-settings-overlay');
  assert.equal(shell.panel.id, 'contact-settings-panel');
  assert.equal(shell.titleEl.id, 'contact-settings-title');
  assert.equal(shell.subtitleEl.id, 'contact-settings-sub');
  assert.equal(shell.closeButton.id, 'contact-settings-close');
  assert.equal(shell.titleEl.textContent, '好友设置');
  assert.equal(shell.overlay.style.cssText.includes('background:rgba(0,0,0,0.4);'), true);
  assert.equal(shell.panel.style.cssText.includes('border-radius:12px;'), true);
  console.log('ok - createSessionPanelShell builds contact-style settings shell with custom ids and geometry');
}

{
  const documentRef = createFakeDocument();
  const shell = createSessionPanelShell({
    documentRef,
    overlayId: 'group-settings-overlay',
    panelId: 'group-settings-panel',
    closeId: 'group-settings-close',
    title: '群聊设置',
    subtitleId: 'group-settings-sub',
    panelZIndex: 21000,
    inset: 10,
    radius: 14,
  });
  assert.equal(shell.titleEl.textContent, '群聊设置');
  assert.equal(shell.subtitleEl.id, 'group-settings-sub');
  assert.equal(shell.body.style.cssText.includes('overflow:auto;'), true);
  assert.equal(typeof shell.panel.listeners.click[0], 'function');
  console.log('ok - createSessionPanelShell builds group-style settings shell and preserves click trap');
}
