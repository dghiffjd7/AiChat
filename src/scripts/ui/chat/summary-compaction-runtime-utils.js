export const createSessionSummaryCompactionRuntime = ({
  chatStore = null,
  getIsSummaryMemoryEnabled = () => false,
  getIsConfigured = () => true,
  buildMessages = null,
  backgroundChat = null,
  buildSessionContext = () => null,
  requestCompactionRaw = async () => '',
  parseCompactionResult = () => ({ text: '', valid: false }),
  normalizeItems = (items) => (Array.isArray(items) ? items : []),
  shouldCompact = () => false,
  refreshChatAndContacts = () => {},
  dispatchUpdated = () => {},
  dispatchFailed = () => {},
  logger = null,
  setTimeoutFn = (fn, ms) => setTimeout(fn, ms),
  delayMs = 450,
} = {}) => {
  const compacting = new Set();

  return (sid, { force = false } = {}) => {
    if (!getIsSummaryMemoryEnabled()) return Promise.resolve(false);
    const sessionId = String(sid || '').trim();
    if (!sessionId) return Promise.resolve(false);
    if (compacting.has(sessionId)) return Promise.resolve(false);
    if (!chatStore?.getSummaries || !chatStore?.setCompactedSummary) return Promise.resolve(false);
    if (typeof buildMessages !== 'function' || typeof backgroundChat !== 'function') {
      return Promise.resolve(false);
    }
    if (!getIsConfigured()) return Promise.resolve(false);

    const list = chatStore.getSummaries(sessionId) || [];
    if (!shouldCompact({ items: list, force })) return Promise.resolve(false);

    compacting.add(sessionId);
    return new Promise((resolve) => {
      setTimeoutFn(async () => {
        try {
          const current = chatStore.getSummaries(sessionId) || [];
          const arr = Array.isArray(current) ? current : [];
          const compactedPrev = chatStore.getCompactedSummary(sessionId);
          const compactedText = String(compactedPrev?.text || '').trim();
          const context = buildSessionContext(sessionId);
          const raw = await requestCompactionRaw({
            items: arr,
            compactedText,
            context,
            buildMessages,
            backgroundChat,
          });
          if (!raw) return resolve(false);
          try {
            chatStore.setCompactedSummaryRaw(raw, sessionId);
          } catch {}

          const { text, valid } = parseCompactionResult(raw);
          if (!text) {
            try {
              dispatchFailed(sessionId, 'missing_summary_tag');
            } catch {}
            return resolve(false);
          }

          if (!valid) {
            try {
              dispatchFailed(sessionId, 'format');
            } catch {}
            return resolve(false);
          }

          try {
            chatStore.setCompactedSummary(text, sessionId, { raw });
          } catch {}
          try {
            const keep = normalizeItems(chatStore.getSummaries(sessionId)).slice(-2);
            chatStore.setSummaries(keep, sessionId);
          } catch {}

          try {
            refreshChatAndContacts();
          } catch {}
          try {
            dispatchUpdated(sessionId);
          } catch {}
          resolve(true);
        } catch (error) {
          try {
            logger?.debug?.('summary compaction failed', error);
          } catch {}
          resolve(false);
        } finally {
          compacting.delete(sessionId);
        }
      }, Number(delayMs || 0));
    });
  };
};
