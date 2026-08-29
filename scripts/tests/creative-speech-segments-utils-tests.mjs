import assert from 'node:assert/strict';

import { buildCreativeSpeechSegments } from '../../src/scripts/ui/chat/creative-speech-segments-utils.js';

const narrationConfig = { provider: 'openai', model: 'tts-base', ttsVoice: 'narrator' };
const dialogueConfig = { provider: 'openai', model: 'tts-dialogue', ttsVoice: 'dialogue' };

{
  const chunks = await buildCreativeSpeechSegments({
    text: '旁白“对白”收尾',
    isCreativeSession: true,
    narrationConfig,
    voiceSettings: { dialogueVoiceRef: 'dialogue-ref' },
    resolveVoiceConfigWithMeta: async voiceRef => {
      assert.equal(voiceRef, 'dialogue-ref');
      return { valid: true, config: dialogueConfig };
    },
  });
  assert.deepEqual(chunks.map(item => [item.kind, item.config.ttsVoice]), [
    ['narration', 'narrator'],
    ['dialogue', 'dialogue'],
    ['narration', 'narrator'],
  ]);
}

{
  const chunks = await buildCreativeSpeechSegments({
    text: '“失效对白声音”',
    isCreativeSession: true,
    narrationConfig,
    voiceSettings: { dialogueVoiceRef: 'missing-dialogue' },
    resolveVoiceConfigWithMeta: async () => ({ valid: false, config: { ttsVoice: 'must-not-use' } }),
  });
  assert.equal(chunks[0].config, narrationConfig);
  assert.equal(chunks[0].config.ttsVoice, 'narrator');
}

{
  let resolveCount = 0;
  const fragments = await buildCreativeSpeechSegments({
    text: '“卡片内对白”',
    isCreativeSession: true,
    narrationConfig,
    wrapper: { querySelector: () => ({}) },
    voiceSettings: { dialogueVoiceRef: 'dialogue-ref' },
    resolveVoiceConfigWithMeta: async () => { resolveCount += 1; },
  });
  assert.equal(fragments, null);
  assert.equal(resolveCount, 0);
  assert.equal(await buildCreativeSpeechSegments({
    text: '“非创意会话”',
    isCreativeSession: false,
    narrationConfig,
  }), null);
}

console.log('creative speech segments utils tests passed');
