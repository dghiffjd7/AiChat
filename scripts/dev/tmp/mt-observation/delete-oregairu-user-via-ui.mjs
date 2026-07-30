import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { evaluateInApp } from '../../cdp-client.mjs';

const outputIndex = process.argv.indexOf('--output');
const outputPath = resolve(
  outputIndex >= 0
    ? process.argv[outputIndex + 1]
    : 'scripts/dev/tmp/mt-observation/oregairu-user-ui-delete-20260730.json',
);

const result = await evaluateInApp(`(async () => {
  const registry = window.appBridge?.debugUiRegistry || {};
  const stores = registry.stores || {};
  const panel = registry.panels?.userPanel || null;
  await Promise.all([stores.userStore?.ready, stores.personaStore?.ready].filter(Boolean));
  const target = (stores.userStore?.getAll?.() || [])
    .find(item => String(item?.name || '').trim() === '桐谷澪') || null;
  if (!target) {
    return { ok: true, alreadyAbsent: true, deleted: false, targetId: '' };
  }
  if (!panel?.show || !panel?.openEdit || !panel?.deleteCurrent) {
    return { ok: false, reason: 'user_panel_delete_unavailable', targetId: target.id };
  }

  await panel.show();
  panel.openEdit(target.id);
  const clicked = [];
  const clicker = setInterval(() => {
    const visible = element => {
      if (!element) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    };
    const dialog = [...document.querySelectorAll('.app-confirm-modal')]
      .find(item => (
        visible(item) &&
        String(item.querySelector('.app-confirm-title')?.textContent || '').trim() === '删除用户' &&
        String(item.querySelector('.app-confirm-body')?.textContent || '').trim() === '确定要删除此用户吗？'
      ));
    const button = dialog?.querySelector?.('.app-confirm-ok');
    if (button && visible(button) && !button.dataset.oregairuClicked) {
      button.dataset.oregairuClicked = '1';
      clicked.push({ at: Date.now(), text: String(button.textContent || '').trim() });
      button.click();
    }
  }, 50);

  try {
    await panel.deleteCurrent();
  } finally {
    clearInterval(clicker);
  }
  const stillExists = Boolean(stores.userStore?.get?.(target.id));
  const boundPersonas = (stores.personaStore?.getAll?.() || [])
    .filter(item => String(item?.source?.boundUserId || '').trim() === String(target.id || '').trim())
    .map(item => ({ id: item.id, name: item.name }));
  return {
    ok: !stillExists,
    alreadyAbsent: false,
    deleted: !stillExists,
    targetId: target.id,
    targetName: target.name,
    clicked,
    activeUser: stores.userStore?.getActive?.()?.name || '',
    boundPersonas,
  };
})()`, { timeoutMs: 120000 });

writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ ...result, outputPath }, null, 2));
if (!result?.ok) process.exitCode = 1;
