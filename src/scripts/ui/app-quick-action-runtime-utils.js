export const openSessionRawReplyFlow = ({
  sessionId = '',
  getContact = () => null,
  getLastRawResponse = () => '',
  getLastRawAt = () => '',
  getRepairDetails = () => null,
  showRawReplyModal = () => {},
  notifyWarning = () => {},
} = {}) => {
  const sid = String(sessionId || '').trim();
  const contact = getContact?.(sid);
  const name = contact?.name || sid;
  const raw = getLastRawResponse?.(sid);
  const at = getLastRawAt?.(sid);
  if (!raw) {
    notifyWarning?.('暂无原始回复记录（请先让 AI 回复一次）');
    return false;
  }
  const meta = `${name}${at ? ` · ${new Date(at).toLocaleString()}` : ''}`;
  const repairDetails = getRepairDetails?.(sid, { raw, at, contact }) || null;
  showRawReplyModal?.(raw, meta, repairDetails);
  return true;
};

export const createQuickActionRuntime = ({
  mediaPicker = null,
  appConfirm = async () => false,
  promptFn = () => '',
  addMessage = () => {},
  appendMessage = () => {},
  getActiveUserName = () => '我',
  getActiveUserAvatar = () => '',
  formatNowTime = () => '',
  setStickerPanelOpen = () => {},
  isStickerAllowed = () => true,
  setActionPanelOpen = () => {},
  generateImage = async () => {},
  notifyInfo = () => {},
} = {}) => {
  const actionHandlers = {
    'generate-image': async () => {
      await generateImage?.();
    },
    image: async () => {
      await mediaPicker?.pickFile?.('image');
    },
    music: async () => {
      const useFile = await appConfirm?.({
        title: '音频来源',
        message: '使用本地音频文件吗？',
        confirmText: '本地文件',
        cancelText: '使用 URL',
      });
      if (useFile) {
        await mediaPicker?.pickFile?.('audio');
        return;
      }
      const title = promptFn?.('输入歌名', '未命名');
      const artist = promptFn?.('输入歌手', '');
      const audioUrl = promptFn?.('音源 URL（可留空）', '');
      if (!title) return;
      const msg = {
        role: 'user',
        type: 'music',
        content: title,
        meta: { artist, url: audioUrl },
        name: getActiveUserName?.(),
        avatar: getActiveUserAvatar?.(),
        time: formatNowTime?.(),
      };
      addMessage?.(msg);
      appendMessage?.(msg);
    },
    transfer: async () => {
      const amount = promptFn?.('输入金額（示例：520元）', '520元');
      if (!amount) return;
      const msg = {
        role: 'user',
        type: 'transfer',
        content: amount,
        name: getActiveUserName?.(),
        avatar: getActiveUserAvatar?.(),
        time: formatNowTime?.(),
      };
      addMessage?.(msg);
      appendMessage?.(msg);
    },
    sticker: async () => {
      if (!isStickerAllowed?.()) {
        notifyInfo?.('创意写作界面不支持贴图');
        return;
      }
      setStickerPanelOpen?.(true);
    },
    document: async () => {
      await mediaPicker?.pickFile?.('document');
    },
  };

  const runQuickAction = (action) => {
    const handler = actionHandlers[action];
    if (handler) {
      setActionPanelOpen?.(false);
      handler();
      return true;
    }
    notifyInfo?.(`快捷操作占位：${action}`);
    return false;
  };

  return {
    actionHandlers,
    runQuickAction,
  };
};

export const bindQuickActionButtons = ({
  actionButtons = [],
  chatStickerBtn = null,
  actionChips = [],
  runQuickAction = () => {},
} = {}) => {
  (actionButtons || []).forEach((button) => {
    button?.addEventListener?.('click', () => {
      const action = button.dataset?.action;
      runQuickAction(action);
    });
  });

  chatStickerBtn?.addEventListener?.('click', () => {
    runQuickAction('sticker');
  });

  (actionChips || []).forEach((button) => {
    button?.addEventListener?.('click', () => {
      const action = button.dataset?.action;
      runQuickAction(action);
    });
  });
};
