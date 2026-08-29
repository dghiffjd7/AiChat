import { splitSpeechText } from './speech-chunk-utils.js';

const QUOTE_PAIRS = Object.freeze({
  '"': '"',
  '“': '”',
  '「': '」',
});

const isEscaped = (text, index) => {
  let slashCount = 0;
  for (let cursor = index - 1; cursor >= 0 && text[cursor] === '\\'; cursor -= 1) slashCount += 1;
  return slashCount % 2 === 1;
};

const findClosingQuote = (line, start, opener, closer) => {
  if (opener === closer) {
    for (let index = start + 1; index < line.length; index += 1) {
      if (line[index] === closer && !isEscaped(line, index)) return index;
    }
    return -1;
  }
  let depth = 1;
  for (let index = start + 1; index < line.length; index += 1) {
    if (isEscaped(line, index)) continue;
    if (line[index] === opener) depth += 1;
    else if (line[index] === closer) {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
};

const pushSegment = (segments, kind, text) => {
  if (!text) return;
  const previous = segments[segments.length - 1];
  if (previous?.kind === kind) previous.text += text;
  else segments.push({ kind, text });
};

const segmentLine = (line, segments) => {
  let cursor = 0;
  while (cursor < line.length) {
    let openIndex = -1;
    let opener = '';
    for (let index = cursor; index < line.length; index += 1) {
      if (QUOTE_PAIRS[line[index]] && !isEscaped(line, index)) {
        openIndex = index;
        opener = line[index];
        break;
      }
    }
    if (openIndex < 0) {
      pushSegment(segments, 'narration', line.slice(cursor));
      return;
    }
    const closeIndex = findClosingQuote(line, openIndex, opener, QUOTE_PAIRS[opener]);
    if (closeIndex < 0) {
      pushSegment(segments, 'narration', line.slice(cursor));
      return;
    }
    pushSegment(segments, 'narration', line.slice(cursor, openIndex));
    pushSegment(segments, 'dialogue', line.slice(openIndex, closeIndex + 1));
    cursor = closeIndex + 1;
  }
};

export const segmentDialogueText = (value = '') => {
  const text = String(value || '');
  if (!text) return [];
  const segments = [];
  const lines = text.split('\n');
  lines.forEach((line, index) => {
    segmentLine(line, segments);
    if (index < lines.length - 1) pushSegment(segments, 'narration', '\n');
  });
  return segments;
};

export const buildDualVoiceSpeechChunks = (value = '', {
  narrationConfig = null,
  dialogueConfig = null,
  resolveMaxChars = () => 3600,
  splitText = splitSpeechText,
} = {}) => {
  const segments = segmentDialogueText(value);
  const output = [];
  segments.forEach((segment) => {
    const config = segment.kind === 'dialogue' ? dialogueConfig : narrationConfig;
    if (!config || !segment.text) return;
    const chunks = splitText(segment.text, { maxChars: resolveMaxChars(config) });
    chunks.forEach((text) => {
      const chunkText = String(text ?? '');
      if (!chunkText.trim()) return;
      output.push({ kind: segment.kind, text: chunkText, config });
    });
  });
  return output;
};
