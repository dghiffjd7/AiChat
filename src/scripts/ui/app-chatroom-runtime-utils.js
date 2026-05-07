const formatWorldIdsLabel = (ids) => {
  if (!Array.isArray(ids) || !ids.length) return '';
  if (ids.length <= 2) return ids.join(' + ');
  return `${ids[0]} + ${ids[1]} + ...`;
};

export const formatWorldIndicatorLabel = ({
  globalId = '',
  roleIds = [],
  currentIds = [],
} = {}) => {
  const parts = [];
  const roleLabel = formatWorldIdsLabel(roleIds);
  const currentLabel = formatWorldIdsLabel(currentIds);
  if (globalId) parts.push(`全局:${globalId}`);
  if (roleLabel) parts.push(`角色:${roleLabel}`);
  if (currentLabel) parts.push(`会话:${currentLabel}`);
  return parts.length ? parts.join(' / ') : '未启用';
};

export function createAppChatroomRuntime({
  isStickerAllowed = () => true,
  showInfo = null,
  showWarning = null,
  getCurrentSessionId = () => '',
  bumpStickerUsage = () => {},
  getActiveUserName = () => '',
  getUserAvatar = () => '',
  formatNowTime = () => '',
  formatFileSize = () => '',
  extractDocumentText = async () => ({}),
  readFileAsBase64 = async () => '',
  saveAttachmentBytes = async () => null,
  addMessage = () => {},
  appendMessage = () => {},
  addComposerAttachment = () => {},
  getBridge = () => null,
  setWorldIndicatorName = () => {},
} = {}) {
  return {
    handleSticker(tag) {
      if (!isStickerAllowed()) {
        showInfo?.('RP界面不支持贴图');
        return null;
      }
      const sessionId = getCurrentSessionId?.();
      bumpStickerUsage?.(tag);
      const message = {
        role: 'user',
        type: 'sticker',
        content: tag,
        name: getActiveUserName?.(),
        avatar: getUserAvatar?.(),
        time: formatNowTime?.(),
      };
      addMessage?.(message);
      appendMessage?.(message, sessionId);
      return message;
    },

    handleImage(url, name = '') {
      const resolved = String(url || '').trim();
      if (!resolved) return null;
      const attachment = {
        kind: 'image',
        url: resolved,
        name: String(name || '').trim(),
      };
      addComposerAttachment?.(attachment);
      return attachment;
    },

    handleMusicFile(dataUrl, name = '本地音频') {
      const sessionId = getCurrentSessionId?.();
      const message = {
        role: 'user',
        type: 'music',
        content: name,
        meta: { artist: '本地', url: dataUrl },
        name: getActiveUserName?.(),
        avatar: getUserAvatar?.(),
        time: formatNowTime?.(),
      };
      addMessage?.(message);
      appendMessage?.(message, sessionId);
      return message;
    },

    async handleDocumentFile(file) {
      if (!file) {
        showWarning?.('未选择文档');
        return null;
      }
      const name = String(file?.name || '').trim() || '文件';
      const mime = String(file?.type || '').trim();
      const size = Number(file?.size || 0);
      const sizeLabel = formatFileSize?.(size);
      let text = '';
      let textTruncated = false;
      let supported = false;
      let localPath = '';
      let localBytes = 0;
      try {
        const extracted = await extractDocumentText?.(file);
        text = extracted?.text || '';
        textTruncated = Boolean(extracted?.truncated);
        supported = Boolean(extracted?.supported);
      } catch {}
      if (!supported && mime) {
        showInfo?.('该文件类型暂不支持解析，将仅发送文件信息');
      }
      try {
        const sessionId = String(getCurrentSessionId?.() || '').trim();
        const base64 = await readFileAsBase64?.(file);
        if (sessionId && base64) {
          const response = await saveAttachmentBytes?.({
            sessionId,
            base64,
            fileName: name,
          });
          localPath = String(response?.path || '').trim();
          localBytes = Number(response?.bytes || 0) || 0;
        }
      } catch {}
      const attachment = {
        kind: 'document',
        name,
        mime,
        size,
        sizeLabel,
        text,
        textTruncated,
        localPath,
        localBytes,
        originalName: name,
      };
      addComposerAttachment?.(attachment);
      return attachment;
    },

    updateWorldIndicator() {
      const bridge = getBridge?.();
      const globalId = String(bridge?.globalWorldId || '').trim();
      const roleIds = bridge?.getRoleWorldIds?.(getCurrentSessionId?.()) || [];
      const currentIds = Array.isArray(bridge?.currentWorldIds)
        ? bridge.currentWorldIds
        : (bridge?.currentWorldId ? [bridge.currentWorldId] : []);
      const label = formatWorldIndicatorLabel({
        globalId,
        roleIds,
        currentIds,
      });
      setWorldIndicatorName?.(label);
      return label;
    },
  };
}
