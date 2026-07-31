(async () => {
  const bridge = window.appBridge;
  const registry = bridge?.debugUiRegistry || {};
  const store = registry.stores?.chatStore;
  const chatUi = bridge?.chatUI;
  const runId = 'run:chat-format-guardian:protocol-format-repair-1785463652875-51c272';
  const run = registry.actions?.getAgentRun?.(runId);
  const raw = String(store?.getLastRawResponse?.('娜美') || '');
  const envelope = store?.getLastRawResponseEnvelope?.('娜美') || {};
  const detail = run?.metadata?.modelReviewDetail || {};
  if (!raw || !detail?.candidateText || typeof chatUi?.actionHandler !== 'function') {
    return {
      ok: false,
      reason: 'validated_repair_runtime_missing',
      rawLength: raw.length,
      hasCandidate: Boolean(detail?.candidateText),
    };
  }

  const sourceKind = String(envelope.sourceKind || 'social_turn_raw');
  const sourceSessionId = String(envelope.sourceSessionId || '娜美');
  const turnId = String(envelope.turnId || '');
  const sourceMessageIds = Array.isArray(envelope.sourceMessageIds)
    ? envelope.sourceMessageIds
    : [];
  const message = {
    id: String(run?.metadata?.sourceMessageId || ''),
    role: 'assistant',
    name: '助手',
    content: '',
    rawOriginal: raw,
    time: String(run?.metadata?.repairCandidate?.fallbackTime || ''),
    meta: {
      protocolParseFailure: true,
      source: 'protocol_parse_failure',
      formatRepairTurn: {
        turnId,
        sourceSessionId,
        sourceKind,
        sourceMessageIds,
      },
    },
  };
  const payload = {
    text: String(detail.candidateText || ''),
    regexEditMode: false,
    source: 'chat_format_guardian',
    repairKind: 'model_format_repair',
    repairSummary: String(detail.repairSummary || ''),
    protocolVersion: String(detail.protocolVersion || ''),
    baseRevision: String(detail.baseRevision || ''),
    sourceSnapshot: raw,
    sourceKind,
    sourceSessionId,
    targetSessionId: String(envelope.targetSessionId || '娜美'),
    turnId,
    sourceMessageIds,
    formatTarget: 'private_chat',
    formatSourceIds: ['phoneShell', 'privateChat', 'sceneFormatReminder'],
    linePatches: Array.isArray(detail.linePatches) ? detail.linePatches : [],
    sessionId: '娜美',
  };
  const validation = await chatUi.actionHandler(
    'validate-format-repair-candidate',
    message,
    payload,
  );
  if (validation?.canApply !== true) {
    return {
      ok: false,
      reason: 'candidate_validation_rejected',
      validation,
    };
  }

  const before = store?.getMessages?.('娜美') || [];
  const applied = await chatUi.actionHandler('edit-assistant-raw', message, payload);
  const after = store?.getMessages?.('娜美') || [];
  return {
    ok: applied !== false
      && after.length > before.length
      && after.slice(before.length).some(item => item?.role === 'assistant'),
    validation: {
      canApply: validation.canApply,
      statusText: validation.statusText,
      parserStatus: validation.parserReport?.status || '',
      eventCount: validation.parserReport?.eventDrafts?.length || 0,
    },
    applied,
    beforeCount: before.length,
    afterCount: after.length,
    added: after.slice(before.length).map(item => ({
      id: String(item?.id || ''),
      role: String(item?.role || item?.type || ''),
      content: String(item?.content || item?.text || '').slice(0, 1200),
      formatRepairTurn: item?.meta?.formatRepairTurn || null,
    })),
  };
})()
