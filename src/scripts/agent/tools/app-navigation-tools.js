import {
  buildAppFeatureDoc,
  searchAppFeatures,
} from '../app-feature-catalog.js';

const trim = (value, fallback = '') => {
  const text = String(value ?? '').trim();
  return text || fallback;
};

const isPlainObject = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));

const clone = (value) => {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return Array.isArray(value) ? value.slice() : { ...value };
  }
};

export const APP_NAVIGATION_PANEL_IDS = Object.freeze([
  'agent-center',
  'config',
  'session',
  'session-config',
  'worldbook',
  'memory',
  'variables',
  'regex',
  'preset',
  'extensions',
  'settings',
]);

const normalizePanelId = (panel = '') => {
  const text = trim(panel).toLowerCase().replace(/_/g, '-');
  if (text === 'agent' || text === 'agentcenter' || text === 'agent-center') return 'agent-center';
  if (text === 'api' || text === 'model' || text === 'models' || text === 'config') return 'config';
  if (text === 'sessionconfig' || text === 'chat-config' || text === 'session-config') return 'session-config';
  if (text === 'world' || text === 'world-info' || text === 'worldbook') return 'worldbook';
  if (text === 'memory-template' || text === 'memory-center' || text === 'memory') return 'memory';
  if (text === 'variable' || text === 'variables') return 'variables';
  if (text === 'regex' || text === 'postprocess') return 'regex';
  if (text === 'friend' || text === 'contacts' || text === 'session') return 'session';
  if (text === 'preset' || text === 'prompt') return 'preset';
  if (text === 'extension' || text === 'extensions' || text === 'plugin') return 'extensions';
  if (text === 'settings' || text === 'general-settings') return 'settings';
  return text;
};

const invokePanelAction = async (actions = {}, panel = '', args = {}) => {
  const id = normalizePanelId(panel);
  const fn = actions[id];
  if (typeof fn !== 'function') {
    return {
      ok: false,
      opened: false,
      panel: id,
      reason: `unsupported panel: ${id || '-'}`,
    };
  }
  const result = await fn(isPlainObject(args) ? args : {});
  return {
    ok: result?.ok === false ? false : true,
    opened: result?.opened === false ? false : true,
    panel: id,
    result: clone(result),
  };
};

export const createAppNavigationAgentTools = ({
  actions = {},
  getCurrentState = () => ({}),
} = {}) => [
  {
    name: 'app.search_feature',
    title: 'Search APP features',
    description: 'Search the APP feature catalog by user wording.',
    source: 'maid-app-navigation',
    permissions: [],
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
      required: ['query'],
      additionalProperties: false,
      properties: {
        query: { type: 'string', minLength: 1, maxLength: 160 },
        limit: { type: 'integer', minimum: 1, maximum: 20 },
      },
    },
    execute: async (args = {}) => ({
      query: trim(args.query),
      features: searchAppFeatures(args.query, { limit: args.limit }),
    }),
    summarizeResult: result => `found ${Number(result?.features?.length || 0)} feature(s)`,
  },
  {
    name: 'app.read_feature_doc',
    title: 'Read APP feature doc',
    description: 'Read a concise feature document from the APP feature catalog.',
    source: 'maid-app-navigation',
    permissions: [],
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
      required: ['featureId'],
      additionalProperties: false,
      properties: {
        featureId: { type: 'string', minLength: 1, maxLength: 80 },
      },
    },
    execute: async (args = {}) => {
      const feature = buildAppFeatureDoc(args.featureId);
      if (!feature) return { ok: false, featureId: trim(args.featureId), reason: 'feature_not_found' };
      return { ok: true, feature };
    },
    summarizeResult: result => result?.ok === false ? 'feature doc not found' : `feature doc: ${trim(result?.feature?.id)}`,
  },
  {
    name: 'app.open_panel',
    title: 'Open APP panel',
    description: 'Open a safe APP panel such as config, Agent Center, worldbook, memory, variables, or regex.',
    source: 'maid-app-navigation',
    permissions: [],
    riskLevel: 'low',
    capabilities: {
      read: false,
      write: false,
      network: false,
      cost: 'none',
      undo: 'none',
      modelContext: 'none',
      confirmation: 'allow_once',
    },
    schema: {
      type: 'object',
      required: ['panel'],
      additionalProperties: false,
      properties: {
        panel: { type: 'string', minLength: 1, maxLength: 60 },
        tab: { type: 'string', maxLength: 40 },
        sessionId: { type: 'string', maxLength: 160 },
        focus: { type: 'string', maxLength: 80 },
      },
    },
    execute: async (args = {}) => invokePanelAction(actions, args.panel, args),
    summarizeResult: result => result?.opened ? `opened ${trim(result.panel, 'panel')}` : `open panel failed: ${trim(result?.reason, 'unsupported panel')}`,
  },
  {
    name: 'app.get_current_state',
    title: 'Get APP state',
    description: 'Read a concise snapshot of current APP state for assistant grounding.',
    source: 'maid-app-navigation',
    permissions: [],
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
      additionalProperties: false,
      properties: {},
    },
    execute: async () => {
      const state = await getCurrentState?.();
      return isPlainObject(state) ? clone(state) : {};
    },
    summarizeResult: result => `state page=${trim(result?.activePage || result?.page, '-')} session=${trim(result?.sessionId, '-')}`,
  },
];

export const registerAppNavigationAgentTools = (registry, deps = {}) => {
  const tools = createAppNavigationAgentTools(deps);
  if (!registry || typeof registry.registerMany !== 'function') return tools;
  registry.registerMany(tools);
  return tools;
};
