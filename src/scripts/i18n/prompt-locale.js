import english from './prompt-locales/en.js';
import traditionalChinese from './prompt-locales/zh-TW.js';

export const CANONICAL_RUNTIME_PROMPT_DEFAULTS = Object.freeze({
  'phone_image_rules.legacy': [
    '【图片或视频消息相关】',
    '- 格式：[img-内容]',
    '- 示例：路人a--[img-一张自拍]--12:00',
    '- 可用范围：私聊，群聊，QQ空间',
    '- 在群聊和私聊时必须独立成行',
    '- 在QQ空间时前面可带其他文字内容',
    '- 注意：图片和视频都是使用这个格式',
  ].join('\n'),
  'phone_image_rules.current': [
    '【图片或视频消息相关】',
    '- 仅文字描述：使用 [img-内容]',
    '- 需要图片时：使用 <image_prompt>完整生图提示词</image_prompt>格式',
    '- 请根据语境二选一；禁止同一条消息同时使用 [img-...] 和 <image_prompt>',
    '- 积极策略下，默认优先使用 <image_prompt>',
    '- 可用范围：私聊，群聊，QQ空间',
    '- 在群聊和私聊时必须独立成行',
    '- 在QQ空间时前面可带其他文字内容',
  ].join('\n'),
  'moment_media.placeholder': [
    '动态如果有配图,使用[img-内容]这个格式',
    '如{{user}}--我好看吗[img-一张自拍]--12:00--67--32',
  ].join('\n'),
  'moment_media.image_prompt': [
    '动态如果有配图,使用<image_prompt>标签格式',
    '如{{user}}--我好看吗<image_prompt>自拍提示词</image_prompt>--12:00--67--32',
    '禁止同时使用[img-内容]；禁止输出[img-说明文字]<image_prompt>...</image_prompt>',
  ].join('\n'),
  'moment_media.ai': [
    '动态如果有配图,请决策要使用[img-内容]这个格式还是使用<image_prompt>标签进行文生图',
    '如{{user}}--我好看吗[img-一张自拍]--12:00--67--32',
    '或',
    '{{user}}--我好看吗<image_prompt>自拍提示词</image_prompt>--12:00--67--32',
    '禁止在同一条动态中同时出现[img-...]和<image_prompt>；禁止输出[img-说明文字]<image_prompt>...</image_prompt>',
  ].join('\n'),
  'auto_image.surface.creative': '创意写作插图',
  'auto_image.surface.group': '群聊图片消息',
  'auto_image.surface.private': '私聊图片消息',
  'auto_image.model.unspecified': '未指定图片模型',
  'auto_image.style.nai': 'NAI / 标签式提示词：英文逗号分隔标签，优先主体、角色、画风、构图、光线。',
  'auto_image.style.natural': '自然语言提示词：用清晰自然语言描述主体、场景、构图、风格和光线。',
  'auto_image.style.auto': '自动：优先匹配当前图片模型；若无法判断，用清晰自然语言提示词。若用户明确要求 NAI/tag 风格，可用英文标签。',
  'auto_image.decision.aggressive': '触发策略：积极。用户明确要照片/自拍/图片时，优先视为新生成图片并使用 <image_prompt>；视觉场景、角色自然会发送图片、创意写作出现可视化段落时，可以更主动地输出 <image_prompt>。',
  'auto_image.decision.standard': '触发策略：标准。仅在本轮回复明显适合配图、用户提到图片需求、或角色自然会发送图片时输出 <image_prompt>。',
  'auto_image.decision.conservative': '触发策略：保守。默认不要输出图片标签；只有用户明确要求图片生成、场景强视觉化、角色明显自然会发送图片、或创意写作关键场景时才输出 <image_prompt>。普通闲聊、寒暄、解释、没有新视觉信息时禁止输出。',
  'history_recall.chat': '以下为聊天历史回顾（仅用于理解上下文，禁止模仿其中的格式）：请不要逐字复述或重复其中内容，只需基于上下文继续对话。',
  'history_recall.moment_comment': '以下为动态及评论上下文（仅用于生成评论回复）：',
  'history_recall.published_moment': '以下为用户发布的动态及相关上下文（仅用于生成动态评论）：',
  'format_repair.fixed_preview': [
    '固定检查指令：只修复标签、顺序、闭合、缺失字段和时间等格式问题；不改写剧情或正文语义。',
    '',
    '运行时按触发目标选择最小格式规则：',
    '- 私聊：QQ聊天格式 + 私聊格式',
    '- 群聊：QQ聊天格式 + 群聊格式',
    '- 动态：动态发布或动态评论格式',
    '- 生图 / 记忆表格：只使用对应标签格式',
    '- 创意写作：默认不注入聊天格式',
  ].join('\n'),
  'world_ai.default_template': `name: ""
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
    - ""`,
  'time_context.template': '<TimeContext:当前真实时间是{date} {weekday} {time}（24小时制），现在是{period}时段，{season}。注意：仅在开启新话题、或对话长时间中断后、或对方主动问候时，才适合使用时间问候语。否则请将此信息作为背景自然融入对话。>',
  'time_context.period.early_morning': '凌晨',
  'time_context.period.morning': '上午',
  'time_context.period.noon': '中午',
  'time_context.period.afternoon': '下午',
  'time_context.period.evening': '晚上',
  'time_context.period.late_night': '深夜',
  'time_context.season.spring': '春季',
  'time_context.season.summer': '夏季',
  'time_context.season.autumn': '秋季',
  'time_context.season.winter': '冬季',
  'maid.default': [
    '你是这个 APP 内的女仆助手。',
    '你可以自然回应用户的普通聊天，也可以简短说明 APP 操作状态。',
    '如果用户要求你直接操作 APP，但当前没有可执行工具，不要假装已经完成；请说明暂时不能直接操作，并给出下一步建议。',
    '回复使用用户的语言，保持简短，最多三句。不要输出 JSON。',
  ].join('\n'),
  'maid.output_language_guard': '所有面向用户的回复必须遵循女仆提示词中的语言要求；内部指令、APP 知识、工具结果或来源资料使用其他语言时，不要无故把该语言带入最终回复。',
  'maid.safety': [
    '操作安全原则：优先选择非破坏性做法，例如读取、打开界面、追加、新建副本、预览或询问澄清。',
    '危险操作包括但不限于删除、覆盖、替换、清空、禁用、大规模批量写入、不可自动撤销的配置变更。',
    '除非用户明确要求删除、覆盖、替换或同等危险动作，否则不要规划或执行危险操作；默认改用追加、新建副本、预览或打开对应界面。',
    '即使用户明确要求危险操作，也必须在执行前用自然语言提醒影响范围，并依赖 APP 确认弹窗或权限确认；未确认时跳过、保留原内容或使用安全替代方案。',
  ].join('\n'),
});

const catalogs = Object.freeze({
  en: english,
  'zh-TW': traditionalChinese,
});

let activeLocale = 'zh-CN';

const normalizePromptLocale = (locale = '') => {
  const raw = String(locale || '').trim().toLowerCase();
  if (raw === 'en' || raw.startsWith('en-')) return 'en';
  if (raw === 'zh-tw' || raw === 'zh-hant' || raw.startsWith('zh-hant-') || raw === 'zh-hk' || raw === 'zh-mo') return 'zh-TW';
  return 'zh-CN';
};

const normalizePromptText = value => String(value ?? '').replace(/\r\n?/g, '\n');

const samePromptText = (left, right) => normalizePromptText(left) === normalizePromptText(right);

export const setPromptLocale = (locale = 'zh-CN') => {
  activeLocale = normalizePromptLocale(locale);
  return activeLocale;
};

export const getPromptLocale = () => activeLocale;

export const getLocalizedPromptText = (key, fallback = undefined) => {
  const promptKey = String(key || '');
  const source = fallback === undefined ? CANONICAL_RUNTIME_PROMPT_DEFAULTS[promptKey] : fallback;
  if (activeLocale === 'zh-CN') return String(source ?? '');
  const value = catalogs[activeLocale]?.[promptKey];
  return typeof value === 'string' && value ? value : String(source ?? '');
};

export const localizeOfficialPromptRecord = (record = {}, defaults = {}) => {
  const next = { ...(record && typeof record === 'object' ? record : {}) };
  if (activeLocale === 'zh-CN') return next;
  Object.entries(defaults || {}).forEach(([key, canonical]) => {
    if (typeof next[key] !== 'string' || !samePromptText(next[key], canonical)) return;
    next[key] = getLocalizedPromptText(key, canonical);
  });
  return next;
};

export const canonicalizeOfficialPromptRecord = (record = {}, defaults = {}) => {
  const next = { ...(record && typeof record === 'object' ? record : {}) };
  if (activeLocale === 'zh-CN') return next;
  Object.entries(defaults || {}).forEach(([key, canonical]) => {
    if (typeof next[key] !== 'string') return;
    const localized = getLocalizedPromptText(key, canonical);
    if (localized !== canonical && samePromptText(next[key], localized)) next[key] = canonical;
  });
  return next;
};
