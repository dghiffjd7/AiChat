(async () => {
  const bridge = window.appBridge || {};
  const request = bridge.lastRequest || {};
  const audit = request.injectionAudit || {};
  return {
    at: request.at || 0,
    requestId: request.requestId || '',
    provider: request.provider || '',
    model: request.model || '',
    stream: Boolean(request.stream),
    configProfile: request.configProfile || null,
    session: request.session || null,
    messageCount: Array.isArray(request.messages) ? request.messages.length : 0,
    messageRoles: Array.isArray(request.messages)
      ? request.messages.map(message => String(message?.role || ''))
      : [],
    estimatedPromptTokens: Number(
      audit?.estimatedPromptTokens
      || audit?.totalEstimatedTokens
      || audit?.promptTokens
      || 0,
    ),
    injectionAudit: {
      tokenMode: audit.tokenMode || '',
      totalEstimatedTokens: audit.totalEstimatedTokens || 0,
      calibration: audit.calibration || null,
      historyBudgetStats: audit.historyBudgetStats || null,
      coverageLine: audit.coverageLine || null,
    },
    options: request.options || null,
    requestOptions: request.requestOptions || null,
    deepSeekFormatDebug: request.deepSeekFormatDebug || null,
    responsePrefix: String(request.responsePrefix || ''),
    lastGenerationUsage: bridge.lastGenerationUsage || null,
  };
})()
