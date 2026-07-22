export const MAID_ONBOARDING_FLOW_IDS = Object.freeze([
  'setup-api',
  'add-friend',
  'first-chat',
  'meet-maid',
]);

const trim = value => String(value || '').trim();

export const createGuideStartFlowTools = ({ startFlow = null } = {}) => [{
  name: 'guide.start_flow',
  title: 'Start built-in onboarding flow',
  description: 'Start a verified built-in step-by-step guide. When the user asks how to configure API, add a friend, send their first chat, or learn the maid/Agent Center, prefer this guide instead of operating the UI for them.',
  source: 'maid-onboarding',
  permissions: [],
  riskLevel: 'low',
  capabilities: {
    read: false,
    write: false,
    network: false,
    cost: 'none',
    undo: 'none',
    modelContext: 'allowlist',
    confirmation: 'allow_once',
  },
  schema: {
    type: 'object',
    required: ['flowId'],
    additionalProperties: false,
    properties: {
      flowId: { type: 'string', enum: MAID_ONBOARDING_FLOW_IDS },
    },
  },
  execute: async (args = {}) => {
    const flowId = trim(args.flowId);
    if (!MAID_ONBOARDING_FLOW_IDS.includes(flowId)) {
      return { ok: false, started: false, flowId, reason: 'unsupported_flow' };
    }
    if (typeof startFlow !== 'function') {
      return { ok: false, started: false, flowId, reason: 'guide_runtime_unavailable' };
    }
    const started = await startFlow(flowId);
    return started === false
      ? { ok: false, started: false, flowId, reason: 'guide_start_failed' }
      : { ok: true, started: true, flowId };
  },
  summarizeResult: result => result?.started
    ? `started onboarding flow ${trim(result.flowId)}`
    : `onboarding flow not started: ${trim(result?.reason)}`,
}];

export const registerGuideStartFlowTools = (registry, deps = {}) => {
  const tools = createGuideStartFlowTools(deps);
  if (registry && typeof registry.registerMany === 'function') registry.registerMany(tools);
  return tools;
};
