export const resolveMemoryUpdateHistoryLimit = (settings) => {
  const rawLimit = Math.trunc(Number(settings?.memoryUpdateContextRounds));
  return Number.isFinite(rawLimit) ? Math.max(0, rawLimit) : 6;
};

export const buildMemoryUpdatePlanInput = (baseContext, { sessionId, isGroup } = {}) => {
  const ctx = baseContext || {};
  return {
    ...(ctx || {}),
    session: { id: sessionId, isGroup },
    meta: {
      ...(ctx?.meta || {}),
      memoryStorageMode: 'table',
      memoryAutoExtract: true,
    },
    history: [],
  };
};

export const buildMemoryUpdateRequest = ({ promptText, historyText } = {}) => {
  const systemText = String(promptText || '').trim();
  const userText = [
    '请根据以下聊天记录更新记忆表格。',
    '只输出 <tableEdit>...</tableEdit>，不要输出任何解释。',
    '',
    '<chat_history>',
    String(historyText || ''),
    '</chat_history>',
  ].join('\n');
  return {
    systemText,
    userText,
    requestPrompt: ['system:', systemText, '', 'user:', userText].join('\n'),
    messages: [
      { role: 'system', content: systemText },
      { role: 'user', content: userText },
    ],
  };
};

export const resolveMemoryUpdateTrigger = (settings, previousCounter = 0) => {
  const everyN = Math.max(1, Math.trunc(Number(settings?.memoryFillEveryN)) || 1);
  const nextCounter = Math.max(0, Math.trunc(Number(previousCounter)) || 0) + 1;
  if (nextCounter < everyN) {
    return { shouldRun: false, nextCounter, everyN };
  }
  return { shouldRun: true, nextCounter: 0, everyN };
};
