const defaultEscapeRegex = (input) => String(input ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const createReasoningRuntime = ({
  getSettings = null,
  getPreset = null,
  normalizeLineBreaks = value => String(value ?? ''),
  applyReasoningRegex = null,
} = {}) => {
  const parseReasoningBlock = (text, { strict = true } = {}) => {
    const raw = String(text ?? '');
    const settings = getSettings?.() || {};
    if (settings.reasoningAutoParse !== true) return { content: raw, reasoning: '' };
    const preset = getPreset?.() || {};
    const prefix = String(preset?.prefix ?? '');
    const suffix = String(preset?.suffix ?? '');
    if (!prefix || !suffix) return { content: raw, reasoning: '' };
    try {
      const pattern = `${strict ? '^\\s*?' : ''}${defaultEscapeRegex(prefix)}([\\s\\S]*?)${defaultEscapeRegex(suffix)}`;
      const regex = new RegExp(pattern, 's');
      const match = raw.match(regex);
      if (!match) return { content: raw, reasoning: '' };
      const reasoning = String(match[1] ?? '').trim();
      const content = (raw.slice(0, match.index) + raw.slice(match.index + match[0].length))
        .replace(/\n{3,}/g, '\n\n')
        .trim();
      return { content, reasoning };
    } catch {
      return { content: raw, reasoning: '' };
    }
  };

  const extractReasoningFromContent = (content, { depth, strict = true } = {}) => {
    const parsed = parseReasoningBlock(content, { strict });
    if (!parsed.reasoning) return { content: parsed.content, reasoning: '', reasoningDisplay: '' };
    const result = typeof applyReasoningRegex === 'function'
      ? applyReasoningRegex(parsed.reasoning, { depth })
      : { stored: parsed.reasoning, display: parsed.reasoning };
    return {
      content: parsed.content,
      reasoning: String(result?.stored ?? ''),
      reasoningDisplay: String(result?.display ?? ''),
    };
  };

  const extractStreamingReasoningFromContent = (content, { depth, final = false } = {}) => {
    const raw = normalizeLineBreaks(content);
    const parsed = extractReasoningFromContent(raw, { depth, strict: false });
    if (parsed.reasoning || final) return parsed;
    const settings = getSettings?.() || {};
    if (settings.reasoningAutoParse !== true) {
      return { content: raw, reasoning: '', reasoningDisplay: '' };
    }
    const preset = getPreset?.() || {};
    const prefix = String(preset?.prefix ?? '');
    const suffix = String(preset?.suffix ?? '');
    if (!prefix || !suffix) {
      return { content: raw, reasoning: '', reasoningDisplay: '' };
    }
    const start = raw.indexOf(prefix);
    if (start < 0) {
      return { content: raw, reasoning: '', reasoningDisplay: '' };
    }
    const bodyStart = start + prefix.length;
    const suffixIndex = raw.indexOf(suffix, bodyStart);
    if (suffixIndex >= 0) {
      return extractReasoningFromContent(raw, { depth, strict: false });
    }
    const reasoningRaw = raw.slice(bodyStart).trim();
    const visible = raw.slice(0, start).replace(/\n{3,}/g, '\n\n').trimEnd();
    if (!reasoningRaw) {
      return { content: visible, reasoning: '', reasoningDisplay: '' };
    }
    const result = typeof applyReasoningRegex === 'function'
      ? applyReasoningRegex(reasoningRaw, { depth })
      : { stored: reasoningRaw, display: reasoningRaw };
    return {
      content: visible,
      reasoning: String(result?.stored ?? ''),
      reasoningDisplay: String(result?.display ?? ''),
    };
  };

  return {
    parseReasoningBlock,
    extractReasoningFromContent,
    extractStreamingReasoningFromContent,
  };
};
