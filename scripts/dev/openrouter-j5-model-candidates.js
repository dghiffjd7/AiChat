// Read-only OpenRouter catalog probe. Returns only public model metadata and never exposes credentials.
(async () => {
  const bridge = window.appBridge;
  const profile = (bridge?.config?.getProfiles?.() || []).find(item => (
    String(item?.provider || '').trim().toLowerCase() === 'openrouter'
  ));
  if (!profile?.id) throw new Error('OpenRouter profile missing');
  const runtime = await bridge.config.getRuntimeConfigByProfileId(profile.id);
  const { LLMClient } = await import('/scripts/api/client.js');
  const client = new LLMClient({ ...runtime, webSearchEnabled: false });
  const provider = client.provider;
  const data = await provider.requestJson({
    url: `${provider.baseUrl}/models?supported_parameters=tools,tool_choice`,
    method: 'GET',
    headers: provider.getHeaders(),
  });
  const rows = (Array.isArray(data?.data) ? data.data : [])
    .filter(item => {
      const params = Array.isArray(item?.supported_parameters) ? item.supported_parameters : [];
      return params.includes('tools') && params.includes('tool_choice');
    })
    .map(item => ({
      id: String(item?.id || '').trim(),
      canonicalSlug: String(item?.canonical_slug || '').trim(),
      free: String(item?.id || '').includes(':free'),
      promptPrice: String(item?.pricing?.prompt || ''),
      completionPrice: String(item?.pricing?.completion || ''),
      supportedParameters: item.supported_parameters,
    }))
    .filter(item => item.id)
    .sort((a, b) => Number(b.free) - Number(a.free) || a.id.localeCompare(b.id));
  const query = String(window.__stageJ5OpenRouterQuery || 'gemini-3.7').trim().toLowerCase();
  return {
    total: rows.length,
    free: rows.filter(item => item.free).slice(0, 30),
    paidSample: rows.filter(item => !item.free).slice(0, 10),
    matches: query ? rows.filter(item => item.id.toLowerCase().includes(query)).slice(0, 30) : [],
    credentialRetained: false,
  };
})()
