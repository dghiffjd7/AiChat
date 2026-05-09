import {
  buildMemoryUpdateTaskFinishTraceEvent,
  buildMemoryUpdateTaskSkippedTraceEvent,
  buildMemoryUpdateTaskStartTraceEvent,
  buildMemoryUpdateTraceEvent,
  buildMemoryUpdateRequest,
  resolveMemoryUpdateTrigger,
  setLastMemoryPlan,
} from './memory-update-runtime-utils.js';
import { loadBridgeConfig } from '../config-runtime-utils.js';

const emitMemoryRuntimeTrace = (recordTraceEvent, event) => {
  if (typeof recordTraceEvent !== 'function') return null;
  try {
    return recordTraceEvent(buildMemoryUpdateTraceEvent(event));
  } catch {
    return null;
  }
};

export const createMemoryUpdateRuntime = ({
  appBridge,
  appSettings,
  buildMemoryUpdateHistoryText,
  buildMemoryUpdatePlan,
  canInitClient,
  createClient,
  handleMemoryEditsFromRaw,
  isMemoryAutoExtractSeparate,
  isOnline = () => typeof navigator === 'undefined' || navigator.onLine !== false,
  logger,
  memoryUpdateConfigManager,
  recordTraceEvent = null,
  syncTurnCheckpointForMessage,
} = {}) => {
  const memoryUpdateRunning = new Set();
  const memoryUpdateAbortControllers = new Map();
  const memoryUpdateQueues = new Map();
  const memoryFillSessionCounters = new Map();

  const resolveMemoryUpdateConfig = async () => {
    const settings = appSettings.get();
    const mode = String(settings.memoryUpdateApiMode || 'chat').toLowerCase();
    if (mode !== 'profile') {
      return loadBridgeConfig(appBridge);
    }
    await memoryUpdateConfigManager.load();
    const profileId = String(settings.memoryUpdateProfileId || memoryUpdateConfigManager.getActiveProfileId() || '');
    if (!profileId) return null;
    return memoryUpdateConfigManager.getRuntimeConfigByProfileId(profileId);
  };

  const abortMemoryUpdate = (sessionId) => {
    const ac = memoryUpdateAbortControllers.get(sessionId);
    if (ac) {
      try {
        ac.abort();
      } catch {}
      memoryUpdateAbortControllers.delete(sessionId);
    }
  };

  const runMemoryUpdateTask = async (sessionId, isGroup, baseContext, checkpointMessageId, signal) => {
    const runId = `${sessionId}:${checkpointMessageId || Date.now()}`;
    memoryUpdateRunning.add(runId);
    const finishTrace = ({ status = 'success', reason = '', errorMessage = '' } = {}) =>
      emitMemoryRuntimeTrace(recordTraceEvent, buildMemoryUpdateTaskFinishTraceEvent({
        sessionId,
        status,
        reason,
        checkpointMessageId,
        errorMessage,
      }));
    emitMemoryRuntimeTrace(recordTraceEvent, buildMemoryUpdateTaskStartTraceEvent({
      sessionId,
      isGroup,
      checkpointMessageId,
    }));
    try {
      if (signal?.aborted) {
        finishTrace({ status: 'cancelled', reason: 'aborted' });
        return;
      }
      if (!isOnline()) {
        finishTrace({ status: 'skipped', reason: 'offline' });
        return;
      }
      const plan = await buildMemoryUpdatePlan(sessionId, isGroup, baseContext);
      setLastMemoryPlan(appBridge, plan);
      if (!plan?.enabled || !plan.promptText) {
        finishTrace({ status: 'skipped', reason: plan?.enabled ? 'prompt-missing' : 'plan-disabled' });
        return;
      }
      if (signal?.aborted) {
        finishTrace({ status: 'cancelled', reason: 'aborted' });
        return;
      }
      const historyText = buildMemoryUpdateHistoryText(sessionId);
      if (!historyText.trim()) {
        finishTrace({ status: 'skipped', reason: 'empty-history' });
        return;
      }
      const config = await resolveMemoryUpdateConfig();
      if (!config || !canInitClient(config)) {
        logger.warn('memory update config missing or invalid');
        finishTrace({ status: 'skipped', reason: 'config-invalid' });
        return;
      }
      if (signal?.aborted) {
        finishTrace({ status: 'cancelled', reason: 'aborted' });
        return;
      }
      const request = buildMemoryUpdateRequest({
        promptText: plan.promptText,
        historyText,
      });
      const client = createClient(config);
      const response = await client.chat(request.messages, { signal });
      if (signal?.aborted) {
        finishTrace({ status: 'cancelled', reason: 'aborted' });
        return;
      }
      await handleMemoryEditsFromRaw(response, {
        sessionId,
        isGroup,
        force: true,
        requestPrompt: request.requestPrompt,
      });
      if (checkpointMessageId) {
        await syncTurnCheckpointForMessage(sessionId, checkpointMessageId, {
          captureCurrentActiveState: true,
        });
      }
      finishTrace({ status: 'success' });
    } catch (err) {
      if (err?.name === 'AbortError') {
        logger.info('memory update aborted', sessionId);
        finishTrace({ status: 'cancelled', reason: 'aborted' });
        return;
      }
      logger.warn('memory update failed', err);
      finishTrace({
        status: 'error',
        reason: 'exception',
        errorMessage: err?.message ? String(err.message) : String(err || ''),
      });
    } finally {
      memoryUpdateRunning.delete(runId);
    }
  };

  const ensureMemoryQueue = (sessionId) => {
    let queue = memoryUpdateQueues.get(sessionId);
    if (!queue) {
      queue = {
        pending: [],
        promise: null,
        running: false,
      };
      memoryUpdateQueues.set(sessionId, queue);
    }
    return queue;
  };

  const drainMemoryQueue = (sessionId) => {
    const queue = ensureMemoryQueue(sessionId);
    if (queue.running) return queue.promise || Promise.resolve();
    queue.running = true;
    queue.promise = (async () => {
      try {
        while (queue.pending.length > 0) {
          const task = queue.pending.shift();
          const ac = new AbortController();
          memoryUpdateAbortControllers.set(sessionId, ac);
          await runMemoryUpdateTask(sessionId, task.isGroup, task.baseContext, task.checkpointMessageId, ac.signal);
          if (memoryUpdateAbortControllers.get(sessionId) === ac) {
            memoryUpdateAbortControllers.delete(sessionId);
          }
        }
      } finally {
        queue.running = false;
        queue.promise = null;
      }
    })();
    return queue.promise;
  };

  const enqueueMemoryUpdate = (sessionId, isGroup, baseContext, checkpointMessageId) => {
    const queue = ensureMemoryQueue(sessionId);
    queue.pending.push({ isGroup, baseContext, checkpointMessageId });
    return queue.running ? (queue.promise || Promise.resolve()) : drainMemoryQueue(sessionId);
  };

  const runMemoryUpdateAfterChat = async (sessionId, isGroup, baseContext, options = {}) => {
    if (!isMemoryAutoExtractSeparate()) return;
    if (!sessionId) return;
    const trigger = resolveMemoryUpdateTrigger(
      appSettings.get(),
      memoryFillSessionCounters.get(sessionId) || 0,
    );
    if (!trigger.shouldRun) {
      memoryFillSessionCounters.set(sessionId, trigger.nextCounter);
      emitMemoryRuntimeTrace(recordTraceEvent, buildMemoryUpdateTaskSkippedTraceEvent({
        sessionId,
        reason: 'cadence',
        nextCounter: trigger.nextCounter,
        everyN: trigger.everyN,
      }));
      return;
    }
    memoryFillSessionCounters.set(sessionId, trigger.nextCounter);
    const checkpointMessageId = String(options?.checkpointMessageId || '').trim();
    return enqueueMemoryUpdate(sessionId, isGroup, baseContext, checkpointMessageId);
  };

  return {
    abortMemoryUpdate,
    drainMemoryQueue,
    runMemoryUpdateAfterChat,
  };
};
