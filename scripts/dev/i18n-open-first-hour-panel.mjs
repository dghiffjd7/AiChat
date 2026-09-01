import { evaluateInApp } from './cdp-client.mjs';

const panel = String(process.argv[2] || '').trim();
const keepCurrentPage = process.argv.includes('--no-reload');
const panels = {
  settings: { action: 'settings', selector: '#general-settings-panel' },
  config: { action: 'config', selector: '#config-panel' },
  preset: { action: 'preset', selector: '#preset-panel' },
};
if (!panels[panel]) {
  console.error('usage: node scripts/dev/i18n-open-first-hour-panel.mjs <settings|config|preset>');
  process.exit(1);
}

if (!keepCurrentPage) {
  try { await evaluateInApp('location.reload()'); } catch {}
}
const deadline = Date.now() + 20_000;
let ready = false;
while (Date.now() < deadline) {
  await new Promise(resolve => setTimeout(resolve, 400));
  try {
    ready = await evaluateInApp('Boolean(window.__chatappBootDiag?.runtimeReady && document.querySelector(\'.qq-message-topbar .user-settings-btn\'))');
    if (ready) break;
  } catch {}
}
if (!ready) {
  console.error('app reload timed out');
  process.exit(2);
}
const target = panels[panel];
const result = await evaluateInApp(`(async () => {
  const settingsButton = Array.from(document.querySelectorAll('.qq-message-topbar .user-settings-btn'))
    .find(element => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
    });
  settingsButton?.click();
  await new Promise(resolve => setTimeout(resolve, 120));
  document.querySelector(${JSON.stringify(`#settings-menu [data-action="${target.action}"]`)})?.click();
  await new Promise(resolve => setTimeout(resolve, 1200));
  return {
    opened: Boolean(document.querySelector(${JSON.stringify(target.selector)})),
    settingsButtons: document.querySelectorAll('.qq-message-topbar .user-settings-btn').length,
    selectedSettingsButton: Boolean(settingsButton),
    menuClass: document.getElementById('settings-menu')?.className || '',
    actionButton: Boolean(document.querySelector(${JSON.stringify(`#settings-menu [data-action="${target.action}"]`)})),
  };
})()`);
console.log(JSON.stringify({ panel, ...result }));
if (!result?.opened) process.exitCode = 3;
