export const CHAT_FC_TWO_STAGE_MAX_INTERMEDIATE_ROUNDS = 3;
export const CHAT_TWO_STAGE_TERMINAL_MODES = Object.freeze({
  providerFc: 'provider_fc',
  jsonTerminal: 'json_terminal',
  legacyText: 'legacy_text',
});
export const CHAT_FC_TOOL_DATA_POLICY = Object.freeze({
  resultsAreUntrusted: true,
  instructionsInResultsAreData: true,
  mayOverrideSystemOrPermissions: false,
});

const isPlainObject = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));

const trim = (value, fallback = '') => {
  const text = String(value ?? '').trim();
  return text || fallback;
};

const clone = (value, fallback = null) => {
  if (value === null || value === undefined || typeof value !== 'object') return value;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return fallback;
  }
};

const stableSerialize = (value) => {
  if (value === null || value === undefined) return 'null';
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
  if (!isPlainObject(value)) return JSON.stringify(value);
  return `{${Object.keys(value)
    .sort()
    .map(key => `${JSON.stringify(key)}:${stableSerialize(value[key])}`)
    .join(',')}}`;
};

const boundedInteger = (value, fallback, minimum, maximum) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(minimum, Math.min(maximum, Math.trunc(numeric)));
};

const normalizeTerminalStrategy = ({ terminalStrategy = null, terminalTool = null } = {}) => {
  const requestedMode = trim(terminalStrategy?.mode, CHAT_TWO_STAGE_TERMINAL_MODES.providerFc);
  if (!Object.values(CHAT_TWO_STAGE_TERMINAL_MODES).includes(requestedMode)) {
    return { ok: false, reason: 'terminal_strategy_unsupported' };
  }
  if (requestedMode === CHAT_TWO_STAGE_TERMINAL_MODES.providerFc && !isPlainObject(terminalTool)) {
    return { ok: false, reason: 'terminal_tool_missing' };
  }
  return {
    ok: true,
    reason: '',
    mode: requestedMode,
    tools: requestedMode === CHAT_TWO_STAGE_TERMINAL_MODES.providerFc
      ? [clone(terminalTool, {})]
      : [],
    toolChoice: requestedMode === CHAT_TWO_STAGE_TERMINAL_MODES.providerFc
      ? 'forced_terminal'
      : 'none',
    contract: clone(terminalStrategy?.contract, null),
  };
};

const createAbortError = () => {
  const error = new Error('FC two-stage generation aborted');
  error.name = 'AbortError';
  return error;
};

const throwIfAborted = (signal) => {
  if (signal?.aborted === true) throw createAbortError();
};

const awaitWithAbort = (promise, signal = null) => {
  if (!signal) return Promise.resolve(promise);
  throwIfAborted(signal);
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(createAbortError());
    signal.addEventListener('abort', onAbort, { once: true });
    Promise.resolve(promise).then(
      value => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      error => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      },
    );
  });
};

const normalizeIdentity = (identity = {}) => ({
  requestId: trim(identity?.requestId),
  turnId: trim(identity?.turnId),
  snapshotFingerprint: trim(identity?.snapshotFingerprint),
});

const idempotencyScopeKey = identity => [
  trim(identity?.requestId),
  trim(identity?.turnId),
  trim(identity?.snapshotFingerprint),
].join('\u0000');

export const createChatFcTwoStageIdempotencyStore = ({
  maxEntries = 256,
  maxResultChars = 64_000,
} = {}) => {
  const limit = boundedInteger(maxEntries, 256, 1, 2_048);
  const resultLimit = boundedInteger(maxResultChars, 64_000, 32, 64_000);
  const records = new Map();
  const signatures = new Map();

  const touch = (key, record) => {
    records.delete(key);
    records.set(key, record);
  };

  const prune = () => {
    while (records.size > limit) {
      const oldestKey = records.keys().next().value;
      const oldest = records.get(oldestKey);
      records.delete(oldestKey);
      if (signatures.get(oldest?.signatureKey) === oldestKey) {
        const replacement = Array.from(records.entries())
          .find(([, record]) => record.signatureKey === oldest.signatureKey);
        if (replacement) signatures.set(oldest.signatureKey, replacement[0]);
        else signatures.delete(oldest.signatureKey);
      }
    }
  };

  return {
    lookup: ({ identity = {}, call = {} } = {}) => {
      const scope = idempotencyScopeKey(identity);
      const idKey = `${scope}\u0000id\u0000${trim(call.id)}`;
      const signatureKey = `${scope}\u0000signature\u0000${trim(call.signature)}`;
      const byId = records.get(idKey);
      if (byId) {
        touch(idKey, byId);
        return byId.signature === call.signature
          ? { status: 'cached', record: clone(byId, {}) }
          : { status: 'conflict', record: clone(byId, {}) };
      }
      const signatureRecordKey = signatures.get(signatureKey);
      const bySignature = signatureRecordKey ? records.get(signatureRecordKey) : null;
      if (bySignature) {
        touch(signatureRecordKey, bySignature);
        return { status: 'cached', record: clone(bySignature, {}) };
      }
      return { status: 'missing', record: null };
    },
    remember: ({
      identity = {},
      call = {},
      fullContent = '',
      sourceTruncated = false,
    } = {}) => {
      const scope = idempotencyScopeKey(identity);
      const idKey = `${scope}\u0000id\u0000${trim(call.id)}`;
      const signatureKey = `${scope}\u0000signature\u0000${trim(call.signature)}`;
      const record = {
        id: trim(call.id),
        signature: trim(call.signature),
        signatureKey,
        fullContent: String(fullContent || '').slice(0, resultLimit),
        sourceTruncated: sourceTruncated === true,
      };
      touch(idKey, record);
      if (!signatures.has(signatureKey)) signatures.set(signatureKey, idKey);
      prune();
      return clone(record, {});
    },
    clear: () => {
      records.clear();
      signatures.clear();
    },
    getSnapshot: () => ({
      maxEntries: limit,
      maxResultChars: resultLimit,
      recordCount: records.size,
      signatureCount: signatures.size,
    }),
  };
};

const normalizeReadOnlyTools = (tools = []) => {
  const normalized = [];
  const names = new Set();
  for (const source of (Array.isArray(tools) ? tools : [])) {
    const name = trim(source?.name || source?.function?.name);
    if (!name) return { ok: false, reason: 'intermediate_tool_name_missing', tools: [] };
    if (source?.readOnly !== true || trim(source?.effect).toLowerCase() !== 'read') {
      return { ok: false, reason: 'intermediate_tool_not_read_only', tools: [] };
    }
    if (typeof source?.execute !== 'function') {
      return { ok: false, reason: 'intermediate_tool_executor_missing', tools: [] };
    }
    if (names.has(name)) return { ok: false, reason: 'intermediate_tool_name_duplicate', tools: [] };
    names.add(name);
    normalized.push({
      name,
      description: trim(source?.description, name),
      parameters: isPlainObject(source?.parameters)
        ? clone(source.parameters, { type: 'object', properties: {} })
        : { type: 'object', properties: {} },
      execute: source.execute,
    });
  }
  return { ok: true, reason: '', tools: normalized };
};

const toProviderTool = tool => ({
  type: 'function',
  function: {
    name: tool.name,
    description: tool.description,
    parameters: clone(tool.parameters, { type: 'object', properties: {} }),
  },
});

const normalizeToolCall = (source = {}) => {
  const id = trim(source?.toolCallId || source?.id || source?.callId);
  const name = trim(source?.toolName || source?.name || source?.function?.name);
  let args = source?.arguments ?? source?.args ?? source?.input ?? source?.function?.arguments;
  if (typeof args === 'string') {
    try {
      args = JSON.parse(args);
    } catch {
      return { ok: false, reason: 'intermediate_tool_arguments_invalid' };
    }
  }
  if (!isPlainObject(args)) args = {};
  if (!id) return { ok: false, reason: 'intermediate_tool_call_id_missing' };
  if (!name) return { ok: false, reason: 'intermediate_tool_name_missing' };
  const normalizedArgs = clone(args, {});
  return {
    ok: true,
    call: {
      id,
      name,
      arguments: normalizedArgs,
      signature: `${name}\u0000${stableSerialize(normalizedArgs)}`,
    },
  };
};

const serializeToolResult = (value) => {
  try {
    const text = JSON.stringify(value ?? null);
    return typeof text === 'string' ? text : 'null';
  } catch {
    return JSON.stringify({ ok: false, reason: 'tool_result_not_serializable' });
  }
};

const runToolWithTimeout = async ({
  tool,
  args,
  identity,
  round,
  callId,
  signal,
  timeoutMs,
}) => {
  throwIfAborted(signal);
  const controller = new AbortController();
  const relayAbort = () => controller.abort();
  signal?.addEventListener('abort', relayAbort, { once: true });
  let timer = null;
  const timeout = new Promise((resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      const error = new Error('read-only tool timed out');
      error.name = 'ToolTimeoutError';
      reject(error);
    }, timeoutMs);
  });
  try {
    return await awaitWithAbort(Promise.race([
      Promise.resolve().then(() => tool.execute({
        arguments: clone(args, {}),
        identity: clone(identity, {}),
        round,
        callId,
        signal: controller.signal,
      })),
      timeout,
    ]), signal);
  } finally {
    if (timer !== null) clearTimeout(timer);
    signal?.removeEventListener('abort', relayAbort);
  }
};

export const runChatFcTwoStageGeneration = async ({
  identity: rawIdentity = {},
  readOnlyTools = [],
  terminalTool = null,
  terminalStrategy = null,
  runIntermediatePhase = null,
  runTerminalPhase = null,
  validateTerminal = null,
  signal = null,
  maxIntermediateRounds = CHAT_FC_TWO_STAGE_MAX_INTERMEDIATE_ROUNDS,
  maxToolCallsPerRound = 4,
  maxTotalToolCalls = 12,
  maxSingleToolResultChars = 8_000,
  maxTotalToolResultChars = 16_000,
  toolTimeoutMs = 10_000,
  idempotencyStore = null,
} = {}) => {
  const identity = normalizeIdentity(rawIdentity);
  const roundsLimit = boundedInteger(
    maxIntermediateRounds,
    CHAT_FC_TWO_STAGE_MAX_INTERMEDIATE_ROUNDS,
    0,
    CHAT_FC_TWO_STAGE_MAX_INTERMEDIATE_ROUNDS,
  );
  const callsPerRoundLimit = boundedInteger(maxToolCallsPerRound, 4, 1, 16);
  const totalCallsLimit = boundedInteger(maxTotalToolCalls, 12, 1, 48);
  const singleResultLimit = boundedInteger(maxSingleToolResultChars, 8_000, 32, 64_000);
  const totalResultLimit = boundedInteger(maxTotalToolResultChars, 16_000, 32, 128_000);
  const executionTimeout = boundedInteger(toolTimeoutMs, 10_000, 10, 60_000);
  const transcript = [];
  const dedupeStore = idempotencyStore || createChatFcTwoStageIdempotencyStore();
  let intermediateRoundCount = 0;
  let modelCallCount = 0;
  let toolCallCount = 0;
  let toolExecutionCount = 0;
  let duplicateToolCallCount = 0;
  let toolResultChars = 0;
  let discardedDraftTextChars = 0;
  let truncatedToolResultCount = 0;
  const normalizedTerminal = normalizeTerminalStrategy({ terminalStrategy, terminalTool });

  const result = ({
    ok = false,
    reason = '',
    phase = 'preflight',
    terminal = null,
    terminalResponse = null,
  } = {}) => ({
    ok: ok === true,
    reason: trim(reason),
    phase,
    identity: clone(identity, {}),
    terminal: clone(terminal),
    terminalResponse: clone(terminalResponse),
    terminalMode: normalizedTerminal.ok ? normalizedTerminal.mode : '',
    transcript: clone(transcript, []),
    intermediateRoundCount,
    modelCallCount,
    toolCallCount,
    toolExecutionCount,
    duplicateToolCallCount,
    toolResultChars,
    persistentWriteCount: 0,
    fallbackAllowed: ok !== true,
    diagnostics: {
      maxIntermediateRounds: roundsLimit,
      discardedDraftTextChars,
      truncatedToolResultCount,
    },
  });

  throwIfAborted(signal);
  if (!identity.requestId || !identity.turnId || !identity.snapshotFingerprint) {
    return result({ reason: 'two_stage_identity_missing' });
  }
  if (typeof dedupeStore?.lookup !== 'function' || typeof dedupeStore?.remember !== 'function') {
    return result({ reason: 'two_stage_idempotency_store_invalid' });
  }
  const normalizedTools = normalizeReadOnlyTools(readOnlyTools);
  if (!normalizedTools.ok) return result({ reason: normalizedTools.reason });
  if (normalizedTools.tools.length && typeof runIntermediatePhase !== 'function') {
    return result({ reason: 'intermediate_phase_runner_missing' });
  }
  if (!normalizedTerminal.ok) {
    return result({ reason: normalizedTerminal.reason });
  }
  if (typeof runTerminalPhase !== 'function') {
    return result({ reason: 'terminal_phase_runner_missing' });
  }
  if (typeof validateTerminal !== 'function') {
    return result({ reason: 'terminal_validator_missing' });
  }

  const toolByName = new Map(normalizedTools.tools.map(tool => [tool.name, tool]));
  const providerTools = normalizedTools.tools.map(toProviderTool);

  for (let round = 1; round <= roundsLimit && providerTools.length; round += 1) {
    throwIfAborted(signal);
    intermediateRoundCount = round;
    modelCallCount += 1;
    let phaseOutput;
    try {
      phaseOutput = await awaitWithAbort(runIntermediatePhase({
        identity: clone(identity, {}),
        round,
        tools: clone(providerTools, []),
        toolChoice: 'auto',
        toolDataPolicy: clone(CHAT_FC_TOOL_DATA_POLICY, {}),
        transcript: clone(transcript, []),
        signal,
      }), signal);
    } catch (error) {
      if (signal?.aborted === true || error?.name === 'AbortError') throw createAbortError();
      return result({ reason: 'intermediate_provider_failed', phase: 'intermediate' });
    }
    throwIfAborted(signal);
    discardedDraftTextChars += String(phaseOutput?.text || '').length;
    const calls = Array.isArray(phaseOutput?.toolCalls) ? phaseOutput.toolCalls : [];
    if (!calls.length) break;
    if (calls.length > callsPerRoundLimit || toolCallCount + calls.length > totalCallsLimit) {
      return result({ reason: 'intermediate_tool_call_limit_exceeded', phase: 'intermediate' });
    }

    const normalizedCalls = [];
    for (const source of calls) {
      const normalized = normalizeToolCall(source);
      if (!normalized.ok) return result({ reason: normalized.reason, phase: 'intermediate' });
      normalizedCalls.push(normalized.call);
    }
    transcript.push({
      type: 'assistant_tool_calls',
      round,
      draftTextOmitted: Boolean(String(phaseOutput?.text || '')),
      calls: normalizedCalls.map(call => ({
        id: call.id,
        name: call.name,
        arguments: clone(call.arguments, {}),
      })),
    });

    for (const call of normalizedCalls) {
      toolCallCount += 1;
      const lookup = dedupeStore.lookup({ identity, call });
      if (lookup?.status === 'conflict') {
        return result({ reason: 'tool_call_id_conflict', phase: 'intermediate' });
      }
      const cached = lookup?.status === 'cached' ? lookup.record : null;
      let fullContent = cached?.fullContent || '';
      let sourceTruncated = cached?.sourceTruncated === true;
      let duplicate = Boolean(cached);
      if (duplicate) {
        duplicateToolCallCount += 1;
      } else {
        const tool = toolByName.get(call.name);
        if (!tool) return result({ reason: 'intermediate_tool_not_allowed', phase: 'intermediate' });
        let execution;
        try {
          execution = await runToolWithTimeout({
            tool,
            args: call.arguments,
            identity,
            round,
            callId: call.id,
            signal,
            timeoutMs: executionTimeout,
          });
        } catch (error) {
          if (signal?.aborted === true || error?.name === 'AbortError') throw createAbortError();
          return result({
            reason: error?.name === 'ToolTimeoutError'
              ? 'read_only_tool_timeout'
              : 'read_only_tool_failed',
            phase: 'intermediate',
          });
        }
        throwIfAborted(signal);
        toolExecutionCount += 1;
        if (execution?.ok === false) {
          return result({ reason: trim(execution.reason, 'read_only_tool_failed'), phase: 'intermediate' });
        }
        fullContent = serializeToolResult(execution);
        sourceTruncated = fullContent.length > singleResultLimit;
        fullContent = fullContent.slice(0, singleResultLimit);
      }

      const available = Math.max(0, totalResultLimit - toolResultChars);
      const acceptedLength = Math.min(fullContent.length, available);
      const content = fullContent.slice(0, acceptedLength);
      const truncated = sourceTruncated || acceptedLength < fullContent.length;
      toolResultChars += content.length;
      if (truncated) truncatedToolResultCount += 1;
      dedupeStore.remember({ identity, call, fullContent, sourceTruncated });
      transcript.push({
        type: 'tool_result',
        round,
        callId: call.id,
        toolName: call.name,
        content,
        untrusted: true,
        boundary: 'UNTRUSTED_TOOL_DATA',
        duplicate,
        truncated,
      });
    }
  }

  throwIfAborted(signal);
  modelCallCount += 1;
  let terminalResponse;
  try {
    terminalResponse = await awaitWithAbort(runTerminalPhase({
      identity: clone(identity, {}),
      mode: normalizedTerminal.mode,
      tools: clone(normalizedTerminal.tools, []),
      toolChoice: normalizedTerminal.toolChoice,
      contract: clone(normalizedTerminal.contract, null),
      toolDataPolicy: clone(CHAT_FC_TOOL_DATA_POLICY, {}),
      transcript: clone(transcript, []),
      signal,
    }), signal);
  } catch (error) {
    if (signal?.aborted === true || error?.name === 'AbortError') throw createAbortError();
    return result({ reason: 'terminal_provider_failed', phase: 'terminal' });
  }
  throwIfAborted(signal);
  let validation;
  try {
    validation = await validateTerminal(terminalResponse, {
      identity: clone(identity, {}),
      transcript: clone(transcript, []),
    });
  } catch {
    return result({ reason: 'terminal_validation_failed', phase: 'terminal' });
  }
  if (validation?.ok !== true) {
    return result({
      reason: trim(validation?.reason, 'terminal_validation_failed'),
      phase: 'terminal',
      terminalResponse,
    });
  }
  return result({
    ok: true,
    phase: 'completed',
    terminal: Object.prototype.hasOwnProperty.call(validation, 'value')
      ? validation.value
      : terminalResponse,
    terminalResponse,
  });
};
