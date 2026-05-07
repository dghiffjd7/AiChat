import assert from 'node:assert/strict';

import {
  createScrollDateBadgeUiRuntime,
  formatScrollDateLabel,
  resolveScrollDateLabel,
} from '../../src/scripts/ui/chat/scroll-date-badge-ui-utils.js';

const createClassList = () => {
  const set = new Set();
  return {
    add: (...tokens) => tokens.forEach(token => set.add(token)),
    remove: (...tokens) => tokens.forEach(token => set.delete(token)),
    contains: token => set.has(token),
  };
};

const createFakeDocument = () => {
  class FakeElement {
    constructor(tagName) {
      this.tagName = String(tagName || '').toUpperCase();
      this.children = [];
      this.parentElement = null;
      this.className = '';
      this.classList = createClassList();
      this.style = {};
      this.textContent = '';
      this.dataset = {};
    }
    appendChild(child) {
      this.children.push(child);
      child.parentElement = this;
      return child;
    }
    setAttribute() {}
  }
  return {
    createElement(tagName) {
      return new FakeElement(tagName);
    },
  };
};

{
  const now = new Date('2026-05-06T12:00:00Z');
  assert.equal(formatScrollDateLabel(new Date('2026-05-06T03:00:00Z').getTime(), { now }), '今天');
  assert.equal(formatScrollDateLabel(new Date('2026-05-05T03:00:00Z').getTime(), { now }), '昨天');
  assert.equal(formatScrollDateLabel(new Date('2026-05-01T03:00:00Z').getTime(), { now }), '5/1');
  assert.equal(formatScrollDateLabel(new Date('2025-12-31T03:00:00Z').getTime(), { now }), '2025/12/31');
  console.log('ok - formatScrollDateLabel formats today yesterday same-year and cross-year labels');
}

{
  const items = [
    { dataset: { timestamp: String(new Date('2026-05-05T00:00:00Z').getTime()) }, offsetTop: 0, offsetHeight: 40 },
    { dataset: { timestamp: String(new Date('2026-05-06T00:00:00Z').getTime()) }, offsetTop: 80, offsetHeight: 40 },
  ];
  const label = resolveScrollDateLabel({
    scrollTop: 70,
    querySelectorAll: () => items,
  }, {
    formatLabel: ts => String(new Date(ts).getUTCDate()),
  });
  assert.equal(label, '6');
  console.log('ok - resolveScrollDateLabel picks the first message crossing the anchor top');
}

{
  const documentLike = createFakeDocument();
  const host = documentLike.createElement('div');
  const timers = [];
  let hideTimer = null;
  const runtime = createScrollDateBadgeUiRuntime({
    documentLike,
    getUiMode: () => 'chat',
    schedule: (handler, delay) => {
      timers.push([handler, delay]);
      return timers.length;
    },
    clearSchedule: () => {},
  });
  const scrollEl = { parentElement: host };
  const badge = runtime.ensureBadge({ scrollEl, existingBadgeEl: null });
  assert.equal(host.children[0], badge);
  runtime.showBadge({
    badgeEl: badge,
    label: '今天',
    clearHideTimer: () => {},
    getHideTimer: () => hideTimer,
    setHideTimer: value => {
      hideTimer = value;
    },
  });
  assert.equal(badge.textContent, '今天');
  assert.equal(badge.classList.contains('is-visible'), true);
  assert.equal(timers[0][1], 760);
  timers[0][0]();
  assert.equal(badge.classList.contains('is-visible'), false);
  runtime.hideBadge({ badgeEl: badge, immediate: true });
  timers[1][0]();
  assert.equal(badge.classList.contains('is-immediate'), false);
  console.log('ok - scroll date badge runtime mounts badge and toggles visible/immediate states');
}

{
  const runtime = createScrollDateBadgeUiRuntime({
    documentLike: createFakeDocument(),
    getUiMode: () => 'rp',
    schedule: () => null,
    clearSchedule: () => {},
  });
  const calls = [];
  runtime.refreshBadge({
    scrollEl: {},
    badgeEl: {},
    reveal: true,
    hideBadge: options => calls.push(['hide', options]),
    showBadge: label => calls.push(['show', label]),
  });
  assert.deepEqual(calls, [['hide', { immediate: true }]]);
  console.log('ok - refreshBadge hides badge immediately in rp mode');
}
