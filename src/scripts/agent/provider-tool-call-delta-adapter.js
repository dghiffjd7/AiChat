import { normalizeProviderToolCall } from './provider-tool-call-parts.js';

export const PROVIDER_TOOL_CALL_DELTA_TYPE = 'provider_tool_call_delta';

export const PROVIDER_TOOL_CALL_DELTA_PHASES = Object.freeze({
  start: 'start',
  argumentsDelta: 'arguments_delta',
  complete: 'complete',
});

const isPlainObject = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));

const trim = (value, fallback = '') => {
  const text = String(value ?? '').trim();
  return text || fallback;
};

const clone = (value) => {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return Array.isArray(value) ? value.slice() : { ...value };
  }
};

const readIndex = (value, fallback = -1) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const parseArgumentsText = (text = '') => {
  const raw = String(text || '').trim();
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return isPlainObject(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

const stringifyArguments = (value) => {
  if (!isPlainObject(value)) return '';
  try {
    return JSON.stringify(value);
  } catch {
    return '';
  }
};

const hasObjectKeys = value => isPlainObject(value) && Object.keys(value).length > 0;

const buildDelta = ({
  phase = PROVIDER_TOOL_CALL_DELTA_PHASES.start,
  provider = '',
  model = '',
  id = '',
  toolCallId = '',
  index = -1,
  toolName = '',
  argumentsDelta = '',
  argumentsText = '',
  arguments: args = null,
  all = false,
  source = 'provider-tool-call-delta',
  raw = null,
  now = Date.now,
} = {}) => ({
  type: PROVIDER_TOOL_CALL_DELTA_TYPE,
  phase,
  provider: trim(provider),
  model: trim(model),
  id: trim(id || toolCallId),
  toolCallId: trim(toolCallId || id),
  index: readIndex(index, -1),
  toolName: trim(toolName),
  argumentsDelta: String(argumentsDelta ?? ''),
  argumentsText: String(argumentsText ?? ''),
  arguments: isPlainObject(args) ? clone(args) : null,
  all: all === true,
  source,
  raw: raw ? clone(raw) : null,
  createdAt: Number(now?.() || Date.now()) || Date.now(),
});

const extractOpenAIToolDeltas = (data = {}, context = {}) => {
  const choice = data?.choices?.[0] && typeof data.choices[0] === 'object' ? data.choices[0] : {};
  const delta = isPlainObject(choice.delta)
    ? choice.delta
    : (isPlainObject(data.delta) ? data.delta : {});
  const message = isPlainObject(choice.message) ? choice.message : {};
  const toolCalls = Array.isArray(delta.tool_calls)
    ? delta.tool_calls
    : (Array.isArray(message.tool_calls)
        ? message.tool_calls
        : (Array.isArray(data.tool_calls) ? data.tool_calls : []));
  const items = [];
  toolCalls.forEach((call, idx) => {
    const src = isPlainObject(call) ? call : {};
    const fn = isPlainObject(src.function) ? src.function : {};
    const id = trim(src.id || src.tool_call_id || src.call_id);
    const toolName = trim(fn.name || src.name);
    const argumentsDelta = typeof fn.arguments === 'string'
      ? fn.arguments
      : (typeof src.arguments === 'string' ? src.arguments : '');
    const base = {
      provider: context.provider,
      model: context.model,
      id,
      toolCallId: id,
      index: readIndex(src.index, idx),
      toolName,
      raw: src,
      now: context.now,
    };
    if (id || toolName) {
      items.push(buildDelta({
        ...base,
        phase: PROVIDER_TOOL_CALL_DELTA_PHASES.start,
      }));
    }
    if (argumentsDelta) {
      items.push(buildDelta({
        ...base,
        phase: PROVIDER_TOOL_CALL_DELTA_PHASES.argumentsDelta,
        argumentsDelta,
      }));
    }
  });
  if (trim(choice.finish_reason || data.finish_reason) === 'tool_calls') {
    items.push(buildDelta({
      provider: context.provider,
      model: context.model,
      phase: PROVIDER_TOOL_CALL_DELTA_PHASES.complete,
      all: true,
      raw: data,
      now: context.now,
    }));
  }
  return items;
};

const extractOpenAIResponseDeltas = (data = {}, context = {}) => {
  const type = trim(data.type).toLowerCase();
  if (!type.startsWith('response.')) return [];
  const item = isPlainObject(data.item) ? data.item : {};
  if (type === 'response.output_item.added' && trim(item.type) === 'function_call') {
    return [buildDelta({
      provider: context.provider,
      model: context.model,
      phase: PROVIDER_TOOL_CALL_DELTA_PHASES.start,
      id: item.id || item.call_id,
      toolCallId: item.call_id || item.id,
      index: data.output_index,
      toolName: item.name,
      raw: data,
      now: context.now,
    })];
  }
  if (type === 'response.function_call_arguments.delta') {
    return [buildDelta({
      provider: context.provider,
      model: context.model,
      phase: PROVIDER_TOOL_CALL_DELTA_PHASES.argumentsDelta,
      id: data.item_id || data.call_id,
      toolCallId: data.call_id || data.item_id,
      index: data.output_index,
      argumentsDelta: data.delta,
      raw: data,
      now: context.now,
    })];
  }
  if (type === 'response.function_call_arguments.done') {
    return [buildDelta({
      provider: context.provider,
      model: context.model,
      phase: PROVIDER_TOOL_CALL_DELTA_PHASES.complete,
      id: data.item_id || data.call_id,
      toolCallId: data.call_id || data.item_id,
      index: data.output_index,
      argumentsText: data.arguments,
      raw: data,
      now: context.now,
    })];
  }
  if (type === 'response.output_item.done' && trim(item.type) === 'function_call') {
    return [buildDelta({
      provider: context.provider,
      model: context.model,
      phase: PROVIDER_TOOL_CALL_DELTA_PHASES.complete,
      id: item.id || item.call_id,
      toolCallId: item.call_id || item.id,
      index: data.output_index,
      toolName: item.name,
      argumentsText: item.arguments,
      raw: data,
      now: context.now,
    })];
  }
  return [];
};

const extractAnthropicToolDeltas = (data = {}, context = {}) => {
  const type = trim(data.type).toLowerCase();
  const block = isPlainObject(data.content_block) ? data.content_block : {};
  if (type === 'content_block_start' && trim(block.type) === 'tool_use') {
    const hasInput = hasObjectKeys(block.input);
    return [buildDelta({
      provider: context.provider,
      model: context.model,
      phase: PROVIDER_TOOL_CALL_DELTA_PHASES.start,
      id: block.id,
      toolCallId: block.id,
      index: data.index,
      toolName: block.name,
      argumentsText: hasInput ? stringifyArguments(block.input) : '',
      arguments: hasInput ? block.input : null,
      raw: data,
      now: context.now,
    })];
  }
  const delta = isPlainObject(data.delta) ? data.delta : {};
  if (type === 'content_block_delta' && trim(delta.type) === 'input_json_delta') {
    return [buildDelta({
      provider: context.provider,
      model: context.model,
      phase: PROVIDER_TOOL_CALL_DELTA_PHASES.argumentsDelta,
      index: data.index,
      argumentsDelta: delta.partial_json,
      raw: data,
      now: context.now,
    })];
  }
  if (type === 'content_block_stop') {
    return [buildDelta({
      provider: context.provider,
      model: context.model,
      phase: PROVIDER_TOOL_CALL_DELTA_PHASES.complete,
      index: data.index,
      raw: data,
      now: context.now,
    })];
  }
  return [];
};

const extractGeminiToolDeltas = (data = {}, context = {}) => {
  const candidates = Array.isArray(data.candidates) ? data.candidates : [];
  const parts = candidates.flatMap(candidate => (
    Array.isArray(candidate?.content?.parts) ? candidate.content.parts : []
  ));
  return parts
    .filter(part => isPlainObject(part?.functionCall))
    .map((part, index) => {
      const call = part.functionCall;
      return buildDelta({
        provider: context.provider,
        model: context.model,
        phase: PROVIDER_TOOL_CALL_DELTA_PHASES.complete,
        index,
        toolName: call.name,
        arguments: isPlainObject(call.args) ? call.args : {},
        argumentsText: stringifyArguments(call.args),
        raw: part,
        now: context.now,
      });
    });
};

export const normalizeProviderToolCallDeltas = (data = {}, {
  provider = '',
  model = '',
  now = Date.now,
} = {}) => {
  const context = { provider, model, now };
  const src = isPlainObject(data) ? data : {};
  return [
    ...extractOpenAIResponseDeltas(src, context),
    ...extractOpenAIToolDeltas(src, context),
    ...extractAnthropicToolDeltas(src, context),
    ...extractGeminiToolDeltas(src, context),
  ];
};

export const createProviderToolCallDeltaAccumulator = ({
  provider = '',
  model = '',
  now = Date.now,
} = {}) => {
  const states = new Map();

  const getKey = (delta = {}) => {
    const id = trim(delta.toolCallId || delta.id);
    if (id) return `id:${id}`;
    const index = readIndex(delta.index, -1);
    return index >= 0 ? `index:${index}` : 'default';
  };

  const getState = (delta = {}) => {
    const id = trim(delta.toolCallId || delta.id);
    const index = readIndex(delta.index, -1);
    if (id) {
      const idKey = `id:${id}`;
      const existingById = states.get(idKey);
      if (existingById) return existingById;
      const existingByIndex = Array.from(states.values())
        .find(state => state.index >= 0 && state.index === index);
      if (existingByIndex) {
        states.delete(existingByIndex.key);
        existingByIndex.key = idKey;
        states.set(idKey, existingByIndex);
        return existingByIndex;
      }
    }
    if (!id && index >= 0) {
      const existingByIndex = Array.from(states.values())
        .find(state => state.index >= 0 && state.index === index);
      if (existingByIndex) return existingByIndex;
    }
    const key = getKey(delta);
    const current = states.get(key) || {
      key,
      id: '',
      toolCallId: '',
      index: -1,
      toolName: '',
      argumentsText: '',
      arguments: null,
      provider: trim(delta.provider, provider),
      model: trim(delta.model, model),
    };
    states.set(key, current);
    return current;
  };

  const updateState = (state, delta = {}) => {
    state.id = trim(delta.id, state.id);
    state.toolCallId = trim(delta.toolCallId, state.toolCallId || state.id);
    state.index = readIndex(delta.index, state.index);
    state.toolName = trim(delta.toolName, state.toolName);
    state.provider = trim(delta.provider, state.provider);
    state.model = trim(delta.model, state.model);
    if (delta.argumentsText) state.argumentsText = String(delta.argumentsText);
    if (delta.argumentsDelta) state.argumentsText += String(delta.argumentsDelta);
    if (isPlainObject(delta.arguments)) state.arguments = clone(delta.arguments);
    return state;
  };

  const completeState = (state) => {
    const args = isPlainObject(state.arguments)
      ? state.arguments
      : parseArgumentsText(state.argumentsText);
    const completed = normalizeProviderToolCall({
      id: state.id || state.toolCallId,
      toolCallId: state.toolCallId || state.id,
      toolName: state.toolName,
      provider: state.provider,
      model: state.model,
      arguments: args,
      status: 'succeeded',
      metadata: {
        streamingArgumentsText: state.argumentsText,
        streamingIndex: state.index,
      },
    }, { provider, model, now });
    states.delete(state.key);
    return completed;
  };

  const push = (data = {}, context = {}) => {
    const deltas = normalizeProviderToolCallDeltas(data, {
      provider: trim(context.provider, provider),
      model: trim(context.model, model),
      now,
    });
    const completed = [];
    deltas.forEach((delta) => {
      if (delta.phase === PROVIDER_TOOL_CALL_DELTA_PHASES.complete && delta.all) {
        Array.from(states.values()).forEach(state => completed.push(completeState(state)));
        return;
      }
      const state = updateState(getState(delta), delta);
      if (delta.phase === PROVIDER_TOOL_CALL_DELTA_PHASES.complete) {
        completed.push(completeState(state));
      }
    });
    return { deltas, completed };
  };

  return {
    clear: () => states.clear(),
    getSnapshot: () => Array.from(states.values()).map(state => ({ ...state })),
    push,
  };
};
