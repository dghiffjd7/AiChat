import { evaluateInApp } from './cdp-client.mjs';

const targetLocale = String(process.argv[2] || '').trim();
if (!['system', 'zh-CN', 'zh-TW', 'en'].includes(targetLocale)) {
  console.error('usage: node scripts/dev/i18n-deferred-switch-smoke.mjs <system|zh-CN|zh-TW|en>');
  process.exit(1);
}

const result = await evaluateInApp(`(async () => {
  const select = document.getElementById('general-language-select');
  if (!select) return { ok: false, reason: 'language_select_missing' };
  const before = window.appI18n?.getState?.() || {};
  select.value = ${JSON.stringify(targetLocale)};
  select.dispatchEvent(new Event('change', { bubbles: true }));
  await new Promise(resolve => setTimeout(resolve, 250));
  const confirmationModal = document.querySelector('.app-confirm-modal');
  const confirmationVisible = Boolean(confirmationModal && getComputedStyle(confirmationModal).display !== 'none');
  let persisted = {};
  try { persisted = JSON.parse(localStorage.getItem('app_settings_v1') || '{}') || {}; } catch {}
  const after = window.appI18n?.getState?.() || {};
  document.querySelector('.app-confirm-modal .app-confirm-cancel')?.click();
  await new Promise(resolve => setTimeout(resolve, 100));
  return {
    ok: true,
    beforeLocale: before.locale,
    afterLocale: after.locale,
    targetLocale: persisted.locale,
    confirmationVisible,
    confirmationClosed: getComputedStyle(document.querySelector('.app-confirm-modal')).display === 'none',
  };
})()`);
console.log(JSON.stringify(result, null, 2));
if (
  result?.ok !== true
  || result.confirmationVisible !== true
  || result.confirmationClosed !== true
  || result.targetLocale !== targetLocale
  || result.afterLocale !== result.beforeLocale
) process.exitCode = 2;
