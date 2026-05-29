export const createVariableAgentTools = ({
  previewVariableCommands = null,
  getPreviewVariableCommands = null,
} = {}) => {
  const resolvePreviewVariableCommands = () => {
    if (typeof previewVariableCommands === 'function') return previewVariableCommands;
    if (typeof getPreviewVariableCommands !== 'function') return null;
    try {
      const fn = getPreviewVariableCommands();
      return typeof fn === 'function' ? fn : null;
    } catch {
      return null;
    }
  };
  const tools = [];

  if (typeof previewVariableCommands === 'function' || typeof getPreviewVariableCommands === 'function') {
    tools.push({
      name: 'variable.preview_commands',
      title: 'Preview variable commands',
      description: 'Build a variable diff and rollback preview without writing variable state.',
      source: 'update-variable-preview',
      permissions: ['variables.read'],
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
        required: ['sessionId', 'commands'],
        additionalProperties: false,
        properties: {
          sessionId: { type: 'string', minLength: 1 },
          useGlobal: { type: 'boolean' },
          commands: {
            type: 'array',
            items: { type: 'object' },
          },
        },
      },
      execute: async (args = {}) => {
        const preview = resolvePreviewVariableCommands();
        if (typeof preview !== 'function') {
          throw new Error('variable command preview runtime not available');
        }
        return preview({
          sessionId: String(args.sessionId || '').trim(),
          useGlobal: args.useGlobal === true,
          commands: Array.isArray(args.commands) ? args.commands : [],
        });
      },
      summarizeResult: result => `variable command preview: ${Number(result?.changed || 0)} change(s), ${Number(result?.skipped?.length || 0)} skipped`,
    });
  }

  return tools;
};

export const registerVariableAgentTools = (registry, deps = {}) => {
  const tools = createVariableAgentTools(deps);
  if (!registry || typeof registry.registerMany !== 'function') return tools;
  registry.registerMany(tools);
  return tools;
};
