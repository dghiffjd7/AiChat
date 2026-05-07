import assert from 'node:assert/strict';

import {
  ensureGroupManagementDropdown,
  renderGroupManagementDropdown,
} from '../../src/scripts/ui/app-group-dropdown-runtime-utils.js';

class FakeElement {
  constructor(tagName = 'div', ownerDocument = null) {
    this.tagName = String(tagName || 'div').toUpperCase();
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.parentNode = null;
    this.dataset = {};
    this.style = { cssText: '', display: '' };
    this.className = '';
    this.id = '';
    this.textContent = '';
    this.src = '';
    this.alt = '';
    this.listeners = new Map();
  }

  appendChild(child) {
    if (!child) return child;
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  replaceChildren(...nextChildren) {
    this.children = [];
    nextChildren.forEach((child) => this.appendChild(child));
  }

  addEventListener(type, handler) {
    const list = this.listeners.get(type) || [];
    list.push(handler);
    this.listeners.set(type, list);
  }

  trigger(type = 'click', event = {}) {
    const handlers = this.listeners.get(type) || [];
    handlers.forEach((handler) => handler({
      currentTarget: this,
      target: this,
      stopPropagation() {},
      ...event,
    }));
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  querySelectorAll(selector) {
    const matches = [];
    const matcher = buildSelectorMatcher(selector);
    const visit = (node) => {
      if (matcher(node)) matches.push(node);
      node.children.forEach(visit);
    };
    this.children.forEach(visit);
    return matches;
  }
}

class FakeDocument {
  constructor() {
    this.body = new FakeElement('body', this);
  }

  createElement(tagName) {
    return new FakeElement(tagName, this);
  }

  getElementById(id) {
    const visit = (node) => {
      if (node.id === id) return node;
      for (const child of node.children) {
        const match = visit(child);
        if (match) return match;
      }
      return null;
    };
    return visit(this.body);
  }
}

const buildSelectorMatcher = (selector) => {
  if (selector.startsWith('#')) {
    const id = selector.slice(1);
    return (node) => node.id === id;
  }
  if (selector.startsWith('.')) {
    const className = selector.slice(1);
    return (node) => String(node.className || '').split(/\s+/).includes(className);
  }
  const tagName = selector.toUpperCase();
  return (node) => node.tagName === tagName;
};

{
  const documentRef = new FakeDocument();
  const first = ensureGroupManagementDropdown({ documentRef });
  const second = ensureGroupManagementDropdown({ documentRef });
  let stopped = false;

  first.trigger('click', {
    stopPropagation() {
      stopped = true;
    },
  });

  assert.equal(first, second);
  assert.equal(first.id, 'group-management-dropdown');
  assert.equal(first.className, 'group-management-dropdown');
  assert.match(first.style.cssText, /min-width:\s*240px/);
  assert.equal(documentRef.body.children.length, 1);
  assert.equal(stopped, true);
  console.log('ok - ensureGroupManagementDropdown creates once and stops outside bubbling');
}

{
  const documentRef = new FakeDocument();
  const anchorEl = new FakeElement('button', documentRef);
  const calls = [];
  const dropdown = renderGroupManagementDropdown({
    groupId: 'group:1',
    anchorEl,
    documentRef,
    getGroupContact: (id) => {
      if (id === 'group:1') return { name: '测试群', members: ['alice', 'bob'] };
      if (id === 'alice') return { name: 'Alice' };
      if (id === 'bob') return { name: 'Bob' };
      return null;
    },
    resolveAvatar: (id) => `avatar:${id}`,
    positionSheet: (...args) => calls.push(['position', ...args]),
    openSessionConfig: (groupId) => calls.push(['session-config', groupId]),
    openGroupSettings: (groupId) => calls.push(['settings', groupId]),
    openMemberChat: (memberId, contact) => calls.push(['member', memberId, contact?.name || memberId]),
  });

  assert.equal(dropdown.style.display, 'block');
  assert.equal(dropdown.querySelectorAll('.group-dd-member').length, 2);
  assert.equal(dropdown.querySelector('.group-dd-title')?.textContent, '测试群 · 2人');
  assert.deepEqual(calls, [['position', dropdown, anchorEl, 0, 6, false]]);

  dropdown.querySelector('#group-dd-session-config')?.trigger('click');
  dropdown.querySelector('#group-dd-settings')?.trigger('click');
  dropdown.querySelectorAll('.group-dd-member')[1]?.trigger('click');

  assert.equal(dropdown.style.display, 'none');
  assert.deepEqual(calls, [
    ['position', dropdown, anchorEl, 0, 6, false],
    ['session-config', 'group:1'],
    ['settings', 'group:1'],
    ['member', 'bob', 'Bob'],
  ]);
  console.log('ok - renderGroupManagementDropdown renders actions and member entry handlers');
}

{
  const documentRef = new FakeDocument();
  const dropdown = renderGroupManagementDropdown({
    groupId: 'group:empty',
    anchorEl: new FakeElement('button', documentRef),
    documentRef,
    getGroupContact: () => ({ name: '空群', members: [] }),
  });

  assert.equal(dropdown.querySelector('.group-dd-empty')?.textContent, '暂无成员');
  assert.equal(dropdown.querySelectorAll('.group-dd-member').length, 0);
  console.log('ok - renderGroupManagementDropdown shows empty state when group has no members');
}
