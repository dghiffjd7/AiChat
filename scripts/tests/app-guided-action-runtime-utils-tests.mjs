import assert from 'node:assert/strict';

import {
  buildGuidedActionGuide,
  createAppGuidedActionRuntime,
  isGuidedActionOutputOk,
  prepareGuidedActionEntryNavigation,
} from '../../src/scripts/ui/app-guided-action-runtime-utils.js';

{
  const guide = buildGuidedActionGuide({
    id: 'session.config.open',
    title: '打开会话配置',
    firstRunGuide: 'session.config.open.guide',
    uiPath: ['聊天室标题', '会话配置'],
  });
  assert.equal(guide.guideId, 'session.config.open.guide');
  assert.match(guide.message, /聊天室标题 -> 会话配置/);
  assert.equal(guide.pathText, '聊天室标题 -> 会话配置');
  assert.equal(guide.stepDetails.length, 2);
  assert.equal(guide.stepDetails[0].label, '聊天室标题');
  assert.ok(guide.stepDetails[0].selectors.some(selector => selector.includes('chat-title-entry')));
  assert.ok(guide.stepDetails[1].selectors.some(selector => selector.includes('session-config')));
  console.log('ok - guided action runtime builds first-run guide messages');
}

{
  const guide = buildGuidedActionGuide({
    id: 'user.create',
    title: '创建用户名称',
    firstRunGuide: 'user.create.guide',
    uiPath: ['头像/用户入口', '用户', '管理用户', '新建'],
  });
  assert.deepEqual(guide.steps, ['头像/用户入口', '用户', '管理用户', '新建']);
  assert.ok(guide.stepDetails[0].selectors.some(selector => selector.includes('avatar-user-entry')));
  assert.ok(guide.stepDetails[1].selectors.some(selector => selector.includes('persona-switcher-tab-user')));
  assert.ok(guide.stepDetails[2].selectors.some(selector => selector.includes('manage-users')));
  assert.ok(guide.stepDetails[3].selectors.some(selector => selector.includes('create-user')));
  console.log('ok - guided action runtime exposes selectors for step playback');
}

{
  assert.equal(isGuidedActionOutputOk({ status: 'succeeded', result: { ok: true } }), true);
  assert.equal(isGuidedActionOutputOk({ status: 'succeeded', result: { ok: false } }), false);
  assert.equal(isGuidedActionOutputOk({ status: 'failed' }), false);
  console.log('ok - guided action runtime detects business-level tool failures');
}

{
  const completed = new Set();
  const shown = [];
  const runtime = createAppGuidedActionRuntime({
    guideStore: {
      isCompleted: id => completed.has(id),
      markCompleted: id => completed.add(id),
    },
    getFeature: id => ({
      id,
      title: '打开会话配置',
      firstRunGuide: 'session.config.open.guide',
      uiPath: ['聊天室标题', '会话配置'],
    }),
    showGuide: guide => shown.push(guide.guideId),
  });

  const first = await runtime.run({
    plan: { featureId: 'session.config.open', toolName: 'session.open_config' },
    execute: async () => ({ status: 'succeeded', result: { ok: true }, summary: 'opened' }),
  });
  assert.equal(first.guided, true);
  assert.equal(completed.has('session.config.open.guide'), true);
  assert.deepEqual(shown, ['session.config.open.guide']);

  const second = await runtime.run({
    plan: { featureId: 'session.config.open', toolName: 'session.open_config' },
    execute: async () => ({ status: 'succeeded', result: { ok: true }, summary: 'opened' }),
  });
  assert.equal(second.guided, false);
  assert.equal(shown.length, 1);
  console.log('ok - guided action runtime guides first run and skips completed guides');
}

{
  const completed = new Set();
  const runtime = createAppGuidedActionRuntime({
    guideStore: {
      isCompleted: id => completed.has(id),
      markCompleted: id => completed.add(id),
    },
    getFeature: id => ({
      id,
      title: '打开会话配置',
      firstRunGuide: 'session.config.open.guide',
      uiPath: ['聊天室标题', '会话配置'],
    }),
  });
  const result = await runtime.run({
    plan: { featureId: 'session.config.open', toolName: 'session.open_config' },
    execute: async () => ({ status: 'succeeded', result: { ok: false, reason: 'missing_session_id' } }),
  });
  assert.equal(result.guided, true);
  assert.equal(completed.has('session.config.open.guide'), false);
  console.log('ok - guided action runtime does not mark failed actions as completed');
}

{
  const order = [];
  const runtime = createAppGuidedActionRuntime({
    guideStore: {
      isCompleted: () => false,
      markCompleted: () => {},
    },
    getFeature: id => ({
      id,
      title: '打开会话配置',
      firstRunGuide: 'session.config.open.guide',
      uiPath: ['聊天室标题', '会话配置'],
    }),
    showGuide: async () => {
      order.push('guide-start');
      await Promise.resolve();
      order.push('guide-end');
    },
  });
  await runtime.run({
    plan: { featureId: 'session.config.open', toolName: 'session.open_config' },
    execute: async () => {
      order.push('execute');
      return { status: 'succeeded', result: { ok: true } };
    },
  });
  assert.deepEqual(order, ['guide-start', 'guide-end', 'execute']);
  console.log('ok - guided action runtime waits for interactive guides before executing');
}

{
  const calls = [];
  const result = await prepareGuidedActionEntryNavigation({
    guide: { stepDetails: [{ label: '设置' }] },
    isTargetVisible: () => true,
    hideMenus: () => calls.push('hide'),
    switchPage: page => calls.push(`switch:${page}`),
  });
  assert.equal(result.navigated, false);
  assert.equal(result.reason, 'target_visible');
  assert.deepEqual(calls, []);
  console.log('ok - guided action entry navigation leaves an already visible target untouched');
}

{
  const calls = [];
  const result = await prepareGuidedActionEntryNavigation({
    guide: { stepDetails: [{ label: '顶部 +' }] },
    isTargetVisible: () => false,
    isChatRoomVisible: () => true,
    hideMenus: () => calls.push('hide'),
    exitChatRoom: () => calls.push('exit'),
    switchPage: (page, options) => calls.push(`switch:${page}:${options?.animate}`),
  });
  assert.equal(result.navigated, true);
  assert.equal(result.route, 'chat_list');
  assert.deepEqual(calls, ['hide', 'exit', 'switch:chat:false']);
  console.log('ok - guided action entry navigation exits a room before opening the chat list shell');
}

{
  const calls = [];
  const result = await prepareGuidedActionEntryNavigation({
    guide: { stepDetails: [{ label: '聊天室标题' }] },
    meta: {
      plan: { args: { sessionName: '目标会话' } },
      context: { sessionId: 'context-session' },
    },
    isTargetVisible: () => false,
    resolveSessionTarget: async query => {
      calls.push(`resolve:${query}`);
      return { id: 'target-session', name: '目标会话' };
    },
    hideMenus: () => calls.push('hide'),
    switchPage: (page, options) => calls.push(`switch:${page}:${options?.animate}`),
    enterChatRoom: async (id, name) => calls.push(`enter:${id}:${name}`),
  });
  assert.equal(result.navigated, true);
  assert.equal(result.route, 'chat_room');
  assert.equal(result.sessionId, 'target-session');
  assert.deepEqual(calls, [
    'resolve:目标会话',
    'hide',
    'switch:chat:false',
    'enter:target-session:目标会话',
  ]);
  console.log('ok - guided action entry navigation prioritizes the explicit plan target and awaits room entry');
}

{
  const calls = [];
  const result = await prepareGuidedActionEntryNavigation({
    guide: { stepDetails: [{ label: '聊天室右上角菜单' }] },
    meta: {
      plan: { toolName: 'worldbook.create', args: { name: '艾尔登世界书' } },
      context: { sessionId: 'current-room' },
    },
    isTargetVisible: () => false,
    resolveSessionTarget: async query => {
      calls.push(`resolve:${query}`);
      return query === 'current-room' ? { id: query, name: '当前会话' } : null;
    },
    switchPage: () => {},
    enterChatRoom: async () => {},
  });
  assert.equal(result.navigated, true);
  assert.equal(result.sessionId, 'current-room');
  assert.deepEqual(calls, ['resolve:current-room']);
  console.log('ok - guided action entry navigation does not treat resource names as session names');
}

{
  const calls = [];
  const result = await prepareGuidedActionEntryNavigation({
    guide: { stepDetails: [{ label: '聊天室右上角菜单' }] },
    meta: { plan: { args: { sessionId: 'missing-session' } } },
    isTargetVisible: () => false,
    resolveSessionTarget: async query => {
      calls.push(`resolve:${query}`);
      return null;
    },
    hideMenus: () => calls.push('hide'),
    switchPage: page => calls.push(`switch:${page}`),
    enterChatRoom: async id => calls.push(`enter:${id}`),
  });
  assert.equal(result.navigated, false);
  assert.equal(result.reason, 'session_not_found');
  assert.deepEqual(calls, ['resolve:missing-session']);
  console.log('ok - guided action entry navigation does not enter a fallback room for an invalid explicit target');
}

{
  const result = await prepareGuidedActionEntryNavigation({
    guide: { stepDetails: [{ label: '设置' }] },
    isTargetVisible: () => false,
    isChatRoomVisible: () => false,
    hideMenus: () => {
      throw new Error('navigation failed');
    },
  });
  assert.equal(result.navigated, false);
  assert.equal(result.reason, 'navigation_failed');
  console.log('ok - guided action entry navigation degrades without blocking the guide when navigation fails');
}
