// Stage G.5 formal-send transaction smoke for the ordered phone batch route.
// Uses a deterministic local provider, writes only uniquely named temporary chat data,
// removes every temporary row/contact/session, and restores all patched runtime state.
(async () => {
  const bridge = window.appBridge;
  const debug = bridge?.debugUiRegistry;
  const actions = debug?.actions;
  const registry = debug?.stores?.agentToolRegistry;
  const chatStore = debug?.stores?.chatStore;
  const contactsStore = debug?.stores?.contactsStore;
  const memoryTableStore = debug?.stores?.memoryTableStore;
  const sessionPanel = debug?.panels?.sessionPanel;
  if (
    !actions?.enterChatRoom
    || !actions?.setPrivateChatProviderFcExperimentEnabled
    || !registry?.executeTool
    || !chatStore?.getMessages
    || !contactsStore?.upsertContact
    || !sessionPanel?.removeCore
  ) {
    throw new Error('Stage G.5 UI transaction smoke dependencies unavailable');
  }

  const { appSettings } = await import('/scripts/storage/app-settings.js');
  const prefix = `__codex_g5_tx_${Date.now()}`;
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
    user: `${prefix}_user`,
    replyA: `${prefix}_reply_a`,
    replyB: `${prefix}_reply_b`,
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
  const report = {
    fixtureVersion: 'stage-g5-phone-batch-ui-transaction-v1',
    provider: 'deterministic_local',
    persistentScope: 'temporary_only',
    providerRequests: 0,
    providerToolRequests: 0,
    historyWritesIntercepted: 0,
    transaction: null,
    cleanup: null,
  };

  const listTempMemoryRows = async () => {
    if (!memoryTableStore?.getMemories) return [];
    try {
      const rows = await memoryTableStore.getMemories({
        scope: 'group',
        group_id: ids.group,
      });
      return Array.isArray(rows) ? rows : [];
    } catch {
      return [];
    }
  };
  const removeTempMemoryRows = async () => {
    const rows = await listTempMemoryRows();
    const rowIds = rows.map(row => String(row?.id || '').trim()).filter(Boolean);
    if (rowIds.length && memoryTableStore?.batchDeleteMemories) {
      await memoryTableStore.batchDeleteMemories(rowIds);
    }
    return rowIds;
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

    // Keep the test on the structured primary without persisting changes to the
    // user's compatibility or memory-auto-extract settings.
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
        apiKey: 'stage-g5-local-provider',
        stream: false,
        webSearchEnabled: false,
      },
      client: {
        async chat(_messages, options = {}) {
          report.providerRequests += 1;
          const toolName = String(options?.tools?.[0]?.function?.name || '');
          if (toolName === 'emit_phone_batch') report.providerToolRequests += 1;
          options.onProviderToolCallDelta?.({
            choices: [{
              message: {
                tool_calls: [{
                  id: `call-${prefix}`,
                  type: 'function',
                  function: {
                    name: 'emit_phone_batch',
                    arguments: JSON.stringify({
                      items: [{
                        kind: 'chat',
                        messages: [
                          { speakerId: ids.memberA, type: 'text', content: markers.replyA },
                          { speakerId: ids.memberB, type: 'text', content: markers.replyB },
                        ],
                      }],
                    }),
                  },
                }],
              },
              finish_reason: 'tool_calls',
            }],
          }, { provider: 'deepseek', model: 'deepseek-v4-flash' });
          return '';
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
    const toolResult = await registry.executeTool('chat.send_message', {
      sessionId: ids.group,
      content: markers.user,
      role: 'user',
      open: true,
      triggerReply: true,
      waitForReply: true,
    }, {
      source: 'stage_g5_transaction_smoke',
      sessionId: ids.group,
      operationIntentPolicy: { mode: 'write_allowed' },
      requestPermission: async () => ({ decision: 'allow' }),
      requestToolConfirmation: async () => ({ decision: 'allow_once' }),
    });

    const messages = chatStore.getMessages(ids.group) || [];
    const countMarker = marker => messages.filter(message => (
      String(message?.content || '') === marker
      || String(message?.rawOriginal || '') === marker
    )).length;
    const transport = bridge.lastRequest?.phoneReplyTransport || {};
    const raw = String(chatStore.getLastRawResponse?.(ids.group) || '');
    const tempMemoryRows = await listTempMemoryRows();
    const checks = {
      toolSucceeded: toolResult?.status === 'succeeded' && toolResult?.result?.ok === true,
      assistantDelivered: toolResult?.result?.completionOutcome === 'assistant_delivered',
      providerFcUsed: transport.effectiveMode === 'provider_fc'
        && transport.adapter === 'phone_batch'
        && transport.attempted === true,
      exactOneProviderRequest: report.providerRequests === 1 && report.providerToolRequests === 1,
      exactOneToolCall: Number(transport.toolCallCount || 0) === 1,
      noFallback: String(transport.fallbackReason || '') === '',
      userCommittedOnce: countMarker(markers.user) === 1,
      firstReplyCommittedOnce: countMarker(markers.replyA) === 1,
      secondReplyCommittedOnce: countMarker(markers.replyB) === 1,
      canonicalRawSaved: raw.includes('MiPhone_start')
        && raw.includes(markers.replyA)
        && raw.includes(markers.replyB),
      noUnexpectedMemoryWrite: tempMemoryRows.length === 0,
    };
    report.transaction = {
      ...checks,
      messageCount: messages.length,
      temporaryMemoryRowCount: tempMemoryRows.length,
      requestedMode: String(transport.requestedMode || ''),
      effectiveMode: String(transport.effectiveMode || ''),
      adapter: String(transport.adapter || ''),
      pass: Object.values(checks).every(value => value === true),
    };
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

    const removedMemoryRowIds = await removeTempMemoryRows();
    try {
      if (chatStore.listSessions?.().includes(ids.group)) {
        await sessionPanel.removeCore(ids.group);
      }
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

    const remainingMemoryRows = await listTempMemoryRows();
    report.cleanup = {
      removedMemoryRowCount: removedMemoryRowIds.length,
      remainingSessions: chatStore.listSessions?.().filter(id => id === ids.group) || [],
      remainingContacts: [ids.group, ids.memberA, ids.memberB]
        .filter(id => Boolean(contactsStore.getContact?.(id))),
      remainingMemoryRows: remainingMemoryRows.length,
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
      && report.cleanup.remainingMemoryRows === 0
      && report.cleanup.internalFlagRestored
      && report.cleanup.runtimeRestored
      && report.cleanup.activeSessionRestored;
  }

  report.pass = report.transaction?.pass === true && report.cleanup?.pass === true;
  return report;
})()
