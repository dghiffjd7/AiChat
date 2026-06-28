import assert from 'node:assert/strict';

import {
  buildGuidedActionGuide,
  createAppGuidedActionRuntime,
  isGuidedActionOutputOk,
} from '../../src/scripts/ui/app-guided-action-runtime-utils.js';

{
  const guide = buildGuidedActionGuide({
    id: 'session.config.open',
    title: '打开会话配置',
    firstRunGuide: 'session.config.open.guide',
    uiPath: ['聊天室右上角菜单', '会话配置'],
  });
  assert.equal(guide.guideId, 'session.config.open.guide');
  assert.match(guide.message, /聊天室右上角菜单 -> 会话配置/);
  console.log('ok - guided action runtime builds first-run guide messages');
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
      uiPath: ['聊天室右上角菜单', '会话配置'],
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
      uiPath: ['聊天室右上角菜单', '会话配置'],
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
