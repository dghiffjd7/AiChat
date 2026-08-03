import assert from 'node:assert/strict';

import { createMaidOnboardingRuntime, MAID_SETUP_HINT_ID } from '../../src/scripts/ui/maid-onboarding-runtime.js';

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

assert.equal(MAID_SETUP_HINT_ID, 'maid-onboarding-welcome-v2', 'new dismissal semantics must not inherit task-start writes from v1');

{
  const shown = [];
  const prepared = [];
  const backOrder = [];
  const listeners = new Map();
  const documentRef = {
    addEventListener: (type, handler) => listeners.set(type, handler),
    removeEventListener: type => listeners.delete(type),
  };
  const windowRef = {
    addEventListener() {},
    removeEventListener() {},
  };
  const flow = {
    id: 'back-flow',
    title: '返回流程',
    steps: [
      { action: 'observe', text: '第一步' },
      { action: 'observe', text: '第二步' },
    ],
  };
  const runtime = createMaidOnboardingRuntime({
    documentRef,
    windowRef,
    getFlow: id => id === flow.id ? flow : null,
    tasks: [],
    prepareStep: async ({ index, meta }) => {
      prepared.push({ index, reason: meta?.reason || '' });
      if (meta?.reason === 'prev') backOrder.push('prepare-previous');
    },
    spotlight: { show: value => shown.push(value), hide() {}, destroy() {} },
    entryUi: { hideHint() {}, hideWelcome() {}, destroy() {} },
  });
  runtime.bind();
  runtime.startFlow(flow.id);
  await flush();
  shown.at(-1).onNext();
  await flush();
  assert.equal(runtime.getState().idx, 1);
  assert.equal(runtime.back(), true);
  await flush();
  assert.equal(runtime.getState().idx, 0);
  assert.deepEqual(prepared.at(-1), { index: 0, reason: 'prev' });

  shown.at(-1).onNext();
  await flush();
  const backButton = {
    dataset: { maidGuideBack: 'test-panel' },
    closest: selector => selector.includes('button[data-maid-guide-back]') ? backButton : null,
  };
  backOrder.length = 0;
  listeners.get('click')?.({ target: backButton, composedPath: () => [backButton] });
  backOrder.push('native-close');
  await flush();
  assert.equal(runtime.getState().idx, 0, '面板返回控件必须回到引导上一步');
  assert.deepEqual(backOrder, ['native-close', 'prepare-previous'], '应先让面板按钮完成关闭，再恢复上一步界面');
  assert.equal(runtime.back(), true, '第一步返回应结束引导而不是卡住');
  await flush();
  assert.equal(runtime.getState().phase, 'idle');
  runtime.destroy();
  console.log('ok - onboarding back controls and system back share previous-step semantics');
}

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
  const values = {
    provider: { value: 'openai' },
    apiKey: { value: 'sk••saved', dataset: { hasKey: 'true' } },
    serviceAccount: { value: '' },
    baseUrl: { value: 'https://api.openai.com/v1' },
    model: { value: 'gpt-saved' },
  };
  const documentRef = {
    querySelector: (selector) => {
      if (selector.includes('config-provider')) return values.provider;
      if (selector.includes('config-api-key')) return values.apiKey;
      if (selector.includes('config-service-account') || selector.includes('config-serviceaccount')) return values.serviceAccount;
      if (selector.includes('config-base-url') || selector.includes('config-baseurl')) return values.baseUrl;
      if (selector.includes('config-model-select') || selector.includes('config-model')) return values.model;
      return null;
    },
  };
  const shown = [];
  const runtime = createMaidOnboardingRuntime({
    documentRef,
    tasks: [],
    hasConfiguredProfile: () => true,
    spotlight: { show: value => shown.push(value), hide() {}, destroy() {} },
    entryUi: { hideHint() {}, hideWelcome() {}, destroy() {} },
  });
  runtime.startFlow('setup-api');
  await flush();
  shown.at(-1).onNext();
  await flush();
  runtime.emit('target-click', { target: 'settings-entry' });
  await flush();
  runtime.emit('target-click', { target: 'settings-api-config' });
  for (let i = 0; i < 8; i += 1) await flush();
  const state = runtime.getState();
  assert.equal(state.phase, 'steps');
  assert.equal(shown.at(-1).flow.steps[shown.at(-1).index].target, 'config-save-btn');
  console.log('ok - onboarding runtime skips fulfilled API setup fields when replaying a configured profile');
}

{
  const values = {
    provider: { value: 'openai' },
    apiKey: { value: 'sk••saved', dataset: { hasKey: 'true' } },
    serviceAccount: { value: '' },
    baseUrl: { value: 'https://api.openai.com/v1' },
    model: { value: 'gpt-saved' },
  };
  const documentRef = {
    querySelector: (selector) => {
      if (selector.includes('config-provider')) return values.provider;
      if (selector.includes('config-api-key')) return values.apiKey;
      if (selector.includes('config-service-account') || selector.includes('config-serviceaccount')) return values.serviceAccount;
      if (selector.includes('config-base-url') || selector.includes('config-baseurl')) return values.baseUrl;
      if (selector.includes('config-model-select') || selector.includes('config-model')) return values.model;
      return null;
    },
  };
  const shown = [];
  const fallbacks = [];
  const completed = new Set();
  const runtime = createMaidOnboardingRuntime({
    documentRef,
    tasks: [{ id: 'task-setup-api', flowId: 'setup-api' }],
    guideStore: {
      isTaskDone: id => completed.has(id),
      markTaskDone: id => completed.add(id),
    },
    hasConfiguredProfile: () => true,
    runFallback: context => fallbacks.push(context),
    spotlight: { show: value => shown.push(value), hide() {}, destroy() {} },
    entryUi: { hideHint() {}, hideWelcome() {}, destroy() {} },
  });
  runtime.startFlow('setup-api');
  await flush();
  shown.at(-1).onNext();
  await flush();
  runtime.emit('target-click', { target: 'settings-entry' });
  await flush();
  runtime.emit('target-click', { target: 'settings-api-config' });
  await flush();
  assert.equal(
    shown.at(-1).flow.steps[shown.at(-1).index].target,
    'config-profile-select',
    'an upgrade user must explicitly review the connection profile',
  );
  shown.at(-1).onNext();
  await flush();
  const modelView = shown.at(-1).flow.steps[shown.at(-1).index];
  assert.equal(modelView.target, 'config-model-section');
  assert.equal(runtime.emit('config-model-selected', { model: 'gpt-saved' }), false, 'model selection stays optional');
  shown.at(-1).onFallback();
  assert.equal(fallbacks.at(-1).step.fallback.target, 'config-save-btn');
  assert.equal(runtime.getState().phase, 'steps', 'clicking the save assist must wait for the real save callback');
  assert.equal(runtime.emit('config-profile-saved', { profileCount: 1 }), true);
  await flush();
  assert.equal(runtime.getState().phase, 'done');
  assert.equal(completed.has('task-setup-api'), true);
  console.log('ok - configured upgrade users confirm profile/model and finish only after a real save');
}

{
  const values = {
    provider: { value: 'custom' },
    apiKey: { value: '', dataset: { hasKey: 'false' } },
    serviceAccount: { value: '' },
    baseUrl: { value: 'http://localhost:8000/v1' },
    model: { value: 'default' },
  };
  const documentRef = {
    querySelector: (selector) => {
      if (selector.includes('config-provider')) return values.provider;
      if (selector.includes('config-api-key')) return values.apiKey;
      if (selector.includes('config-service-account') || selector.includes('config-serviceaccount')) return values.serviceAccount;
      if (selector.includes('config-base-url') || selector.includes('config-baseurl')) return values.baseUrl;
      if (selector.includes('config-model-select') || selector.includes('config-model')) return values.model;
      return null;
    },
  };
  const shown = [];
  const runtime = createMaidOnboardingRuntime({
    documentRef,
    tasks: [],
    hasConfiguredProfile: () => false,
    spotlight: { show: value => shown.push(value), hide() {}, destroy() {} },
    entryUi: { hideHint() {}, hideWelcome() {}, destroy() {} },
  });
  runtime.startFlow('setup-api');
  await flush();
  shown.at(-1).onNext();
  await flush();
  runtime.emit('target-click', { target: 'settings-entry' });
  await flush();
  runtime.emit('target-click', { target: 'settings-api-config' });
  await flush();
  assert.equal(shown.at(-1).flow.steps[shown.at(-1).index].target, 'config-provider-select');
  runtime.emit('config-provider-confirmed', { provider: 'custom' });
  await flush();
  const credentialsView = shown.at(-1).flow.steps[shown.at(-1).index];
  assert.equal(credentialsView.target, 'config-custom-fields');
  assert.match(credentialsView.text, /Base URL/);
  assert.equal(runtime.emit('config-credentials-ready', { ready: false }), false);
  assert.equal(runtime.emit('config-credentials-ready', { ready: true }), true);
  await flush();
  assert.equal(shown.at(-1).flow.steps[shown.at(-1).index].target, 'config-model-section');
  assert.equal(runtime.emit('config-models-refreshed', { tab: 'chat', count: 0 }), false);
  assert.equal(runtime.emit('config-models-refreshed', { tab: 'chat', count: 3 }), true);
  await flush();
  assert.equal(shown.at(-1).flow.steps[shown.at(-1).index].target, 'config-model-picker');
  assert.equal(runtime.emit('config-model-selected', { model: '' }), false);
  assert.equal(runtime.emit('config-model-selected', { model: 'custom-model' }), true);
  await flush();
  assert.equal(shown.at(-1).flow.steps[shown.at(-1).index].target, 'config-save-btn');
  console.log('ok - onboarding runtime keeps fresh custom API setup on each required interaction');
}

{
  const values = {
    provider: { value: 'openai' },
    apiKey: { value: 'sk-existing', dataset: { hasKey: 'true' } },
    serviceAccount: { value: '' },
    baseUrl: { value: '' },
    model: { value: 'gpt-existing' },
  };
  const documentRef = {
    querySelector: (selector) => {
      if (selector.includes('config-provider')) return values.provider;
      if (selector.includes('config-api-key')) return values.apiKey;
      if (selector.includes('config-service-account') || selector.includes('config-serviceaccount')) return values.serviceAccount;
      if (selector.includes('config-baseurl')) return values.baseUrl;
      if (selector.includes('config-model-select') || selector.includes('config-model')) return values.model;
      return null;
    },
  };
  const shown = [];
  const runtime = createMaidOnboardingRuntime({
    documentRef,
    tasks: [],
    hasConfiguredProfile: () => false,
    spotlight: { show: value => shown.push(value), hide() {}, destroy() {} },
    entryUi: { hideHint() {}, hideWelcome() {}, destroy() {} },
  });
  runtime.startFlow('setup-api');
  await flush();
  shown.at(-1).onNext();
  await flush();
  runtime.emit('target-click', { target: 'settings-entry' });
  await flush();
  runtime.emit('target-click', { target: 'settings-api-config' });
  await flush();
  runtime.emit('config-provider-confirmed', { provider: 'openai' });
  await flush();
  assert.equal(shown.at(-1).flow.steps[shown.at(-1).index].target, 'config-model-section');
  shown.at(-1).onPrev();
  await flush();
  assert.equal(
    shown.at(-1).flow.steps[shown.at(-1).index].target,
    'config-api-key-input',
    '回退到已填写的凭据步时必须停留一轮，不能被自动推进原地弹回',
  );
  runtime.destroy();
  console.log('ok - setup API back navigation suppresses one credential auto-advance pass');
}

{
  const shown = [];
  const runtime = createMaidOnboardingRuntime({
    tasks: [],
    spotlight: { show: value => shown.push(value), hide() {}, destroy() {} },
    entryUi: { hideHint() {}, hideWelcome() {}, destroy() {} },
  });
  runtime.startFlow('first-chat');
  await flush();
  shown.at(-1).onNext();
  await flush();
  runtime.emit('target-click', { target: 'contact-list-entry' });
  await flush();
  runtime.emit('chat-room-entered', { sessionId: 'Aria' });
  await flush();
  runtime.emit('chat-composer-input', { length: 2 });
  await flush();
  runtime.emit('chat-message-sent', { sessionId: 'Aria' });
  await flush();
  assert.equal(shown.at(-1).flow.steps[shown.at(-1).index].target, 'chat-body');
  assert.equal(runtime.emit('chat-reply-rejected', { sessionId: 'Aria' }), true);
  await flush();
  const recoveryView = shown.at(-1).flow.steps[shown.at(-1).index];
  assert.equal(runtime.getState().phase, 'steps');
  assert.equal(recoveryView.target, 'format-repair-banner');
  assert.match(recoveryView.text, /格式|重新检查|重新生成/);
  assert.equal(runtime.emit('chat-message-received', { sessionId: 'Aria', role: 'assistant' }), true);
  await flush();
  assert.equal(runtime.getState().phase, 'done');
  runtime.destroy();
  console.log('ok - first chat guide switches to format-rejection recovery instead of hanging');
}

{
  const listeners = new Map();
  const values = {
    provider: { value: 'custom' },
    apiKey: {
      value: '',
      dataset: { maidGuideTarget: 'config-api-key-input', hasKey: 'false' },
    },
    serviceAccount: {
      value: '',
      dataset: { maidGuideTarget: 'config-service-account-input', hasKey: 'false' },
    },
    baseUrl: {
      value: 'http://localhost:8000/v1',
      dataset: { maidGuideTarget: 'config-base-url-input' },
    },
    model: { value: 'default', dataset: { maidGuideTarget: 'config-model-select' } },
  };
  const documentRef = {
    querySelector: (selector) => {
      if (selector.includes('config-provider')) return values.provider;
      if (selector.includes('config-api-key')) return values.apiKey;
      if (selector.includes('config-service-account') || selector.includes('config-serviceaccount')) return values.serviceAccount;
      if (selector.includes('config-baseurl')) return values.baseUrl;
      if (selector.includes('config-model-select') || selector.includes('config-model')) return values.model;
      return null;
    },
    addEventListener: (type, handler) => listeners.set(type, handler),
    removeEventListener: type => listeners.delete(type),
  };
  const windowRef = {
    addEventListener() {},
    removeEventListener() {},
  };
  const shown = [];
  const runtime = createMaidOnboardingRuntime({
    documentRef,
    windowRef,
    tasks: [],
    hasConfiguredProfile: () => false,
    spotlight: { show: value => shown.push(value), hide() {}, destroy() {} },
    entryUi: { hideHint() {}, hideWelcome() {}, destroy() {} },
  });
  runtime.bind();
  runtime.startFlow('setup-api');
  await flush();
  shown.at(-1).onNext();
  await flush();
  runtime.emit('target-click', { target: 'settings-entry' });
  await flush();
  runtime.emit('target-click', { target: 'settings-api-config' });
  await flush();
  runtime.emit('config-provider-confirmed', { provider: 'custom' });
  await flush();

  values.apiKey.value = 'sk-new';
  listeners.get('input')?.({ target: values.apiKey, composedPath: () => [values.apiKey] });
  await flush();
  assert.equal(
    shown.at(-1).flow.steps[shown.at(-1).index].target,
    'config-custom-fields',
    'the custom default URL must not silently count as user-confirmed',
  );
  values.baseUrl.value = 'https://example.test/v1';
  listeners.get('input')?.({ target: values.baseUrl, composedPath: () => [values.baseUrl] });
  await flush();
  assert.equal(shown.at(-1).flow.steps[shown.at(-1).index].target, 'config-model-section');

  // 兜底：服务商不支持模型列表时，手动填写模型直接越过刷新与选模步，落到保存
  values.model.value = 'my-local-model';
  listeners.get('input')?.({ target: values.model, composedPath: () => [values.model] });
  await flush();
  assert.equal(shown.at(-1).flow.steps[shown.at(-1).index].target, 'config-save-btn');

  runtime.skip();
  values.provider.value = 'vertexai';
  values.serviceAccount.value = '';
  runtime.startFlow('setup-api');
  await flush();
  shown.at(-1).onNext();
  await flush();
  runtime.emit('target-click', { target: 'settings-entry' });
  await flush();
  runtime.emit('target-click', { target: 'settings-api-config' });
  await flush();
  runtime.emit('config-provider-confirmed', { provider: 'vertexai' });
  await flush();
  assert.equal(shown.at(-1).flow.steps[shown.at(-1).index].target, 'config-service-account-input');
  values.serviceAccount.value = '{"type":"service_account"}';
  listeners.get('input')?.({ target: values.serviceAccount, composedPath: () => [values.serviceAccount] });
  await flush();
  assert.equal(shown.at(-1).flow.steps[shown.at(-1).index].target, 'config-model-section');
  runtime.destroy();
  console.log('ok - custom Base URL confirmation and Vertex service-account input drive the real guide listeners');
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
