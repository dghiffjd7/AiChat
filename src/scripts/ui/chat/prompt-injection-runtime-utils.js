export const normalizePromptInjectionBlock = (input = {}) => {
  const raw = String(input?.content ?? input?.prompt ?? '').trim();
  if (!raw) return null;
  const roleRaw = String(input?.role || 'system').trim().toLowerCase();
  const role = (roleRaw === 'user' || roleRaw === 'assistant' || roleRaw === 'system') ? roleRaw : 'system';
  const position = String(input?.position || '').trim();
  return { content: raw, role, position };
};

export const createPromptInjectionRuntime = ({
  getCurrentSessionId = null,
} = {}) => {
  const promptInjectionQueue = new Map();

  const resolveSessionId = (sessionId) => String(sessionId || getCurrentSessionId?.() || '').trim();

  const queuePromptInjection = (sessionId, block) => {
    const sid = resolveSessionId(sessionId);
    if (!sid) return false;
    const normalized = normalizePromptInjectionBlock(block);
    if (!normalized) return false;
    const list = promptInjectionQueue.get(sid) || [];
    list.push(normalized);
    promptInjectionQueue.set(sid, list);
    return true;
  };

  const peekPromptInjections = (sessionId) => {
    const sid = resolveSessionId(sessionId);
    if (!sid) return [];
    const list = promptInjectionQueue.get(sid) || [];
    return list.slice();
  };

  const consumePromptInjections = (sessionId) => {
    const sid = resolveSessionId(sessionId);
    if (!sid) return [];
    const list = promptInjectionQueue.get(sid) || [];
    promptInjectionQueue.delete(sid);
    return list.slice();
  };

  return {
    queuePromptInjection,
    peekPromptInjections,
    consumePromptInjections,
  };
};
