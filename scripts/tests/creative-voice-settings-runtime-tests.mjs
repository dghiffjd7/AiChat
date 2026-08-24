import assert from 'node:assert/strict';

import {
  buildCreativeVoiceSelectOptions,
  normalizeCreativeVoiceSettings,
} from '../../src/scripts/ui/chat/creative-voice-settings-runtime.js';

assert.deepEqual(normalizeCreativeVoiceSettings({
  narrationVoiceRef: ' voice-a ',
  dialogueVoiceRef: null,
  apiKey: 'must-not-survive',
}), {
  narrationVoiceRef: 'voice-a',
  dialogueVoiceRef: '',
});

const voices = [
  { id: 'voice-a', label: 'Serena', provider: 'qwen_local', profileName: '本地语音', valid: true },
  { id: 'voice-b', label: 'Nova', provider: 'openai', profileName: '云端', valid: false },
];
const narration = buildCreativeVoiceSelectOptions(voices, {
  slot: 'narration',
  selectedVoiceRef: 'voice-a',
});
assert.equal(narration[0].label, '默认（全局）');
assert.match(narration[1].label, /Serena.*qwen_local.*本地语音/);
assert.match(narration[2].label, /失效/);

const dialogue = buildCreativeVoiceSelectOptions(voices, {
  slot: 'dialogue',
  selectedVoiceRef: 'deleted-voice',
});
assert.equal(dialogue[0].label, '沿用旁白声音');
assert.equal(dialogue.at(-1).value, 'deleted-voice');
assert.equal(dialogue.at(-1).invalid, true);

console.log('ok - creative persona voice selectors expose local registry bindings and safe fallbacks');
