export const canInitClient = (cfg) => {
  const config = cfg || {};
  const hasKey = typeof config.apiKey === 'string' && config.apiKey.trim().length > 0;
  const hasVertexSa =
    config.provider === 'vertexai' &&
    typeof config.vertexaiServiceAccount === 'string' &&
    config.vertexaiServiceAccount.trim().length > 0;
  return hasKey || hasVertexSa;
};
