import { isRpSessionId } from '../memory/memory-context-utils.js';
import { normalizeBadgeList } from '../utils/name-badges.js';

export const runContactSettingsPopulateFlow = ({
  sessionId = '',
  contactsStore = null,
  chatStore = null,
  panel = null,
  avatarPreview = null,
  nameInput = null,
  labelsInput = null,
  templateToggle = null,
  scriptToggle = null,
  rpBridgeSection = null,
  memoryShareSection = null,
  memoryShareSummary = null,
  exportExperiencePackBtn = null,
  onExportExperiencePack = null,
  globalSettings = {},
  setCurrentAvatar = () => {},
  getRpDisplayName = () => '',
  refreshMemoryShareSummary = () => Promise.resolve(),
  resolveAvatar = ({ avatar, name }) => avatar || name || '',
  defaultAvatar = '',
  logger = console,
} = {}) => {
  const contact = contactsStore?.getContact?.(sessionId) || { id: sessionId, name: sessionId, avatar: '' };
  const isRpSession = isRpSessionId(sessionId);
  const rpDisplayName = isRpSession ? getRpDisplayName(sessionId) : '';

  contactsStore?.upsertContact?.(contact);

  const title = panel?.querySelector?.('#contact-settings-title');
  if (title) title.textContent = isRpSession ? '设置' : '好友设置';
  const sub = panel?.querySelector?.('#contact-settings-sub');
  if (sub) sub.textContent = `会话：${sessionId}`;

  const currentAvatar = contact.avatar || '';
  setCurrentAvatar(currentAvatar);

  if (avatarPreview) {
    const savedName = String(contact?.name || '').trim();
    const nameForAvatar = isRpSession
      ? (rpDisplayName || (savedName && !savedName.startsWith('rp:') ? savedName : '') || sessionId || '角色')
      : (savedName || sessionId || '好友');
    const tags = Array.isArray(contact?.libraryTags) && contact.libraryTags.length
      ? contact.libraryTags
      : Array.isArray(contact?.labels)
        ? contact.labels
        : [];
    avatarPreview.src = resolveAvatar({
      avatar: currentAvatar || defaultAvatar,
      name: nameForAvatar,
      tags,
      size: 96,
    });
  }

  if (nameInput) {
    const savedName = String(contact?.name || '').trim();
    nameInput.value = isRpSession
      ? (savedName && !savedName.startsWith('rp:') ? savedName : (rpDisplayName || savedName || sessionId))
      : (savedName || sessionId);
  }

  if (labelsInput) {
    const labels = Array.isArray(contact?.labels) ? contact.labels : [];
    labelsInput.value = labels.join(', ');
  }

  const sessionSettings = chatStore?.getSessionSettings?.(sessionId) || {};
  if (templateToggle) {
    templateToggle.checked = (typeof sessionSettings.templateEnabled === 'boolean')
      ? sessionSettings.templateEnabled
      : (globalSettings.templateEnabled !== false);
  }
  if (scriptToggle) {
    scriptToggle.checked = (typeof sessionSettings.scriptEnabled === 'boolean')
      ? sessionSettings.scriptEnabled
      : (globalSettings.scriptEnabled === true);
  }

  const bridgeBlockTitle = panel?.querySelector?.('#contact-bridge-block-title');
  if (bridgeBlockTitle) bridgeBlockTitle.style.display = isRpSession ? 'none' : 'block';
  if (rpBridgeSection) rpBridgeSection.style.display = 'none';
  if (memoryShareSection) memoryShareSection.style.display = 'block';

  if (exportExperiencePackBtn) {
    const isGroup = contact?.isGroup === true;
    const canExport = !isRpSession && !isGroup && typeof onExportExperiencePack === 'function';
    exportExperiencePackBtn.style.display = canExport ? 'flex' : 'none';
    exportExperiencePackBtn.disabled = !canExport;
  }

  Promise.resolve(refreshMemoryShareSummary(sessionId)).catch((error) => {
    logger?.warn?.('refresh memory share summary failed', error);
    if (memoryShareSummary) memoryShareSummary.textContent = '记忆共享状态读取失败';
  });

  return {
    contact,
    currentAvatar,
    isRpSession,
    rpDisplayName,
  };
};

export const runContactSettingsSaveFlow = ({
  sessionId = '',
  contactsStore = null,
  chatStore = null,
  nameInput = null,
  labelsInput = null,
  currentAvatar = '',
  templateToggle = null,
  scriptToggle = null,
  onSaved = null,
  hide = () => {},
  notifySuccess = () => {},
  notifyError = () => {},
  logger = console,
} = {}) => {
  try {
    const prev = contactsStore?.getContact?.(sessionId) || { id: sessionId };
    const name = String(nameInput?.value || '').trim() || prev.name || sessionId;
    const avatar = String(currentAvatar || '');
    const rawLabels = String(labelsInput?.value || '');
    const labels = normalizeBadgeList(
      rawLabels
        .split(/[,，\n\r]/)
        .map((item) => item.trim())
        .filter(Boolean),
      { max: 8 },
    );

    const sessionSettings = chatStore?.getSessionSettings?.(sessionId) || {};
    if (templateToggle) sessionSettings.templateEnabled = Boolean(templateToggle.checked);
    if (scriptToggle) sessionSettings.scriptEnabled = Boolean(scriptToggle.checked);
    chatStore?.setSessionSettings?.(sessionId, sessionSettings);
    contactsStore?.upsertContact?.({ ...prev, id: sessionId, name, avatar, labels });

    notifySuccess(isRpSessionId(sessionId) ? '已保存设置' : '已保存好友设置');
    onSaved?.({ id: sessionId, name, avatar, labels });
    hide?.();
    return { sessionId, name, avatar, labels, sessionSettings };
  } catch (error) {
    logger?.error?.('保存好友设置失败', error);
    notifyError(error?.message || '保存失败');
    return false;
  }
};
