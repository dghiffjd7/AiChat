// Read-only endpoint metadata for the zero-cost J.5 candidate. No credential is returned.
(async () => {
  const bridge = window.appBridge;
  const profile = (bridge?.config?.getProfiles?.() || []).find(item => (
    String(item?.provider || '').trim().toLowerCase() === 'openrouter'
  ));
  if (!profile?.id) throw new Error('OpenRouter profile missing');
  const runtime = await bridge.config.getRuntimeConfigByProfileId(profile.id);
  const { LLMClient } = await import('/scripts/api/client.js');
  const provider = new LLMClient(runtime).provider;
  const model = String(window.__stageJ5OpenRouterModel || 'google/gemini-3.7-flash').trim();
  const path = model.split('/').map(part => encodeURIComponent(part)).join('/');
  const data = await provider.requestJson({
    url: `${provider.baseUrl}/models/${path}/endpoints`,
    method: 'GET',
    headers: provider.getHeaders(),
  });
  return {
    id: String(data?.data?.id || ''),
    endpoints: (Array.isArray(data?.data?.endpoints) ? data.data.endpoints : []).map(item => ({
      name: String(item?.name || ''),
      providerName: String(item?.provider_name || ''),
      tag: String(item?.tag || item?.provider_tag || ''),
      supportedParameters: item?.supported_parameters || [],
      promptPrice: String(item?.pricing?.prompt || ''),
      completionPrice: String(item?.pricing?.completion || ''),
    })),
    credentialRetained: false,
  };
})()
