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
  getVisiblePanelSummary = null,
  readResource = null,
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
    name: 'app.read_visible_panel_summary',
    title: 'Read visible APP panel summary',
    description: 'Read a concise text summary of currently visible APP panels and active UI.',
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
      properties: {
        panel: { type: 'string', maxLength: 80 },
        maxTextLength: { type: 'integer', minimum: 120, maximum: 6000 },
      },
    },
    execute: async (args = {}) => {
      if (typeof getVisiblePanelSummary !== 'function') {
        return { ok: false, reason: 'visible_panel_summary_unavailable' };
      }
      const summary = await getVisiblePanelSummary(args);
      return isPlainObject(summary) ? clone(summary) : { ok: true, summary };
    },
    summarizeResult: result => result?.ok === false
      ? `visible panel summary failed: ${trim(result?.reason, 'unavailable')}`
      : `visible panel summary panels=${Number(result?.panels?.length || 0)}`,
  },
  {
    name: 'app.read_resource',
    title: 'Read APP resource',
    description: 'Read structured APP resources such as chat messages, worldbook settings, regex, memory, variables, presets, config, sessions, personas, or users.',
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
      required: ['resource'],
      additionalProperties: false,
      properties: {
        resource: { type: 'string', minLength: 1, maxLength: 80 },
        id: { type: 'string', maxLength: 200 },
        sessionId: { type: 'string', maxLength: 200 },
        sessionName: { type: 'string', maxLength: 200 },
        target: { type: 'string', maxLength: 200 },
        chatName: { type: 'string', maxLength: 200 },
        scope: { type: 'string', maxLength: 80 },
        include: {
          type: 'array',
          items: { type: 'string', maxLength: 80 },
          maxItems: 30,
        },
        query: { type: 'string', maxLength: 200 },
        limit: { type: 'integer', minimum: 1, maximum: 200 },
        maxTextLength: { type: 'integer', minimum: 120, maximum: 12000 },
      },
    },
    execute: async (args = {}) => {
      if (typeof readResource !== 'function') {
        return { ok: false, reason: 'resource_reader_unavailable', resource: trim(args.resource) };
      }
      const result = await readResource(args);
      return isPlainObject(result) ? clone(result) : { ok: true, resource: trim(args.resource), result };
    },
    summarizeResult: result => result?.ok === false
      ? `read resource failed: ${trim(result?.resource, '-')} ${trim(result?.reason, 'unknown')}`
      : `read resource ${trim(result?.resource, '-')}`,
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
