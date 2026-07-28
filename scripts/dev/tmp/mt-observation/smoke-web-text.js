(async () => {
  const registry = window.appBridge?.debugUiRegistry?.stores?.agentToolRegistry;
  if (!registry?.executeTool) {
    return { pass: false, reason: 'web_tools_missing' };
  }
  const query = 'WebView2 remote debugging port';
  const context = {
    source: 'dev_smoke',
    requestPermission: () => ({ decision: 'allow' }),
  };
  const searchOutput = await registry.executeTool('web.search', { query, limit: 3 }, context);
  const researchOutput = await registry.executeTool('web.research', {
    query,
    limit: 2,
    fetchTop: 1,
    maxTextLength: 1200,
  }, context);
  const search = searchOutput?.result || {};
  const research = researchOutput?.result || {};
  const compact = result => ({
    ok: result?.ok === true,
    provider: result?.provider || '',
    requestedProvider: result?.requestedProvider || '',
    attemptedProviders: result?.attemptedProviders || [],
    providerOutcomes: result?.providerOutcomes || [],
    results: (result?.results || []).map(item => ({
      title: String(item?.title || '').slice(0, 160),
      url: String(item?.url || '').slice(0, 500),
      source: item?.source || '',
    })),
    documents: (result?.documents || []).map(item => ({
      ok: item?.ok === true,
      title: String(item?.title || '').slice(0, 160),
      url: String(item?.url || '').slice(0, 500),
      textLength: String(item?.text || '').length,
      reason: String(item?.reason || '').slice(0, 160),
    })),
    message: String(result?.message || '').slice(0, 200),
  });
  return {
    pass: search?.ok === true
      && search?.provider === 'bing_rss'
      && search?.results?.length > 0
      && research?.ok === true
      && research?.results?.length > 0,
    search: compact(search),
    research: compact(research),
  };
})()
