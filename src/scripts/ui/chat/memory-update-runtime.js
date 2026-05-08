import {
  buildMemoryUpdateRequest,
  resolveMemoryUpdateTrigger,
  setLastMemoryPlan,
} from './memory-update-runtime-utils.js';
import { loadBridgeConfig } from '../config-runtime-utils.js';

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
    try {
      if (signal?.aborted) return;
      if (!isOnline()) return;
      const plan = await buildMemoryUpdatePlan(sessionId, isGroup, baseContext);
      setLastMemoryPlan(appBridge, plan);
      if (!plan?.enabled || !plan.promptText) return;
      if (signal?.aborted) return;
      const historyText = buildMemoryUpdateHistoryText(sessionId);
      if (!historyText.trim()) return;
      const config = await resolveMemoryUpdateConfig();
      if (!config || !canInitClient(config)) {
        logger.warn('memory update config missing or invalid');
        return;
      }
      if (signal?.aborted) return;
      const request = buildMemoryUpdateRequest({
        promptText: plan.promptText,
        historyText,
      });
      const client = createClient(config);
      const response = await client.chat(request.messages, { signal });
      if (signal?.aborted) return;
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
    } catch (err) {
      if (err?.name === 'AbortError') {
        logger.info('memory update aborted', sessionId);
        return;
      }
      logger.warn('memory update failed', err);
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
