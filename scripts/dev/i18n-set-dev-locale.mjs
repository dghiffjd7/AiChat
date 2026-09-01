import { evaluateInApp } from './cdp-client.mjs';

const locale = String(process.argv[2] || '').trim();
if (!['system', 'zh-CN', 'zh-TW', 'en'].includes(locale)) {
  console.error('usage: node scripts/dev/i18n-set-dev-locale.mjs <system|zh-CN|zh-TW|en>');
  process.exit(1);
}

await evaluateInApp(`(() => {
  const key = 'app_settings_v1';
  let current = {};
  try { current = JSON.parse(localStorage.getItem(key) || '{}') || {}; } catch {}
  const next = {
    ...current,
    locale: ${JSON.stringify(locale)},
    languageSetupCompleted: true,
    __updatedAt: Date.now(),
  };
  localStorage.setItem(key, JSON.stringify(next));
  return next.locale;
})()`);
try {
  await evaluateInApp('location.reload()');
} catch {}

const deadline = Date.now() + 20_000;
let state = null;
while (Date.now() < deadline) {
  await new Promise(resolve => setTimeout(resolve, 500));
  try {
    state = await evaluateInApp('window.appI18n?.getState?.() || null', { timeoutMs: 5000 });
    if (state?.locale && (locale === 'system' || state.preference === locale)) break;
  } catch {}
}
if (!state?.locale) {
  console.error('locale reload timed out');
  process.exit(2);
}
console.log(JSON.stringify({
  preference: state.preference,
  requestedLocale: state.requestedLocale,
  locale: state.locale,
  loadError: state.loadError,
}, null, 2));
