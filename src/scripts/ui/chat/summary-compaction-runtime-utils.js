export const createSessionSummaryCompactionRuntime = ({
  chatStore = null,
  getIsSummaryMemoryEnabled = () => false,
  getIsCompactionEnabled = null,
  getDefaultPlace = () => 'chat',
  createAdapter = null,
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

  const createLegacyAdapter = (sessionId) => {
    if (!chatStore?.getSummaries || !chatStore?.setCompactedSummary) return null;
    return {
      kind: 'summary_store',
      getItems: () => chatStore.getSummaries(sessionId) || [],
      getCompactedText: () => String(chatStore.getCompactedSummary(sessionId)?.text || '').trim(),
      setRaw: raw => chatStore.setCompactedSummaryRaw?.(raw, sessionId),
      persist: ({ text, raw, keepItems }) => {
        chatStore.setCompactedSummary(text, sessionId, { raw });
        chatStore.setSummaries(keepItems, sessionId);
      },
    };
  };

  return async (sid, { force = false, place = '' } = {}) => {
    const sessionId = String(sid || '').trim();
    if (!sessionId) return false;
    const resolvedPlace = String(place || getDefaultPlace?.() || 'chat').trim().toLowerCase() || 'chat';
    const enabled = typeof getIsCompactionEnabled === 'function'
      ? getIsCompactionEnabled({ sessionId, place: resolvedPlace, force })
      : getIsSummaryMemoryEnabled(resolvedPlace);
    if (!enabled) return false;
    const compactKey = `${resolvedPlace}:${sessionId}`;
    if (compacting.has(compactKey)) return false;
    if (typeof buildMessages !== 'function' || typeof backgroundChat !== 'function') {
      return false;
    }
    if (!getIsConfigured()) return false;

    let adapter = null;
    try {
      adapter = await createAdapter?.({ sessionId, place: resolvedPlace }) || createLegacyAdapter(sessionId);
    } catch (error) {
      logger?.debug?.('summary compaction adapter init failed', error);
      return false;
    }
    if (!adapter?.getItems || !adapter?.persist) return false;
    const list = await adapter.getItems();
    if (!shouldCompact({ items: list, force })) return false;

    compacting.add(compactKey);
    return new Promise((resolve) => {
      setTimeoutFn(async () => {
        try {
          const current = await adapter.getItems();
          const arr = Array.isArray(current) ? current : [];
          const compactedText = String(await adapter.getCompactedText?.() || '').trim();
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
            await adapter.setRaw?.(raw);
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

          const latestItems = await adapter.getItems();
          const normalizedItems = typeof adapter.normalizeItems === 'function'
            ? adapter.normalizeItems(latestItems)
            : normalizeItems(latestItems);
          const keep = (Array.isArray(normalizedItems) ? normalizedItems : []).slice(-2);
          await adapter.persist({
            text,
            raw,
            items: arr,
            keepItems: keep,
            sessionId,
            place: resolvedPlace,
          });

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
          compacting.delete(compactKey);
        }
      }, Number(delayMs || 0));
    });
  };
};
