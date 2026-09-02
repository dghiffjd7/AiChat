import { getLocalizedPromptText } from '../i18n/prompt-locale.js';

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

const prompt = (key, fallback, params = {}) => {
  let output = getLocalizedPromptText(`world_ai.${key}`, fallback);
  Object.entries(params).forEach(([name, value]) => {
    output = output.replaceAll(`{${name}}`, String(value ?? ''));
  });
  return output;
};

const resolveStorage = storage => storage === undefined ? globalThis?.localStorage : storage;

export const readWorldAiGenerationSettings = (storage = undefined) => {
  let storedTemplate = '';
  try {
    storedTemplate = text(resolveStorage(storage)?.getItem?.(WORLD_AI_TEMPLATE_STORAGE_KEY));
  } catch {}
  const hasCustomTemplate = Boolean(storedTemplate && storedTemplate !== DEFAULT_WORLD_AI_TEMPLATE);
  return {
    templateStorageKey: WORLD_AI_TEMPLATE_STORAGE_KEY,
    hasCustomTemplate,
    template: hasCustomTemplate
      ? storedTemplate
      : getLocalizedPromptText('world_ai.default_template', DEFAULT_WORLD_AI_TEMPLATE),
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
      prompt('generate.intro', '请根据模板与用户输入生成完整的「角色世界书条目」。'),
      prompt('requirements', '要求：'),
      prompt('yaml_only', '- 仅输出 YAML，不要解释，不要代码块，不要附加标题。'),
      prompt('generate.schema', '- YAML 结构必须与模板一致；内容尽量充实，未知的可以写“未说明”。'),
      prompt('dialogue_note', '- 英文名使用英文；对话范例需明确“仅供参考，勿完全按照其输出”。'),
      '',
      '<template>',
      trimmedTemplate || prompt('empty_template', '(空模板)'),
      '</template>',
      '',
      '<input>',
      trimmedInput || prompt('no_input', '(未提供)'),
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
      prompt('continue.intro', '请在模板约束下，结合用户输入，对已有草稿进行补全与润色。'),
      prompt('requirements', '要求：'),
      prompt('yaml_only', '- 仅输出 YAML，不要解释，不要代码块，不要附加标题。'),
      prompt('continue.schema', '- YAML 结构必须与模板一致；不要丢失草稿里已经明确的设定。'),
      prompt('continue.dialogue_note', '- 对话范例需明确“仅供参考，勿完全按照其输出”。'),
      '',
      '<template>',
      trimmedTemplate || prompt('empty_template', '(空模板)'),
      '</template>',
      '',
      '<input>',
      trimmedInput || prompt('no_input', '(未提供)'),
      '</input>',
      '',
      '<draft>',
      trimmedDraft || prompt('empty_draft', '(空草稿)'),
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
    prompt('entry.intro', '为世界书「{name}」生成条目正文。', { name: text(worldbookName) }),
    prompt('entry.title', '条目标题：{value}', { value: text(title) }),
    prompt('entry.outline', '要点大纲：{value}', { value: text(outline) }),
    prompt('entry.layer', '资料层：{value}', {
      value: text(sourceLayer) || prompt('entry.unmarked', '未标记'),
    }),
    prompt('entry.refs', '来源引用：{value}', {
      value: refs.join('、') || prompt('entry.no_refs', '无'),
    }),
    text(sourceNotes) ? prompt('entry.notes', '来源说明：{value}', { value: text(sourceNotes) }) : '',
    prompt('entry.boundary', '资料边界：只根据大纲与上述来源层写作；不得把用户原创或创意扩写伪装成原作事实。'),
    useAiTemplate && templateText
      ? [
          prompt('entry.yaml_output', '输出要求：按模板结构输出 YAML；只输出 YAML 本身，不要解释、标题或 markdown 代码块。'),
          '<ai_generation_template>',
          templateText,
          '</ai_generation_template>',
        ].join('\n')
      : prompt('entry.text_output', '要求：约 {length} 字；只输出条目正文本身（纯文本，不要标题、不要解释、不要 markdown 代码块）。', { length: targetLength }),
    useAiTemplate && templateText
      ? prompt('entry.length', '内容详略目标：约 {length} 字。', { length: targetLength })
      : '',
  ].filter(Boolean).join('\n');
};
