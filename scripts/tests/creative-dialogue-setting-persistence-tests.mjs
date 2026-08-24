import assert from 'node:assert/strict';

const values = new Map();
globalThis.localStorage = {
  getItem: key => values.get(key) || null,
  setItem: (key, value) => values.set(key, String(value)),
  removeItem: key => values.delete(key),
};

const { appSettings } = await import('../../src/scripts/storage/app-settings.js');

assert.equal(appSettings.get().creativeDialogueHighlightEnabled, true);
appSettings.update({ creativeDialogueHighlightEnabled: false });
assert.equal(appSettings.get().creativeDialogueHighlightEnabled, false);
assert.equal(JSON.parse(values.get('app_settings_v1')).creativeDialogueHighlightEnabled, false);
appSettings.update({ creativeDialogueHighlightEnabled: 'unexpected' });
assert.equal(appSettings.get().creativeDialogueHighlightEnabled, true);

console.log('ok - creative dialogue highlight preference defaults on and persists safely');
