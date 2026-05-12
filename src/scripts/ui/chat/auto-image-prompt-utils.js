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

const isEmptyPromptToken = (value = '') => {
  const raw = String(value || '').trim().toLowerCase();
  return !raw || raw === 'none' || raw === 'null' || raw === 'n/a' || raw === '无' || raw === '不需要';
};

export const AUTO_IMAGE_PROMPT_TAG = IMAGE_PROMPT_TAG;

export const DEFAULT_AUTO_IMAGE_PROMPT_RULES = [
  '自动生图标签规则，用于生成{{image_prompt_surface}}。默认不要输出图片标签。',
  '当本轮回复适合配图、或聊天角色会自然发送图片时，输出一个生图提示词标签。',
  '当前图片模型：{{image_prompt_model}}',
  '提示词风格：{{image_prompt_style}}',
  '请严格按以下XML格式输出：',
  '<image_prompt>',
  '这里写完整生图提示词',
  '</image_prompt>',
  '注意事项：',
  '- 所有信息需与当前剧情进展严格连贯。',
  '- 格式务必正确。',
  '- 标签内只写生图提示词，不写解释、编号或 Markdown',
  '若本轮不需要图片，完全不要输出 <image_prompt> 标签。',
].join('\n');

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

export const buildImagePromptModelHintFromConfig = (config = {}) => {
  const provider = String(config?.provider || '').trim();
  const model = String(config?.model || '').trim();
  return [provider, model].filter(Boolean).join(' / ');
};

export const buildAutoImagePromptInstruction = ({
  uiMode = 'chat',
  isGroupChat = false,
  modelHint = '',
  style = 'auto',
  template = '',
  includeTableEdit = false,
} = {}) => {
  const mode = String(uiMode || '').trim().toLowerCase();
  const surface = mode === 'rp'
    ? '创意写作插图'
    : (isGroupChat ? '群聊图片消息' : '私聊图片消息');
  const targetModel = String(modelHint || '').trim() || '未指定图片模型';
  const positionRule = includeTableEdit
    ? '若需要生成图片，必须在所有正文、MiPhone_end、以及 <tableEdit>...</tableEdit> 之后，另起一行输出：'
    : '若需要生成图片，必须在所有正文和 MiPhone_end 之后，另起一行输出：';
  const source = String(template || '').trim() || DEFAULT_AUTO_IMAGE_PROMPT_RULES;
  return source
    .split(/\r?\n/)
    .map((line) => {
      const text = String(line || '');
      if (
        text.includes('若需要生成图片') &&
        text.includes('可能存在') &&
        text.includes('<tableEdit>') &&
        text.includes('image_prompt_position_rule') === false
      ) {
        return positionRule;
      }
      return line;
    })
    .join('\n')
    .replace(/\{\{\s*image_prompt_surface\s*\}\}/gi, surface)
    .replace(/\{\{\s*image_prompt_model\s*\}\}/gi, targetModel)
    .replace(/\{\{\s*image_prompt_style\s*\}\}/gi, describeAutoImagePromptStyle(style))
    .replace(/\{\{\s*image_prompt_position_rule\s*\}\}/gi, positionRule)
    .replace(/\{\{\s*image_prompt_tag\s*\}\}/gi, IMAGE_PROMPT_TAG)
    .trim();
};

export const extractAutoImagePrompts = (text = '', { max = 1, maxLength = 2000 } = {}) => {
  const source = htmlDecodeLite(text);
  const limit = Math.max(1, Math.trunc(Number(max)) || 1);
  const lengthLimit = Math.max(80, Math.trunc(Number(maxLength)) || 2000);
  const prompts = [];
  const seen = new Set();
  const re = /<\s*image_prompt(?:\s[^>]*)?\s*>([\s\S]*?)<\s*\/\s*image_prompt\s*>/gi;
  let match = null;
  while ((match = re.exec(source))) {
    const normalized = normalizePromptText(match[1]).slice(0, lengthLimit).trim();
    const key = normalized.toLowerCase();
    if (isEmptyPromptToken(normalized) || seen.has(key)) continue;
    seen.add(key);
    prompts.push(normalized);
    if (prompts.length >= limit) break;
  }
  return prompts;
};

export const stripAutoImagePromptTags = (text = '') => {
  const source = String(text ?? '');
  if (!source) return source;
  const stripped = source
    .replace(/<\s*image_prompt(?:\s[^>]*)?\s*>[\s\S]*?<\s*\/\s*image_prompt\s*>/gi, '')
    .replace(/&lt;\s*image_prompt(?:\s[^&]*?)?&gt;[\s\S]*?&lt;\s*\/\s*image_prompt\s*&gt;/gi, '');
  return stripped.replace(/[ \t]+\n/g, '\n').replace(/\n{4,}/g, '\n\n\n');
};
