export const runGroupSettingsSaveFlow = ({
  groupId = '',
  panel = null,
  avatar = '',
  members = [],
  contactsStore = null,
  chatStore = null,
  onSaved = null,
  hide = () => {},
  normalize = (value) => String(value || '').trim(),
  normalizeKey = (value) => String(value || '').trim().toLowerCase().replace(/\s+/g, ''),
  notifySuccess = () => {},
  notifyError = () => {},
  logger = console,
} = {}) => {
  try {
    const prev = contactsStore?.getContact?.(groupId);
    if (!prev) return false;

    const sessionSettings = chatStore?.getSessionSettings?.(groupId) || {};
    const nextName = normalize(panel?.querySelector?.('#group-settings-name')?.value) || prev.name;
    const nextKey = normalizeKey(nextName);
    const groups = contactsStore?.listGroups?.() || [];
    const dup = groups.find((group) => group?.id !== groupId && normalizeKey(group?.name) === nextKey);
    if (dup) {
      notifyError?.('已存在同名群组');
      return false;
    }

    const beforeMembers = Array.isArray(prev.members) ? prev.members.map(normalize).filter(Boolean) : [];
    const afterMembers = [...new Set((Array.isArray(members) ? members : []).map(normalize).filter(Boolean))];

    logger?.info?.(
      `[group-chat] save scope=${contactsStore?.scopeId || 'default'} id=${groupId} prevName=${String(prev.name || '')} nextName=${nextName} beforeMembers=${beforeMembers.length} afterMembers=${afterMembers.length} avatarLen=${String(avatar || '').trim().length}`
    );

    chatStore?.setSessionSettings?.(groupId, sessionSettings);
    contactsStore?.upsertContact?.({
      ...prev,
      id: groupId,
      name: nextName,
      avatar: avatar || '',
      isGroup: true,
      members: afterMembers,
    });

    const time = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    let didAppendSystem = false;
    if (nextName !== prev.name) {
      chatStore?.appendMessage?.({ role: 'system', type: 'meta', content: `群聊名称已更新：${prev.name} → ${nextName}`, name: '系统', time }, groupId);
      didAppendSystem = true;
    }

    const added = afterMembers.filter((memberId) => !beforeMembers.includes(memberId));
    const removed = beforeMembers.filter((memberId) => !afterMembers.includes(memberId));

    if (added.length) {
      const names = added.map((memberId) => contactsStore?.getContact?.(memberId)?.name || memberId).join('、');
      chatStore?.appendMessage?.({ role: 'system', type: 'meta', content: `成员加入：${names}`, name: '系统', time }, groupId);
      didAppendSystem = true;
    }
    if (removed.length) {
      const names = removed.map((memberId) => contactsStore?.getContact?.(memberId)?.name || memberId).join('、');
      chatStore?.appendMessage?.({ role: 'system', type: 'meta', content: `成员已移除：${names}`, name: '系统', time }, groupId);
      didAppendSystem = true;
    }

    notifySuccess?.('已保存群聊设置');
    onSaved?.({ id: groupId, forceRefresh: didAppendSystem });
    hide?.();
    return { groupId, nextName, didAppendSystem, beforeMembers, afterMembers };
  } catch (error) {
    logger?.error?.('保存群聊设置失败', error);
    notifyError?.(error?.message || '保存失败');
    return false;
  }
};
