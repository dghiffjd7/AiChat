import assert from 'node:assert/strict';

import { createMaidOnboardingRuntime, MAID_SETUP_HINT_ID } from '../../src/scripts/ui/maid-onboarding-runtime.js';

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

assert.equal(MAID_SETUP_HINT_ID, 'maid-onboarding-welcome-v2', 'new dismissal semantics must not inherit task-start writes from v1');

{
  const shown = [];
  const completed = new Map();
  const completionToasts = [];
  const dismissed = [];
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
      dismissHint: id => dismissed.push(id),
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
  assert.deepEqual(dismissed, [], 'starting a guide must not permanently dismiss unfinished onboarding tasks');
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
  const maidBall = { id: 'mode-switch' };
  const runtime = createMaidOnboardingRuntime({
    getFlow: id => id === 'setup-api' ? { id, title: '接线', steps: [{ action: 'observe', text: '开始' }] } : null,
    guideStore: {
      listTasks: () => [],
      isHintDismissed: () => false,
      dismissHint: id => dismissed.push(id),
    },
    hasConfiguredProfile: () => true,
    getMaidBallElement: () => maidBall,
    spotlight: { show() {}, hide() {}, destroy() {} },
    entryUi: {
      showHint: options => { hintOptions = options; return true; },
      hideHint() {},
      destroy() {},
    },
  });
  assert.equal(runtime.maybeOfferSetupHint(), true);
  assert.equal(runtime.maybeOfferSetupHint(), false, 'one runtime session should offer the hint once');
  assert.equal(hintOptions.anchorEl, maidBall);
  hintOptions.onDismiss();
  assert.deepEqual(dismissed, [MAID_SETUP_HINT_ID]);
  console.log('ok - onboarding runtime offers an anchored first-run hint even when API is configured');
}

{
  let welcomeOptions = null;
  let welcomeHidden = 0;
  let hintHidden = 0;
  let firstRunTaskStarted = '';
  let taskListOpened = 0;
  const dismissed = [];
  const commandRoot = { id: 'maid-command-input' };
  const runtime = createMaidOnboardingRuntime({
    guideStore: {
      listTasks: () => [],
      isTaskDone: () => false,
      isHintDismissed: () => false,
      dismissHint: id => dismissed.push(id),
    },
    hasConfiguredProfile: () => false,
    onFirstRunTaskStart: task => { firstRunTaskStarted = task?.startFlowId || ''; },
    onOpenTaskList: () => { taskListOpened += 1; },
    spotlight: { show() {}, hide() {}, destroy() {} },
    entryUi: {
      hideHint: () => { hintHidden += 1; },
      hideWelcome: () => { welcomeHidden += 1; },
      showWelcome: options => { welcomeOptions = options; return true; },
      destroy() {},
    },
  });

  assert.equal(runtime.isFirstRunPending(), true);
  assert.equal(runtime.handleCommandInputOpen({ open: true, anchorEl: commandRoot }), true);
  assert.equal(hintHidden, 1);
  assert.equal(welcomeOptions.anchorEl, commandRoot);
  assert.equal(welcomeOptions.tasks.length, 4);
  const firstChat = welcomeOptions.tasks.find(task => task.flowId === 'first-chat');
  assert.equal(firstChat.locked, true);
  assert.equal(firstChat.startFlowId, 'setup-api');
  assert.equal(firstChat.actionLabel, '先接 API');
  welcomeOptions.onStartTask(firstChat);
  assert.equal(firstRunTaskStarted, 'setup-api');
  assert.equal(runtime.getState().flowId, 'setup-api');
  assert.deepEqual(dismissed, [], 'starting the first task must keep the welcome list available next time');
  runtime.skip();
  welcomeOptions.onOpenTasks();
  assert.equal(taskListOpened, 1);
  assert.deepEqual(dismissed, [], 'opening the full task page is not an opt-out');
  welcomeOptions.onDismiss();
  assert.deepEqual(dismissed, [MAID_SETUP_HINT_ID], 'only the explicit close action persists the opt-out');
  runtime.handleCommandInputOpen({ open: false, anchorEl: commandRoot });
  assert.ok(welcomeHidden >= 1);
  console.log('ok - command input first open renders four tasks and routes locked chat through API setup');
}

{
  const tasks = [
    { id: 'task-one', flowId: 'one' },
    { id: 'task-two', flowId: 'two' },
  ];
  const done = new Set(['task-one']);
  let dismissed = false;
  const runtime = createMaidOnboardingRuntime({
    tasks,
    guideStore: {
      isTaskDone: id => done.has(id),
      isHintDismissed: id => id === 'maid-onboarding-welcome-v1' || (id === MAID_SETUP_HINT_ID && dismissed),
      dismissHint: () => { dismissed = true; },
    },
    spotlight: { show() {}, hide() {}, destroy() {} },
    entryUi: { destroy() {} },
  });

  assert.equal(runtime.isFirstRunPending(), true, 'one completed task must not suppress the remaining task list');
  done.add('task-two');
  assert.equal(runtime.isFirstRunPending(), false, 'the welcome list should retire after all tasks are done');
  done.delete('task-two');
  dismissed = true;
  assert.equal(runtime.isFirstRunPending(), false, 'manual close should persist before all tasks are complete');
  console.log('ok - onboarding welcome persists between partial completions and retires only on all-done or explicit close');
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
