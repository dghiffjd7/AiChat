// Manual Stage G private-message fixture. Run through app-eval against an open Windows dev WebView.
// It performs six paid, non-streaming, no-write calls and retains message types only.
(async () => {
  const bridge = window.appBridge;
  if (!bridge?.backgroundChat || !bridge?.config) {
    throw new Error('Stage G private special-message smoke requires an initialized app bridge');
  }
  const [{ runPrivateChatProviderFcAttempt }, { validateBuiltinPhoneFormat }] = await Promise.all([
    import('/scripts/ui/chat/private-chat-provider-fc.js'),
    import('/scripts/utils/builtin-phone-format-contract.js'),
  ]);
  const profiles = bridge.config.getProfiles?.() || [];
  const activeId = String(bridge.config.getActiveProfileId?.() || '').trim();
  const profile = profiles.find(item => (
    String(item?.id || '').trim() === activeId
    && String(item?.provider || '').trim().toLowerCase() === 'deepseek'
    && String(item?.model || '').trim().toLowerCase() === 'deepseek-v4-flash'
  )) || profiles.find(item => (
    String(item?.provider || '').trim().toLowerCase() === 'deepseek'
    && String(item?.model || '').trim().toLowerCase() === 'deepseek-v4-flash'
  ));
  if (!profile?.id) throw new Error('Stage G requires an official deepseek-v4-flash profile');
  const runtime = await bridge.config.getRuntimeConfigByProfileId(profile.id);
  if (!runtime) throw new Error('Stage G could not resolve the DeepSeek runtime profile');

  const allowedItemTypes = ['text', 'sticker', 'voice', 'transfer', 'music', 'image'];
  const allowedStickerKeywords = ['收到', '晚安抱抱'];
  const fixtures = [
    { expectedType: 'text', prompt: '请用 text 类型发一条简短文字，内容是你已经知道了。' },
    { expectedType: 'sticker', prompt: '只发一条 sticker 类型消息，贴图必须选“收到”。' },
    { expectedType: 'voice', prompt: '只发一条 voice 类型消息，用一句很短的语音说晚安。' },
    { expectedType: 'transfer', prompt: '只发一条 transfer 类型消息，金额内容为 52元。' },
    { expectedType: 'music', prompt: '只发一条 music 类型消息，歌曲是富士山下，歌手是陈奕迅。' },
    { expectedType: 'image', prompt: '只发一条 image 类型消息，内容简短描述窗外明亮的月亮。' },
  ];
  const target = Object.freeze({
    sessionId: 'stage-g-private-special-mia',
    targetName: '米娅',
    speakerId: 'stage-g-contact-mia',
    speakerName: '米娅',
    userName: '我',
  });
  const context = Object.freeze({
    uiMode: 'chat',
    surface: 'private_chat',
    responseTarget: 'assistant',
    usesBuiltinFormat: true,
    usesDefaultPreset: true,
    compatibilityModeEnabled: false,
    assistantContinuation: false,
    webSearchEnabled: false,
    hasProviderTools: false,
    formatProfileEnabled: false,
  });
  const rows = [];
  for (const fixture of fixtures) {
    const startedAt = performance.now();
    const result = await runPrivateChatProviderFcAttempt({
      client: {
        chat: (messages, options) => bridge.backgroundChat(messages, {
          ...options,
          runtimeConfigOverride: { ...runtime, webSearchEnabled: false },
          presetContext: {
            sessionId: target.sessionId,
            uiMode: 'chat',
            taskType: 'stage_g_private_special_smoke',
          },
        }),
      },
      config: runtime,
      messages: [
        {
          role: 'system',
          content: '你是米娅。严格按用户指定的消息类型，通过唯一函数发出一条私聊消息；不要输出包装文字。',
        },
        { role: 'user', content: fixture.prompt },
      ],
      context,
      target,
      allowedItemTypes,
      allowedStickerKeywords,
      thinkingEnabled: false,
    });
    const actualTypes = result.ok && Array.isArray(result.ir?.items)
      ? result.ir.items.map(item => String(item?.type || ''))
      : [];
    rows.push({
      expectedType: fixture.expectedType,
      ok: result.ok === true,
      reason: String(result.reason || ''),
      actualTypes,
      exactTypeMatch: actualTypes.length === 1 && actualTypes[0] === fixture.expectedType,
      canonicalValid: result.ok
        ? validateBuiltinPhoneFormat(result.raw, { surface: 'private_chat' }).valid === true
        : false,
      targetSessionCorrect: result.ir?.target?.sessionId === target.sessionId,
      latencyMs: Math.round(performance.now() - startedAt),
    });
  }
  return {
    fixtureVersion: 'stage-g-private-special-v1',
    provider: String(runtime.provider || ''),
    model: String(runtime.model || ''),
    persistentWrites: 0,
    rawContentRetained: false,
    argumentContentRetained: false,
    total: rows.length,
    passed: rows.filter(row => (
      row.ok && row.exactTypeMatch && row.canonicalValid && row.targetSessionCorrect
    )).length,
    rows,
  };
})()
