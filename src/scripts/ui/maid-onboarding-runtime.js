import { createMaidGuideFlowEngine } from './maid-guide-flow-engine.js';
import { createMaidGuideSpotlight } from './maid-guide-spotlight.js';
import { createMaidOnboardingEntryUi } from './maid-onboarding-entry-ui.js';
import { getMaidOnboardingFlow, ONBOARDING_TASKS } from './maid-onboarding-flows.js';

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

  const taskForFlow = flowId => taskList.find(task => trim(task?.flowId) === trim(flowId)) || null;

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
    const provider = String(documentRef?.querySelector?.('[data-maid-guide-target="config-provider-select"], #config-provider')?.value || '').trim().toLowerCase();
    const apiKey = String(documentRef?.querySelector?.('[data-maid-guide-target="config-api-key-input"], #config-apikey')?.value || '');
    const serviceAccount = String(documentRef?.querySelector?.('#config-serviceaccount')?.value || '');
    const model = String(documentRef?.querySelector?.('[data-maid-guide-target="config-model-select"], #config-model')?.value || '');
    return engine?.emit?.('config-credentials-ready', {
      hasKey: provider === 'vertexai' ? Boolean(serviceAccount.trim()) : Boolean(apiKey.trim()),
      hasModel: Boolean(model.trim()),
    }) === true;
  };
  const renderState = async (state = {}) => {
    const version = ++renderVersion;
    if (state.phase === 'idle') {
      spotlightUi.hide?.();
      try { onFlowEnd?.(); } catch {}
      const completion = pendingCompletion;
      pendingCompletion = null;
      if (completion) entry.showCompletion?.(completion);
      return;
    }
    const flow = getFlow?.(state.flowId);
    if (!flow) {
      spotlightUi.hide?.();
      return;
    }
    const index = Math.max(0, Math.trunc(Number(state.idx) || 0));
    const step = flow.steps?.[index] || null;
    if (state.phase === 'steps') {
      try {
        await prepareStep?.({ flow, step, index, state });
      } catch (error) {
        logger?.warn?.('maid onboarding step preparation failed', error);
      }
      if (step?.target === 'config-connection-fields') emitConfigCredentialsReady();
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
    spotlightUi.show?.({
      flow,
      index,
      phase: state.phase,
      onNext: () => engine.next(),
      onPrev: () => engine.prev(),
      onSkip: () => engine.skip(),
      onFallback: () => engine.runFallback(),
      onFinish: () => engine.skip(),
    });
  };

  engine = createMaidGuideFlowEngine({
    getFlow,
    onStateChange: state => {
      void renderState(state).catch(error => logger?.warn?.('maid onboarding render failed', error));
    },
    onFallback: context => {
      const result = runFallback?.(context);
      result?.catch?.(error => logger?.warn?.('maid onboarding fallback failed', error));
      return result;
    },
  });

  const onGuideEvent = (event) => {
    const detail = event?.detail || {};
    engine.emit(trim(detail.event), detail.payload);
  };
  const onSessionChanged = event => engine.emit('session-changed', event?.detail || {});
  const onDocumentClick = event => {
    let target = readTargetKey(event);
    if (!target) {
      const currentTarget = spotlightUi.getCurrentTarget?.();
      const clicked = event?.target || null;
      if (currentTarget && (clicked === currentTarget || currentTarget.contains?.(clicked))) {
        const state = engine.getState();
        target = trim(getFlow?.(state.flowId)?.steps?.[state.idx]?.target);
      }
    }
    if (!target) return;
    engine.emit('target-click', { target });
    if (target === 'agent-center-close') engine.emit('agent-center-closed', {});
  };
  const onDocumentInput = event => {
    const target = readTargetKey(event);
    const value = String(event?.target?.value || '');
    if (target === 'config-connection-fields' || target === 'config-api-key-input' || target === 'config-model-select') {
      emitConfigCredentialsReady();
    }
    if (target === 'chat-input') {
      engine.emit('chat-composer-input', { length: value.length });
    }
  };

  const bind = () => {
    if (bound) return false;
    bound = true;
    windowRef?.addEventListener?.(MAID_GUIDE_EVENT, onGuideEvent);
    windowRef?.addEventListener?.('session-changed', onSessionChanged);
    documentRef?.addEventListener?.('click', onDocumentClick, true);
    documentRef?.addEventListener?.('input', onDocumentInput, true);
    return true;
  };

  const unbind = () => {
    if (!bound) return false;
    bound = false;
    windowRef?.removeEventListener?.(MAID_GUIDE_EVENT, onGuideEvent);
    windowRef?.removeEventListener?.('session-changed', onSessionChanged);
    documentRef?.removeEventListener?.('click', onDocumentClick, true);
    documentRef?.removeEventListener?.('input', onDocumentInput, true);
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
        engine.start(trim(task?.startFlowId));
      },
      onDismiss: dismissFirstRun,
      onOpenTasks: () => {
        onOpenTaskList?.();
      },
    }) === true;
  };

  return {
    bind,
    destroy() {
      unbind();
      renderVersion += 1;
      pendingCompletion = null;
      engine.skip();
      spotlightUi.destroy?.();
      entry.destroy?.();
    },
    emit: (event, payload) => engine.emit(event, payload),
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
      return engine.start(flowId);
    },
    getSpotlight: () => spotlightUi,
    getEntryUi: () => entry,
  };
};
