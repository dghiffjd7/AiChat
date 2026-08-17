// Zero-inference OpenCode Go catalog snapshot for the staged FC matrix runner.
(async () => {
  const bridge = window.appBridge;
  if (!bridge?.config) throw new Error('OpenCode FC matrix requires an initialized app bridge');
  const [
    { LLMClient },
    { BUNDLED_CHAT_FC_CAPABILITY_CATALOG },
    { isOpenCodeGoChatCompletionsModel, OPENCODE_GO_BASE_URL },
  ] = await Promise.all([
    import('/scripts/api/client.js'),
    import('/scripts/agent/chat-fc-capability-catalog.js'),
    import('/scripts/api/providers/opencode.js'),
  ]);
  const trim = value => String(value ?? '').trim();
  const profiles = bridge.config.getProfiles?.() || [];
  const profile = profiles.find(item => trim(item?.provider).toLowerCase() === 'opencode')
    || profiles.find(item => (
      trim(item?.provider).toLowerCase() === 'custom'
      && trim(item?.name).toLowerCase() === 'open'
    ));
  if (!profile?.id) throw new Error('OpenCode or legacy open profile missing');
  const sourceRuntime = await bridge.config.getRuntimeConfigByProfileId(profile.id);
  if (!trim(sourceRuntime?.apiKey)) throw new Error('OpenCode API key missing');
  const runtime = {
    ...sourceRuntime,
    provider: 'opencode',
    baseUrl: OPENCODE_GO_BASE_URL,
    connectionMode: 'direct',
    proxyBaseUrl: '',
    webSearchEnabled: false,
  };
  const client = new LLMClient(runtime);
  const data = await client.provider.requestJson({
    url: `${client.provider.baseUrl}/models`,
    method: 'GET',
    headers: client.provider.getHeaders(),
  });
  const rows = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
  const catalogModels = [...new Set(rows
    .map(item => trim(item?.id || item?.name || item).toLowerCase())
    .filter(Boolean))]
    .sort();
  const compatibleModels = catalogModels.filter(isOpenCodeGoChatCompletionsModel);
  const bundledModels = (BUNDLED_CHAT_FC_CAPABILITY_CATALOG.entries || [])
    .filter(entry => (
      entry?.identity?.providerId === 'opencode'
      && entry?.identity?.endpointClass === 'official_opencode_go_chat_completions'
    ))
    .map(entry => trim(entry?.identity?.modelId).toLowerCase())
    .filter(Boolean)
    .sort();
  return {
    fixtureVersion: 'opencode-fc-matrix-catalog-v1',
    configuredFrom: trim(profile.provider).toLowerCase(),
    provider: runtime.provider,
    endpointClass: 'official_opencode_go_chat_completions',
    catalogModelCount: catalogModels.length,
    compatibleModelCount: compatibleModels.length,
    catalogModels,
    compatibleModels,
    bundledRevision: Number(BUNDLED_CHAT_FC_CAPABILITY_CATALOG.revision || 0),
    bundledModels,
    inferenceCallsMade: 0,
    credentialsRetained: false,
  };
})()
