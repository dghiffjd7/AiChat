const IMAGE_PROMPT_TAG = 'image_prompt';

const htmlDecodeLite = (value = '') => String(value ?? '')
  .replace(/&lt;/gi, '<')
  .replace(/&gt;/gi, '>')
  .replace(/&quot;/gi, '"')
  .replace(/&#39;/gi, "'")
  .replace(/&amp;/gi, '&');

const normalizePromptText = (value = '') => String(value ?? '')
  .replace(/\r\n/g, '\n')
  .replace(/\r/g, '\n')
  .replace(/\n{3,}/g, '\n\n')
  .trim();

const IMAGE_PROMPT_OPEN_RE = /<\s*image_prompt(?:\s[^>]*)?\s*>/gi;
const IMAGE_PROMPT_CLOSE_RE = /<\s*\/\s*image_prompt\s*>/gi;
const PROTECTED_IMAGE_PROMPT_OPEN_PREFIX = '\uE000chatapp-image-prompt-open-';
const PROTECTED_IMAGE_PROMPT_OPEN_SUFFIX = '\uE001';

const isEmptyPromptToken = (value = '') => {
  const raw = String(value || '').trim().toLowerCase();
  return !raw || raw === 'none' || raw === 'null' || raw === 'n/a' || raw === '无' || raw === '不需要';
};

const stripMarkdownCodeBlocks = (value = '') => String(value ?? '')
  .replace(/```[\s\S]*?```/g, '')
  .replace(/~~~[\s\S]*?~~~/g, '');

const stripReasoningLikeBlocks = (value = '') => String(value ?? '')
  .replace(/<\s*(?:think|thinking|reasoning)(?:\s[^>]*)?\s*>[\s\S]*?<\s*\/\s*(?:think|thinking|reasoning)\s*>/gi, '');

const stripDelimitedPlainBlocks = (value = '', start = '', end = '') => {
  const source = String(value ?? '');
  if (!source || !start || !end) return source;
  const re = new RegExp(`(?:<\\s*)?${start}(?:\\s*>|\\b)[\\s\\S]*?(?:<\\s*)?${end}(?:\\s*>|\\b)`, 'gi');
  return source.replace(re, '');
};

export const stripMomentBlocksForAutoImagePrompt = (text = '') => {
  const source = htmlDecodeLite(text);
  if (!source) return source;
  return stripDelimitedPlainBlocks(
    stripDelimitedPlainBlocks(source, 'moment_reply_start', 'moment_reply_end'),
    'moment_start',
    'moment_end',
  );
};

export const AUTO_IMAGE_PROMPT_TAG = IMAGE_PROMPT_TAG;

export const protectUnclosedAutoImagePromptTags = (text = '') => {
  const source = String(text ?? '');
  if (!source || !/<\s*image_prompt\b/i.test(source)) {
    return { text: source, replacements: [] };
  }
  const replacements = [];
  const protectedText = source.replace(IMAGE_PROMPT_OPEN_RE, (full, offset) => {
    const openEnd = offset + full.length;
    const closeRe = new RegExp(IMAGE_PROMPT_CLOSE_RE.source, IMAGE_PROMPT_CLOSE_RE.flags);
    closeRe.lastIndex = openEnd;
    const close = closeRe.exec(source);
    const nextOpenRe = new RegExp(IMAGE_PROMPT_OPEN_RE.source, IMAGE_PROMPT_OPEN_RE.flags);
    nextOpenRe.lastIndex = openEnd;
    const nextOpen = nextOpenRe.exec(source);
    if (close && (!nextOpen || close.index < nextOpen.index)) return full;
    const token = `${PROTECTED_IMAGE_PROMPT_OPEN_PREFIX}${replacements.length}${PROTECTED_IMAGE_PROMPT_OPEN_SUFFIX}`;
    replacements.push({ token, value: full });
    return token;
  });
  return { text: protectedText, replacements };
};

export const restoreProtectedAutoImagePromptTags = (text = '', protection = null) => {
  const replacements = Array.isArray(protection)
    ? protection
    : (Array.isArray(protection?.replacements) ? protection.replacements : []);
  if (!replacements.length) return String(text ?? '');
  let out = String(text ?? '');
  replacements.forEach(({ token, value }) => {
    if (!token) return;
    out = out.split(token).join(String(value || ''));
  });
  return out;
};

export const DEFAULT_AUTO_IMAGE_PROMPT_RULES = [
  '<generate_img_rule>',
  '自动生图标签规则，用于生成{{image_prompt_surface}}。',
  '当本轮回复适合配图、或聊天角色会自然发送图片时，在合适的位置插入一个生图提示词标签。',
  '当前图片模型：{{image_prompt_model}}',
  '提示词风格：{{image_prompt_style}}',
  '{{image_prompt_decision_mode}}',
  '请严格按以下XML格式输出：',
  '<image_prompt>这里写完整生图提示词</image_prompt>',
  '注意事项：',
  '- 所有信息需与当前剧情进展严格连贯。',
  '- 格式务必正确。',
  '- [img-内容] 是一般图片格式，<image_prompt> 是文生图格式，二者禁止在同一条内容中混用或嵌套。',
  '- 标签内只写生图提示词，不写解释、编号或 Markdown',
  '若本轮不需要图片，完全不要输出 <image_prompt> 标签。',
  '</generate_img_rule>',
].join('\n');

export const wrapAutoImagePromptInstruction = (value = '') => {
  const body = String(value || '').trim();
  if (!body) return '';
  if (/^<\s*generate_img_rule(?:\s[^>]*)?\s*>[\s\S]*<\s*\/\s*generate_img_rule\s*>$/i.test(body)) {
    return body;
  }
  return `<generate_img_rule>\n${body}\n</generate_img_rule>`;
};

export const normalizeAutoImagePromptStyle = (value = '') => {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'nai' || raw === 'tags' || raw === 'tag') return 'nai_tags';
  if (raw === 'natural' || raw === 'prose') return 'natural';
  return 'auto';
};

export const describeAutoImagePromptStyle = (value = '') => {
  const style = normalizeAutoImagePromptStyle(value);
  if (style === 'nai_tags') return 'NAI / 标签式提示词：英文逗号分隔标签，优先主体、角色、画风、构图、光线。';
  if (style === 'natural') return '自然语言提示词：用清晰自然语言描述主体、场景、构图、风格和光线。';
  return '自动：优先匹配当前图片模型；若无法判断，用清晰自然语言提示词。若用户明确要求 NAI/tag 风格，可用英文标签。';
};

export const describeAutoImagePromptDecisionMode = (value = '') => {
  const mode = String(value || '').trim().toLowerCase();
  if (mode === 'aggressive') {
    return '触发策略：积极。视觉场景、角色自然会发送图片、创意写作出现可视化段落时，可以更主动地输出 <image_prompt>。';
  }
  if (mode === 'standard') {
    return '触发策略：标准。仅在本轮回复明显适合配图、用户提到图片需求、或角色自然会发送图片时输出 <image_prompt>。';
  }
  return '触发策略：保守。默认不要输出图片标签；只有用户明确要求图像、场景强视觉化、角色明显自然会发送图片、或创意写作关键场景时才输出 <image_prompt>。普通闲聊、寒暄、解释、没有新视觉信息时禁止输出。';
};

export const buildImagePromptModelHintFromConfig = (config = {}) => {
  const provider = String(config?.provider || '').trim();
  const model = String(config?.model || '').trim();
  return [provider, model].filter(Boolean).join(' / ');
};

export const normalizeAutoImagePromptTextKey = (value = '') =>
  String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();

export const isAutoImagePromptAssistantRoundMessage = (message = {}) => {
  if (!message || message.role !== 'assistant') return false;
  if (message?.meta?.kind === 'memory-table-push') return false;
  const generated = message?.meta?.generatedMedia && typeof message.meta.generatedMedia === 'object'
    ? message.meta.generatedMedia
    : null;
  if (!generated) return true;
  const sourceId = String(generated.sourceMessageId || '').trim();
  const messageId = String(message.id || '').trim();
  return generated.source === 'auto_image_prompt' && sourceId && sourceId === messageId;
};

export const getAutoImagePromptAssistantOrdinal = (messages = [], messageId = '') => {
  const targetId = String(messageId || '').trim();
  if (!targetId) return 0;
  let ordinal = 0;
  for (const item of Array.isArray(messages) ? messages : []) {
    if (isAutoImagePromptAssistantRoundMessage(item)) ordinal += 1;
    if (String(item?.id || '') === targetId) return ordinal;
  }
  return ordinal;
};

export const collectAutoImagePromptGenerationHistory = (messages = []) => {
  let ordinal = 0;
  const ordinalById = new Map();
  const history = [];
  for (const item of Array.isArray(messages) ? messages : []) {
    const itemId = String(item?.id || '').trim();
    const isRound = isAutoImagePromptAssistantRoundMessage(item);
    if (isRound) {
      ordinal += 1;
      if (itemId) ordinalById.set(itemId, ordinal);
    }
    const generated = item?.meta?.generatedMedia && typeof item.meta.generatedMedia === 'object'
      ? item.meta.generatedMedia
      : null;
    if (!generated || generated.source !== 'auto_image_prompt') continue;
    const sourceId = String(generated.sourceMessageId || '').trim();
    const prompt = String(generated.prompt || '').trim();
    history.push({
      ordinal: (sourceId && ordinalById.get(sourceId)) || ordinal,
      prompt,
      key: normalizeAutoImagePromptTextKey(prompt),
    });
  }
  return history;
};

export const shouldAllowAutoImagePromptByRateLimit = ({
  messages = [],
  messageId = '',
  prompt = '',
  settings = {},
  nextAssistantTurn = false,
  checkRepeated = true,
} = {}) => {
  const list = Array.isArray(messages) ? messages : [];
  const currentOrdinal = nextAssistantTurn
    ? list.reduce((count, item) => count + (isAutoImagePromptAssistantRoundMessage(item) ? 1 : 0), 0) + 1
    : getAutoImagePromptAssistantOrdinal(list, messageId);
  const promptKey = normalizeAutoImagePromptTextKey(prompt);
  const history = collectAutoImagePromptGenerationHistory(list);
  if (checkRepeated && settings.autoImagePromptSkipRepeated !== false && promptKey && history.some(item => item.key === promptKey)) {
    return { ok: false, reason: 'repeated-prompt' };
  }
  const cooldown = Math.max(0, Math.trunc(Number(settings.autoImagePromptCooldownRounds) || 0));
  if (cooldown > 0 && history.length) {
    const last = history[history.length - 1];
    if (last && currentOrdinal > 0 && currentOrdinal - last.ordinal <= cooldown) {
      return { ok: false, reason: `cooldown-${cooldown}` };
    }
  }
  const windowRounds = Math.max(0, Math.trunc(Number(settings.autoImagePromptWindowRounds) || 0));
  const windowMax = Math.max(0, Math.trunc(Number(settings.autoImagePromptWindowMax) || 0));
  if (windowRounds > 0 && windowMax > 0 && currentOrdinal > 0) {
    const count = history.filter(item => currentOrdinal - item.ordinal < windowRounds).length;
    if (count >= windowMax) {
      return { ok: false, reason: `window-limit-${windowMax}-per-${windowRounds}` };
    }
  }
  return { ok: true, reason: '' };
};

export const buildAutoImagePromptInstruction = ({
  uiMode = 'chat',
  isGroupChat = false,
  modelHint = '',
  style = 'auto',
  decisionMode = 'conservative',
  template = '',
} = {}) => {
  const mode = String(uiMode || '').trim().toLowerCase();
  const surface = mode === 'rp'
    ? '创意写作插图'
    : (isGroupChat ? '群聊图片消息' : '私聊图片消息');
  const targetModel = String(modelHint || '').trim() || '未指定图片模型';
  const source = String(template || '').trim() || DEFAULT_AUTO_IMAGE_PROMPT_RULES;
  const rendered = source
    .replace(/\{\{\s*image_prompt_surface\s*\}\}/gi, surface)
    .replace(/\{\{\s*image_prompt_model\s*\}\}/gi, targetModel)
    .replace(/\{\{\s*image_prompt_style\s*\}\}/gi, describeAutoImagePromptStyle(style))
    .replace(/\{\{\s*image_prompt_decision_mode\s*\}\}/gi, describeAutoImagePromptDecisionMode(decisionMode))
    .replace(/\{\{\s*image_prompt_position_rule\s*\}\}/gi, '')
    .replace(/\{\{\s*image_prompt_tag\s*\}\}/gi, IMAGE_PROMPT_TAG)
    .trim();
  return wrapAutoImagePromptInstruction(rendered);
};

const normalizeAutoImagePromptLimit = (max, fallback) => {
  const raw = Math.trunc(Number(max));
  if (Number.isFinite(raw)) return raw <= 0 ? Number.POSITIVE_INFINITY : raw;
  return fallback <= 0 ? Number.POSITIVE_INFINITY : fallback;
};

export const extractAutoImagePrompts = (text = '', { max = 1, maxLength = 2000, dedupe = true, stripMomentBlocks = false } = {}) => {
  const decoded = stripMomentBlocks ? stripMomentBlocksForAutoImagePrompt(text) : htmlDecodeLite(text);
  const source = stripReasoningLikeBlocks(stripMarkdownCodeBlocks(decoded));
  const limit = normalizeAutoImagePromptLimit(max, 1);
  const lengthLimit = Math.max(80, Math.trunc(Number(maxLength)) || 2000);
  const prompts = [];
  const seen = new Set();
  const re = /<\s*image_prompt(?:\s[^>]*)?\s*>([\s\S]*?)<\s*\/\s*image_prompt\s*>/gi;
  let match = null;
  while ((match = re.exec(source))) {
    const normalized = normalizePromptText(match[1]).slice(0, lengthLimit).trim();
    const key = normalized.toLowerCase();
    if (isEmptyPromptToken(normalized) || (dedupe && seen.has(key))) continue;
    if (dedupe) seen.add(key);
    prompts.push(normalized);
    if (prompts.length >= limit) break;
  }
  return prompts;
};

export const buildAutoImagePromptPendingToken = (index = 0) =>
  `[img-图片生成中${index > 0 ? ` ${index + 1}` : ''}]`;

export const prepareAutoImagePromptPlaceholders = (text = '', {
  max = 10,
  maxLength = 2000,
  overflowTokenBuilder = null,
} = {}) => {
  const source = String(text ?? '');
  const limit = normalizeAutoImagePromptLimit(max, 10);
  const lengthLimit = Math.max(80, Math.trunc(Number(maxLength)) || 2000);
  const prompts = [];
  let tagIndex = 0;
  const nextText = source.replace(/<\s*image_prompt(?:\s[^>]*)?\s*>([\s\S]*?)<\s*\/\s*image_prompt\s*>/gi, (full, body) => {
    const index = tagIndex;
    tagIndex += 1;
    const prompt = normalizePromptText(body).slice(0, lengthLimit).trim();
    if (isEmptyPromptToken(prompt)) return '';
    if (prompts.length >= limit) {
      if (typeof overflowTokenBuilder === 'function') {
        return String(overflowTokenBuilder({ prompt, index, tag: full, max: limit }) || '');
      }
      return '';
    }
    const pendingToken = buildAutoImagePromptPendingToken(index);
    prompts.push({ prompt, pendingToken, tag: full, index });
    return pendingToken;
  });
  return {
    text: nextText.replace(/[ \t]+\n/g, '\n').replace(/\n{4,}/g, '\n\n\n'),
    prompts,
  };
};

export const stripAutoImagePromptTags = (text = '') => {
  const source = String(text ?? '');
  if (!source) return source;
  const stripped = source
    .replace(/<\s*image_prompt(?:\s[^>]*)?\s*>[\s\S]*?<\s*\/\s*image_prompt\s*>/gi, '')
    .replace(/&lt;\s*image_prompt(?:\s[^&]*?)?&gt;[\s\S]*?&lt;\s*\/\s*image_prompt\s*&gt;/gi, '');
  return stripped.replace(/[ \t]+\n/g, '\n').replace(/\n{4,}/g, '\n\n\n');
};
