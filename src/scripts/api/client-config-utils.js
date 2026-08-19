import { hasVertexCredentialForMode } from './vertexai-config-utils.js';

export const canInitClient = (cfg) => {
  const config = cfg || {};
  const hasKey = typeof config.apiKey === 'string' && config.apiKey.trim().length > 0;
  if (config.provider === 'vertexai') {
    return hasVertexCredentialForMode(config);
  }
  return hasKey;
};
