export const WORLD_AI_TEMPLATE_STORAGE_KEY = 'world_ai_template_v1';

export const DEFAULT_WORLD_AI_TEMPLATE = `
name: ""
english_name: ""
gender: ""
background: ""
appearance: ""
personality:
  mbti: ""
  traits: ""
dialogue_examples:
  note: "仅供参考，勿完全按照其输出"
  examples:
    - ""
    - ""
    - ""
`.trim();

const text = value => String(value ?? '').trim();

const resolveStorage = storage => storage === undefined ? globalThis?.localStorage : storage;

export const readWorldAiGenerationSettings = (storage = undefined) => {
  let storedTemplate = '';
  try {
    storedTemplate = text(resolveStorage(storage)?.getItem?.(WORLD_AI_TEMPLATE_STORAGE_KEY));
  } catch {}
  return {
    templateStorageKey: WORLD_AI_TEMPLATE_STORAGE_KEY,
    hasCustomTemplate: Boolean(storedTemplate),
    template: storedTemplate || DEFAULT_WORLD_AI_TEMPLATE,
  };
};

export const saveWorldAiTemplate = (value, storage = undefined) => {
  const template = text(value) || DEFAULT_WORLD_AI_TEMPLATE;
  try {
    resolveStorage(storage)?.setItem?.(WORLD_AI_TEMPLATE_STORAGE_KEY, template);
    return true;
  } catch {
    return false;
  }
};

export const buildWorldAiMessages = (template, inputText) => {
  const trimmedTemplate = text(template);
  const trimmedInput = text(inputText);
  return [{
    role: 'user',
    content: [
      '请根据模板与用户输入生成完整的「角色世界书条目」。',
      '要求：',
      '- 仅输出 YAML，不要解释，不要代码块，不要附加标题。',
      '- YAML 结构必须与模板一致；内容尽量充实，未知的可以写“未说明”。',
      '- 英文名使用英文；对话范例需明确“仅供参考，勿完全按照其输出”。',
      '',
      '<template>',
      trimmedTemplate || '(空模板)',
      '</template>',
      '',
      '<input>',
      trimmedInput || '(未提供)',
      '</input>',
    ].join('\n'),
  }];
};

export const buildWorldAiContinueMessages = (template, inputText, draft) => {
  const trimmedTemplate = text(template);
  const trimmedInput = text(inputText);
  const trimmedDraft = text(draft);
  return [{
    role: 'user',
    content: [
      '请在模板约束下，结合用户输入，对已有草稿进行补全与润色。',
      '要求：',
      '- 仅输出 YAML，不要解释，不要代码块，不要附加标题。',
      '- YAML 结构必须与模板一致；不要丢失草稿里已经明确的设定。',
      '- 对话范例需明确“仅供参考，勿完全按照其输出”。',
      '',
      '<template>',
      trimmedTemplate || '(空模板)',
      '</template>',
      '',
      '<input>',
      trimmedInput || '(未提供)',
      '</input>',
      '',
      '<draft>',
      trimmedDraft || '(空草稿)',
      '</draft>',
    ].join('\n'),
  }];
};

export const buildWorldbookEntryGenerationPrompt = ({
  worldbookName = '',
  title = '',
  outline = '',
  length = 220,
  sourceLayer = '',
  sourceRefs = [],
  sourceNotes = '',
  template = '',
  useAiTemplate = false,
} = {}) => {
  const refs = Array.isArray(sourceRefs) ? sourceRefs.map(item => text(item)).filter(Boolean) : [];
  const targetLength = Math.max(50, Math.min(1200, Math.trunc(Number(length)) || 220));
  const templateText = text(template);
  return [
    `为世界书「${text(worldbookName)}」生成条目正文。`,
    `条目标题：${text(title)}`,
    `要点大纲：${text(outline)}`,
    `资料层：${text(sourceLayer) || '未标记'}`,
    `来源引用：${refs.join('、') || '无'}`,
    text(sourceNotes) ? `来源说明：${text(sourceNotes)}` : '',
    '资料边界：只根据大纲与上述来源层写作；不得把用户原创或创意扩写伪装成原作事实。',
    useAiTemplate && templateText
      ? [
          '输出要求：按模板结构输出 YAML；只输出 YAML 本身，不要解释、标题或 markdown 代码块。',
          '<ai_generation_template>',
          templateText,
          '</ai_generation_template>',
        ].join('\n')
      : `要求：约 ${targetLength} 字；只输出条目正文本身（纯文本，不要标题、不要解释、不要 markdown 代码块）。`,
    useAiTemplate && templateText ? `内容详略目标：约 ${targetLength} 字。` : '',
  ].filter(Boolean).join('\n');
};
