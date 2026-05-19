export const createPromptPreviewRuntime = ({
  getCurrentSessionId = null,
  getContactBySessionId = null,
  getLastRequest = null,
  buildPromptPreview = () => ({ meta: '', head: '', body: '', messages: [] }),
  buildPromptLineageTrace = () => null,
  formatPromptLineageText = () => '',
  formatWorldDebugText = () => '',
  buildWorldDebugCandidates = () => [],
  showPromptPreviewModal = () => {},
  hidePromptPreviewModal = () => {},
  showWorldDebugLocatorModal = () => {},
  openWorldEditor = async () => {},
  notifyWarning = () => {},
  notifyError = () => {},
  logger = null,
} = {}) => () => {
  try {
    const sid = String(getCurrentSessionId?.() || '').trim();
    const contact = getContactBySessionId?.(sid);
    const name = contact?.name || sid;
    const req = getLastRequest?.();
    const {
      meta,
      head,
      body,
      messages,
    } = buildPromptPreview({
      request: req,
      contactName: name,
    });
    if (!messages || !messages.length) {
      notifyWarning('暂无本次 Prompt 记录（请先发送一次）');
      return false;
    }
    const worldDebug = req?.worldDebug && typeof req.worldDebug === 'object' ? req.worldDebug : null;
    const worldDebugText = formatWorldDebugText(worldDebug);
    const lineageTrace = req?.lineageTrace && typeof req.lineageTrace === 'object'
      ? req.lineageTrace
      : buildPromptLineageTrace({ request: req, worldDebug });
    const lineageText = formatPromptLineageText(lineageTrace);
    const locateCandidates = buildWorldDebugCandidates(worldDebug);
    showPromptPreviewModal(
      [head, worldDebugText, body].filter(Boolean).join('\n\n').trim(),
      meta,
      {
        request: req,
        lineageText,
        lineageTrace,
        onLocate: locateCandidates.length
          ? async () => {
              showWorldDebugLocatorModal(locateCandidates, {
                meta: `${meta} · ${locateCandidates.length} 条可定位记录`,
                onChoose: async (item) => {
                  hidePromptPreviewModal();
                  const worldId = String(item?.worldId || '').trim();
                  if (!worldId) return;
                  await openWorldEditor(worldId, {
                    entryId: String(item?.entryId || '').trim(),
                    blockId: String(item?.blockId || '').trim(),
                    nodeId: String(item?.focusNodeId || '').trim(),
                  });
                },
              });
            }
          : null,
      },
    );
    return true;
  } catch (error) {
    try {
      logger?.warn?.('prompt preview failed', error);
    } catch {}
    notifyError('打开本次 Prompt 失败');
    return false;
  }
};
