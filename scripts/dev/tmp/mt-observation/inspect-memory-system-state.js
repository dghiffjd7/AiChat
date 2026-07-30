(async () => {
  const registry = window.appBridge?.debugUiRegistry || {};
  const stores = registry.stores || {};
  const conversation = stores.maidConversationStore;
  const semantic = stores.maidSemanticMemoryStore;
  const settings = stores.maidSettingsStore;
  if (!conversation?.exportState || !semantic?.exportState) {
    return { ok: false, reason: 'maid_memory_runtime_missing' };
  }
  const state = conversation.exportState();
  const semanticState = semantic.exportState();
  const profiles = await registry.actions?.listAgentModelProfiles?.() || [];
  const boundProfileId = settings?.getBoundProfileId?.() || '';
  const context = await conversation.getContextSnapshotAsync?.({
    query: '请回忆这轮测试要求的回复风格与后台操作偏好',
  });
  return {
    ok: true,
    runtime: {
      profileId: boundProfileId,
      profile: profiles.find(item => item?.id === boundProfileId) || null,
      modelOverride: settings?.getBoundModelOverride?.() || '',
      fallbackProfileId: settings?.getFallbackProfileId?.() || '',
      subAgents: (settings?.listSubAgents?.() || []).map(item => ({
        name: item?.name || '',
        profileId: item?.profileId || '',
        modelOverride: item?.modelOverride || '',
        enabled: item?.enabled !== false,
      })),
    },
    ui: {
      activePage: document.body?.dataset?.activePage || '',
      bodyClass: document.body?.className || '',
      sessionId: stores.chatStore?.getCurrent?.() || '',
      personaId: stores.personaStore?.getCurrentId?.() || stores.personaStore?.getCurrent?.()?.id || '',
      userId: stores.userStore?.getCurrentId?.() || stores.userStore?.getCurrent?.()?.id || '',
    },
    semanticScope: semantic.scopeId || '',
    conversation: {
      threadId: state.threadId || '',
      turns: state.turns?.length || 0,
      activeTurns: (state.turns || []).filter(turn => !turn.compacted).length,
      compactedTurns: (state.turns || []).filter(turn => turn.compacted).length,
      memoryRowCount: state.memoryRows?.length || 0,
      memoryRows: (state.memoryRows || []).slice(-5).map(row => ({
        id: row.id,
        title: row.title,
        kind: row.kind,
        sourceTurnCount: row.sourceTurnIds?.length || 0,
        contentLength: String(row.content || '').length,
      })),
      extractionBatches: (state.extractionBatches || []).map(batch => ({
        id: batch.id,
        status: batch.status,
        attempts: batch.attempts,
        deterministicComplete: batch.deterministicComplete === true,
        extractedCount: batch.extractedCount,
        sourceTurnCount: batch.sourceTurnIds?.length || 0,
        lastError: batch.lastError || '',
      })),
      stats: conversation.getStats?.() || null,
    },
    semantic: {
      count: semanticState.memories?.length || 0,
      memories: (semanticState.memories || []).map(memory => ({
        id: memory.id,
        kind: memory.kind,
        key: memory.key,
        content: memory.content,
        status: memory.status,
        confidence: memory.confidence,
        sourceTurnCount: memory.sourceTurnIds?.length || 0,
        resourceRef: memory.resourceRef || null,
      })),
    },
    context: context ? {
      maidContextVersion: context.maidContextVersion,
      tokenCount: context.tokenCount,
      historyTokenCount: context.historyTokenCount,
      workingTokenCount: context.workingTokenCount,
      semanticMemoryTokenCount: context.semanticMemoryTokenCount,
      legacyMemoryTokenCount: context.legacyMemoryTokenCount,
      selectedTurnIds: context.selectedTurnIds || [],
      selectedMemoryIds: context.selectedMemoryIds || [],
      diagnostics: context.contextDiagnostics || null,
    } : null,
  };
})()
