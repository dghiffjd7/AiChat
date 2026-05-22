export const PROMPT_LIBRARY_CATEGORIES = Object.freeze({
  chat: 'chat',
  writing: 'writing',
  image: 'image',
  moments: 'moments',
  agent: 'agent',
  advanced: 'advanced',
  unsorted: 'unsorted',
});

export const PROMPT_LIBRARY_CATEGORY_ORDER = Object.freeze([
  PROMPT_LIBRARY_CATEGORIES.chat,
  PROMPT_LIBRARY_CATEGORIES.writing,
  PROMPT_LIBRARY_CATEGORIES.image,
  PROMPT_LIBRARY_CATEGORIES.moments,
  PROMPT_LIBRARY_CATEGORIES.agent,
  PROMPT_LIBRARY_CATEGORIES.advanced,
  PROMPT_LIBRARY_CATEGORIES.unsorted,
]);

export const PROMPT_LIBRARY_CATEGORY_LABELS = Object.freeze({
  [PROMPT_LIBRARY_CATEGORIES.chat]: 'Chat',
  [PROMPT_LIBRARY_CATEGORIES.writing]: 'Writing',
  [PROMPT_LIBRARY_CATEGORIES.image]: 'Image',
  [PROMPT_LIBRARY_CATEGORIES.moments]: 'Moments',
  [PROMPT_LIBRARY_CATEGORIES.agent]: 'Agent',
  [PROMPT_LIBRARY_CATEGORIES.advanced]: 'Advanced',
  [PROMPT_LIBRARY_CATEGORIES.unsorted]: 'Unsorted',
});

const KEYWORDS = Object.freeze({
  [PROMPT_LIBRARY_CATEGORIES.image]: [
    '<image_prompt',
    'image_prompt',
    'generate_img',
    'negative prompt',
    'reference image',
    '生图',
    '图片',
    '绘图',
    '画面',
  ],
  [PROMPT_LIBRARY_CATEGORIES.moments]: [
    'moments',
    'moment',
    'feed',
    'timeline',
    'comment',
    '动态',
    '评论',
    '朋友圈',
    '社媒',
  ],
  [PROMPT_LIBRARY_CATEGORIES.writing]: [
    'writing',
    'creative',
    'story',
    'novel',
    'chapter',
    'draft',
    'rewrite',
    '续写',
    '改写',
    '润色',
    '章节',
    '创作',
    '写作',
  ],
  [PROMPT_LIBRARY_CATEGORIES.agent]: [
    'agent',
    'tool call',
    'tool_call',
    'function call',
    'function_call',
    'provider tool',
    'provider_tool',
    'runner',
    'schema',
    '工具调用',
    '工具权限',
  ],
  [PROMPT_LIBRARY_CATEGORIES.advanced]: [
    'regex',
    'post-process',
    'postprocess',
    'slash',
    'script',
    'mvu',
    'stat_data',
    'variable',
    'worldbook',
    'world book',
    '变量',
    '世界书',
    '脚本',
    '后处理',
  ],
  [PROMPT_LIBRARY_CATEGORIES.chat]: [
    'chat',
    'chatroom',
    'roleplay',
    'rp',
    'group chat',
    'system prompt',
    '聊天',
    '群聊',
    '角色',
    '对话',
  ],
});

const trim = (value, fallback = '') => {
  const text = String(value ?? '').trim();
  return text || fallback;
};

const normalizeText = value => trim(value).toLowerCase();

const normalizeList = value => (Array.isArray(value) ? value : [value])
  .map(trim)
  .filter(Boolean);

export const normalizePromptLibraryCategory = (value = '') => {
  const raw = normalizeText(value).replace(/[\s_-]+/g, '');
  const match = PROMPT_LIBRARY_CATEGORY_ORDER.find(category => raw === category.replace(/[\s_-]+/g, ''));
  return match || PROMPT_LIBRARY_CATEGORIES.unsorted;
};

const buildSearchText = (item = {}) => {
  const src = item && typeof item === 'object' ? item : {};
  return [
    src.category,
    src.surface,
    src.scope,
    src.type,
    src.identifier,
    src.name,
    src.title,
    src.label,
    src.description,
    src.content,
    src.prompt,
    src.template,
    src.rules,
    ...normalizeList(src.tags),
  ].map(trim).filter(Boolean).join('\n').toLowerCase();
};

export const scorePromptLibraryCategories = (item = {}) => {
  const text = buildSearchText(item);
  const scores = Object.fromEntries(PROMPT_LIBRARY_CATEGORY_ORDER.map(category => [category, 0]));
  const explicit = normalizePromptLibraryCategory(item?.category || item?.surface || '');
  if (explicit !== PROMPT_LIBRARY_CATEGORIES.unsorted) scores[explicit] += 100;
  Object.entries(KEYWORDS).forEach(([category, keywords]) => {
    keywords.forEach((keyword) => {
      const key = normalizeText(keyword);
      if (key && text.includes(key)) scores[category] += 1;
    });
  });
  return scores;
};

export const detectPromptLibraryCategory = (item = {}) => {
  const scores = scorePromptLibraryCategories(item);
  const ranked = PROMPT_LIBRARY_CATEGORY_ORDER
    .filter(category => category !== PROMPT_LIBRARY_CATEGORIES.unsorted)
    .map(category => [category, scores[category] || 0])
    .sort((a, b) => b[1] - a[1] || PROMPT_LIBRARY_CATEGORY_ORDER.indexOf(a[0]) - PROMPT_LIBRARY_CATEGORY_ORDER.indexOf(b[0]));
  const [category, score] = ranked[0] || [PROMPT_LIBRARY_CATEGORIES.unsorted, 0];
  return score > 0 ? category : PROMPT_LIBRARY_CATEGORIES.unsorted;
};

export const normalizePromptLibraryItem = (item = {}) => {
  const source = item && typeof item === 'object' ? item : {};
  const category = normalizePromptLibraryCategory(source.category);
  const detectionSource = { ...source, category: '', surface: '' };
  const detectedCategory = detectPromptLibraryCategory(detectionSource);
  return {
    ...source,
    category: category === PROMPT_LIBRARY_CATEGORIES.unsorted ? detectedCategory : category,
    detectedCategory,
  };
};

export const buildPromptLibraryFacetCounts = (items = []) => {
  const counts = Object.fromEntries(PROMPT_LIBRARY_CATEGORY_ORDER.map(category => [category, 0]));
  (Array.isArray(items) ? items : []).forEach((item) => {
    const category = normalizePromptLibraryItem(item).category;
    counts[category] = (counts[category] || 0) + 1;
  });
  return counts;
};

export const filterPromptLibraryItems = ({
  items = [],
  category = PROMPT_LIBRARY_CATEGORIES.unsorted,
  includeUnsortedWhenAll = true,
} = {}) => {
  const rawCategory = normalizeText(category);
  const normalizedItems = (Array.isArray(items) ? items : []).map(normalizePromptLibraryItem);
  if (!rawCategory || rawCategory === 'all') return normalizedItems;
  const normalizedCategory = normalizePromptLibraryCategory(rawCategory);
  if (normalizedCategory === PROMPT_LIBRARY_CATEGORIES.unsorted && includeUnsortedWhenAll !== false) {
    return normalizedItems.filter(item => item.category === PROMPT_LIBRARY_CATEGORIES.unsorted);
  }
  return normalizedItems.filter(item => item.category === normalizedCategory);
};
