import assert from 'node:assert/strict';

import { createMaidOnboardingRuntime, MAID_SETUP_HINT_ID } from '../../src/scripts/ui/maid-onboarding-runtime.js';

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

{
  const shown = [];
  const completed = new Map();
  const completionToasts = [];
  const flow = {
    id: 'test-flow',
    title: '测试流程',
    reward: '测试成就',
    steps: [
      { action: 'observe', text: '开始' },
      { action: 'wait-event', text: '等待', canAdvance: (event, payload) => event === 'ready' && payload?.ok === true },
    ],
  };
  const spotlight = {
    show: value => shown.push(value),
    hide() {},
    destroy() {},
  };
  const runtime = createMaidOnboardingRuntime({
    getFlow: id => id === flow.id ? flow : null,
    tasks: [{ id: 'task-test', flowId: flow.id, reward: flow.reward }],
    guideStore: {
      isTaskDone: id => completed.has(id),
      markTaskDone: (id, value) => completed.set(id, value),
      listTasks: () => [],
    },
    prepareStep: async ({ index }) => shown.push({ prepared: index }),
    spotlight,
    entryUi: {
      hideHint() {},
      showCompletion: value => completionToasts.push(value),
      destroy() {},
    },
  });

  assert.equal(runtime.startFlow('test-flow'), true);
  await flush();
  assert.equal(shown.at(-1).index, 0);
  shown.at(-1).onNext();
  await flush();
  assert.equal(runtime.getState().idx, 1);
  assert.equal(runtime.emit('ready', { ok: false }), false);
  assert.equal(runtime.emit('ready', { ok: true }), true);
  await flush();
  assert.equal(runtime.getState().phase, 'done');
  assert.equal(completed.get('task-test').flowId, 'test-flow');
  assert.equal(completionToasts.length, 0, 'completion toast should wait until the spotlight exits');
  assert.equal(shown.at(-1).phase, 'done');
  shown.at(-1).onFinish();
  await flush();
  assert.equal(runtime.getState().phase, 'idle');
  assert.equal(completionToasts.length, 1);
  console.log('ok - onboarding runtime prepares steps, gates events, and records completion once');
}

{
  let hintOptions = null;
  const dismissed = [];
  const runtime = createMaidOnboardingRuntime({
    getFlow: id => id === 'setup-api' ? { id, title: '接线', steps: [{ action: 'observe', text: '开始' }] } : null,
    guideStore: {
      listTasks: () => [],
      isHintDismissed: () => false,
      dismissHint: id => dismissed.push(id),
    },
    hasConfiguredProfile: () => false,
    spotlight: { show() {}, hide() {}, destroy() {} },
    entryUi: {
      showHint: options => { hintOptions = options; return true; },
      hideHint() {},
      destroy() {},
    },
  });
  assert.equal(runtime.maybeOfferSetupHint(), true);
  assert.equal(runtime.maybeOfferSetupHint(), false, 'one runtime session should offer the hint once');
  hintOptions.onDismiss();
  assert.deepEqual(dismissed, [MAID_SETUP_HINT_ID]);
  console.log('ok - onboarding runtime offers and persists the first-run setup hint');
}

{
  const flow = {
    id: 'configured-replay',
    title: '重温配置',
    steps: [
      { action: 'observe', text: '开始' },
      {
        target: 'config-connection-fields',
        action: 'type',
        text: '检查配置',
        canAdvance: (event, payload) => event === 'config-credentials-ready' && payload?.hasKey && payload?.hasModel,
      },
    ],
  };
  const documentRef = {
    querySelector: selector => ({ value: selector.includes('api-key') ? '••••' : 'saved-model' }),
  };
  const shown = [];
  const runtime = createMaidOnboardingRuntime({
    documentRef,
    getFlow: id => id === flow.id ? flow : null,
    tasks: [],
    spotlight: { show: value => shown.push(value), hide() {}, destroy() {} },
    entryUi: { hideHint() {}, destroy() {} },
  });
  runtime.startFlow(flow.id);
  await flush();
  shown.at(-1).onNext();
  await flush();
  assert.equal(runtime.getState().phase, 'done');
  console.log('ok - onboarding runtime recognizes already populated API fields when replaying setup');
}

{
  const shown = [];
  const warnings = [];
  const flow = {
    id: 'fallback-failure',
    title: '兜底失败',
    steps: [{ action: 'click', fallback: { kind: 'open-panel' }, text: '尝试打开' }],
  };
  const runtime = createMaidOnboardingRuntime({
    getFlow: id => id === flow.id ? flow : null,
    tasks: [],
    runFallback: async () => { throw new Error('panel failed'); },
    spotlight: { show: value => shown.push(value), hide() {}, destroy() {} },
    entryUi: { hideHint() {}, destroy() {} },
    logger: { warn: (...args) => warnings.push(args) },
  });
  runtime.startFlow(flow.id);
  await flush();
  shown.at(-1).onFallback();
  await flush();
  assert.equal(warnings.length, 1, 'async fallback failures should be contained and logged');
  runtime.skip();
  console.log('ok - onboarding runtime contains asynchronous fallback failures');
}
