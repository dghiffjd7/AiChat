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
  if (
    run?.status !== 'waiting_permission'
    || !raw
    || !detail?.candidateText
    || typeof chatUi?.handleChatFormatGuardianAction !== 'function'
  ) {
    return {
      ok: false,
      reason: 'format_repair_review_runtime_missing',
      runStatus: run?.status || '',
      rawLength: raw.length,
      hasCandidate: Boolean(detail?.candidateText),
    };
  }

  const before = store?.getMessages?.('娜美') || [];
  const repairCandidate = {
    ...(run.metadata.repairCandidate || {}),
    replacementText: String(detail.candidateText || ''),
    sourceSnapshot: raw,
    sourceKind: String(envelope.sourceKind || 'social_turn_raw'),
    sourceSessionId: String(envelope.sourceSessionId || '娜美'),
    targetSessionId: String(envelope.targetSessionId || '娜美'),
    turnId: String(envelope.turnId || ''),
    sourceMessageIds: Array.isArray(envelope.sourceMessageIds)
      ? envelope.sourceMessageIds
      : [],
    linePatches: Array.isArray(detail.linePatches)
      ? detail.linePatches
      : (run.metadata.repairCandidate?.linePatches || []),
  };
  const part = {
    runId,
    status: run.status,
    summary: run.summary,
    metadata: {
      ...run.metadata,
      repairCandidate,
    },
  };
  const message = {
    id: String(run.metadata.sourceMessageId || ''),
    role: 'assistant',
    name: '助手',
    content: '',
    rawOriginal: raw,
    time: String(run.metadata.repairCandidate?.fallbackTime || ''),
    meta: {
      protocolParseFailure: true,
      source: 'protocol_parse_failure',
    },
  };

  const clicks = [];
  const clicker = setInterval(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const button = buttons.find(candidate => {
      const text = String(candidate.textContent || '').trim();
      const style = getComputedStyle(candidate);
      const rect = candidate.getBoundingClientRect();
      return text === '应用修复'
        && style.display !== 'none'
        && style.visibility !== 'hidden'
        && rect.width > 0
        && rect.height > 0;
    });
    if (!button) return;
    clicks.push({ text: String(button.textContent || '').trim(), at: Date.now() });
    button.click();
  }, 150);

  let applied = false;
  let error = '';
  try {
    applied = await chatUi.handleChatFormatGuardianAction({
      action: 'apply_repair',
      part,
      message,
      actionMeta: { repairCandidate },
    });
  } catch (err) {
    error = String(err?.message || err || '');
  } finally {
    clearInterval(clicker);
  }

  const after = store?.getMessages?.('娜美') || [];
  const resolvedRun = registry.actions?.getAgentRun?.(runId);
  return {
    ok: applied === true
      && after.length > before.length
      && resolvedRun?.status === 'succeeded',
    applied,
    error,
    clicks,
    beforeCount: before.length,
    afterCount: after.length,
    added: after.slice(before.length).map(item => ({
      id: String(item?.id || ''),
      role: String(item?.role || item?.type || ''),
      content: String(item?.content || item?.text || '').slice(0, 1200),
      formatRepairTurn: item?.meta?.formatRepairTurn || null,
    })),
    runStatus: resolvedRun?.status || '',
  };
})()
