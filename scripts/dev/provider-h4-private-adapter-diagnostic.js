// One-request Stage H.4 private-adapter diagnostic. It performs no writes and
// returns validation codes and protocol enum values only, never model content.
(async () => {
  const bridge = window.appBridge;
  const [{ LLMClient }, privateFc, { createProviderToolCallDeltaAccumulator }] = await Promise.all([
    import('/scripts/api/client.js'),
    import('/scripts/ui/chat/private-chat-provider-fc.js'),
    import('/scripts/agent/provider-tool-call-delta-adapter.js'),
  ]);
  const trim = value => String(value ?? '').trim();
  const providerFilter = trim(window.__stageH4ProviderFilter).toLowerCase();
  const targets = {
    anthropic: { profileName: 'Claude', providers: ['anthropic'] },
    openai: { profileName: 'oai', providers: ['openai'] },
    gemini: { profileName: '默认', providers: ['makersuite', 'gemini'] },
  };
  const targetProvider = targets[providerFilter];
  if (!targetProvider) throw new Error('Set __stageH4ProviderFilter first');
  const profile = (bridge?.config?.getProfiles?.() || []).find(item => (
    trim(item?.name) === targetProvider.profileName
    && targetProvider.providers.includes(trim(item?.provider).toLowerCase())
  ));
  if (!profile?.id) throw new Error(`${providerFilter} profile missing`);
  const runtime = await bridge.config.getRuntimeConfigByProfileId(profile.id);
  const rawClient = new LLMClient({ ...runtime, stream: true, webSearchEnabled: false });
  const tapped = createProviderToolCallDeltaAccumulator({
    provider: runtime.provider,
    model: runtime.model,
  });
  const structures = [];
  const captureStructures = (data, meta = {}) => {
    const next = tapped.push(data, {
      provider: meta.provider || runtime.provider,
      model: meta.model || runtime.model,
    });
    next.completed.forEach((call) => {
      const messages = Array.isArray(call?.arguments?.messages) ? call.arguments.messages : [];
      structures.push({
        topLevelKeys: call?.arguments && typeof call.arguments === 'object'
          ? Object.keys(call.arguments).sort()
          : [],
        messages: messages.slice(0, 12).map(message => ({
          keys: message && typeof message === 'object' ? Object.keys(message).sort() : [],
          type: typeof message?.type === 'string' ? message.type.slice(0, 40) : null,
          artistPresent: Boolean(message && Object.hasOwn(message, 'artist')),
          artistType: typeof message?.artist,
          artistNonEmpty: String(message?.artist ?? '').trim().length > 0,
        })),
      });
    });
  };
  const client = {
    chat: (messages, options = {}) => rawClient.chat(messages, {
      ...options,
      onProviderToolCallDelta: (data, meta = {}) => {
        captureStructures(data, meta);
        options.onProviderToolCallDelta?.(data, meta);
      },
    }),
    async *streamChat(messages, options = {}) {
      yield* rawClient.streamChat(messages, {
        ...options,
        onProviderToolCallDelta: (data, meta = {}) => {
          captureStructures(data, meta);
          options.onProviderToolCallDelta?.(data, meta);
        },
      });
    },
  };
  const allowedItemTypes = ['text', 'sticker', 'voice', 'transfer', 'music', 'image'];
  const allowedStickerKeywords = ['收到', '晚安抱抱'];
  const instruction = privateFc.buildPrivateChatStructuredTransportInstruction({
    allowedItemTypes,
    allowedStickerKeywords,
  });
  const preview = { updates: 0, disposed: false, outcome: '' };
  try {
    const result = await privateFc.runPrivateChatProviderFcAttempt({
      client,
      config: runtime,
      messages: [
        { role: 'system', content: instruction },
        { role: 'user', content: '只发送一条简短的 text 文字消息。' },
      ],
      context: {
        uiMode: 'chat',
        surface: 'private_chat',
        responseTarget: 'assistant',
        usesBuiltinFormat: true,
        usesDefaultPreset: true,
        compatibilityModeEnabled: false,
        protocolParserEnabled: true,
        hasUnsupportedSideEffects: false,
        assistantContinuation: false,
        webSearchEnabled: false,
        hasProviderTools: false,
        hasAssistantPrefill: false,
        formatProfileEnabled: false,
      },
      target: {
        sessionId: 'contact:h4-private-diagnostic',
        targetName: '测试联系人',
        speakerId: 'contact:h4-private-diagnostic',
        speakerName: '测试联系人',
        userName: '我',
      },
      allowedItemTypes,
      allowedStickerKeywords,
      maxTokens: 400,
      streamPreviewEnabled: true,
      onStructuredPreview: event => {
        if (event?.phase === 'update') preview.updates += 1;
        if (event?.phase === 'dispose') {
          preview.disposed = true;
          preview.outcome = trim(event?.outcome);
        }
      },
    });
    return {
      ok: result?.ok === true,
      provider: trim(runtime?.provider),
      model: trim(runtime?.model),
      reason: trim(result?.reason),
      validationErrors: Array.isArray(result?.validationErrors)
        ? result.validationErrors.slice(0, 12).map(value => trim(value).slice(0, 80))
        : [],
      toolCallCount: Number(result?.diagnostics?.toolCallCount || 0),
      responseChars: Number(result?.diagnostics?.responseChars || 0),
      itemTypes: Array.isArray(result?.ir?.items)
        ? result.ir.items.map(item => trim(item?.type).slice(0, 40))
        : [],
      structures,
      preview,
      persistentWrites: 0,
      rawContentRetained: false,
      argumentContentRetained: false,
    };
  } catch (error) {
    return {
      ok: false,
      provider: trim(runtime?.provider),
      model: trim(runtime?.model),
      reason: trim(error?.code || error?.name, 'request_failed').slice(0, 80),
      validationErrors: [],
      persistentWrites: 0,
      rawContentRetained: false,
      argumentContentRetained: false,
    };
  } finally {
    tapped.clear();
  }
})()
