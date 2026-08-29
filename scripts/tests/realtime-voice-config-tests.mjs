import assert from 'node:assert/strict';

import {
  buildOpenAiRealtimeSessionConfig,
  filterRealtimeModelIds,
  filterRealtimeTranscriptionModelIds,
  normalizeRealtimeVoiceSettings,
  resolveRealtimeConfigReference,
} from '../../src/scripts/ui/realtime/realtime-voice-config-utils.js';

const defaults = normalizeRealtimeVoiceSettings({});
assert.equal(defaults.realtimeModel, 'gpt-realtime-2.1');
assert.equal(defaults.transcriptionModel, 'gpt-4o-mini-transcribe');
assert.equal(defaults.transcriptionLanguage, '');
assert.equal(defaults.voice, 'marin');
assert.equal(defaults.vad.createResponse, false);
assert.equal(defaults.vad.interruptResponse, true);

const normalized = normalizeRealtimeVoiceSettings({
  configRef: { scope: 'unknown', profileId: '  p1  ' },
  transcriptionLanguage: ' ZH, en, zh ',
  voice: 'not-a-voice',
  vad: { threshold: 3, prefixPaddingMs: -1, silenceDurationMs: 99999 },
  idleTimeoutMinutes: 999,
});
assert.deepEqual(normalized.configRef, { scope: 'voice_shared', profileId: 'p1' });
assert.equal(normalized.transcriptionLanguage, 'zh,en');
assert.equal(normalized.voice, 'marin');
assert.equal(normalized.vad.threshold, 1);
assert.equal(normalized.vad.prefixPaddingMs, 0);
assert.equal(normalized.vad.silenceDurationMs, 5000);
assert.equal(normalized.idleTimeoutMinutes, 30);

assert.deepEqual(filterRealtimeModelIds([
  'gpt-4o-mini-tts',
  'gpt-realtime-2.1',
  'gpt-realtime-mini',
  'gpt-4o-realtime-preview-2025-06-03',
]), [
  'gpt-realtime-2.1',
  'gpt-realtime-mini',
  'gpt-4o-realtime-preview-2025-06-03',
]);
assert.deepEqual(filterRealtimeTranscriptionModelIds([
  'gpt-realtime-2.1',
  'gpt-4o-mini-transcribe',
  'gpt-4o-transcribe',
  'whisper-1',
  'text-embedding-3-small',
]), ['gpt-4o-mini-transcribe', 'gpt-4o-transcribe', 'whisper-1']);

const session = buildOpenAiRealtimeSessionConfig({
  ...defaults,
  instructions: '角色语义快照',
});
assert.equal(session.type, 'realtime');
assert.equal(session.model, 'gpt-realtime-2.1');
assert.deepEqual(session.output_modalities, ['audio']);
assert.equal(session.audio.input.transcription.model, 'gpt-4o-mini-transcribe');
assert.equal(session.audio.input.transcription.language, undefined);
assert.equal(session.audio.input.turn_detection.create_response, false);
assert.equal(session.audio.input.turn_detection.interrupt_response, true);
assert.equal(session.instructions, '角色语义快照');

const chineseEnglishSession = buildOpenAiRealtimeSessionConfig({
  ...defaults,
  transcriptionLanguage: 'zh,en',
});
assert.equal(chineseEnglishSession.audio.input.transcription.language, 'zh');
assert.equal(chineseEnglishSession.audio.input.transcription.languages, undefined);

const liveMultilingualSession = buildOpenAiRealtimeSessionConfig({
  ...defaults,
  transcriptionModel: 'gpt-live-transcribe',
  transcriptionLanguage: 'zh,en',
});
assert.deepEqual(liveMultilingualSession.audio.input.transcription.languages, ['zh', 'en']);
assert.equal(liveMultilingualSession.audio.input.transcription.language, undefined);

const manager = {
  async getRuntimeConfigByProfileId(profileId) {
    assert.equal(profileId, 'profile_openai');
    return {
      provider: 'openai',
      baseUrl: 'https://api.openai.com/v1/',
      apiKey: 'sk-test-secret',
    };
  },
};
const resolved = await resolveRealtimeConfigReference({
  settings: { configRef: { scope: 'chat', profileId: 'profile_openai' } },
  managers: { chat: manager },
});
assert.equal(resolved.ok, true);
assert.equal(resolved.config.baseUrl, 'https://api.openai.com/v1');
assert.equal(resolved.config.apiKey, 'sk-test-secret');

const wrongProvider = await resolveRealtimeConfigReference({
  settings: { configRef: { scope: 'chat', profileId: 'profile_openai' } },
  managers: {
    chat: { async getRuntimeConfigByProfileId() { return { provider: 'custom', apiKey: 'x', baseUrl: 'https://example.com/v1' }; } },
  },
});
assert.equal(wrongProvider.ok, false);
assert.equal(wrongProvider.reason, 'provider_not_openai');

const invalidModels = await resolveRealtimeConfigReference({
  settings: {
    configRef: { scope: 'chat', profileId: 'profile_openai' },
    realtimeModel: 'gpt-4.1',
    transcriptionModel: 'gpt-4o-mini',
  },
  managers: { chat: manager },
});
assert.equal(invalidModels.ok, false);
assert.equal(invalidModels.reason, 'realtime_model_invalid');

console.log('realtime voice config tests passed');
