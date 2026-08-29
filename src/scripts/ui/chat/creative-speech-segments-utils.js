import { buildDualVoiceSpeechChunks } from './dialogue-segment-utils.js';
import { resolveSpeechChunkMaxChars } from './speech-chunk-utils.js';

export const buildCreativeSpeechSegments = async ({
  text = '',
  wrapper = null,
  voiceRefOverride = null,
  isCreativeSession = false,
  narrationConfig = null,
  voiceSettings = {},
  resolveVoiceConfigWithMeta = null,
} = {}) => {
  if (
    !isCreativeSession
    || wrapper?.querySelector?.('iframe, .chat-rich-fragment, .chat-codeblock')
    || voiceRefOverride !== null
  ) return null;

  const dialogueRef = String(voiceSettings?.dialogueVoiceRef || '').trim();
  let dialogueConfig = narrationConfig;
  if (dialogueRef && typeof resolveVoiceConfigWithMeta === 'function') {
    const result = await resolveVoiceConfigWithMeta(dialogueRef);
    if (result?.valid && result.config) dialogueConfig = result.config;
  }
  return buildDualVoiceSpeechChunks(text, {
    narrationConfig,
    dialogueConfig,
    resolveMaxChars: resolveSpeechChunkMaxChars,
  });
};
