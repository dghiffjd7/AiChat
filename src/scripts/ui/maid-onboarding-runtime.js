import { createMaidGuideFlowEngine } from './maid-guide-flow-engine.js';
import { createMaidGuideSpotlight } from './maid-guide-spotlight.js';
import { createMaidOnboardingEntryUi } from './maid-onboarding-entry-ui.js';
import {
  createMaidExistingApiReviewFlow,
  getMaidOnboardingFlow,
  ONBOARDING_TASKS,
} from './maid-onboarding-flows.js';

export const MAID_GUIDE_EVENT = 'maid-guide-event';
export const MAID_ONBOARDING_WELCOME_HINT_ID = 'maid-onboarding-welcome-v2';
export const MAID_SETUP_HINT_ID = MAID_ONBOARDING_WELCOME_HINT_ID;

const trim = (value, fallback = '') => {
  const text = String(value ?? '').trim();
  return text || fallback;
};

export const maidGuideEmit = (
  windowRef = globalThis?.window || null,
  event = '',
  payload = undefined,
) => {
  const name = trim(event);
  if (!name || typeof windowRef?.dispatchEvent !== 'function') return false;
  const CustomEventCtor = windowRef?.CustomEvent || globalThis?.CustomEvent;
  if (typeof CustomEventCtor !== 'function') return false;
  windowRef.dispatchEvent(new CustomEventCtor(MAID_GUIDE_EVENT, {
    detail: { event: name, payload },
  }));
  return true;
};

const readTargetKey = (event = {}) => {
  const path = typeof event?.composedPath === 'function' ? event.composedPath() : [];
  const candidates = [...path, event?.target].filter(Boolean);
  for (const candidate of candidates) {
    const own = trim(candidate?.dataset?.maidGuideTarget);
    if (own) return own;
    const closest = candidate?.closest?.('[data-maid-guide-target]');
    const nested = trim(closest?.dataset?.maidGuideTarget);
    if (nested) return nested;
  }
  return '';
};

const readConfigElement = (documentRef, selector = '') => {
  try {
    return documentRef?.querySelector?.(selector) || null;
  } catch {
    return null;
  }
};

const hasStoredSecret = element => (
  element?.dataset?.hasKey === 'true'
  || Boolean(trim(element?.dataset?.masked))
  || Boolean(trim(element?.dataset?.originalKey))
);

const isValidConfigUrl = (value) => {
  const text = trim(value);
  if (!text) return false;
  try {
    new URL(text);
    return true;
  } catch {
    return false;
  }
};

export const readMaidApiSetupState = (documentRef = globalThis?.document || null) => {
  const providerEl = readConfigElement(documentRef, '#config-provider, [data-maid-guide-target="config-provider-select"]');
  const apiKeyEl = readConfigElement(documentRef, '#config-apikey, [data-maid-guide-target="config-api-key-input"]');
  const serviceAccountEl = readConfigElement(documentRef, '#config-serviceaccount, [data-maid-guide-target="config-service-account-input"]');
  const baseUrlEl = readConfigElement(documentRef, '#config-baseurl');
  const modelEl = readConfigElement(documentRef, '#config-model, [data-maid-guide-target="config-model-select"]');
  const provider = trim(providerEl?.value, 'openai').toLowerCase();
  const apiKey = trim(apiKeyEl?.value);
  const serviceAccount = trim(serviceAccountEl?.value);
  const baseUrl = trim(baseUrlEl?.value);
  const model = trim(modelEl?.value);
  return {
    provider,
    apiKey,
    serviceAccount,
    baseUrl,
    model,
    hasApiKey: Boolean(apiKey),
    hasSavedApiKey: hasStoredSecret(apiKeyEl),
    hasServiceAccount: Boolean(serviceAccount),
    hasValidBaseUrl: isValidConfigUrl(baseUrl),
    hasModel: Boolean(model),
  };
};

const PROVIDER_LABELS = Object.freeze({
  openai: 'OpenAI',
  makersuite: 'Google AI Studio',
  vertexai: 'Google Vertex AI',
  deepseek: 'Deepseek',
  openrouter: 'OpenRouter',
  opencode: 'OpenCode Go',
  kimi: 'Kimi',
  zhipu: '智谱 GLM',
  anthropic: 'Anthropic',
  custom: '自定义 API',
});

export const resolveMaidApiCredentialStepView = (step = {}, configState = {}) => {
  const provider = trim(configState?.provider, 'openai').toLowerCase();
  const providerLabel = PROVIDER_LABELS[provider] || provider;
  if (provider === 'custom') {
    return {
      ...step,
      target: 'config-custom-fields',
      text: '自定义 API 需要正确的 Base URL 与 API Key。请确认地址指向兼容接口，再贴上 Key；内容只保存在本机。',
      hint: '填写 Base URL 与 API Key',
      fallback: { kind: 'focus-target', target: 'config-base-url-input' },
    };
  }
  if (provider === 'vertexai') {
    return {
      ...step,
      target: 'config-service-account-input',
      text: 'Google Vertex AI 需要 Service Account JSON。请粘贴完整凭证；引导只检查是否填写，不会读取内容。',
      hint: '填写 Service Account JSON',
      fallback: { kind: 'focus-target', target: 'config-service-account-input' },
    };
  }
  return {
    ...step,
    target: 'config-api-key-input',
    text: `服务商已选为 ${providerLabel}。请贴上 API Key；Key 只保存在本机，引导只检查是否填写。`,
    hint: `填写 ${providerLabel} API Key`,
    fallback: { kind: 'focus-target', target: 'config-api-key-input' },
  };
};

export const createMaidOnboardingRuntime = ({
  documentRef = globalThis?.document || null,
  windowRef = globalThis?.window || null,
  guideStore = null,
  getFlow = getMaidOnboardingFlow,
  tasks = ONBOARDING_TASKS,
  resolveTarget = null,
  prepareStep = null,
  runFallback = null,
  hasConfiguredProfile = () => true,
  getMaidBallElement = null,
  onFirstRunTaskStart = null,
  onOpenTaskList = null,
  onFlowEnd = null,
  spotlight = null,
  entryUi = null,
  logger = console,
} = {}) => {
  const spotlightUi = spotlight || createMaidGuideSpotlight({
    documentRef,
    windowRef,
    resolveTarget,
    setTimeoutFn: windowRef?.setTimeout?.bind?.(windowRef) || globalThis?.setTimeout,
    clearTimeoutFn: windowRef?.clearTimeout?.bind?.(windowRef) || globalThis?.clearTimeout,
    setIntervalFn: windowRef?.setInterval?.bind?.(windowRef) || globalThis?.setInterval,
    clearIntervalFn: windowRef?.clearInterval?.bind?.(windowRef) || globalThis?.clearInterval,
    requestAnimationFrameFn: windowRef?.requestAnimationFrame?.bind?.(windowRef) || null,
    cancelAnimationFrameFn: windowRef?.cancelAnimationFrame?.bind?.(windowRef) || null,
    matchMediaFn: windowRef?.matchMedia?.bind?.(windowRef) || null,
  });
  const entry = entryUi || createMaidOnboardingEntryUi({
    documentRef,
    windowRef,
    setTimeoutFn: windowRef?.setTimeout?.bind?.(windowRef) || globalThis?.setTimeout,
    clearTimeoutFn: windowRef?.clearTimeout?.bind?.(windowRef) || globalThis?.clearTimeout,
  });
  const taskList = Array.isArray(tasks) ? tasks : [];
  let bound = false;
  let renderVersion = 0;
  let hintOffered = false;
  let pendingCompletion = null;
  let activeFlowOverride = null;
  let setupApiReplayConfigured = false;
  let setupApiCustomBaseConfirmed = false;
  let firstChatReplyRejected = false;

  const taskForFlow = flowId => taskList.find(task => trim(task?.flowId) === trim(flowId)) || null;
  const resolveFlow = flowId => (
    activeFlowOverride?.id === trim(flowId)
      ? activeFlowOverride
      : getFlow?.(flowId)
  );

  const areAllOnboardingTasksDone = () => (
    taskList.length > 0
    && taskList.every(task => guideStore?.isTaskDone?.(task?.id) === true)
  );

  const isFirstRunPending = () => (
    !areAllOnboardingTasksDone()
    && !guideStore?.isHintDismissed?.(MAID_ONBOARDING_WELCOME_HINT_ID)
  );

  const buildFirstRunTaskViews = () => taskList.map((task) => {
    const requiredFlow = trim(task?.requires);
    const requiredTask = taskForFlow(requiredFlow);
    const requirementMet = !requiredFlow
      || (requiredFlow === 'setup-api'
        ? hasConfiguredProfile?.() === true
        : Boolean(requiredTask && guideStore?.isTaskDone?.(requiredTask.id)));
    const locked = Boolean(requiredFlow && !requirementMet);
    const done = Boolean(guideStore?.isTaskDone?.(task?.id));
    return {
      ...task,
      done,
      locked,
      startFlowId: locked ? requiredFlow : trim(task?.flowId),
      actionLabel: locked ? '先接 API' : (done ? '重温' : '开始'),
    };
  });

  const dismissFirstRun = () => guideStore?.dismissHint?.(MAID_ONBOARDING_WELCOME_HINT_ID);

  let engine = null;
  const emitConfigCredentialsReady = () => {
    const configState = readMaidApiSetupState(documentRef);
    let ready = configState.hasApiKey;
    if (configState.provider === 'vertexai') {
      ready = configState.hasServiceAccount;
    } else if (configState.provider === 'custom') {
      const baseUrlConfirmed = setupApiCustomBaseConfirmed
        || setupApiReplayConfigured
        || configState.hasSavedApiKey;
      ready = configState.hasApiKey && configState.hasValidBaseUrl && baseUrlConfirmed;
    }
    return engine?.emit?.('config-credentials-ready', {
      ready,
      provider: configState.provider,
      hasApiKey: configState.hasApiKey,
      hasServiceAccount: configState.hasServiceAccount,
      hasValidBaseUrl: configState.hasValidBaseUrl,
    }) === true;
  };
  const autoAdvanceSetupApiStep = (flow, step) => {
    if (flow?.id !== 'setup-api' || !step?.configRequirement) return false;
    const configState = readMaidApiSetupState(documentRef);
    if (step.configRequirement === 'provider') {
      if (!setupApiReplayConfigured) return false;
      return engine?.emit?.('config-provider-confirmed', {
        provider: configState.provider,
        replay: true,
      }) === true;
    }
    if (step.configRequirement === 'credentials') {
      return emitConfigCredentialsReady();
    }
    if (step.configRequirement === 'model-refresh') {
      if (!setupApiReplayConfigured || !configState.hasModel) return false;
      return engine?.emit?.('config-models-refreshed', {
        tab: 'chat',
        provider: configState.provider,
        count: 1,
        replay: true,
      }) === true;
    }
    if (step.configRequirement === 'model-selection') {
      if (!setupApiReplayConfigured || !configState.hasModel) return false;
      return engine?.emit?.('config-model-selected', {
        model: configState.model,
        replay: true,
      }) === true;
    }
    return false;
  };
  const renderState = async (state = {}, meta = {}) => {
    const version = ++renderVersion;
    if (state.phase === 'idle') {
      spotlightUi.hide?.();
      activeFlowOverride = null;
      firstChatReplyRejected = false;
      try { onFlowEnd?.(); } catch {}
      const completion = pendingCompletion;
      pendingCompletion = null;
      if (completion) entry.showCompletion?.(completion);
      return;
    }
    const flow = resolveFlow(state.flowId);
    if (!flow) {
      spotlightUi.hide?.();
      return;
    }
    const index = Math.max(0, Math.trunc(Number(state.idx) || 0));
    const sourceStep = flow.steps?.[index] || null;
    const configState = flow.id === 'setup-api' ? readMaidApiSetupState(documentRef) : null;
    let step = sourceStep?.configRequirement === 'credentials'
      ? resolveMaidApiCredentialStepView(sourceStep, configState)
      : sourceStep;
    if (
      firstChatReplyRejected
      && flow.id === 'first-chat'
      && sourceStep?.target === 'chat-body'
    ) {
      step = {
        ...sourceStep,
        target: 'format-repair-banner',
        text: '这次回复没有通过格式验收，所以没有投放成聊天气泡。请在下方提示中开启或配置格式修复 Agent，再重新检查；也可以直接重新生成。收到一条完整回复后，我会继续完成引导。',
        hint: '使用格式修复提示中的操作继续',
      };
    }
    if (state.phase === 'steps') {
      try {
        await prepareStep?.({ flow, step, index, state, meta });
      } catch (error) {
        logger?.warn?.('maid onboarding step preparation failed', error);
      }
      if (trim(meta?.reason) !== 'prev') autoAdvanceSetupApiStep(flow, sourceStep);
      const latest = engine?.getState?.() || {};
      if (version !== renderVersion || latest.phase !== 'steps' || latest.flowId !== state.flowId || latest.idx !== index) return;
    }
    if (state.phase === 'done') {
      const task = taskForFlow(flow.id);
      const wasDone = task ? Boolean(guideStore?.isTaskDone?.(task.id)) : false;
      if (task && !wasDone) {
        guideStore?.markTaskDone?.(task.id, {
          flowId: flow.id,
          reward: task.reward || flow.reward || '',
        });
        pendingCompletion = {
          title: `${flow.title} · 完成`,
          reward: task.reward || flow.reward || '',
          onViewTasks: () => onOpenTaskList?.(),
        };
      }
    }
    const viewFlow = step === sourceStep
      ? flow
      : { ...flow, steps: flow.steps.map((item, stepIndex) => stepIndex === index ? step : item) };
    spotlightUi.show?.({
      flow: viewFlow,
      index,
      phase: state.phase,
      onNext: () => engine.next(),
      onPrev: () => handleBack(),
      onSkip: () => engine.skip(),
      onFallback: () => engine.runFallback(),
      onFinish: () => engine.skip(),
    });
  };

  engine = createMaidGuideFlowEngine({
    getFlow: resolveFlow,
    onStateChange: (state, meta) => {
      void renderState(state, meta).catch(error => logger?.warn?.('maid onboarding render failed', error));
    },
    onFallback: context => {
      const result = runFallback?.(context);
      result?.catch?.(error => logger?.warn?.('maid onboarding fallback failed', error));
      return result;
    },
  });

  const emitGuideEvent = (event = '', payload = undefined) => {
    const name = trim(event);
    const state = engine.getState();
    if (
      name === 'chat-reply-rejected'
      && state.phase === 'steps'
      && state.flowId === 'first-chat'
      && resolveFlow(state.flowId)?.steps?.[state.idx]?.target === 'chat-body'
    ) {
      firstChatReplyRejected = true;
      void renderState(state, { reason: `event:${name}` })
        .catch(error => logger?.warn?.('maid onboarding rejection recovery render failed', error));
      return true;
    }
    const advanced = engine.emit(name, payload);
    if (name === 'chat-message-received' && advanced) firstChatReplyRejected = false;
    return advanced;
  };

  const handleBack = () => {
    const state = engine.getState();
    if (state.phase === 'idle') return false;
    firstChatReplyRejected = false;
    if (state.phase === 'steps' && state.idx > 0) return engine.prev();
    return engine.skip();
  };

  const isGuideBackControl = event => {
    const clicked = event?.target || null;
    if (trim(clicked?.dataset?.maidGuideBack)) return true;
    const button = clicked?.closest?.('button[data-maid-guide-back], [role="button"][data-maid-guide-back]');
    return Boolean(trim(button?.dataset?.maidGuideBack));
  };

  const onGuideEvent = (event) => {
    const detail = event?.detail || {};
    emitGuideEvent(detail.event, detail.payload);
  };
  const onSessionChanged = event => engine.emit('session-changed', event?.detail || {});
  const onDocumentClick = event => {
    let target = readTargetKey(event);
    if (!target) {
      const currentTarget = spotlightUi.getCurrentTarget?.();
      const clicked = event?.target || null;
      if (currentTarget && (clicked === currentTarget || currentTarget.contains?.(clicked))) {
        const state = engine.getState();
        target = trim(resolveFlow(state.flowId)?.steps?.[state.idx]?.target);
      }
    }
    let advanced = false;
    if (target) {
      advanced = engine.emit('target-click', { target });
      if (!advanced && target === 'agent-center-close') {
        advanced = engine.emit('agent-center-closed', {});
      }
    }
    if (!advanced && isGuideBackControl(event)) {
      Promise.resolve().then(() => handleBack());
    }
  };
  const onDocumentInput = event => {
    const target = readTargetKey(event);
    const value = String(event?.target?.value || '');
    if (target === 'config-base-url-input') setupApiCustomBaseConfirmed = true;
    if (
      target === 'config-base-url-input'
      || target === 'config-api-key-input'
      || target === 'config-service-account-input'
    ) {
      emitConfigCredentialsReady();
    }
    if (target === 'config-model-select') {
      const model = value.trim();
      const activeState = engine.getState();
      const activeStep = resolveFlow(activeState.flowId)?.steps?.[activeState.idx] || null;
      const advanced = engine.emit('config-model-selected', { model });
      // 手动填模型越过了刷新步时，紧随的「选模型」步已冗余，同一事件再推进一次直达保存
      if (advanced && activeStep?.configRequirement === 'model-refresh') {
        engine.emit('config-model-selected', { model });
      }
    }
    if (target === 'chat-input') {
      engine.emit('chat-composer-input', { length: value.length });
    }
  };
  const onDocumentChange = (event) => {
    const target = readTargetKey(event);
    if (target !== 'config-provider-select') return;
    setupApiCustomBaseConfirmed = false;
    const provider = trim(event?.target?.value, 'openai').toLowerCase();
    engine.emit('config-provider-confirmed', { provider });
  };
  const onConfigModelsRefreshed = event => engine.emit('config-models-refreshed', event?.detail || {});

  const bind = () => {
    if (bound) return false;
    bound = true;
    windowRef?.addEventListener?.(MAID_GUIDE_EVENT, onGuideEvent);
    windowRef?.addEventListener?.('session-changed', onSessionChanged);
    windowRef?.addEventListener?.('config-models-refreshed', onConfigModelsRefreshed);
    documentRef?.addEventListener?.('click', onDocumentClick, true);
    documentRef?.addEventListener?.('input', onDocumentInput, true);
    documentRef?.addEventListener?.('change', onDocumentChange, true);
    return true;
  };

  const unbind = () => {
    if (!bound) return false;
    bound = false;
    windowRef?.removeEventListener?.(MAID_GUIDE_EVENT, onGuideEvent);
    windowRef?.removeEventListener?.('session-changed', onSessionChanged);
    windowRef?.removeEventListener?.('config-models-refreshed', onConfigModelsRefreshed);
    documentRef?.removeEventListener?.('click', onDocumentClick, true);
    documentRef?.removeEventListener?.('input', onDocumentInput, true);
    documentRef?.removeEventListener?.('change', onDocumentChange, true);
    return true;
  };

  const maybeOfferSetupHint = () => {
    if (hintOffered || !isFirstRunPending()) return false;
    hintOffered = true;
    return entry.showHint?.({
      anchorEl: getMaidBallElement?.() || null,
      onDismiss: dismissFirstRun,
    }) === true;
  };

  const handleCommandInputOpen = ({ open = false, anchorEl = null } = {}) => {
    if (!open) {
      entry.hideWelcome?.();
      return false;
    }
    entry.hideHint?.();
    if (!isFirstRunPending() || engine.getState().phase !== 'idle') return false;
    return entry.showWelcome?.({
      anchorEl,
      tasks: buildFirstRunTaskViews(),
      onStartTask: (task) => {
        try { onFirstRunTaskStart?.(task); } catch {}
        pendingCompletion = null;
        startFlow(trim(task?.startFlowId));
      },
      onDismiss: dismissFirstRun,
      onOpenTasks: () => {
        onOpenTaskList?.();
      },
    }) === true;
  };

  const startFlow = (flowId) => {
    const id = trim(flowId);
    firstChatReplyRejected = false;
    const baseFlow = getFlow?.(id);
    const configured = id === 'setup-api' && hasConfiguredProfile?.() === true;
    const setupTask = id === 'setup-api' ? taskForFlow(id) : null;
    const needsFirstConfirmation = Boolean(
      configured
      && setupTask
      && guideStore?.isTaskDone?.(setupTask.id) !== true,
    );
    activeFlowOverride = needsFirstConfirmation
      ? createMaidExistingApiReviewFlow(baseFlow)
      : null;
    setupApiReplayConfigured = configured && !needsFirstConfirmation;
    setupApiCustomBaseConfirmed = setupApiReplayConfigured;
    const started = engine.start(id);
    if (!started) activeFlowOverride = null;
    return started;
  };

  return {
    back: handleBack,
    bind,
    destroy() {
      unbind();
      renderVersion += 1;
      pendingCompletion = null;
      engine.skip();
      spotlightUi.destroy?.();
      entry.destroy?.();
    },
    emit: emitGuideEvent,
    finish: () => engine.skip(),
    getState: () => engine.getState(),
    handleCommandInputOpen,
    isFirstRunPending,
    isActive: () => engine.getState().phase !== 'idle',
    maybeOfferSetupHint,
    refresh: () => void renderState(engine.getState()),
    skip: () => engine.skip(),
    startFlow(flowId) {
      entry.hideHint?.();
      entry.hideWelcome?.();
      pendingCompletion = null;
      return startFlow(flowId);
    },
    getSpotlight: () => spotlightUi,
    getEntryUi: () => entry,
  };
};
