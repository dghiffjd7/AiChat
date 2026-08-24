import assert from 'node:assert/strict';

globalThis.localStorage = {
  getItem: () => null,
  setItem() {},
  removeItem() {},
};

const { normalizePersonaVoiceSettings } = await import('../../src/scripts/storage/persona-store.js');
const {
  buildExperiencePackContactPayload,
  buildExperiencePackPersonaPayload,
} = await import('../../src/scripts/ui/experience-pack-export-utils.js');
const { buildCustomBundlePersonaPayload } = await import('../../src/scripts/ui/custom-bundle-manifest-utils.js');

assert.deepEqual(normalizePersonaVoiceSettings({
  narrationVoiceRef: ' narrator ',
  dialogueVoiceRef: ' dialogue ',
  apiKey: 'must-not-survive',
}), {
  narrationVoiceRef: 'narrator',
  dialogueVoiceRef: 'dialogue',
});
assert.deepEqual(normalizePersonaVoiceSettings(null), {
  narrationVoiceRef: '',
  dialogueVoiceRef: '',
});
const persona = {
  id: 'persona-a',
  name: '角色 A',
  description: '测试',
  voiceSettings: { narrationVoiceRef: 'narrator', dialogueVoiceRef: 'dialogue' },
};
assert.equal('voiceSettings' in buildExperiencePackPersonaPayload({ persona }), false);
assert.equal('voiceSettings' in buildCustomBundlePersonaPayload({ role: persona }), false);
assert.equal('voiceRef' in buildExperiencePackContactPayload({
  contact: { id: 'contact-a', name: '角色 A', voiceRef: 'narrator' },
}), false);
console.log('ok - persona voice settings preserve only local registry references');
