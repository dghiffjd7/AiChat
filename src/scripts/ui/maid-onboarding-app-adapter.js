const trim = value => String(value || '').trim();

export const createMaidOnboardingAppAdapter = ({
  documentRef = globalThis?.document || null,
  targetSelectors = {},
  isElementVisible = element => Boolean(element),
  delay = async () => {},
  openSettingsMenu = null,
  openApiConfig = null,
  openQuickMenu = null,
  openAddFriend = null,
  closeMenus = null,
  closeApiConfig = null,
  closeAddFriend = null,
  cancelAddFriendConfirm = null,
  isChatRoomVisible = () => false,
  exitChatRoom = null,
  switchPage = null,
  openMaidCommand = null,
  closeMaidCommand = null,
  openAgentCenter = null,
  closeAgentCenter = null,
  openAgentCenterDetail = null,
  closeAgentCenterDetail = null,
  emit = null,
  configManager = null,
} = {}) => {
  const resolveTarget = (targetKey = '') => {
    const selectors = targetSelectors?.[trim(targetKey)] || [];
    for (const selector of selectors) {
      try {
        for (const element of documentRef?.querySelectorAll?.(selector) || []) {
          if (isElementVisible(element)) return element;
        }
      } catch {}
    }
    return null;
  };

  const preparePreviousStep = async (target = '') => {
    if (target === 'settings-entry') {
      await closeApiConfig?.();
      await closeMenus?.();
      return false;
    }
    if (target === 'settings-api-config') {
      await closeApiConfig?.();
      return false;
    }
    if (target === 'top-plus-entry') {
      await cancelAddFriendConfirm?.();
      await closeAddFriend?.();
      await delay(260);
      await closeMenus?.();
      return false;
    }
    if (target === 'quick-add-friend') {
      await cancelAddFriendConfirm?.();
      await closeAddFriend?.();
      await delay(260);
      return false;
    }
    if (target === 'add-friend-recommendation') {
      await cancelAddFriendConfirm?.();
      await delay(220);
      return true;
    }
    if (target === 'maid-ball') {
      await closeAgentCenter?.();
      await closeMaidCommand?.();
      await closeMenus?.();
      return false;
    }
    if (target === 'maid-command-input') {
      await closeAgentCenter?.();
      await closeMenus?.();
      return false;
    }
    if (target === 'agent-center-entry') {
      await closeAgentCenter?.();
      return false;
    }
    if (target === 'agent-center-card') {
      await closeAgentCenterDetail?.();
      return false;
    }
    if (target === 'agent-center-detail-close') {
      await openAgentCenter?.();
      await openAgentCenterDetail?.();
      return true;
    }
    return false;
  };

  const prepareStep = async ({ step = null, meta = null } = {}) => {
    const target = trim(step?.target);
    const isPrevious = trim(meta?.reason) === 'prev';
    if (isPrevious && await preparePreviousStep(target)) return;
    if (!isPrevious) await delay(0);
    if (target === 'settings-api-config' && !resolveTarget(target)) {
      await openSettingsMenu?.();
      return;
    }
    if (target.startsWith('config-') && !resolveTarget(target)) {
      await openApiConfig?.({ reason: 'guide' });
      return;
    }
    if (target === 'quick-add-friend' && !resolveTarget(target)) {
      await openQuickMenu?.();
      return;
    }
    if ((target === 'add-friend-search-input' || target === 'add-friend-recommendation') && !resolveTarget(target)) {
      const panel = await openAddFriend?.();
      if (target === 'add-friend-recommendation') panel?.nameInput?.focus?.();
      return;
    }
    if (target === 'chat-list-entry') {
      if (isChatRoomVisible?.()) await exitChatRoom?.({ animate: false, source: 'maid-onboarding' });
      await switchPage?.('chat', { animate: false });
      return;
    }
    if (target === 'agent-center-entry') {
      await closeMaidCommand?.();
      if (resolveTarget('settings-agent-center')) return;
      await openSettingsMenu?.();
      if (resolveTarget('settings-agent-center') || resolveTarget(target)) return;
      await switchPage?.('moments', { animate: false });
      return;
    }
    if (target === 'maid-command-settings' && !resolveTarget(target)) {
      await openMaidCommand?.();
      return;
    }
    if (target === 'agent-center-detail-close' && !resolveTarget(target)) {
      await openAgentCenter?.();
      await openAgentCenterDetail?.();
      return;
    }
    if ((target === 'agent-center-card' || target === 'agent-center-close') && !resolveTarget(target)) {
      await openAgentCenter?.();
    }
  };

  const runClickFallback = async (action, target) => {
    if (typeof action !== 'function') return false;
    const result = await action();
    if (result === false) return false;
    emit?.('target-click', { target });
    return true;
  };

  const runFallback = async ({ step = null } = {}) => {
    const kind = trim(step?.fallback?.kind);
    if (kind === 'open-settings-menu') {
      return runClickFallback(openSettingsMenu, 'settings-entry');
    }
    if (kind === 'open-api-config') {
      if (typeof openApiConfig !== 'function') return false;
      return runClickFallback(() => openApiConfig?.({ reason: 'guide' }), 'settings-api-config');
    }
    if (kind === 'open-quick-menu') {
      return runClickFallback(openQuickMenu, 'top-plus-entry');
    }
    if (kind === 'open-add-friend') {
      return runClickFallback(openAddFriend, 'quick-add-friend');
    }
    if (kind === 'open-maid-command') return openMaidCommand?.();
    if (kind === 'open-agent-center') {
      await closeMaidCommand?.();
      await openAgentCenter?.();
      emit?.('agent-center-opened', {});
      return true;
    }
    if (kind === 'close-agent-center') {
      await closeAgentCenter?.();
      emit?.('agent-center-closed', {});
      return true;
    }
    const target = resolveTarget(step?.fallback?.target || step?.target);
    if (kind === 'focus-target') {
      target?.focus?.();
      return Boolean(target);
    }
    if (kind === 'click-target') {
      target?.click?.();
      return Boolean(target);
    }
    return false;
  };

  const hasConfiguredProfile = () => (configManager?.getProfiles?.() || []).some((profile) => {
    if (!trim(profile?.model)) return false;
    const hasSavedKey = Boolean(trim(profile?.activeKeyId)) ||
      (configManager?.listKeys?.(profile?.id) || []).length > 0;
    const hasServiceAccount = Boolean(trim(
      profile?.vertexaiServiceAccount || profile?.serviceAccount || profile?.serviceAccountJson,
    ));
    return hasSavedKey || hasServiceAccount;
  });

  return {
    hasConfiguredProfile,
    prepareStep,
    resolveTarget,
    runFallback,
  };
};
