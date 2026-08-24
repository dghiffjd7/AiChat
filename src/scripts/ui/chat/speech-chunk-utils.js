export const DEFAULT_TTS_CHUNK_CHARS = 3600;
export const QWEN_LOCAL_TTS_CHUNK_CHARS = 36;

export const splitSpeechText = (value, { maxChars = DEFAULT_TTS_CHUNK_CHARS } = {}) => {
  let remaining = String(value || '');
  const limit = Math.max(1, Math.trunc(Number(maxChars)) || DEFAULT_TTS_CHUNK_CHARS);
  const chunks = [];
  while (remaining.length > limit) {
    const windowText = remaining.slice(0, limit);
    const minCut = Math.floor(limit * 0.35);
    const findCut = pattern => {
      for (let index = windowText.length - 1; index >= minCut; index -= 1) {
        if (pattern.test(windowText[index])) return index + 1;
      }
      return -1;
    };
    let cut = findCut(/[。！？!?；;\n]/);
    if (cut <= 0) cut = findCut(/[，,、：:]/);
    if (cut <= 0) cut = limit;
    chunks.push(remaining.slice(0, cut));
    remaining = remaining.slice(cut);
  }
  if (remaining) chunks.push(remaining);
  return chunks;
};

export const resolveSpeechChunkMaxChars = config => (
  String(config?.provider || '').trim().toLowerCase() === 'qwen_local'
    ? QWEN_LOCAL_TTS_CHUNK_CHARS
    : DEFAULT_TTS_CHUNK_CHARS
);
