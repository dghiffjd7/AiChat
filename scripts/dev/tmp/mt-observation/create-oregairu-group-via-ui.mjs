import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { evaluateInApp } from '../../cdp-client.mjs';

const outputPath = resolve(
  'scripts/dev/tmp/mt-observation/oregairu-group-ui-create-20260730.json',
);
const expression = `(async () => {
  const registry = window.appBridge?.debugUiRegistry || {};
  const stores = registry.stores || {};
  const panels = registry.panels || {};
  await Promise.all([
    stores.chatStore?.fullyReady || stores.chatStore?.ready,
    stores.contactsStore?.ready,
  ].filter(Boolean));

  const removedOrphan = await panels.sessionPanel?.removeCore?.('Lara Croft');
  panels.sessionPanel?.refresh?.();
  const orphanStillPresent = stores.chatStore?.listSessions?.().includes('Lara Croft') === true;
  if (orphanStillPresent) {
    return { ok: false, reason: 'orphan_session_delete_failed', removedOrphan };
  }

  const existing = (stores.contactsStore?.listGroups?.() || [])
    .find(item => String(item?.name || '').trim() === '侍奉部');
  if (existing) {
    return {
      ok: false,
      reason: 'group_already_exists',
      existing: { id: existing.id, name: existing.name, members: existing.members || [] },
      removedOrphan,
    };
  }

  const panelController = panels.groupCreatePanel;
  panelController?.show?.();
  await new Promise(resolve => setTimeout(resolve, 250));
  const panel = panelController?.panel;
  if (!panel) return { ok: false, reason: 'group_create_panel_missing', removedOrphan };

  const nameInput = panel.querySelector('#group-name');
  if (!nameInput) return { ok: false, reason: 'group_name_input_missing', removedOrphan };
  nameInput.value = '侍奉部';
  nameInput.dispatchEvent(new Event('input', { bubbles: true }));

  const requestedMembers = ['比企谷八幡', '雪之下雪乃', '由比滨结衣'];
  const clicked = [];
  for (const memberId of requestedMembers) {
    const row = [...panel.querySelectorAll('[data-contact-id]')]
      .find(item => String(item.dataset?.contactId || '').trim() === memberId);
    if (!row) {
      panelController?.hide?.();
      return {
        ok: false,
        reason: 'group_member_row_missing',
        memberId,
        clicked,
        removedOrphan,
      };
    }
    row.click();
    clicked.push(memberId);
  }

  const state = panelController?.ensureCreateRuntime?.()?.getValidationState?.() || null;
  if (!state?.valid) {
    panelController?.hide?.();
    return { ok: false, reason: 'group_validation_failed', state, clicked, removedOrphan };
  }
  const createButton = panel.querySelector('#group-create');
  if (!createButton) {
    panelController?.hide?.();
    return { ok: false, reason: 'group_create_button_missing', clicked, removedOrphan };
  }
  createButton.click();
  await new Promise(resolve => setTimeout(resolve, 500));

  const group = (stores.contactsStore?.listGroups?.() || [])
    .find(item => String(item?.name || '').trim() === '侍奉部') || null;
  if (!group) return { ok: false, reason: 'group_not_created', clicked, removedOrphan };
  const memberIds = Array.isArray(group.members) ? group.members.map(String) : [];
  const resolved = window.appBridge?.getResolvedWorldState?.(group.id, {
    uiMode: 'chat',
    isGroupChat: true,
    groupMemberIds: memberIds,
  }) || null;
  return {
    ok: true,
    removedOrphan,
    orphanStillPresent: false,
    group: {
      id: group.id,
      name: group.name,
      members: memberIds,
      hasAvatar: Boolean(group.avatar),
      messageCount: Number(stores.chatStore?.getMessages?.(group.id)?.length || 0),
    },
    resolved,
    currentSessionId: stores.chatStore?.getCurrent?.() || '',
  };
})()`;

const result = await evaluateInApp(expression, { timeoutMs: 300000 });
writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ ...result, outputPath }, null, 2));
if (!result?.ok) process.exitCode = 1;
