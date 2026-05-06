import { ensureDebugUiRegistry as ensureSharedDebugUiRegistry } from './debug-ui-registry-utils.js';

const assignBridgeMethods = (appBridge, methods = {}) => {
  if (!appBridge || typeof appBridge !== 'object') return false;
  for (const [key, value] of Object.entries(methods || {})) {
    if (typeof value === 'undefined') continue;
    appBridge[key] = value;
  }
  return true;
};

export const registerPromptInjectionBridgeContract = (appBridge, methods = {}) => {
  return assignBridgeMethods(appBridge, methods);
};

export const registerPersonaBridgeContract = (appBridge, methods = {}) => {
  return assignBridgeMethods(appBridge, methods);
};

export const registerRoleWorldBridgeContract = (appBridge, {
  resolveRoleWorldBindings = null,
  handleWorldLifecycle = null,
  ...methods
} = {}) => {
  if (!appBridge || typeof appBridge !== 'object') return false;
  assignBridgeMethods(appBridge, methods);
  if (typeof appBridge.setRoleWorldResolver === 'function' && typeof resolveRoleWorldBindings === 'function') {
    appBridge.setRoleWorldResolver((sessionId, options = {}) => resolveRoleWorldBindings(sessionId, options));
  }
  if (typeof appBridge.setWorldLifecycleHandler === 'function' && typeof handleWorldLifecycle === 'function') {
    appBridge.setWorldLifecycleHandler(async (event = {}) => handleWorldLifecycle(event));
  }
  return true;
};

export const registerSharedSessionBridgeContract = (appBridge, methods = {}) => {
  return assignBridgeMethods(appBridge, methods);
};

export const registerRuntimeServiceBridgeContract = (appBridge, methods = {}) => {
  return assignBridgeMethods(appBridge, methods);
};

export const registerTurnCheckpointBridgeContract = (appBridge, methods = {}) => {
  return assignBridgeMethods(appBridge, methods);
};

export const registerMemoryUpdateBridgeContract = (appBridge, methods = {}) => {
  return assignBridgeMethods(appBridge, methods);
};

export const registerMessageActionBridgeContract = (appBridge, methods = {}) => {
  return assignBridgeMethods(appBridge, methods);
};

export const registerUiUtilityBridgeContract = (appBridge, methods = {}) => {
  return assignBridgeMethods(appBridge, methods);
};

export const ensureDebugUiRegistry = (appBridge) => {
  return ensureSharedDebugUiRegistry(appBridge);
};
