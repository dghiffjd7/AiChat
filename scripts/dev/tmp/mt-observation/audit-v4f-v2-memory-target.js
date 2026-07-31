(async () => {
  const stores = window.appBridge?.debugUiRegistry?.stores || {};
  const conversation = stores.maidConversationStore;
  const semantic = stores.maidSemanticMemoryStore;
  const state = conversation?.exportState?.() || {};
  const semanticState = semantic?.exportState?.() || {};
  const targets = (semanticState.memories || []).filter(memory => (
    /霜港核对完成|名字含「?V4F-V2」?/.test(String(memory?.content || ''))
  ));
  const context = await conversation?.getContextSnapshotAsync?.({
    query: '完成 V4F-V2 测试任务时如何汇报',
  });
  return {
    turns: (state.turns || []).length,
    activeTurns: (state.turns || []).filter(turn => !turn.compacted).length,
    compactedTurns: (state.turns || []).filter(turn => turn.compacted).length,
    memoryRows: (state.memoryRows || []).length,
    activeTurnSummaries: (state.turns || [])
      .filter(turn => !turn.compacted)
      .map(turn => ({
        id: turn.id,
        input: String(turn.input || '').slice(0, 180),
        status: turn.status,
        createdAt: turn.createdAt,
      })),
    latestExtractionBatches: (state.extractionBatches || []).slice(-8).map(batch => ({
      id: batch.id,
      sourceTurnIds: batch.sourceTurnIds || [],
      status: batch.status,
      attempts: batch.attempts,
      deterministicComplete: batch.deterministicComplete,
      extractedCount: batch.extractedCount,
      modelSource: batch.modelSource,
      model: batch.model,
      fallbackUsed: batch.fallbackUsed,
      lastError: batch.lastError || '',
      createdAt: batch.createdAt,
      completedAt: batch.completedAt,
    })),
    targets: targets.map(memory => ({
      id: memory.id,
      kind: memory.kind,
      key: memory.key,
      content: memory.content,
      confidence: memory.confidence,
      status: memory.status,
      sourceTurnIds: memory.sourceTurnIds || [],
      createdAt: memory.createdAt,
      updatedAt: memory.updatedAt,
    })),
    selectedMemoryIds: context?.selectedMemoryIds || [],
    selectedSemanticMemories: context?.semanticMemories || [],
    semanticMemoryTokenCount: context?.semanticMemoryTokenCount || 0,
  };
})()
