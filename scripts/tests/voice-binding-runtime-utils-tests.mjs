import assert from 'node:assert/strict';

import {
  createVoiceBindingConfigResolver,
  resolveMessageVoiceRef,
} from '../../src/scripts/ui/chat/voice-binding-runtime-utils.js';

{
  const contacts = new Map([
    ['private-a', { id: 'private-a', voiceRef: 'voice-private' }],
    ['speaker-a', { id: 'speaker-a', voiceRef: 'voice-group' }],
  ]);
  const getContact = id => contacts.get(id) || null;
  assert.equal(resolveMessageVoiceRef({
    message: { role: 'assistant' },
    sessionId: 'private-a',
    getContact,
  }), 'voice-private');
  assert.equal(resolveMessageVoiceRef({
    message: { role: 'assistant', name: 'A', meta: { speakerContactId: 'speaker-a' } },
    sessionId: 'group:room',
    getContact,
  }), 'voice-group');
  assert.equal(resolveMessageVoiceRef({
    message: { role: 'assistant', name: 'A' },
    sessionId: 'group:room',
    getContact,
    resolveGroupSpeakerContact: () => contacts.get('speaker-a'),
  }), 'voice-group');
  console.log('ok - voice binding resolves private and group speakers from stable contacts');
}

{
  const warningRefs = [];
  let globalResolveCount = 0;
  const globalConfig = {
    provider: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    apiKey: 'global-secret',
    model: 'global-model',
    ttsVoice: 'marin',
  };
  const records = new Map([
    ['shared', {
      id: 'shared',
      configRef: { scope: 'voice_shared', profileId: 'shared-profile' },
      providerSnapshot: 'qwen_local',
      voiceId: 'Serena',
      modelOverride: 'override-shared',
    }],
    ['split', {
      id: 'split',
      configRef: { scope: 'voice_tts', profileId: 'tts-profile' },
      providerSnapshot: 'openai',
      voiceId: 'cedar',
      modelOverride: 'override-tts',
    }],
    ['stale', {
      id: 'stale',
      configRef: { scope: 'voice_tts', profileId: 'tts-profile' },
      providerSnapshot: 'qwen_local',
      voiceId: 'bad',
    }],
    ['missing-profile', {
      id: 'missing-profile',
      configRef: { scope: 'voice_tts', profileId: 'deleted-profile' },
      providerSnapshot: 'openai',
      voiceId: 'cedar',
    }],
  ]);
  const managers = {
    voice_shared: {
      getRuntimeConfigByProfileId: async id => id === 'shared-profile' ? {
        provider: 'qwen_local', baseUrl: 'http://localhost', ttsModel: 'shared-base', apiKey: 'shared-secret',
      } : null,
    },
    voice_tts: {
      getRuntimeConfigByProfileId: async id => id === 'tts-profile' ? {
        provider: 'openai', baseUrl: 'https://api.openai.com/v1', model: 'tts-base', apiKey: 'tts-secret',
      } : null,
    },
  };
  const resolver = createVoiceBindingConfigResolver({
    resolveGlobalConfig: async () => {
      globalResolveCount += 1;
      return { ...globalConfig };
    },
    getVoiceRecord: id => records.get(id) || null,
    getConfigManager: scope => managers[scope] || null,
    warnInvalidBinding: voiceRef => warningRefs.push(voiceRef),
  });

  const shared = await resolver('shared');
  assert.equal(shared.model, 'override-shared');
  assert.equal(shared.ttsModel, 'override-shared');
  assert.equal(shared.ttsVoice, 'Serena');
  assert.equal(globalResolveCount, 0, 'valid bindings must not decrypt the unrelated global profile');
  const split = await resolver('split');
  assert.equal(split.model, 'override-tts');
  assert.equal(split.ttsVoice, 'cedar');
  assert.deepEqual(await resolver('stale'), globalConfig);
  assert.deepEqual(await resolver('stale'), globalConfig);
  assert.deepEqual(warningRefs, ['stale']);
  assert.equal(globalResolveCount, 2, 'fallback config resolves once per speak attempt');
  const missingVoice = await resolver.resolveWithMeta('deleted-voice');
  assert.equal(missingVoice.reason, 'voice_missing');
  assert.equal(missingVoice.valid, false);
  assert.deepEqual(missingVoice.config, globalConfig);
  const missingProfile = await resolver.resolveWithMeta('missing-profile');
  assert.equal(missingProfile.reason, 'profile_missing');
  assert.equal(missingProfile.valid, false);
  assert.deepEqual(missingProfile.config, globalConfig);
  assert.deepEqual(warningRefs, ['stale', 'deleted-voice', 'missing-profile']);
  assert.equal(globalResolveCount, 4);
  console.log('ok - voice bindings resolve scoped profiles and dedupe invalid fallback warnings');
}
