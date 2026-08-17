// Deterministic FC-first bridge smoke. No network or persistent writes.
(async () => {
  const bridge = window.appBridge;
  const actions = bridge?.debugUiRegistry?.actions;
  if (!bridge?.generate || !actions?.setPrivateChatProviderFcExperimentEnabled) {
    throw new Error('FC-first snapshot fallback smoke dependencies unavailable');
  }

  const { appSettings } = await import('/scripts/storage/app-settings.js');
  const previousFlag = actions.getPrivateChatProviderFcExperimentStatus?.()?.enabled === true;
  const previousResolveRuntime = bridge.resolveRequestRuntimeConfig;
  const previousSaveToHistory = bridge.saveToHistory;
  const previousLastRequest = bridge.lastRequest;
  const previousLastMemoryPlan = bridge.lastMemoryPlan;
  const previousLastPhoneFormatTransportPlan = bridge.lastPhoneFormatTransportPlan;
  const previousUsage = bridge.lastGenerationUsage;
  const previousSources = bridge.lastGenerationSources;
  const previousSettingsGet = appSettings.get;
  const providerCalls = [];
  let historyWrites = 0;
  let capturedRequest = null;
  let output = '';
  let errorCode = '';

  const config = {
    provider: 'deepseek',
    model: 'deepseek-v4-flash',
    baseUrl: 'https://api.deepseek.com/v1',
    stream: false,
    webSearchEnabled: false,
    maxRetries: 0,
  };
  const legacyRaw = [
    'MiPhone_start',
    'msg_start',
    '<群聊:FC-first回退测试群>',
    '<成员>测试甲</成员>',
    '<聊天内容>',
    '测试甲--本地回退成功--09:30',
    '</聊天内容>',
    '</群聊:FC-first回退测试群>',
    'msg_end',
    'MiPhone_end',
  ].join('\n');
  const messageText = messages => (Array.isArray(messages) ? messages : [])
    .map(message => typeof message?.content === 'string' ? message.content : '')
    .join('\n');

  try {
    actions.setPrivateChatProviderFcExperimentEnabled(true);
    appSettings.get = (...args) => ({
      ...previousSettingsGet.apply(appSettings, args),
      traditionalModelOutputProtocolEnabled: false,
      memoryAutoExtract: false,
    });
    bridge.resolveRequestRuntimeConfig = async () => ({
      config,
      client: {
        async chat(messages, options = {}) {
          const structured = Array.isArray(options?.tools) && options.tools.length > 0;
          providerCalls.push({ structured, text: messageText(messages) });
          return structured ? '' : legacyRaw;
        },
      },
    });
    bridge.saveToHistory = async () => {
      historyWrites += 1;
      return true;
    };

    output = await bridge.generate('请回复这条本地失败注入消息', {
      user: { name: '我' },
      character: { name: 'FC-first回退测试群' },
      session: {
        id: 'group:fc-first-snapshot-fallback',
        name: 'FC-first回退测试群',
        isGroup: true,
      },
      group: {
        id: 'group:fc-first-snapshot-fallback',
        name: 'FC-first回退测试群',
        members: ['contact:fc-first-a'],
        memberNames: ['测试甲'],
      },
      history: [],
      meta: {
        uiMode: 'chat',
        rawUserMessage: '请回复这条本地失败注入消息',
        appendUserToHistory: true,
        memoryStorageMode: 'none',
      },
    });
    capturedRequest = JSON.parse(JSON.stringify(bridge.lastRequest || null));
  } catch (error) {
    errorCode = String(error?.code || error?.name || error?.message || 'failed').slice(0, 120);
  } finally {
    bridge.resolveRequestRuntimeConfig = previousResolveRuntime;
    bridge.saveToHistory = previousSaveToHistory;
    bridge.lastRequest = previousLastRequest;
    bridge.lastMemoryPlan = previousLastMemoryPlan;
    bridge.lastPhoneFormatTransportPlan = previousLastPhoneFormatTransportPlan;
    bridge.lastGenerationUsage = previousUsage;
    bridge.lastGenerationSources = previousSources;
    appSettings.get = previousSettingsGet;
    actions.setPrivateChatProviderFcExperimentEnabled(previousFlag);
  }

  const transport = capturedRequest?.phoneReplyTransport || {};
  const first = providerCalls[0] || {};
  const second = providerCalls[1] || {};
  const checks = {
    noError: !errorCode,
    twoProviderCalls: providerCalls.length === 2,
    fcFirst: first.structured === true,
    legacySecond: second.structured === false,
    fcPromptHasNoTextProtocol: !/MiPhone_|msg_(?:start|end)/u.test(first.text || ''),
    fcPromptHasNoInternalAnchor: !/chat-semantic:/u.test(first.text || ''),
    fallbackHasLegacyProtocol: /MiPhone_start/u.test(second.text || '')
      && /msg_start/u.test(second.text || ''),
    fallbackHasNoInternalAnchor: !/chat-semantic:/u.test(second.text || ''),
    sameSnapshotRecorded: /^chat-semantic-v1:/u.test(String(transport.snapshotFingerprint || '')),
    lazyFallbackRecorded: transport.fallbackAssembly === 'lazy_legacy_from_snapshot',
    budgetNotRecomputed: transport.budgetRecomputed === false,
    actualModeRecorded: transport.effectiveMode === 'fc_fallback',
    stableFallbackReason: transport.fallbackReason === 'no_tool_call',
    oneHistoryWrite: historyWrites === 1,
    legacyResultReturned: output === legacyRaw,
    stateRestored: bridge.resolveRequestRuntimeConfig === previousResolveRuntime
      && bridge.saveToHistory === previousSaveToHistory
      && appSettings.get === previousSettingsGet
      && actions.getPrivateChatProviderFcExperimentStatus?.()?.enabled === previousFlag,
  };
  return {
    fixtureVersion: 'chat-fc-first-snapshot-fallback-v1',
    networkRequests: 0,
    persistentWrites: 0,
    providerCalls: providerCalls.length,
    historyWritesIntercepted: historyWrites,
    effectiveMode: String(transport.effectiveMode || ''),
    fallbackReason: String(transport.fallbackReason || ''),
    snapshotFingerprintPresent: /^chat-semantic-v1:/u.test(String(transport.snapshotFingerprint || '')),
    checks,
    pass: Object.values(checks).every(value => value === true),
  };
})()
