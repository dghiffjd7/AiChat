import { AGENT_EVENT_TYPES, cloneAgentValue } from './agent-events.js';
import {
  AGENT_PERMISSION_DECISIONS,
  createAgentPermissionEvaluator,
} from './agent-permissions.js';

export class AgentToolError extends Error {
  constructor(message, {
    code = 'agent_tool_error',
    toolName = '',
    details = null,
  } = {}) {
    super(message);
    this.name = 'AgentToolError';
    this.code = code;
    this.toolName = toolName;
    this.details = details;
  }
}

export class AgentToolPermissionError extends AgentToolError {
  constructor(message, options = {}) {
    super(message, { ...options, code: options.code || 'agent_tool_permission' });
    this.name = 'AgentToolPermissionError';
  }
}

const isPlainObject = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));

const trim = (value, fallback = '') => {
  const text = String(value ?? '').trim();
  return text || fallback;
};

const list = value => (Array.isArray(value) ? value : [value])
  .map(item => trim(item))
  .filter(Boolean);

const clone = value => cloneAgentValue(value, value && typeof value === 'object' ? {} : value);

const createAbortError = (message = 'Agent tool aborted') => {
  try {
    return new DOMException(message, 'AbortError');
  } catch {
    const err = new Error(message);
    err.name = 'AbortError';
    return err;
  }
};

const normalizeToolName = (name = '') => trim(name).replace(/\s+/g, '_');

export const normalizeAgentToolDefinition = (definition = {}) => {
  const src = isPlainObject(definition) ? definition : {};
  const name = normalizeToolName(src.name);
  if (!name) throw new AgentToolError('Agent tool name is required', { code: 'tool_name_required' });
  if (typeof src.execute !== 'function') {
    throw new AgentToolError(`Agent tool "${name}" missing execute function`, {
      code: 'tool_execute_required',
      toolName: name,
    });
  }
  return {
    name,
    title: trim(src.title || src.label, name),
    description: trim(src.description),
    source: trim(src.source, 'internal'),
    permissions: list(src.permissions),
    riskLevel: trim(src.riskLevel || src.risk, 'low'),
    executionMode: trim(src.executionMode, 'sequential'),
    schema: isPlainObject(src.schema) ? clone(src.schema) : { type: 'object' },
    timeoutMs: Math.max(0, Number(src.timeoutMs || 0) || 0),
    outputLimit: Math.max(0, Number(src.outputLimit || 0) || 0),
    prepareArguments: typeof src.prepareArguments === 'function' ? src.prepareArguments : null,
    summarizeResult: typeof src.summarizeResult === 'function' ? src.summarizeResult : null,
    execute: src.execute,
    metadata: isPlainObject(src.metadata) ? clone(src.metadata) : {},
  };
};

const typeMatches = (value, type) => {
  if (!type) return true;
  if (Array.isArray(type)) return type.some(item => typeMatches(value, item));
  if (type === 'array') return Array.isArray(value);
  if (type === 'object') return isPlainObject(value);
  if (type === 'integer') return Number.isInteger(Number(value));
  if (type === 'number') return Number.isFinite(Number(value));
  if (type === 'string') return typeof value === 'string';
  if (type === 'boolean') return typeof value === 'boolean';
  if (type === 'null') return value === null;
  return true;
};

const validateValue = (value, schema = {}, path = 'args') => {
  const errors = [];
  if (!isPlainObject(schema)) return errors;
  if (schema.type && !typeMatches(value, schema.type)) {
    errors.push(`${path} expected ${Array.isArray(schema.type) ? schema.type.join('|') : schema.type}`);
    return errors;
  }
  if (schema.enum && Array.isArray(schema.enum) && !schema.enum.includes(value)) {
    errors.push(`${path} must be one of ${schema.enum.join(', ')}`);
  }
  if (typeof value === 'string') {
    if (Number.isFinite(Number(schema.minLength)) && value.length < Number(schema.minLength)) {
      errors.push(`${path} must be at least ${Number(schema.minLength)} chars`);
    }
    if (Number.isFinite(Number(schema.maxLength)) && value.length > Number(schema.maxLength)) {
      errors.push(`${path} must be at most ${Number(schema.maxLength)} chars`);
    }
  }
  if (Number.isFinite(Number(value))) {
    const numeric = Number(value);
    if (Number.isFinite(Number(schema.minimum)) && numeric < Number(schema.minimum)) {
      errors.push(`${path} must be >= ${Number(schema.minimum)}`);
    }
    if (Number.isFinite(Number(schema.maximum)) && numeric > Number(schema.maximum)) {
      errors.push(`${path} must be <= ${Number(schema.maximum)}`);
    }
  }
  if (Array.isArray(value) && isPlainObject(schema.items)) {
    value.forEach((item, index) => {
      errors.push(...validateValue(item, schema.items, `${path}[${index}]`));
    });
  }
  if (isPlainObject(value)) {
    const required = Array.isArray(schema.required) ? schema.required : [];
    required.forEach((key) => {
      if (!Object.prototype.hasOwnProperty.call(value, key)) errors.push(`${path}.${key} is required`);
    });
    const properties = isPlainObject(schema.properties) ? schema.properties : {};
    Object.entries(properties).forEach(([key, childSchema]) => {
      if (!Object.prototype.hasOwnProperty.call(value, key)) return;
      errors.push(...validateValue(value[key], childSchema, `${path}.${key}`));
    });
    if (schema.additionalProperties === false) {
      Object.keys(value).forEach((key) => {
        if (!Object.prototype.hasOwnProperty.call(properties, key)) errors.push(`${path}.${key} is not allowed`);
      });
    }
  }
  return errors;
};

export const validateAgentToolArguments = (args = {}, schema = {}) => {
  const normalized = isPlainObject(args) ? args : {};
  const errors = validateValue(normalized, isPlainObject(schema) ? schema : { type: 'object' }, 'args');
  return {
    ok: errors.length === 0,
    errors,
    args: normalized,
  };
};

const summarizeResultValue = (result, outputLimit = 0) => {
  if (result === null || result === undefined) return '';
  const raw = typeof result === 'string' ? result : JSON.stringify(result);
  if (!outputLimit || raw.length <= outputLimit) return raw;
  return `${raw.slice(0, outputLimit)}...`;
};

const runWithTimeout = async (task, timeoutMs = 0, signal = null) => {
  if (signal?.aborted) throw createAbortError();
  if (!timeoutMs) return task();
  let timeoutId = null;
  try {
    return await Promise.race([
      task(),
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(createAbortError('Agent tool timed out')), timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
};

export const createAgentToolRegistry = ({
  permissionEvaluator = createAgentPermissionEvaluator({ defaultDecision: AGENT_PERMISSION_DECISIONS.ask }),
  logger = console,
} = {}) => {
  const tools = new Map();

  const register = (definition = {}) => {
    const normalized = normalizeAgentToolDefinition(definition);
    tools.set(normalized.name, normalized);
    return { ...normalized, execute: undefined, prepareArguments: undefined, summarizeResult: undefined };
  };

  const registerMany = (definitions = []) => (Array.isArray(definitions) ? definitions : [])
    .map(register);

  const get = (name = '') => {
    const tool = tools.get(normalizeToolName(name)) || null;
    if (!tool) return null;
    return { ...tool, execute: undefined, prepareArguments: undefined, summarizeResult: undefined };
  };

  const listTools = () => Array.from(tools.values())
    .map(tool => ({ ...tool, execute: undefined, prepareArguments: undefined, summarizeResult: undefined }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const evaluatePermission = async (tool, args = {}, context = {}) => {
    const check = permissionEvaluator?.evaluateTool
      ? permissionEvaluator.evaluateTool(tool, {
        ...context,
        toolName: tool.name,
        source: context.source || tool.source,
      })
      : { decision: AGENT_PERMISSION_DECISIONS.allow, checks: [] };
    if (check.decision === AGENT_PERMISSION_DECISIONS.allow) return check;
    if (check.decision === AGENT_PERMISSION_DECISIONS.ask && typeof context.requestPermission === 'function') {
      const requested = await context.requestPermission({
        toolName: tool.name,
        permissions: tool.permissions.slice(),
        argsPreview: clone(args),
        checks: check.checks,
        riskLevel: tool.riskLevel,
      });
      const decision = typeof requested === 'string'
        ? requested
        : requested?.decision;
      if (decision === AGENT_PERMISSION_DECISIONS.allow) {
        return { ...check, decision: AGENT_PERMISSION_DECISIONS.allow, requested };
      }
    }
    throw new AgentToolPermissionError(`Agent tool permission ${check.decision}: ${tool.name}`, {
      toolName: tool.name,
      details: check,
      code: check.decision === AGENT_PERMISSION_DECISIONS.deny
        ? 'agent_tool_denied'
        : 'agent_tool_permission_required',
    });
  };

  const executeTool = async (name = '', args = {}, context = {}) => {
    const toolName = normalizeToolName(name);
    const tool = tools.get(toolName);
    if (!tool) {
      throw new AgentToolError(`Agent tool not found: ${toolName}`, {
        code: 'agent_tool_not_found',
        toolName,
      });
    }
    const validation = validateAgentToolArguments(args, tool.schema);
    if (!validation.ok) {
      throw new AgentToolError(`Agent tool arguments invalid: ${validation.errors.join('; ')}`, {
        code: 'agent_tool_args_invalid',
        toolName,
        details: validation.errors,
      });
    }
    await evaluatePermission(tool, validation.args, context);
    const startedAt = Date.now();
    const preparedArgs = tool.prepareArguments
      ? await tool.prepareArguments(validation.args, context)
      : validation.args;
    context.emit?.({
      type: AGENT_EVENT_TYPES.toolStarted,
      runId: context.runId,
      stepId: context.stepId,
      sessionId: context.sessionId,
      source: tool.source,
      status: 'running',
      summary: `tool started: ${tool.name}`,
      details: { toolName: tool.name },
    });
    try {
      const result = await runWithTimeout(
        () => tool.execute(preparedArgs, {
          ...context,
          signal: context.signal,
          tool,
        }),
        tool.timeoutMs,
        context.signal,
      );
      const durationMs = Math.max(0, Date.now() - startedAt);
      const summary = tool.summarizeResult
        ? String(await tool.summarizeResult(result, { args: preparedArgs, context }) || '')
        : summarizeResultValue(result, tool.outputLimit);
      const output = {
        toolName: tool.name,
        status: 'succeeded',
        result: clone(result),
        summary,
        durationMs,
      };
      context.emit?.({
        type: AGENT_EVENT_TYPES.toolFinished,
        runId: context.runId,
        stepId: context.stepId,
        sessionId: context.sessionId,
        source: tool.source,
        status: 'succeeded',
        summary: summary || `tool finished: ${tool.name}`,
        details: { toolName: tool.name, durationMs },
      });
      return output;
    } catch (err) {
      const durationMs = Math.max(0, Date.now() - startedAt);
      context.emit?.({
        type: AGENT_EVENT_TYPES.toolFinished,
        runId: context.runId,
        stepId: context.stepId,
        sessionId: context.sessionId,
        source: tool.source,
        status: err?.name === 'AbortError' ? 'cancelled' : 'failed',
        summary: err?.message ? String(err.message) : `tool failed: ${tool.name}`,
        details: { toolName: tool.name, durationMs },
      });
      logger?.warn?.('agent tool failed', tool.name, err);
      throw err;
    }
  };

  return {
    executeTool,
    get,
    listTools,
    register,
    registerMany,
    unregister: name => tools.delete(normalizeToolName(name)),
  };
};
