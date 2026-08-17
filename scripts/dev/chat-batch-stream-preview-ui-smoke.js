// FC tool-argument streaming smoke for an open Windows dev WebView. Provider
// deltas stay enabled, but the duplicate disposable content bubble stays hidden.
// All chat/contact writes use a unique temporary group and are removed in finally.
(async () => {
  const bridge = window.appBridge;
  const debug = bridge?.debugUiRegistry;
  const actions = debug?.actions;
  const registry = debug?.stores?.agentToolRegistry;
  const chatStore = debug?.stores?.chatStore;
  const contactsStore = debug?.stores?.contactsStore;
  const sessionPanel = debug?.panels?.sessionPanel;
  if (
    !actions?.enterChatRoom
    || !actions?.setPrivateChatProviderFcExperimentEnabled
    || !registry?.executeTool
    || !chatStore?.getMessages
    || !contactsStore?.upsertContact
    || !sessionPanel?.removeCore
  ) {
    throw new Error('Stage G.5.3 stream preview smoke dependencies unavailable');
  }

  const { appSettings } = await import('/scripts/storage/app-settings.js');
  const { serializeBuiltinPhoneBatch } = await import('/scripts/utils/builtin-phone-format-contract.js');
  const prefix = `__codex_g53_preview_${Date.now()}`;
  const ids = {
    group: `group:${prefix}`,
    memberA: `${prefix}_member_a`,
    memberB: `${prefix}_member_b`,
  };
  const names = {
    group: `${prefix} 测试群`,
    memberA: `${prefix} 测试甲`,
    memberB: `${prefix} 测试乙`,
  };
  const markers = {
    successUser: `${prefix}_success_user`,
    successReply: `${prefix}_success_reply`,
    fallbackUser: `${prefix}_fallback_user`,
    fallbackPreview: `${prefix}_fallback_preview`,
    fallbackReply: `${prefix}_fallback_reply`,
    cancelUser: `${prefix}_cancel_user`,
    cancelPreview: `${prefix}_cancel_preview`,
    regenerateReply: `${prefix}_regenerate_reply`,
  };
  const previousSessionId = String(chatStore.getCurrent?.() || '').trim();
  const previousSessionContact = previousSessionId
    ? contactsStore.getContact?.(previousSessionId) || null
    : null;
  const previousSessionRestorable = Boolean(
    previousSessionId
    && (!previousSessionId.startsWith('group:') || previousSessionContact),
  );
  const previousRoomVisible = !document.getElementById('chat-room')?.classList?.contains?.('hidden');
  const previousPersona = debug?.stores?.personaStore?.getActive?.() || null;
  const previousSessionName = String(
    previousSessionContact?.name
    || (previousSessionId.startsWith('rp:') ? previousPersona?.name : '')
    || previousSessionId,
  );
  const previousFlag = actions.getPrivateChatProviderFcExperimentStatus?.()?.enabled === true;
  const previousResolveRuntime = bridge.resolveRequestRuntimeConfig;
  const previousSaveToHistory = bridge.saveToHistory;
  const previousLastRequest = bridge.lastRequest;
  const previousLastMemoryPlan = bridge.lastMemoryPlan;
  const previousLastPhoneFormatTransportPlan = bridge.lastPhoneFormatTransportPlan;
  const previousUsage = bridge.lastGenerationUsage;
  const previousSources = bridge.lastGenerationSources;
  const previousSettingsGet = appSettings.get;
  const previousTypingDots = document.body?.dataset?.typingDots;
  const plans = [];
  let activeFallbackMarker = '';
  const report = {
    fixtureVersion: 'phone-batch-hidden-transport-preview-v2',
    provider: 'deterministic_local_stream',
    providerRequests: 0,
    structuredRequests: 0,
    fallbackRequests: 0,
    historyWritesIntercepted: 0,
    cases: {},
    cleanup: null,
  };

  const waitFor = async (predicate, label, timeoutMs = 6000) => {
    const startedAt = performance.now();
    while (performance.now() - startedAt < timeoutMs) {
      try {
        const value = predicate();
        if (value) return value;
      } catch {}
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    throw new Error(`timeout waiting for ${label}`);
  };

  const createPlan = ({ marker, outcome = 'accepted', fallbackMarker = '' } = {}) => {
    let release = null;
    const gate = new Promise(resolve => { release = resolve; });
    const plan = { marker, outcome, fallbackMarker, gate, release, previewEventSeen: false };
    plans.push(plan);
    return plan;
  };

  const waitForGateOrAbort = (gate, signal) => new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener?.('abort', onAbort);
      callback(value);
    };
    const onAbort = () => {
      const error = new Error('aborted');
      error.name = 'AbortError';
      finish(reject, error);
    };
    if (signal?.aborted) {
      onAbort();
      return;
    }
    signal?.addEventListener?.('abort', onAbort, { once: true });
    gate.then(() => finish(resolve), error => finish(reject, error));
  });

  const previewWrapper = marker => Array.from(
    document.querySelectorAll('.QQ_chat_charmsg[data-disposable-preview="1"]'),
  ).find(wrapper => String(wrapper.textContent || '').includes(marker)) || null;

  const storedMarkerCount = marker => (chatStore.getMessages(ids.group) || []).filter(message => (
    String(message?.content || '') === marker
    || String(message?.rawOriginal || '') === marker
    || String(message?.raw || '') === marker
  )).length;

  const executeSend = content => registry.executeTool('chat.send_message', {
    sessionId: ids.group,
    content,
    role: 'user',
    open: true,
    triggerReply: true,
    waitForReply: true,
  }, {
    source: 'stage_g53_stream_preview_smoke',
    sessionId: ids.group,
    operationIntentPolicy: { mode: 'write_allowed' },
    requestPermission: async () => ({ decision: 'allow' }),
    requestToolConfirmation: async () => ({ decision: 'allow_once' }),
  });

  const runGatedSend = async ({ userMarker, previewMarker, outcome = 'accepted', fallbackMarker = '' } = {}) => {
    const plan = createPlan({ marker: previewMarker, outcome, fallbackMarker });
    const sendPromise = executeSend(userMarker);
    await waitFor(() => plan.previewEventSeen, `${outcome} streamed arguments`);
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const wrapper = previewWrapper(previewMarker);
    const during = {
      visible: Boolean(wrapper),
      text: String(wrapper?.textContent || '').trim(),
      disposableAttribute: wrapper?.dataset?.disposablePreview === '1',
      persistedBeforeTerminal: storedMarkerCount(previewMarker),
    };
    plan.release();
    const toolResult = await sendPromise;
    await waitFor(() => !previewWrapper(previewMarker), `${outcome} preview disposal`);
    return { during, toolResult };
  };

  try {
    contactsStore.upsertContact({ id: ids.memberA, name: names.memberA, isGroup: false });
    contactsStore.upsertContact({ id: ids.memberB, name: names.memberB, isGroup: false });
    contactsStore.upsertContact({
      id: ids.group,
      name: names.group,
      isGroup: true,
      members: [ids.memberA, ids.memberB],
    });
    appSettings.get = (...args) => ({
      ...previousSettingsGet.apply(appSettings, args),
      traditionalModelOutputProtocolEnabled: false,
      memoryAutoExtract: false,
    });
    if (document.body?.dataset) document.body.dataset.typingDots = 'off';
    actions.setPrivateChatProviderFcExperimentEnabled(true);

    bridge.resolveRequestRuntimeConfig = async () => ({
      config: {
        provider: 'deepseek',
        model: 'deepseek-v4-flash',
        baseUrl: 'https://api.deepseek.com/v1',
        apiKey: 'stage-g53-local-provider',
        stream: true,
        webSearchEnabled: false,
      },
      client: {
        async chat() {
          throw new Error('G.5.3 smoke expected streamChat');
        },
        async *streamChat(_messages, options = {}) {
          report.providerRequests += 1;
          const toolName = String(options?.tools?.[0]?.function?.name || '');
          if (toolName !== 'emit_phone_batch') {
            report.fallbackRequests += 1;
            const fallbackRaw = serializeBuiltinPhoneBatch([{
              surface: 'group_chat',
              payload: {
                groupName: names.group,
                members: [names.memberA, names.memberB],
                messages: [{ speaker: names.memberA, content: activeFallbackMarker || 'fallback' }],
              },
            }], { mode: 'group_chat' });
            activeFallbackMarker = '';
            const splitAt = Math.max(1, Math.floor(fallbackRaw.length / 2));
            yield fallbackRaw.slice(0, splitAt);
            yield fallbackRaw.slice(splitAt);
            return;
          }

          report.structuredRequests += 1;
          const plan = plans.shift();
          if (!plan) throw new Error('missing structured stream plan');
          if (plan.outcome === 'fallback') activeFallbackMarker = plan.fallbackMarker;
          const argsText = JSON.stringify({
            items: [{
              kind: 'chat',
              messages: [{
                speakerId: ids.memberA,
                type: 'text',
                content: plan.marker,
              }],
            }],
          });
          const splitAt = argsText.indexOf(plan.marker) + plan.marker.length;
          options.onProviderToolCallDelta?.({
            choices: [{ delta: { tool_calls: [{
              index: 0,
              id: `call-${prefix}-${report.structuredRequests}`,
              type: 'function',
              function: { name: 'emit_phone_batch', arguments: '' },
            }] } }],
          }, { provider: 'deepseek', model: 'deepseek-v4-flash' });
          options.onProviderToolCallDelta?.({
            choices: [{ delta: { tool_calls: [{
              index: 0,
              function: { arguments: argsText.slice(0, splitAt) },
            }] } }],
          }, { provider: 'deepseek', model: 'deepseek-v4-flash' });
          plan.previewEventSeen = true;
          yield '';
          await waitForGateOrAbort(plan.gate, options.signal);
          options.onProviderToolCallDelta?.({
            choices: [{ delta: { tool_calls: [{
              index: 0,
              function: { arguments: argsText.slice(splitAt) },
            }] } }],
          }, { provider: 'deepseek', model: 'deepseek-v4-flash' });
          options.onProviderToolCallDelta?.({
            choices: [{ delta: {}, finish_reason: 'tool_calls' }],
          }, { provider: 'deepseek', model: 'deepseek-v4-flash' });
          if (plan.outcome === 'fallback') yield 'invalid extra response text';
        },
      },
    });
    bridge.saveToHistory = async () => {
      report.historyWritesIntercepted += 1;
      return true;
    };

    await actions.enterChatRoom(ids.group, names.group, 'chat', {
      suppressInitialAutoScroll: true,
    });

    const success = await runGatedSend({
      userMarker: markers.successUser,
      previewMarker: markers.successReply,
    });
    const successTransport = { ...(bridge.lastRequest?.phoneReplyTransport || {}) };
    report.cases.accepted = {
      ...success.during,
      committedAfterTerminal: storedMarkerCount(markers.successReply),
      toolSucceeded: success.toolResult?.status === 'succeeded'
        && success.toolResult?.result?.ok === true,
      transport: successTransport,
    };
    report.cases.accepted.pass = !report.cases.accepted.visible
      && !report.cases.accepted.disposableAttribute
      && report.cases.accepted.persistedBeforeTerminal === 0
      && report.cases.accepted.committedAfterTerminal === 1
      && report.cases.accepted.toolSucceeded
      && successTransport.streamPreviewUsed === true
      && Number(successTransport.previewUpdateCount || 0) > 0
      && String(successTransport.fallbackReason || '') === '';

    const regeneratePlan = createPlan({ marker: markers.regenerateReply, outcome: 'accepted' });
    const originalAssistant = (chatStore.getMessages(ids.group) || []).find(message => (
      String(message?.content || '') === markers.successReply
    ));
    const originalWrapper = await waitFor(
      () => originalAssistant?.id
        ? document.querySelector(`[data-msg-id="${CSS.escape(String(originalAssistant.id))}"]`)
        : null,
      'accepted assistant wrapper',
      8000,
    );
    const regenerateButton = await waitFor(
      () => originalWrapper.querySelector('[data-rp-message-action="regenerate"]'),
      'regenerate quick action',
    );
    regenerateButton.click();
    await waitFor(() => regeneratePlan.previewEventSeen, 'regenerate streamed arguments');
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const regeneratePreview = previewWrapper(markers.regenerateReply);
    const regeneratePersistedBefore = storedMarkerCount(markers.regenerateReply);
    regeneratePlan.release();
    await waitFor(
      () => storedMarkerCount(markers.regenerateReply) === 1 && !previewWrapper(markers.regenerateReply),
      'regenerate terminal commit',
      8000,
    );
    report.cases.regenerate = {
      previewVisible: Boolean(regeneratePreview),
      persistedBeforeTerminal: regeneratePersistedBefore,
      regeneratedCommittedOnce: storedMarkerCount(markers.regenerateReply),
      originalVisibleContentCount: storedMarkerCount(markers.successReply),
      disposableRemaining: document.querySelectorAll('[data-disposable-preview="1"]').length,
    };
    report.cases.regenerate.pass = !report.cases.regenerate.previewVisible
      && report.cases.regenerate.persistedBeforeTerminal === 0
      && report.cases.regenerate.regeneratedCommittedOnce === 1
      && report.cases.regenerate.originalVisibleContentCount === 0
      && report.cases.regenerate.disposableRemaining === 0;
    await waitFor(() => (
      bridge.isGenerating !== true
      && !document.getElementById('send-button')?.classList?.contains?.('is-generating')
    ), 'regenerate send cleanup', 8000);

    const fallback = await runGatedSend({
      userMarker: markers.fallbackUser,
      previewMarker: markers.fallbackPreview,
      outcome: 'fallback',
      fallbackMarker: markers.fallbackReply,
    });
    const fallbackTransport = { ...(bridge.lastRequest?.phoneReplyTransport || {}) };
    report.cases.fallback = {
      ...fallback.during,
      previewPersistedAfterFallback: storedMarkerCount(markers.fallbackPreview),
      fallbackCommittedOnce: storedMarkerCount(markers.fallbackReply),
      toolSucceeded: fallback.toolResult?.status === 'succeeded'
        && fallback.toolResult?.result?.ok === true,
      transport: fallbackTransport,
    };
    report.cases.fallback.pass = !report.cases.fallback.visible
      && report.cases.fallback.persistedBeforeTerminal === 0
      && report.cases.fallback.previewPersistedAfterFallback === 0
      && report.cases.fallback.fallbackCommittedOnce === 1
      && report.cases.fallback.toolSucceeded
      && fallbackTransport.effectiveMode === 'fc_fallback'
      && fallbackTransport.fallbackReason === 'unexpected_response_text';

    const cancelPlan = createPlan({ marker: markers.cancelPreview, outcome: 'cancel' });
    const cancelPromise = executeSend(markers.cancelUser).catch(error => ({ error: String(error?.message || error) }));
    await waitFor(() => cancelPlan.previewEventSeen, 'cancel streamed arguments');
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const cancelWrapper = previewWrapper(markers.cancelPreview);
    const cancelPersistedBefore = storedMarkerCount(markers.cancelPreview);
    document.getElementById('send-button')?.click?.();
    const cancelResult = await cancelPromise;
    await waitFor(() => !previewWrapper(markers.cancelPreview), 'cancel preview disposal');
    report.cases.cancel = {
      visible: Boolean(cancelWrapper),
      persistedBeforeCancel: cancelPersistedBefore,
      persistedAfterCancel: storedMarkerCount(markers.cancelPreview),
      disposableRemaining: document.querySelectorAll('[data-disposable-preview="1"]').length,
      result: cancelResult,
    };
    report.cases.cancel.pass = !report.cases.cancel.visible
      && report.cases.cancel.persistedBeforeCancel === 0
      && report.cases.cancel.persistedAfterCancel === 0
      && report.cases.cancel.disposableRemaining === 0;
    cancelPlan.release();
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
    if (document.body?.dataset) {
      if (previousTypingDots === undefined) delete document.body.dataset.typingDots;
      else document.body.dataset.typingDots = previousTypingDots;
    }
    document.querySelectorAll('[data-disposable-preview="1"]').forEach(node => node.remove());
    try {
      if (chatStore.listSessions?.().includes(ids.group)) await sessionPanel.removeCore(ids.group);
    } catch {
      try { chatStore.delete?.(ids.group); } catch {}
    }
    [ids.group, ids.memberA, ids.memberB].forEach((id) => {
      if (contactsStore.getContact?.(id)) contactsStore.removeContact?.(id);
    });
    if (previousSessionRestorable && previousRoomVisible) {
      try {
        await actions.enterChatRoom(previousSessionId, previousSessionName, 'chat', {
          suppressInitialAutoScroll: true,
        });
      } catch {}
      if (String(chatStore.getCurrent?.() || '') !== previousSessionId) {
        chatStore.switchSession?.(previousSessionId);
        bridge.setActiveSession?.(previousSessionId);
      }
    } else {
      if (previousSessionRestorable) {
        chatStore.setCurrent?.(previousSessionId);
        bridge.setActiveSession?.(previousSessionId);
      }
      try { actions.exitChatRoom?.(); } catch {}
    }
    report.cleanup = {
      remainingSessions: chatStore.listSessions?.().filter(id => id === ids.group) || [],
      remainingContacts: [ids.group, ids.memberA, ids.memberB]
        .filter(id => Boolean(contactsStore.getContact?.(id))),
      disposableRemaining: document.querySelectorAll('[data-disposable-preview="1"]').length,
      internalFlagRestored: actions.getPrivateChatProviderFcExperimentStatus?.()?.enabled === previousFlag,
      runtimeRestored: bridge.resolveRequestRuntimeConfig === previousResolveRuntime
        && bridge.saveToHistory === previousSaveToHistory
        && appSettings.get === previousSettingsGet,
      activeSessionRestored: previousSessionRestorable
        ? String(chatStore.getCurrent?.() || '') === previousSessionId
        : !String(chatStore.getCurrent?.() || '').startsWith('group:')
          || Boolean(contactsStore.getContact?.(chatStore.getCurrent?.())),
    };
    report.cleanup.pass = report.cleanup.remainingSessions.length === 0
      && report.cleanup.remainingContacts.length === 0
      && report.cleanup.disposableRemaining === 0
      && report.cleanup.internalFlagRestored
      && report.cleanup.runtimeRestored
      && report.cleanup.activeSessionRestored;
  }

  report.pass = Object.values(report.cases).every(item => item?.pass === true)
    && report.cleanup?.pass === true;
  return report;
})()
