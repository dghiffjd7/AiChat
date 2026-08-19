export const VERTEX_AUTH_MODE_SERVICE_ACCOUNT = 'service_account';
export const VERTEX_AUTH_MODE_EXPRESS = 'express';

export const normalizeVertexAuthMode = (value, config = {}) => {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === VERTEX_AUTH_MODE_EXPRESS || raw === 'api_key') return VERTEX_AUTH_MODE_EXPRESS;
  if (raw === VERTEX_AUTH_MODE_SERVICE_ACCOUNT || raw === 'full') return VERTEX_AUTH_MODE_SERVICE_ACCOUNT;
  if (String(config?.vertexaiServiceAccount || '').trim()) return VERTEX_AUTH_MODE_SERVICE_ACCOUNT;
  if (String(config?.vertexaiProjectId || '').trim()) return VERTEX_AUTH_MODE_SERVICE_ACCOUNT;
  if (String(config?.apiKey || '').trim() || config?.activeKeyId) return VERTEX_AUTH_MODE_EXPRESS;
  return VERTEX_AUTH_MODE_SERVICE_ACCOUNT;
};

export const hasVertexCredentialForMode = (config = {}) => {
  const mode = normalizeVertexAuthMode(config.vertexaiAuthMode, config);
  if (mode === VERTEX_AUTH_MODE_EXPRESS) return Boolean(String(config.apiKey || '').trim());
  return Boolean(String(config.vertexaiServiceAccount || '').trim());
};
