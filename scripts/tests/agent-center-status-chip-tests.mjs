import assert from 'node:assert/strict';

import {
  AgentCenterStatusChip,
  buildAgentStatusChipView,
} from '../../src/scripts/ui/agent-center-status-chip.js';

{
  const view = buildAgentStatusChipView({
    meta: { pending: 2, activeRuns: 1, failedRuns: 1, tools: 6, sessionGateEnabled: true },
  });
  assert.equal(view.label, '待确认');
  assert.equal(view.count, '2');
  assert.equal(view.tone, 'pending');
  assert.equal(view.tab, 'pending');
  console.log('ok - agent status chip prioritizes pending approvals');
}

{
  const running = buildAgentStatusChipView({
    meta: { pending: 0, activeRuns: 3, failedRuns: 1, tools: 6 },
  });
  assert.equal(running.label, '运行中');
  assert.equal(running.count, '3');
  assert.equal(running.tone, 'active');
  assert.equal(running.tab, 'activity');
  assert.equal(running.activityStatus, 'active');

  const failed = buildAgentStatusChipView({
    meta: { pending: 0, activeRuns: 0, failedRuns: 2, tools: 6 },
  });
  assert.equal(failed.label, '失败');
  assert.equal(failed.count, '2');
  assert.equal(failed.tone, 'failed');
  assert.equal(failed.tab, 'activity');
  assert.equal(failed.activityStatus, 'failure');
  console.log('ok - agent status chip summarizes active and failed runs');
}

{
  const readFailures = buildAgentStatusChipView({
    meta: { pending: 0, activeRuns: 0, failedRuns: 2, unreadFailedRuns: 0, tools: 6 },
  });
  assert.equal(readFailures.label, 'Agent');
  assert.equal(readFailures.count, '6');
  assert.equal(readFailures.tone, 'idle');

  const unreadFailures = buildAgentStatusChipView({
    meta: { pending: 0, activeRuns: 0, failedRuns: 2, unreadFailedRuns: 1, tools: 6 },
  });
  assert.equal(unreadFailures.label, '失败');
  assert.equal(unreadFailures.count, '1');
  assert.equal(unreadFailures.tone, 'failed');
  console.log('ok - agent status chip uses unread failure count for topbar noise control');
}

{
  const scoped = buildAgentStatusChipView({
    meta: { pending: 0, activeRuns: 0, failedRuns: 3, tools: 6 },
    activity: {
      runs: [{ id: 'run-1', status: 'running', isActive: true }],
    },
  }, {
    activityScope: 'visible',
    showToolsCount: false,
  });
  assert.equal(scoped.label, '运行中');
  assert.equal(scoped.count, '1');
  assert.equal(scoped.tone, 'active');

  const scopedFailure = buildAgentStatusChipView({
    meta: { pending: 0, activeRuns: 0, failedRuns: 3, tools: 6 },
    activity: {
      runs: [
        { id: 'run-old', status: 'failed', updatedAt: 90 },
        { id: 'run-new', status: 'failed', updatedAt: 150 },
      ],
    },
  }, {
    activityScope: 'visible',
    failureSeenAt: 100,
    showToolsCount: false,
  });
  assert.equal(scopedFailure.label, '失败');
  assert.equal(scopedFailure.count, '1');

  const idle = buildAgentStatusChipView({
    meta: { pending: 0, activeRuns: 0, failedRuns: 3, tools: 6, sessionGateEnabled: true },
    activity: { runs: [] },
  }, {
    activityScope: 'visible',
    idleLabel: '动态',
    showSessionGateState: false,
    showToolsCount: false,
  });
  assert.equal(idle.label, '动态');
  assert.equal(idle.count, '');
  assert.equal(idle.tone, 'idle');
  console.log('ok - agent status chip can scope activity to visible runs');
}

{
  const ready = buildAgentStatusChipView({
    meta: { pending: 0, activeRuns: 0, failedRuns: 0, tools: 6, sessionGateEnabled: true },
  });
  assert.equal(ready.label, 'Agent 开启');
  assert.equal(ready.count, '6');
  assert.equal(ready.tone, 'ready');
  assert.equal(ready.tab, 'safety');

  const idle = buildAgentStatusChipView({
    meta: { pending: 0, activeRuns: 0, failedRuns: 0, tools: 6, sessionGateEnabled: false },
  });
  assert.equal(idle.label, 'Agent');
  assert.equal(idle.count, '6');
  assert.equal(idle.tone, 'idle');
  assert.equal(idle.tab, 'activity');
  console.log('ok - agent status chip keeps idle tool state compact');
}

{
  let opened = null;
  const created = [];
  const root = {
    children: created,
    appendChild(element) {
      this.children.push(element);
      element.parentNode = this;
    },
    insertBefore(element, before) {
      const index = this.children.indexOf(before);
      this.children.splice(index < 0 ? this.children.length : index, 0, element);
      element.parentNode = this;
    },
  };
  const before = { parentNode: root };
  root.children.push(before);
  const documentRef = {
    visibilityState: 'visible',
    head: { appendChild() {} },
    getElementById: () => null,
    createElement(tagName) {
      return {
        tagName,
        dataset: {},
        style: {},
        children: [],
        parentNode: null,
        className: '',
        title: '',
        textContent: '',
        innerHTML: '',
        setAttribute(name, value) {
          this[name] = value;
        },
        appendChild(child) {
          this.children.push(child);
          child.parentNode = this;
        },
        addEventListener(type, handler) {
          this[`on${type}`] = handler;
        },
        querySelector(selector) {
          if (selector === '.agent-status-chip-label') return this.labelElement;
          if (selector === '.agent-status-chip-count') return this.countElement;
          return null;
        },
        get labelElement() {
          return this.children.find(child => child.className === 'agent-status-chip-label') || null;
        },
        get countElement() {
          return this.children.find(child => child.className === 'agent-status-chip-count') || null;
        },
      };
    },
  };
  const chip = new AgentCenterStatusChip({
    documentRef,
    rootElement: root,
    beforeElement: before,
    refreshIntervalMs: 0,
    collectView: () => ({ meta: { activeRuns: 1 } }),
    openAgentCenter: options => {
      opened = options;
    },
  });
  const element = chip.mount();
  element.children = [
    { className: 'agent-status-chip-dot' },
    { className: 'agent-status-chip-label', textContent: '' },
    { className: 'agent-status-chip-count', textContent: '' },
  ];
  chip.render(buildAgentStatusChipView({ meta: { activeRuns: 1 } }));
  element.onclick();
  assert.equal(root.children[0], element);
  assert.deepEqual(opened, { tab: 'activity', activityStatus: 'active' });
  assert.equal(element.dataset.agentStatusTone, 'active');
  console.log('ok - agent status chip mounts before chat menu and opens Agent Center');
}

{
  let opened = null;
  let marked = null;
  const root = {
    children: [],
    appendChild(element) {
      this.children.push(element);
      element.parentNode = this;
    },
  };
  const documentRef = {
    visibilityState: 'visible',
    head: { appendChild() {} },
    getElementById: () => null,
    createElement(tagName) {
      return {
        tagName,
        dataset: {},
        style: {},
        children: [],
        parentNode: null,
        className: '',
        title: '',
        textContent: '',
        innerHTML: '',
        setAttribute(name, value) {
          this[name] = value;
        },
        appendChild(child) {
          this.children.push(child);
          child.parentNode = this;
        },
        addEventListener(type, handler) {
          this[`on${type}`] = handler;
        },
        querySelector(selector) {
          if (selector === '.agent-status-chip-label') return this.labelElement;
          if (selector === '.agent-status-chip-count') return this.countElement;
          return null;
        },
        get labelElement() {
          return this.children.find(child => child.className === 'agent-status-chip-label') || null;
        },
        get countElement() {
          return this.children.find(child => child.className === 'agent-status-chip-count') || null;
        },
      };
    },
  };
  const chip = new AgentCenterStatusChip({
    documentRef,
    rootElement: root,
    refreshIntervalMs: 0,
    collectView: () => ({ meta: { unreadFailedRuns: 1 } }),
    openAgentCenter: options => {
      opened = options;
    },
    markFailureSeen: options => {
      marked = options;
    },
  });
  const element = chip.mount();
  element.children = [
    { className: 'agent-status-chip-dot' },
    { className: 'agent-status-chip-label', textContent: '' },
    { className: 'agent-status-chip-count', textContent: '' },
  ];
  chip.render(buildAgentStatusChipView({ meta: { failedRuns: 1, unreadFailedRuns: 1 } }));
  element.onclick();
  assert.equal(marked.activityStatus, 'failure');
  assert.equal(typeof marked.at, 'number');
  assert.deepEqual(opened, { tab: 'activity', activityStatus: 'failure' });
  console.log('ok - agent status chip marks failed state as seen when opening failures');
}
