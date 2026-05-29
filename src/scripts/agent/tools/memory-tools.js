const isPlainObject = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));

export const createMemoryAgentTools = ({
  memoryUpdateRuntime = null,
  getMemoryUpdateRuntime = null,
  previewMemoryActions = null,
  getPreviewMemoryActions = null,
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
  const resolvePreviewMemoryActions = () => {
    if (typeof previewMemoryActions === 'function') return previewMemoryActions;
    if (typeof getPreviewMemoryActions !== 'function') return null;
    try {
      const fn = getPreviewMemoryActions();
      return typeof fn === 'function' ? fn : null;
    } catch {
      return null;
    }
  };

  const tools = [
    {
      name: 'memory.update_after_chat',
      title: 'Update memory after chat',
      description: 'Queue the existing chat memory update runtime for a session.',
      source: 'memory-update-runtime',
      permissions: ['storage'],
      riskLevel: 'medium',
      capabilities: {
        read: true,
        write: true,
        network: false,
        cost: 'none',
        undo: 'rollback_snapshot',
        modelContext: 'none',
        confirmation: 'required',
      },
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
      capabilities: {
        read: false,
        write: true,
        network: false,
        cost: 'none',
        undo: 'none',
        modelContext: 'none',
        confirmation: 'required',
      },
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

  if (typeof previewMemoryActions === 'function' || typeof getPreviewMemoryActions === 'function') {
    tools.push({
      name: 'memory.preview_actions',
      title: 'Preview memory actions',
      description: 'Build a memory table diff and rollback preview without writing memory rows.',
      source: 'memory-table-action-preview',
      permissions: ['storage'],
      riskLevel: 'low',
      capabilities: {
        read: true,
        write: false,
        network: false,
        cost: 'none',
        undo: 'none',
        modelContext: 'allowlist',
        confirmation: 'allow_once',
      },
      schema: {
        type: 'object',
        required: ['sessionId', 'actions'],
        additionalProperties: false,
        properties: {
          sessionId: { type: 'string', minLength: 1 },
          isGroup: { type: 'boolean' },
          updateMode: { type: 'string', enum: ['full', 'summary', 'standard'] },
          actions: {
            type: 'array',
            items: { type: 'object' },
          },
          contextType: { type: 'string' },
          uiMode: { type: 'string' },
          useSharedGlobalScope: { type: 'boolean' },
        },
      },
      execute: async (args = {}) => {
        const preview = resolvePreviewMemoryActions();
        if (typeof preview !== 'function') {
          throw new Error('memory action preview runtime not available');
        }
        return preview({
          sessionId: String(args.sessionId || '').trim(),
          isGroup: args.isGroup === true,
          updateMode: String(args.updateMode || 'full').trim() || 'full',
          actions: Array.isArray(args.actions) ? args.actions : [],
          contextType: String(args.contextType || '').trim(),
          uiMode: String(args.uiMode || '').trim(),
          useSharedGlobalScope: args.useSharedGlobalScope === true,
        });
      },
      summarizeResult: result => `memory action preview: ${Number(result?.changed || 0)} change(s), ${Number(result?.skipped || 0)} skipped`,
    });
  }

  return tools;
};

export const registerMemoryAgentTools = (registry, deps = {}) => {
  const tools = createMemoryAgentTools(deps);
  if (!registry || typeof registry.registerMany !== 'function') return tools;
  registry.registerMany(tools);
  return tools;
};
