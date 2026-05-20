const isPlainObject = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));

export const createMemoryAgentTools = ({
  memoryUpdateRuntime = null,
  getMemoryUpdateRuntime = null,
} = {}) => {
  const resolveRuntime = () => {
    if (memoryUpdateRuntime && typeof memoryUpdateRuntime === 'object') return memoryUpdateRuntime;
    if (typeof getMemoryUpdateRuntime !== 'function') return null;
    try {
      const runtime = getMemoryUpdateRuntime();
      return runtime && typeof runtime === 'object' ? runtime : null;
    } catch {
      return null;
    }
  };

  return [
    {
      name: 'memory.update_after_chat',
      title: 'Update memory after chat',
      description: 'Queue the existing chat memory update runtime for a session.',
      source: 'memory-update-runtime',
      permissions: ['storage'],
      riskLevel: 'medium',
      schema: {
        type: 'object',
        required: ['sessionId'],
        additionalProperties: false,
        properties: {
          sessionId: { type: 'string', minLength: 1 },
          isGroup: { type: 'boolean' },
          baseContext: { type: 'object' },
          checkpointMessageId: { type: 'string' },
        },
      },
      execute: async (args = {}) => {
        const runtime = resolveRuntime();
        if (!runtime || typeof runtime.runMemoryUpdateAfterChat !== 'function') {
          throw new Error('memory update runtime not available');
        }
        const sessionId = String(args.sessionId || '').trim();
        const checkpointMessageId = String(args.checkpointMessageId || '').trim();
        await runtime.runMemoryUpdateAfterChat(
          sessionId,
          args.isGroup === true,
          isPlainObject(args.baseContext) ? args.baseContext : {},
          { checkpointMessageId },
        );
        return {
          queued: true,
          sessionId,
          checkpointMessageId,
        };
      },
      summarizeResult: result => `memory update queued for ${String(result?.sessionId || '').trim()}`,
    },
    {
      name: 'memory.abort_update',
      title: 'Abort memory update',
      description: 'Abort the running memory update task for a session when supported.',
      source: 'memory-update-runtime',
      permissions: ['storage'],
      riskLevel: 'medium',
      schema: {
        type: 'object',
        required: ['sessionId'],
        additionalProperties: false,
        properties: {
          sessionId: { type: 'string', minLength: 1 },
        },
      },
      execute: async (args = {}) => {
        const runtime = resolveRuntime();
        if (!runtime || typeof runtime.abortMemoryUpdate !== 'function') {
          throw new Error('memory update abort not available');
        }
        const sessionId = String(args.sessionId || '').trim();
        runtime.abortMemoryUpdate(sessionId);
        return {
          aborted: true,
          sessionId,
        };
      },
      summarizeResult: result => `memory update abort requested for ${String(result?.sessionId || '').trim()}`,
    },
  ];
};

export const registerMemoryAgentTools = (registry, deps = {}) => {
  const tools = createMemoryAgentTools(deps);
  if (!registry || typeof registry.registerMany !== 'function') return tools;
  registry.registerMany(tools);
  return tools;
};
