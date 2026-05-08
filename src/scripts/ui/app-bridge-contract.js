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
  runtimeService: 'runtime-service',
  turnCheckpoint: 'turn-checkpoint',
  memoryUpdate: 'memory-update',
  memoryStore: 'memory-store',
  messageAction: 'message-action',
  chatUi: 'chat-ui',
  uiUtility: 'ui-utility',
});

const DEFAULT_BRIDGE_CONTRACT_DOMAIN = 'app-bridge';
const DEFAULT_BRIDGE_CONTRACT_SOURCE = 'app-bridge-contract';

const isPlainObject = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));

const normalizeBridgeContractDomain = (domain) => {
  const normalized = String(domain || '').trim();
  return normalized || DEFAULT_BRIDGE_CONTRACT_DOMAIN;
};

const normalizeBridgeContractName = (name) => String(name || '').trim();

const normalizeBridgeContractEntry = (name, domain, metadata = {}) => {
  const normalizedName = normalizeBridgeContractName(name);
  const normalizedDomain = normalizeBridgeContractDomain(domain);
  const entry = isPlainObject(metadata) ? metadata : {};
  return {
    name: normalizedName,
    domain: normalizedDomain,
    kind: String(entry.kind || 'method').trim() || 'method',
    source: String(entry.source || DEFAULT_BRIDGE_CONTRACT_SOURCE).trim() || DEFAULT_BRIDGE_CONTRACT_SOURCE,
    ...(entry.bridgeField ? { bridgeField: String(entry.bridgeField).trim() } : {}),
  };
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
