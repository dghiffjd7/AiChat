import { ensureDebugUiRegistry as ensureSharedDebugUiRegistry } from './debug-ui-registry-utils.js';

export const BRIDGE_CONTRACT_DOMAINS = Object.freeze({
  promptInjection: 'prompt-injection',
  promptProcessing: 'prompt-processing',
  persona: 'persona',
  sessionState: 'session-state',
  roleWorld: 'role-world',
  worldStore: 'world-store',
  worldSession: 'world-session',
  configRuntime: 'config-runtime',
  presetStore: 'preset-store',
  scriptRuntime: 'script-runtime',
  generation: 'generation',
  regexTransform: 'regex-transform',
  regexStore: 'regex-store',
  sharedSession: 'shared-session',
  variableRuntime: 'variable-runtime',
  runtimeService: 'runtime-service',
  turnCheckpoint: 'turn-checkpoint',
  memoryUpdate: 'memory-update',
  memoryStore: 'memory-store',
  messageAction: 'message-action',
  chatUi: 'chat-ui',
  uiUtility: 'ui-utility',
});

export const BRIDGE_CONTRACT_METHOD_METADATA = Object.freeze({
  [BRIDGE_CONTRACT_DOMAINS.variableRuntime]: {
    isVariableRuntimeEnabled: {
      params: ['sessionId?: string'],
      returns: 'boolean',
      sideEffects: [],
      tests: ['app-bridge-contract-tests.mjs', 'variable-runtime-policy-utils-tests.mjs'],
      status: 'covered',
    },
    setVariableRuntimeEnabled: {
      params: ['sessionId: string', 'enabled: boolean'],
      returns: 'variable runtime setting result',
      sideEffects: [
        'persists the current-session variable runtime policy',
        'dispatches chatapp-variable-runtime-changed when the value changes',
      ],
      tests: ['app-bridge-contract-tests.mjs', 'variable-runtime-policy-utils-tests.mjs'],
      status: 'covered',
    },
    initializeMvuVariables: {
      params: ['sessionId?: string', 'options?: { reason?: string }'],
      returns: 'MVU initialization result',
      sideEffects: [
        'fills missing current values from schema defaults',
        'backfills initial values for restored session variables',
        'emits MVU initialized lifecycle event when values changed',
      ],
      tests: [
        'app-bridge-contract-tests.mjs',
        'mvu-variable-initialization-tests.mjs',
      ],
      status: 'covered',
    },
    reconvertMvuVariables: {
      params: ['options?: { sessionId?: string, personaId?: string }'],
      returns: 'Promise<MVU recovery result>',
      sideEffects: [
        'loads the source character card',
        'refreshes variable schema defaults and initial values',
        'fills only missing current values',
      ],
      tests: [
        'app-bridge-contract-tests.mjs',
        'mvu-variable-recovery-tests.mjs',
      ],
      status: 'covered',
    },
  },
  [BRIDGE_CONTRACT_DOMAINS.generation]: {
    generate: {
      params: ['userMessage: string', 'context?: generation context'],
      returns: 'Promise<string> | AsyncGenerator<string>',
      sideEffects: [
        'initializes runtime when needed',
        'sets generation lock and abort state',
        'updates lastRequest diagnostics',
        'saves non-stream assistant replies to history',
      ],
      tests: [
        'app-bridge-contract-tests.mjs',
        'send-side-effect-utils-tests.mjs',
        'send-cancel-regenerate-integration.mjs',
      ],
      status: 'covered',
    },
    buildMessages: {
      params: ['userMessage: string', 'context?: prompt context'],
      returns: 'Provider message[]',
      sideEffects: [
        'resets prompt debug snapshots',
        'may update world and provider compatibility diagnostics',
      ],
      tests: [
        'app-bridge-contract-tests.mjs',
        'llm-context-builder-utils-tests.mjs',
        'summary-compaction-utils-tests.mjs',
      ],
      status: 'covered',
    },
    backgroundChat: {
      params: ['messages: Provider message[]', 'options?: generation overrides'],
      returns: 'Promise<string>',
      sideEffects: [
        'initializes runtime when needed',
        'calls provider client without main generation lock',
        'does not write chat history',
      ],
      tests: [
        'app-bridge-contract-tests.mjs',
        'summary-compaction-utils-tests.mjs',
        'moments-runtime-utils-tests.mjs',
      ],
      status: 'covered',
    },
    consumeLastGenerationUsage: {
      returns: 'Provider usage | null',
      sideEffects: ['clears the cached main-generation usage after reading'],
      tests: ['app-bridge-contract-tests.mjs', 'assistant-message-builder-utils-tests.mjs'],
      status: 'covered',
    },
    consumeLastGenerationSources: {
      returns: 'Web source[] | null',
      sideEffects: ['clears the cached main-generation sources after reading'],
      tests: ['app-bridge-contract-tests.mjs', 'web-search-runtime-tests.mjs'],
      status: 'covered',
    },
    finalizeChatStructuredEvidence: {
      params: ['payload: { requestId: string, committed: boolean }'],
      returns: 'Promise<structured evidence finalize result>',
      sideEffects: [
        'commits staged structured-route success evidence only after the APP transaction succeeds',
        'discards staged success evidence when committed is false',
      ],
      tests: [
        'app-bridge-contract-tests.mjs',
        'chat-structured-evidence-commit-runtime-tests.mjs',
      ],
      status: 'covered',
    },
    setWebSearchToolRuntime: {
      params: ['runtime: read-only web tool runtime | null'],
      returns: 'void',
      sideEffects: ['sets the allowlisted web.search/web.research fallback runtime'],
      tests: ['app-bridge-contract-tests.mjs', 'web-search-generation-client-tests.mjs'],
      status: 'covered',
    },
    getWebSearchToolRuntime: {
      returns: 'read-only web tool runtime | null',
      sideEffects: [],
      tests: ['app-bridge-contract-tests.mjs', 'ad-hoc-web-search-runtime-tests.mjs'],
      status: 'covered',
    },
  },
  [BRIDGE_CONTRACT_DOMAINS.sessionState]: {
    getActiveSessionId: {
      returns: 'string',
      tests: [
        'app-bridge-contract-tests.mjs',
        'session-enter-runtime-tests.mjs',
        'session-enter-lifecycle-integration.mjs',
      ],
      status: 'covered',
    },
    setActiveSession: {
      params: ['sessionId: string'],
      returns: 'void',
      sideEffects: [
        'updates activeSessionId',
        'updates current world ids',
        'syncs world regex bindings',
        'emits worldinfo-changed',
        'dispatches plugin/script session.changed',
      ],
      tests: [
        'app-bridge-contract-tests.mjs',
        'session-enter-runtime-tests.mjs',
        'session-enter-lifecycle-integration.mjs',
      ],
      status: 'covered',
    },
  },
  [BRIDGE_CONTRACT_DOMAINS.memoryUpdate]: {
    getLastMemoryUpdate: {
      params: ['sessionId: string'],
      returns: 'Memory update entry | null',
      tests: [
        'app-bridge-contract-tests.mjs',
        'memory-update-runtime-utils-tests.mjs',
        'memory-lifecycle-integration.mjs',
      ],
      status: 'covered',
    },
    setLastMemoryUpdate: {
      params: ['sessionId: string', 'entry: object | null'],
      returns: 'void',
      sideEffects: ['stores or clears last memory update entry scoped by sessionId'],
      tests: [
        'app-bridge-contract-tests.mjs',
        'memory-update-runtime-utils-tests.mjs',
        'memory-lifecycle-integration.mjs',
      ],
      status: 'covered',
    },
    getLastMemoryPlan: {
      returns: 'Memory prompt plan | null',
      tests: [
        'app-bridge-contract-tests.mjs',
        'memory-update-runtime-utils-tests.mjs',
        'memory-lifecycle-integration.mjs',
      ],
      status: 'covered',
    },
    setLastMemoryPlan: {
      params: ['plan: object | null'],
      returns: 'void',
      sideEffects: ['stores or clears latest memory prompt plan'],
      tests: [
        'app-bridge-contract-tests.mjs',
        'memory-update-runtime-utils-tests.mjs',
        'memory-lifecycle-integration.mjs',
      ],
      status: 'covered',
    },
    buildMemoryPromptPlan: {
      params: ['context: generation context'],
      returns: 'Promise<Memory prompt plan | null>',
      sideEffects: ['reads memory table/template stores and settings'],
      tests: [
        'app-bridge-contract-tests.mjs',
        'memory-update-runtime-utils-tests.mjs',
        'memory-lifecycle-integration.mjs',
      ],
      status: 'covered',
    },
    rollbackLastMemoryUpdate: {
      params: ['sessionId: string'],
      returns: 'Promise<boolean>',
      sideEffects: [
        'restores memory rows from rollback snapshots or action history',
        'notifies memory rollback UI when rows changed',
      ],
      tests: [
        'app-bridge-contract-tests.mjs',
        'memory-update-runtime-utils-tests.mjs',
        'memory-lifecycle-integration.mjs',
      ],
      status: 'covered',
    },
  },
});

const DEFAULT_BRIDGE_CONTRACT_DOMAIN = 'app-bridge';
const DEFAULT_BRIDGE_CONTRACT_SOURCE = 'app-bridge-contract';

const isPlainObject = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));

const normalizeStringList = (value) => {
  const raw = Array.isArray(value) ? value : (value ? [value] : []);
  return raw.map(item => String(item || '').trim()).filter(Boolean);
};

const normalizeBridgeContractDomain = (domain) => {
  const normalized = String(domain || '').trim();
  return normalized || DEFAULT_BRIDGE_CONTRACT_DOMAIN;
};

const normalizeBridgeContractName = (name) => String(name || '').trim();

const getDefaultBridgeContractMetadata = (name, domain) => (
  BRIDGE_CONTRACT_METHOD_METADATA[domain]?.[name] || {}
);

const normalizeBridgeContractEntry = (name, domain, metadata = {}) => {
  const normalizedName = normalizeBridgeContractName(name);
  const normalizedDomain = normalizeBridgeContractDomain(domain);
  const defaults = getDefaultBridgeContractMetadata(normalizedName, normalizedDomain);
  const entry = {
    ...(isPlainObject(defaults) ? defaults : {}),
    ...(isPlainObject(metadata) ? metadata : {}),
  };
  const contract = {
    name: normalizedName,
    domain: normalizedDomain,
    kind: String(entry.kind || 'method').trim() || 'method',
    source: String(entry.source || DEFAULT_BRIDGE_CONTRACT_SOURCE).trim() || DEFAULT_BRIDGE_CONTRACT_SOURCE,
    ...(entry.bridgeField ? { bridgeField: String(entry.bridgeField).trim() } : {}),
  };
  const params = normalizeStringList(entry.params);
  const sideEffects = normalizeStringList(entry.sideEffects);
  const tests = normalizeStringList(entry.tests);
  const callers = normalizeStringList(entry.callers);
  const returns = String(entry.returns || '').trim();
  const status = String(entry.status || '').trim();
  if (params.length) contract.params = params;
  if (returns) contract.returns = returns;
  if (sideEffects.length) contract.sideEffects = sideEffects;
  if (tests.length) contract.tests = tests;
  if (callers.length) contract.callers = callers;
  if (status) contract.status = status;
  return contract;
};

export const ensureBridgeContractRegistry = (appBridge) => {
  if (!appBridge || typeof appBridge !== 'object') return null;
  if (!isPlainObject(appBridge.bridgeContractRegistry)) {
    appBridge.bridgeContractRegistry = { version: 1, contracts: {}, domains: {} };
  }
  const registry = appBridge.bridgeContractRegistry;
  registry.version = 1;
  if (!isPlainObject(registry.contracts)) registry.contracts = {};
  if (!isPlainObject(registry.domains)) registry.domains = {};
  return registry;
};

export const getBridgeContractRegistry = (appBridge) => {
  if (!appBridge || typeof appBridge !== 'object') return null;
  if (!isPlainObject(appBridge.bridgeContractRegistry)) return null;
  return ensureBridgeContractRegistry(appBridge);
};

export const registerBridgeContractMetadata = (appBridge, domain, entries = {}) => {
  const registry = ensureBridgeContractRegistry(appBridge);
  if (!registry) return false;
  const normalizedDomain = normalizeBridgeContractDomain(domain);
  const entryMap = Array.isArray(entries)
    ? Object.fromEntries(entries.map(name => [name, {}]))
    : entries;
  for (const [name, metadata] of Object.entries(entryMap || {})) {
    const normalizedName = normalizeBridgeContractName(name);
    if (!normalizedName) continue;
    const previousDomain = registry.contracts[normalizedName]?.domain;
    if (previousDomain && previousDomain !== normalizedDomain && registry.domains[previousDomain]) {
      delete registry.domains[previousDomain][normalizedName];
    }
    const contract = normalizeBridgeContractEntry(normalizedName, normalizedDomain, metadata);
    registry.contracts[normalizedName] = contract;
    if (!isPlainObject(registry.domains[normalizedDomain])) registry.domains[normalizedDomain] = {};
    registry.domains[normalizedDomain][normalizedName] = true;
  }
  return true;
};

const assignBridgeMethods = (appBridge, methods = {}, domain = DEFAULT_BRIDGE_CONTRACT_DOMAIN) => {
  if (!appBridge || typeof appBridge !== 'object') return false;
  const assignedNames = [];
  for (const [key, value] of Object.entries(methods || {})) {
    if (typeof value === 'undefined') continue;
    appBridge[key] = value;
    assignedNames.push(key);
  }
  if (assignedNames.length > 0) registerBridgeContractMetadata(appBridge, domain, assignedNames);
  return true;
};

export const registerPromptInjectionBridgeContract = (appBridge, methods = {}) => {
  return assignBridgeMethods(appBridge, methods, BRIDGE_CONTRACT_DOMAINS.promptInjection);
};

export const registerPromptProcessingBridgeContract = (appBridge, methods = {}) => {
  return assignBridgeMethods(appBridge, methods, BRIDGE_CONTRACT_DOMAINS.promptProcessing);
};

export const registerPersonaBridgeContract = (appBridge, methods = {}) => {
  return assignBridgeMethods(appBridge, methods, BRIDGE_CONTRACT_DOMAINS.persona);
};

export const registerSessionStateBridgeContract = (appBridge, methods = {}) => {
  return assignBridgeMethods(appBridge, methods, BRIDGE_CONTRACT_DOMAINS.sessionState);
};

export const registerRoleWorldBridgeContract = (appBridge, {
  resolveRoleWorldBindings = null,
  handleWorldLifecycle = null,
  ...methods
} = {}) => {
  if (!appBridge || typeof appBridge !== 'object') return false;
  assignBridgeMethods(appBridge, methods, BRIDGE_CONTRACT_DOMAINS.roleWorld);
  if (typeof appBridge.setRoleWorldResolver === 'function' && typeof resolveRoleWorldBindings === 'function') {
    appBridge.setRoleWorldResolver((sessionId, options = {}) => resolveRoleWorldBindings(sessionId, options));
    registerBridgeContractMetadata(appBridge, BRIDGE_CONTRACT_DOMAINS.roleWorld, {
      resolveRoleWorldBindings: { kind: 'resolver', bridgeField: 'setRoleWorldResolver' },
    });
  }
  if (typeof appBridge.setWorldLifecycleHandler === 'function' && typeof handleWorldLifecycle === 'function') {
    appBridge.setWorldLifecycleHandler(async (event = {}) => handleWorldLifecycle(event));
    registerBridgeContractMetadata(appBridge, BRIDGE_CONTRACT_DOMAINS.roleWorld, {
      handleWorldLifecycle: { kind: 'lifecycle-handler', bridgeField: 'setWorldLifecycleHandler' },
    });
  }
  return true;
};

export const registerWorldStoreBridgeContract = (appBridge, methods = {}) => {
  return assignBridgeMethods(appBridge, methods, BRIDGE_CONTRACT_DOMAINS.worldStore);
};

export const registerWorldSessionBridgeContract = (appBridge, methods = {}) => {
  return assignBridgeMethods(appBridge, methods, BRIDGE_CONTRACT_DOMAINS.worldSession);
};

export const registerConfigRuntimeBridgeContract = (appBridge, methods = {}) => {
  return assignBridgeMethods(appBridge, methods, BRIDGE_CONTRACT_DOMAINS.configRuntime);
};

export const registerPresetStoreBridgeContract = (appBridge, methods = {}) => {
  return assignBridgeMethods(appBridge, methods, BRIDGE_CONTRACT_DOMAINS.presetStore);
};

export const registerScriptRuntimeBridgeContract = (appBridge, methods = {}) => {
  return assignBridgeMethods(appBridge, methods, BRIDGE_CONTRACT_DOMAINS.scriptRuntime);
};

export const registerGenerationBridgeContract = (appBridge, methods = {}) => {
  return assignBridgeMethods(appBridge, methods, BRIDGE_CONTRACT_DOMAINS.generation);
};

export const registerRegexTransformBridgeContract = (appBridge, methods = {}) => {
  return assignBridgeMethods(appBridge, methods, BRIDGE_CONTRACT_DOMAINS.regexTransform);
};

export const registerRegexStoreBridgeContract = (appBridge, methods = {}) => {
  return assignBridgeMethods(appBridge, methods, BRIDGE_CONTRACT_DOMAINS.regexStore);
};

export const registerSharedSessionBridgeContract = (appBridge, methods = {}) => {
  return assignBridgeMethods(appBridge, methods, BRIDGE_CONTRACT_DOMAINS.sharedSession);
};

export const registerVariableRuntimeBridgeContract = (appBridge, methods = {}) => {
  return assignBridgeMethods(appBridge, methods, BRIDGE_CONTRACT_DOMAINS.variableRuntime);
};

export const registerRuntimeServiceBridgeContract = (appBridge, methods = {}) => {
  return assignBridgeMethods(appBridge, methods, BRIDGE_CONTRACT_DOMAINS.runtimeService);
};

export const registerTurnCheckpointBridgeContract = (appBridge, methods = {}) => {
  return assignBridgeMethods(appBridge, methods, BRIDGE_CONTRACT_DOMAINS.turnCheckpoint);
};

export const registerMemoryUpdateBridgeContract = (appBridge, methods = {}) => {
  return assignBridgeMethods(appBridge, methods, BRIDGE_CONTRACT_DOMAINS.memoryUpdate);
};

export const registerMemoryStoreBridgeContract = (appBridge, methods = {}) => {
  return assignBridgeMethods(appBridge, methods, BRIDGE_CONTRACT_DOMAINS.memoryStore);
};

export const registerMessageActionBridgeContract = (appBridge, methods = {}) => {
  return assignBridgeMethods(appBridge, methods, BRIDGE_CONTRACT_DOMAINS.messageAction);
};

export const registerChatUiBridgeContract = (appBridge, methods = {}) => {
  return assignBridgeMethods(appBridge, methods, BRIDGE_CONTRACT_DOMAINS.chatUi);
};

export const registerUiUtilityBridgeContract = (appBridge, methods = {}) => {
  return assignBridgeMethods(appBridge, methods, BRIDGE_CONTRACT_DOMAINS.uiUtility);
};

export const ensureDebugUiRegistry = (appBridge) => {
  return ensureSharedDebugUiRegistry(appBridge);
};
