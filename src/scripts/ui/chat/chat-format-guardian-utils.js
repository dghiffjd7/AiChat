import { DialogueStreamParser } from './dialogue-stream-parser.js';

export const CHAT_FORMAT_EVENT_TYPES = Object.freeze({
  privateMessage: 'private_message',
  groupMessage: 'group_message',
  groupSystemEvent: 'group_system_event',
  momentComment: 'moment_comment',
  momentPost: 'moment_post',
});

const CHAT_SURFACE = 'chat';
const MOMENTS_SURFACE = 'moments';

export const CHAT_FORMAT_GUARDIAN_TARGETS = Object.freeze({
  auto: 'auto',
  privateChat: 'private_chat',
  groupChat: 'group_chat',
  momentComment: 'moment_comment',
  momentPost: 'moment_post',
  imagePrompt: 'image_prompt',
  memoryTableEdit: 'memory_table_edit',
  creativeText: 'creative_text',
  forum: 'forum',
});

const isPlainObject = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));

const trim = (value, fallback = '') => {
  const text = String(value ?? '').trim();
  return text || fallback;
};

const list = value => (Array.isArray(value) ? value : [value]).filter(item => item !== null && item !== undefined);

const normalizeConfidence = (value, fallback = 0.75) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.min(1, numeric));
};

const normalizeAttachments = value => (Array.isArray(value) ? value : []).filter(Boolean);

const normalizeStringList = value => list(value)
  .map(item => trim(item))
  .filter(Boolean);

const compactWhitespace = value => String(value ?? '').trim().replace(/\s+/g, ' ');

const truncatePreview = (value = '', maxLength = 240) => {
  const text = String(value ?? '').trim();
  const limit = Math.max(20, Math.trunc(Number(maxLength) || 240));
  return text.length > limit ? `${text.slice(0, limit - 1)}...` : text;
};

const boundRawText = (value = '', maxLength = 12000) => {
  const text = String(value ?? '');
  const limit = Math.max(1000, Math.trunc(Number(maxLength) || 12000));
  return {
    text: text.length > limit ? text.slice(0, limit) : text,
    truncated: text.length > limit,
  };
};

const splitLines = value => String(value ?? '').replace(/\r\n/g, '\n').split('\n');

const countLooseChatRows = (value = '') => splitLines(value)
  .map(line => trim(line))
  .filter(Boolean)
  .filter((line) => {
    if (/^(?:MiPhone_start|msg_start|msg_end|MiPhone_end)$/i.test(line)) return false;
    if (/^<[^>]+>$/.test(line)) return false;
    const parts = line.split('--');
    return parts.length >= 2 && trim(parts[0]) && trim(parts[1]);
  })
  .length;

const formatNumberedLines = (value = '') => {
  const lines = splitLines(value);
  const width = String(Math.max(1, lines.length)).length;
  return lines
    .map((line, index) => `${String(index + 1).padStart(width, '0')}: ${line}`)
    .join('\n');
};

const CHAT_FORMAT_PROMPT_LABELS = Object.freeze({
  phoneShell: 'MiPhone 外层格式',
  privateChat: '私聊格式',
  groupChat: '群聊格式',
  momentComment: '动态评论格式',
  momentPost: '动态发布格式',
  tableEdit: '记忆表格写入格式',
  imagePrompt: '图片提示词格式',
});

const CHAT_FORMAT_PROMPT_SNIPPETS = Object.freeze({
  phoneShell: [
    'MiPhone_start',
    'msg_start',
    'msg_end',
    'MiPhone_end',
  ],
  privateChat: [
    '<{{user}}和联系人名的私聊>',
    '说话人--正文--HH:mm',
    '</{{user}}和联系人名的私聊>',
  ],
  groupChat: [
    '<群聊:群名>',
    '<成员>成员1,成员2</成员>',
    '<聊天内容>',
    '说话人--正文--HH:mm',
    '</聊天内容>',
    '</群聊:群名>',
  ],
  momentComment: [
    'moment_reply_start',
    'moment_id:: 动态id',
    '评论者--评论正文--reply_to:: 评论id--reply_to_author:: 被回复者',
    'moment_reply_end',
  ],
  momentPost: [
    'moment_start',
    'author:: 发布者',
    'content:: 动态正文',
    'moment_end',
  ],
  tableEdit: [
    '<tableEdit>',
    '记忆表格内容',
    '</tableEdit>',
  ],
  imagePrompt: [
    '<image_prompt>',
    '图片提示词',
    '</image_prompt>',
  ],
});

export const normalizeChatFormatGuardianTarget = (value = '', fallback = CHAT_FORMAT_GUARDIAN_TARGETS.auto) => {
  const raw = trim(value || fallback, fallback).toLowerCase();
  const aliases = {
    private: CHAT_FORMAT_GUARDIAN_TARGETS.privateChat,
    private_message: CHAT_FORMAT_GUARDIAN_TARGETS.privateChat,
    dialogue: CHAT_FORMAT_GUARDIAN_TARGETS.privateChat,
    chat: CHAT_FORMAT_GUARDIAN_TARGETS.privateChat,
    group: CHAT_FORMAT_GUARDIAN_TARGETS.groupChat,
    group_message: CHAT_FORMAT_GUARDIAN_TARGETS.groupChat,
    moment: CHAT_FORMAT_GUARDIAN_TARGETS.momentPost,
    moments: CHAT_FORMAT_GUARDIAN_TARGETS.momentComment,
    moment_reply: CHAT_FORMAT_GUARDIAN_TARGETS.momentComment,
    image: CHAT_FORMAT_GUARDIAN_TARGETS.imagePrompt,
    image_tag: CHAT_FORMAT_GUARDIAN_TARGETS.imagePrompt,
    memory: CHAT_FORMAT_GUARDIAN_TARGETS.memoryTableEdit,
    table_edit: CHAT_FORMAT_GUARDIAN_TARGETS.memoryTableEdit,
    tableedit: CHAT_FORMAT_GUARDIAN_TARGETS.memoryTableEdit,
    creative: CHAT_FORMAT_GUARDIAN_TARGETS.creativeText,
    rp: CHAT_FORMAT_GUARDIAN_TARGETS.creativeText,
  };
  const normalized = aliases[raw] || raw;
  return Object.values(CHAT_FORMAT_GUARDIAN_TARGETS).includes(normalized)
    ? normalized
    : CHAT_FORMAT_GUARDIAN_TARGETS.auto;
};

const detectFormatTargetFromParserResult = (parserResult = null) => {
  const events = list(parserResult?.eventDrafts);
  if (events.some(event => trim(event?.type) === CHAT_FORMAT_EVENT_TYPES.groupMessage ||
    trim(event?.type) === CHAT_FORMAT_EVENT_TYPES.groupSystemEvent)) {
    return CHAT_FORMAT_GUARDIAN_TARGETS.groupChat;
  }
  if (events.some(event => trim(event?.type) === CHAT_FORMAT_EVENT_TYPES.privateMessage)) {
    return CHAT_FORMAT_GUARDIAN_TARGETS.privateChat;
  }
  if (events.some(event => trim(event?.type) === CHAT_FORMAT_EVENT_TYPES.momentPost)) {
    return CHAT_FORMAT_GUARDIAN_TARGETS.momentPost;
  }
  if (events.some(event => trim(event?.type) === CHAT_FORMAT_EVENT_TYPES.momentComment)) {
    return CHAT_FORMAT_GUARDIAN_TARGETS.momentComment;
  }
  return '';
};

const detectFormatTargetFromText = (text = '') => {
  const raw = String(text ?? '');
  if (/<\s*image_prompt\b/i.test(raw)) return CHAT_FORMAT_GUARDIAN_TARGETS.imagePrompt;
  if (/<\s*tableEdit\b/i.test(raw)) return CHAT_FORMAT_GUARDIAN_TARGETS.memoryTableEdit;
  return '';
};

const selectFormatIdsForTarget = (target = '') => {
  switch (normalizeChatFormatGuardianTarget(target)) {
    case CHAT_FORMAT_GUARDIAN_TARGETS.privateChat:
      return ['phoneShell', 'privateChat'];
    case CHAT_FORMAT_GUARDIAN_TARGETS.groupChat:
      return ['phoneShell', 'groupChat'];
    case CHAT_FORMAT_GUARDIAN_TARGETS.momentComment:
      return ['momentComment'];
    case CHAT_FORMAT_GUARDIAN_TARGETS.momentPost:
      return ['momentPost'];
    case CHAT_FORMAT_GUARDIAN_TARGETS.imagePrompt:
      return ['imagePrompt'];
    case CHAT_FORMAT_GUARDIAN_TARGETS.memoryTableEdit:
      return ['tableEdit'];
    case CHAT_FORMAT_GUARDIAN_TARGETS.creativeText:
    case CHAT_FORMAT_GUARDIAN_TARGETS.forum:
      return [];
    default:
      return [];
  }
};

export const resolveChatFormatGuardianFormatProfile = ({
  target = CHAT_FORMAT_GUARDIAN_TARGETS.auto,
  uiMode = '',
  surface = '',
  isGroupChat = false,
  assistantText = '',
  parserResult = null,
  enabledFormats = {},
} = {}) => {
  const requested = normalizeChatFormatGuardianTarget(target);
  const detectedFromText = detectFormatTargetFromText(assistantText);
  const detectedFromParser = detectFormatTargetFromParserResult(parserResult);
  const normalizedSurface = trim(surface).toLowerCase();
  const normalizedUiMode = trim(uiMode).toLowerCase();
  const resolvedTarget = requested !== CHAT_FORMAT_GUARDIAN_TARGETS.auto
    ? requested
    : (
      detectedFromText ||
      detectedFromParser ||
      (normalizedUiMode === 'rp' || normalizedSurface === 'creative'
        ? CHAT_FORMAT_GUARDIAN_TARGETS.creativeText
        : (normalizedSurface === MOMENTS_SURFACE
          ? CHAT_FORMAT_GUARDIAN_TARGETS.momentComment
          : (isGroupChat ? CHAT_FORMAT_GUARDIAN_TARGETS.groupChat : CHAT_FORMAT_GUARDIAN_TARGETS.privateChat)))
    );
  const wantedIds = selectFormatIdsForTarget(resolvedTarget);
  const source = isPlainObject(enabledFormats) ? enabledFormats : {};
  const selectedFormats = {};
  wantedIds.forEach((id) => {
    if (source[id] === true) selectedFormats[id] = true;
  });
  return {
    target: resolvedTarget,
    requestedTarget: requested,
    enabledFormats: selectedFormats,
    enabledFormatIds: Object.keys(selectedFormats),
  };
};

const normalizeEnabledFormatEntries = (enabledFormats = {}) => {
  if (Array.isArray(enabledFormats)) {
    return enabledFormats
      .map(item => trim(item))
      .filter(Boolean)
      .map(id => ({
        id,
        label: CHAT_FORMAT_PROMPT_LABELS[id] || id,
        snippet: CHAT_FORMAT_PROMPT_SNIPPETS[id] || [],
      }));
  }
  const src = isPlainObject(enabledFormats) ? enabledFormats : {};
  return Object.keys(CHAT_FORMAT_PROMPT_LABELS)
    .filter(id => src[id] === true)
    .map(id => ({
      id,
      label: CHAT_FORMAT_PROMPT_LABELS[id],
      snippet: CHAT_FORMAT_PROMPT_SNIPPETS[id] || [],
    }));
};

const isChatFormatEnabled = (enabledFormats = {}, id = '') => {
  const key = trim(id);
  if (!key) return false;
  if (Array.isArray(enabledFormats)) return enabledFormats.map(item => trim(item)).includes(key);
  const src = isPlainObject(enabledFormats) ? enabledFormats : {};
  return src[key] === true;
};

const getPhoneShellMarkerIndex = (text = '', marker = '') => {
  const src = String(text ?? '');
  const escaped = String(marker || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`<\\s*${escaped}\\s*>|\\b${escaped}\\b`, 'i');
  const match = re.exec(src);
  return match ? match.index : -1;
};

const collectPhoneShellWarnings = (text = '', eventDrafts = [], enabledFormats = {}) => {
  if (!isChatFormatEnabled(enabledFormats, 'phoneShell')) return [];
  if (!list(eventDrafts).length) return [];
  const markers = ['MiPhone_start', 'msg_start', 'msg_end', 'MiPhone_end'];
  const indices = markers.map(marker => [marker, getPhoneShellMarkerIndex(text, marker)]);
  const warnings = indices
    .filter(([, index]) => index < 0)
    .map(([marker]) => `phone shell marker is missing: ${marker}`);
  if (!warnings.length) {
    for (let index = 1; index < indices.length; index += 1) {
      if (indices[index][1] < indices[index - 1][1]) {
        warnings.push('phone shell marker order is invalid');
        break;
      }
    }
  }
  return warnings;
};

const serializeFormatEntries = (entries = []) => (
  entries
    .map((entry) => {
      const snippet = list(entry?.snippet).map(line => String(line ?? '')).join('\n').trim();
      return [`- ${entry.label || entry.id}`, snippet].filter(Boolean).join('\n');
    })
    .join('\n\n')
    .trim()
);

const buildPrivateChatTagName = ({ userName = '我', sessionLabel = '' } = {}) =>
  `${trim(userName, '我')}和${trim(sessionLabel, '联系人名')}的私聊`;

const buildPrivateDirectRepairExample = ({ userName = '我', sessionLabel = '', fallbackTime = '' } = {}) => {
  const tagName = buildPrivateChatTagName({ userName, sessionLabel });
  const time = trim(fallbackTime, '00:00');
  return [
    '错误原文示例：',
    '联系人名: 在吗？',
    '',
    '可直接替换的修复文本示例：',
    'MiPhone_start',
    'msg_start',
    `<${tagName}>`,
    `联系人名--在吗？--${time}`,
    `</${tagName}>`,
    'msg_end',
    'MiPhone_end',
  ].join('\n');
};

const buildDirectRepairExample = ({
  userName = '我',
  sessionLabel = '',
  fallbackTime = '',
  target = CHAT_FORMAT_GUARDIAN_TARGETS.privateChat,
} = {}) => {
  const normalizedTarget = normalizeChatFormatGuardianTarget(target, CHAT_FORMAT_GUARDIAN_TARGETS.privateChat);
  const time = trim(fallbackTime, '00:00');
  if (normalizedTarget === CHAT_FORMAT_GUARDIAN_TARGETS.groupChat) {
    return [
      '错误原文示例：',
      '成员A: 我到了',
      '',
      '可直接替换的修复文本示例：',
      'MiPhone_start',
      'msg_start',
      '<群聊:群名>',
      '<聊天内容>',
      `成员A--我到了--${time}`,
      '</聊天内容>',
      '</群聊:群名>',
      'msg_end',
      'MiPhone_end',
    ].join('\n');
  }
  if (normalizedTarget === CHAT_FORMAT_GUARDIAN_TARGETS.momentComment) {
    return [
      '错误原文示例：',
      '评论者: 好看！',
      '',
      '可直接替换的修复文本示例：',
      'moment_reply_start',
      'moment_id:: 动态id',
      '评论者--好看！',
      'moment_reply_end',
    ].join('\n');
  }
  if (normalizedTarget === CHAT_FORMAT_GUARDIAN_TARGETS.momentPost) {
    return [
      '错误原文示例：',
      '今天去了海边。',
      '',
      '可直接替换的修复文本示例：',
      'moment_start',
      `author:: ${trim(userName, '我')}`,
      'content:: 今天去了海边。',
      'moment_end',
    ].join('\n');
  }
  if (normalizedTarget === CHAT_FORMAT_GUARDIAN_TARGETS.imagePrompt) {
    return [
      '错误原文示例：',
      '画一张黄昏海边的少女',
      '',
      '可直接替换的修复文本示例：',
      '<image_prompt>',
      '黄昏海边的少女，柔和光线，细节清晰',
      '</image_prompt>',
    ].join('\n');
  }
  if (normalizedTarget === CHAT_FORMAT_GUARDIAN_TARGETS.memoryTableEdit) {
    return [
      '错误原文示例：',
      '把 Alice 的喜好改成喜欢红茶',
      '',
      '可直接替换的修复文本示例：',
      '<tableEdit>',
      'update memory set preference="喜欢红茶" where name="Alice"',
      '</tableEdit>',
    ].join('\n');
  }
  if (normalizedTarget === CHAT_FORMAT_GUARDIAN_TARGETS.creativeText ||
      normalizedTarget === CHAT_FORMAT_GUARDIAN_TARGETS.forum) {
    return '';
  }
  return buildPrivateDirectRepairExample({ userName, sessionLabel, fallbackTime });
};

const compactParserReportForPrompt = (report = null, { maxEvents = 6, maxIssues = 8 } = {}) => {
  if (!isPlainObject(report)) return null;
  return {
    status: trim(report.status),
    summary: trim(report.summary),
    repairFallbackTime: trim(report.repairFallbackTime),
    errors: normalizeStringList(report.errors).slice(0, Math.max(0, Math.trunc(Number(maxIssues) || 8))),
    warnings: normalizeStringList(report.warnings).slice(0, Math.max(0, Math.trunc(Number(maxIssues) || 8))),
    events: list(report.eventDrafts)
      .slice(0, Math.max(0, Math.trunc(Number(maxEvents) || 6)))
      .map(event => ({
        type: trim(event?.type),
        surface: trim(event?.surface),
        targetName: trim(event?.targetName),
        speakerName: trim(event?.speakerName),
        time: trim(event?.time),
        contentPreview: truncatePreview(event?.content, 80),
        warnings: normalizeStringList(event?.warnings).slice(0, 4),
      })),
  };
};

export const buildChatFormatGuardianModelPrompt = ({
  assistantText = '',
  formatReminderText = '',
  customFormatGuide = '',
  enabledFormats = {},
  parserReport = null,
  userName = '我',
  sessionLabel = '',
  surface = 'chat',
  formatTarget = CHAT_FORMAT_GUARDIAN_TARGETS.privateChat,
} = {}) => {
  const rawAssistantText = String(assistantText ?? '').trim();
  const reminder = String(formatReminderText ?? '').trim();
  const customGuide = String(customFormatGuide ?? '').trim().slice(0, 6000);
  const formatEntries = normalizeEnabledFormatEntries(enabledFormats);
  const formatSummary = serializeFormatEntries(formatEntries);
  const compactReport = compactParserReportForPrompt(parserReport);
  const numberedAssistantText = rawAssistantText ? formatNumberedLines(rawAssistantText) : '';
  const looseChatRowCount = countLooseChatRows(rawAssistantText);
  const repairFallbackTime = trim(compactReport?.repairFallbackTime, '00:00');
  const privateTagName = buildPrivateChatTagName({ userName, sessionLabel });
  const normalizedTarget = normalizeChatFormatGuardianTarget(formatTarget, CHAT_FORMAT_GUARDIAN_TARGETS.privateChat);
  const hasPrivateFormat = formatEntries.some(entry => entry.id === 'privateChat');
  const hasChatFormat = formatEntries.some(entry => ['privateChat', 'groupChat', 'phoneShell'].includes(entry.id));
  const directRepairExample = buildDirectRepairExample({
    userName,
    sessionLabel,
    fallbackTime: repairFallbackTime,
    target: normalizedTarget,
  });
  const noEventsHint = compactReport?.status === 'no_events'
    ? (looseChatRowCount > 0
      ? [
        `本地解析器没有发现可提交的完整协议内容，但原始回复包含 ${looseChatRowCount} 行疑似聊天内容（例如“说话人--正文”或“说话人--正文--HH:mm”）。`,
        '这属于可修复的标签缺漏。保留原文发言人、顺序和正文，只补齐下方格式范例或格式规则明确要求的标签、字段和闭合结构。',
        hasPrivateFormat
          ? `私聊场景优先补成：MiPhone_start / msg_start / <${privateTagName}> / 原聊天行 / </${privateTagName}> / msg_end / MiPhone_end。`
          : '优先补成当前目标格式要求的最小合法结构。',
        `若聊天行缺少时间字段，优先使用 repairFallbackTime（${repairFallbackTime}）；没有可用时间时使用 00:00。`,
      ].join('\n')
      : '本地解析器没有发现可提交的完整协议内容。若原始回复为空、完全没有有效聊天/动态内容，或只有残缺片段，不要补写剧情；返回 canRepair=false、correctedText=""、linePatches=[]，并在 repairSummary 中建议用户重新生成。')
    : '';
  const system = [
    '你是聊天回复格式修复 Agent。',
    '任务：把一段格式错误的 AI 原始回复修成可被应用解析的协议文本。',
    '只修复格式，不评价剧情、修辞、角色一致性或用户意图。',
    '允许修复：补齐/移动/闭合协议标签，补齐 msg 外层，补齐缺失时间，移除末尾残缺半行，把“说话人: 正文”转换为“说话人--正文--HH:mm”。',
    '禁止修改：不得改写正文语义，不得新增剧情内容，不得扩写角色台词。',
    hasPrivateFormat ? '私聊标签遵循现有协议：<{{user}}和联系人名的私聊>...</{{user}}和联系人名的私聊>；{{user}} 经过宏替换后也可能表现为“我和联系人名的私聊”或“用户名和联系人名的私聊”。' : '',
    hasChatFormat ? '如果原始回复没有任何外层标签，但包含“说话人--正文”或“说话人--正文--HH:mm”聊天行，应视为可修复的标签缺漏，优先补齐标签而不是建议重新生成。' : '',
    '如果回复明显在末尾截断，不要补写新剧情；只保留已经完整成行的内容并补齐必要闭合标签。',
    '输出必须是一个完整 JSON 对象。禁止 Markdown 代码块，禁止解释，禁止省略号，禁止在 JSON 前后输出任何文字。',
    'JSON 字符串字段内部不要使用英文双引号；需要引用格式名时使用中文引号或直接写文字，避免破坏 JSON。',
    'canRepair=true 时，correctedText 必须是完整的、可直接替换原回复的修复后文本；linePatches 可以为空数组。',
    hasChatFormat ? 'correctedText 用于重新解析聊天/动态协议；不要在 MiPhone_end 之后追加额外段落或标签。' : 'correctedText 用于重新解析当前目标格式；不要追加目标格式以外的解释段落。',
    hasChatFormat ? '如果原始回复把 <image_prompt>...</image_prompt> 嵌入聊天行，聊天修复只保留可显示的聊天行内容；不要把独立 image_prompt 追加到 correctedText 尾部。' : '',
    'canRepair=false 时，correctedText 必须是空字符串，linePatches 必须是空数组。',
  ].filter(Boolean).join('\n');
  const user = [
    [
      '# Task',
      'Repair the assistant output format. Return only the JSON object defined below.',
    ].join('\n'),
    [
      '# Runtime Context',
      `userName: ${trim(userName, '我')}`,
      `sessionLabel: ${trim(sessionLabel, '') || 'N/A'}`,
      `surface: ${trim(surface, 'chat')}`,
      `formatTarget: ${normalizedTarget}`,
      `repairFallbackTime: ${repairFallbackTime}`,
    ].join('\n'),
    formatSummary ? `# Required Format Examples\n${formatSummary}` : '',
    directRepairExample ? `# Direct Replacement Example\n${directRepairExample}` : '',
    reminder ? `# Required Additional Format Rules\n${reminder}` : '',
    customGuide ? `# Custom Format Guide（从会话正则/世界书/角色卡提取的自定义格式规范，修复结果必须同时满足）\n${customGuide}` : '',
    compactReport ? `# Local Parser Report\n${JSON.stringify(compactReport, null, 2)}` : '',
    noEventsHint,
    [
      '# Current Invalid Model Output（待检测 AI 原始回复）',
      'The line numbers are for locating text only. Do not copy line numbers into correctedText.',
      numberedAssistantText || '（空）',
    ].join('\n'),
    [
      '# Output Contract',
      'Return exactly one JSON object. Do not wrap it in Markdown code fences. Do not use ellipsis or comments.',
      'Do not place unescaped double quotes inside JSON string values. Use Chinese quotes or plain text in message/repairSummary.',
      '{',
      '  "status": "ok | needs_repair | invalid",',
      '  "issues": [{"severity":"error | warning","type":"missing_tag | wrong_order | missing_field | unresolved_target | parse_error | other","message":"简短说明","evidence":"相关短片段"}],',
      '  "canRepair": true | false,',
      '  "repairSummary": "一句话说明修复了什么；不可写长篇解释",',
      '  "linePatches": [{"startLine":1,"endLine":1,"originalLines":["原始行"],"replacementLines":["替换行"]}],',
      '  "correctedText": "完整修复后的协议文本；canRepair=true 时必须非空；必须可直接替换 Current Invalid Model Output"',
      '}',
      'When correctedText contains the full repair, linePatches may be [].',
      'If you also provide linePatches, use 1-based line numbers and exact originalLines. Never abbreviate replacementLines.',
    ].join('\n'),
  ].filter(Boolean).join('\n\n');
  return {
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    responseFormat: 'json_object',
    enabledFormatIds: formatEntries.map(entry => entry.id),
  };
};

export const extractJsonObjectText = (value = '') => {
  const text = String(value ?? '').trim();
  if (!text) return '';
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const source = fenced?.[1]?.trim() || text;
  if (source.startsWith('{') && source.endsWith('}')) return source;
  const start = source.indexOf('{');
  const end = source.lastIndexOf('}');
  return start >= 0 && end > start ? source.slice(start, end + 1) : '';
};

const escapeRegExp = value => String(value ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const parseJsonStringLiteralAt = (source = '', quoteIndex = -1) => {
  const text = String(source ?? '');
  if (quoteIndex < 0 || text[quoteIndex] !== '"') return null;
  let escaped = false;
  for (let index = quoteIndex + 1; index < text.length; index += 1) {
    const char = text[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (char !== '"') continue;
    const after = text.slice(index + 1).match(/^\s*([,}\]])/);
    if (!after) continue;
    try {
      return JSON.parse(text.slice(quoteIndex, index + 1));
    } catch {}
  }
  return null;
};

const extractJsonStringField = (source = '', fieldName = '') => {
  const key = trim(fieldName);
  if (!key) return null;
  const pattern = new RegExp(`"${escapeRegExp(key)}"\\s*:\\s*"`, 'i');
  const match = pattern.exec(String(source ?? ''));
  if (!match) return null;
  return parseJsonStringLiteralAt(source, match.index + match[0].length - 1);
};

const extractJsonBooleanField = (source = '', fieldName = '') => {
  const key = trim(fieldName);
  if (!key) return null;
  const pattern = new RegExp(`"${escapeRegExp(key)}"\\s*:\\s*(true|false)\\b`, 'i');
  const match = pattern.exec(String(source ?? ''));
  if (!match) return null;
  return match[1].toLowerCase() === 'true';
};

const normalizeModelReviewStatus = (status = '', issues = []) => {
  const raw = trim(status).toLowerCase();
  if (['ok', 'ready', 'pass', 'passed'].includes(raw)) return 'ok';
  if (['needs_repair', 'needs-review', 'needs_review', 'repair', 'warning'].includes(raw)) return 'needs_repair';
  if (['invalid', 'error', 'failed', 'fail'].includes(raw)) return 'invalid';
  return issues.length ? 'needs_repair' : 'ok';
};

const normalizeModelReviewIssue = (issue = {}) => {
  if (typeof issue === 'string') {
    return {
      severity: 'warning',
      type: 'other',
      message: trim(issue),
      evidence: '',
    };
  }
  if (!isPlainObject(issue)) return null;
  const severity = trim(issue.severity).toLowerCase();
  return {
    severity: severity === 'error' ? 'error' : 'warning',
    type: trim(issue.type, 'other'),
    message: trim(issue.message || issue.summary || issue.title),
    evidence: truncatePreview(issue.evidence || issue.fragment || issue.text, 160),
  };
};

const normalizeLinePatch = (patch = {}) => {
  if (!isPlainObject(patch)) return null;
  const startLine = Math.trunc(Number(patch.startLine ?? patch.start_line ?? patch.line ?? 0));
  const endLine = Math.trunc(Number(patch.endLine ?? patch.end_line ?? patch.line ?? startLine));
  if (!Number.isFinite(startLine) || !Number.isFinite(endLine) || startLine < 1 || endLine < startLine) return null;
  const rawLines = Array.isArray(patch.replacementLines)
    ? patch.replacementLines
    : (Array.isArray(patch.replacement_lines) ? patch.replacement_lines : null);
  const replacementText = rawLines
    ? rawLines.map(line => String(line ?? '')).join('\n')
    : String(patch.replacementText ?? patch.replacement_text ?? '');
  const rawOriginalLines = Array.isArray(patch.originalLines)
    ? patch.originalLines
    : (Array.isArray(patch.original_lines) ? patch.original_lines : null);
  return {
    startLine,
    endLine,
    originalLines: rawOriginalLines ? rawOriginalLines.map(line => String(line ?? '')) : null,
    replacementText,
    replacementLines: rawLines ? rawLines.map(line => String(line ?? '')) : null,
    reason: trim(patch.reason || patch.summary),
  };
};

const salvageModelReviewFromLooseJson = (sourceText = '', boundedRaw = null) => {
  const jsonText = extractJsonObjectText(sourceText) || String(sourceText ?? '');
  const explicitCorrectedText = trim(
    extractJsonStringField(jsonText, 'correctedText') ??
    extractJsonStringField(jsonText, 'corrected_text') ??
    '',
  );
  if (!explicitCorrectedText) return null;
  const canRepairValue = extractJsonBooleanField(jsonText, 'canRepair');
  const canRepairSnakeValue = extractJsonBooleanField(jsonText, 'can_repair');
  const explicitCanRepair = canRepairValue !== null ? canRepairValue : canRepairSnakeValue;
  const issues = [{
    severity: 'warning',
    type: 'parse_error',
    message: '模型返回 JSON 存在转义错误，已从 correctedText 抢救修复文本',
    evidence: truncatePreview(sourceText, 160),
  }];
  const status = normalizeModelReviewStatus(
    extractJsonStringField(jsonText, 'status') || 'needs_repair',
    issues,
  );
  return {
    ok: true,
    status,
    issues,
    canRepair: explicitCanRepair === false ? false : Boolean(explicitCorrectedText),
    repairSummary: trim(
      extractJsonStringField(jsonText, 'repairSummary') ||
      extractJsonStringField(jsonText, 'repair_summary'),
      '模型返回 JSON 有转义错误，已读取 correctedText。',
    ),
    correctedText: explicitCanRepair === false ? '' : explicitCorrectedText,
    linePatches: [],
    rawPreview: truncatePreview(sourceText, 240),
    rawText: boundedRaw?.text ?? boundRawText(sourceText).text,
    rawTextTruncated: boundedRaw?.truncated ?? boundRawText(sourceText).truncated,
  };
};

const applyLinePatches = (originalText = '', patches = []) => {
  const lines = splitLines(originalText);
  const normalized = (Array.isArray(patches) ? patches : [])
    .map(normalizeLinePatch)
    .filter(Boolean)
    .sort((a, b) => b.startLine - a.startLine);
  if (!normalized.length) return { correctedText: '', linePatches: [] };
  let ok = true;
  normalized.forEach((patch) => {
    if (patch.endLine > lines.length) {
      ok = false;
      patch.originalMatches = false;
      return;
    }
    if (Array.isArray(patch.originalLines)) {
      const currentLines = lines.slice(patch.startLine - 1, patch.endLine);
      const matches = currentLines.length === patch.originalLines.length &&
        currentLines.every((line, index) => line === patch.originalLines[index]);
      patch.originalMatches = matches;
      if (!matches) {
        ok = false;
        return;
      }
    } else {
      patch.originalMatches = null;
    }
    const replacementLines = patch.replacementText === ''
      ? (Array.isArray(patch.replacementLines) ? patch.replacementLines : [])
      : splitLines(patch.replacementText);
    lines.splice(patch.startLine - 1, patch.endLine - patch.startLine + 1, ...replacementLines);
  });
  return {
    correctedText: ok ? lines.join('\n') : '',
    linePatches: normalized.reverse(),
  };
};

export const normalizeChatFormatGuardianModelReview = (raw = '', { originalText = '' } = {}) => {
  const sourceText = typeof raw === 'string' ? raw : JSON.stringify(raw || {});
  const boundedRaw = boundRawText(sourceText);
  let parsed = null;
  if (isPlainObject(raw)) {
    parsed = raw;
  } else {
    const jsonText = extractJsonObjectText(sourceText);
    if (jsonText) {
      try {
        parsed = JSON.parse(jsonText);
      } catch {}
    }
  }
  if (!isPlainObject(parsed)) {
    const salvaged = salvageModelReviewFromLooseJson(sourceText, boundedRaw);
    if (salvaged) return salvaged;
    return {
      ok: false,
      status: 'invalid',
      issues: [{
        severity: 'error',
        type: 'parse_error',
        message: '模型未返回可解析的 JSON',
        evidence: truncatePreview(sourceText, 160),
      }],
      canRepair: false,
      repairSummary: '',
      correctedText: '',
      rawPreview: truncatePreview(sourceText, 240),
      rawText: boundedRaw.text,
      rawTextTruncated: boundedRaw.truncated,
    };
  }
  const issues = list(parsed.issues)
    .map(normalizeModelReviewIssue)
    .filter(issue => issue?.message)
    .slice(0, 12);
  const status = normalizeModelReviewStatus(parsed.status, issues);
  const rawPatches = Array.isArray(parsed.linePatches)
    ? parsed.linePatches
    : (Array.isArray(parsed.line_patches)
      ? parsed.line_patches
      : (Array.isArray(parsed.replacements) ? parsed.replacements : parsed.patches));
  const patchResult = applyLinePatches(originalText, rawPatches);
  const explicitCorrectedText = String(parsed.correctedText ?? parsed.corrected_text ?? '').trim();
  const correctedText = explicitCorrectedText || patchResult.correctedText;
  const canRepair = parsed.canRepair === true || parsed.can_repair === true || Boolean(correctedText);
  return {
    ok: true,
    status,
    issues,
    canRepair: Boolean(canRepair && correctedText),
    repairSummary: trim(parsed.repairSummary || parsed.repair_summary),
    correctedText,
    linePatches: patchResult.linePatches,
    rawPreview: truncatePreview(sourceText, 240),
    rawText: boundedRaw.text,
    rawTextTruncated: boundedRaw.truncated,
  };
};

const inferSurface = (type = '') => (
  type === CHAT_FORMAT_EVENT_TYPES.momentComment || type === CHAT_FORMAT_EVENT_TYPES.momentPost
    ? MOMENTS_SURFACE
    : CHAT_SURFACE
);

const normalizeChatFormatEventType = value => (
  Object.values(CHAT_FORMAT_EVENT_TYPES).includes(value)
    ? value
    : ''
);

export const normalizeChatFormatEventDraft = (event = {}) => {
  const src = isPlainObject(event) ? event : {};
  const type = normalizeChatFormatEventType(trim(src.type));
  const warnings = normalizeStringList(src.warnings);
  return {
    type,
    surface: trim(src.surface, inferSurface(type)),
    targetId: trim(src.targetId),
    targetName: trim(src.targetName),
    speakerId: trim(src.speakerId),
    speakerName: trim(src.speakerName),
    content: trim(src.content),
    time: trim(src.time),
    attachments: normalizeAttachments(src.attachments),
    sourceMessageId: trim(src.sourceMessageId),
    confidence: normalizeConfidence(src.confidence),
    warnings,
    metadata: isPlainObject(src.metadata) ? { ...src.metadata } : {},
  };
};

const isSystemSpeaker = (speaker = '', options = {}) => {
  if (typeof options.isSystemSpeaker === 'function') return options.isSystemSpeaker(speaker) === true;
  return ['系统', 'system', '系统消息'].includes(trim(speaker).toLowerCase()) ||
    trim(speaker).startsWith('系统');
};

const resolveTargetId = (name = '', resolver = null) => {
  if (typeof resolver !== 'function') return '';
  try {
    return trim(resolver(name));
  } catch {
    return '';
  }
};

const resolveSpeakerId = (name = '', resolver = null, targetId = '') => {
  if (typeof resolver !== 'function') return '';
  try {
    return trim(resolver(name, targetId));
  } catch {
    return '';
  }
};

const buildPrivateMessageDrafts = (event = {}, options = {}) => {
  const targetName = trim(event.otherName);
  const targetId = resolveTargetId(targetName, options.resolvePrivateTargetId);
  return list(event.messages).map(message => normalizeChatFormatEventDraft({
    type: CHAT_FORMAT_EVENT_TYPES.privateMessage,
    surface: CHAT_SURFACE,
    targetId,
    targetName,
    speakerId: resolveSpeakerId(message?.speaker, options.resolveSpeakerId, targetId),
    speakerName: trim(message?.speaker),
    content: message?.content,
    time: message?.time,
    sourceMessageId: options.sourceMessageId,
    confidence: targetName ? 0.86 : 0.62,
    metadata: {
      protocolType: 'private_chat',
      tagName: trim(event.tagName),
    },
  }));
};

const buildGroupMessageDrafts = (event = {}, options = {}) => {
  const targetName = trim(event.groupName);
  const targetId = resolveTargetId(targetName, options.resolveGroupTargetId);
  return list(event.messages).map((message) => {
    const speakerName = trim(message?.speaker);
    const system = isSystemSpeaker(speakerName, options);
    return normalizeChatFormatEventDraft({
      type: system ? CHAT_FORMAT_EVENT_TYPES.groupSystemEvent : CHAT_FORMAT_EVENT_TYPES.groupMessage,
      surface: CHAT_SURFACE,
      targetId,
      targetName,
      speakerId: system ? '' : resolveSpeakerId(speakerName, options.resolveSpeakerId, targetId),
      speakerName,
      content: message?.content,
      time: message?.time,
      sourceMessageId: options.sourceMessageId,
      confidence: targetName ? 0.88 : 0.62,
      metadata: {
        protocolType: 'group_chat',
        tagName: trim(event.tagName),
        members: normalizeStringList(event.members),
      },
    });
  });
};

const buildMomentPostDrafts = (event = {}, options = {}) => list(event.moments).map(moment => normalizeChatFormatEventDraft({
  type: CHAT_FORMAT_EVENT_TYPES.momentPost,
  surface: MOMENTS_SURFACE,
  targetId: trim(moment?.id),
  targetName: trim(moment?.author),
  speakerName: trim(moment?.author),
  content: moment?.content,
  time: moment?.time,
  sourceMessageId: options.sourceMessageId,
  confidence: trim(moment?.author) ? 0.82 : 0.66,
  metadata: {
    protocolType: 'moments',
    views: Number(moment?.views || 0) || 0,
    likes: Number(moment?.likes || 0) || 0,
    comments: Array.isArray(moment?.comments) ? moment.comments.slice() : [],
  },
}));

const buildMomentReplyDrafts = (event = {}, options = {}) => list(event.comments).map(comment => normalizeChatFormatEventDraft({
  type: CHAT_FORMAT_EVENT_TYPES.momentComment,
  surface: MOMENTS_SURFACE,
  targetId: trim(event.momentId),
  targetName: trim(comment?.replyToAuthor || comment?.replyTo),
  speakerName: trim(comment?.author),
  content: comment?.content,
  sourceMessageId: options.sourceMessageId,
  confidence: trim(event.momentId) ? 0.84 : 0.68,
  metadata: {
    protocolType: 'moment_reply',
    replyTo: trim(comment?.replyTo),
    replyToAuthor: trim(comment?.replyToAuthor),
  },
}));

export const buildChatFormatEventDraftsFromProtocolEvents = (protocolEvents = [], options = {}) => (
  list(protocolEvents).flatMap((event) => {
    if (event?.type === 'private_chat') return buildPrivateMessageDrafts(event, options);
    if (event?.type === 'group_chat') return buildGroupMessageDrafts(event, options);
    if (event?.type === 'moments') return buildMomentPostDrafts(event, options);
    if (event?.type === 'moment_reply') return buildMomentReplyDrafts(event, options);
    return [];
  })
);

export const validateChatFormatEventDraft = (event = {}) => {
  const draft = normalizeChatFormatEventDraft(event);
  const errors = [];
  const warnings = normalizeStringList(draft.warnings);
  if (!draft.type) errors.push('type is required');
  if (!draft.surface) errors.push('surface is required');
  if (draft.surface === CHAT_SURFACE &&
    (draft.type === CHAT_FORMAT_EVENT_TYPES.momentComment || draft.type === CHAT_FORMAT_EVENT_TYPES.momentPost)) {
    errors.push('moment events must use moments surface');
  }
  if (draft.surface === MOMENTS_SURFACE &&
    (draft.type === CHAT_FORMAT_EVENT_TYPES.privateMessage ||
      draft.type === CHAT_FORMAT_EVENT_TYPES.groupMessage ||
      draft.type === CHAT_FORMAT_EVENT_TYPES.groupSystemEvent)) {
    errors.push('chat events must use chat surface');
  }
  if (!draft.content) errors.push('content is required');
  if (!draft.targetId && !draft.targetName) warnings.push('target is unresolved');
  if (!draft.speakerId && !draft.speakerName && draft.type !== CHAT_FORMAT_EVENT_TYPES.groupSystemEvent) {
    warnings.push('speaker is unresolved');
  }
  if (!draft.time && draft.surface === CHAT_SURFACE) warnings.push('time is missing');
  if (draft.confidence < 0.7) warnings.push('low confidence');
  return {
    ok: errors.length === 0,
    commitReady: errors.length === 0 && warnings.length === 0,
    severity: errors.length ? 'error' : (warnings.length ? 'warning' : 'ok'),
    event: {
      ...draft,
      warnings,
    },
    errors,
    warnings,
  };
};

export const validateChatFormatEventDrafts = (events = []) => {
  const items = list(events).map(validateChatFormatEventDraft);
  const errors = items.flatMap(item => item.errors);
  const warnings = items.flatMap(item => item.warnings);
  return {
    ok: errors.length === 0,
    commitReady: items.length > 0 && items.every(item => item.commitReady),
    severity: errors.length ? 'error' : (warnings.length ? 'warning' : 'ok'),
    items,
    errors,
    warnings,
  };
};

const normalizeRepairTime = value => {
  const text = trim(value);
  const match = text.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return '';
  const hour = Math.min(Math.max(0, Number(match[1]) || 0), 23);
  const minute = Math.min(Math.max(0, Number(match[2]) || 0), 59);
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
};

const serializeProtocolContent = value => (
  trim(value)
    .replace(/\n+/g, '<br>')
    .replace(/\s*<br>\s*/gi, '<br>')
);

const buildProtocolLine = (event = {}, fallbackTime = '') => {
  const speaker = trim(event?.speakerName);
  const content = serializeProtocolContent(event?.content);
  const time = normalizeRepairTime(event?.time) || fallbackTime;
  if (!speaker || !content || !time) return '';
  return `${speaker}--${content}--${time}`;
};

const getEventGroupKey = event => [
  trim(event?.metadata?.protocolType),
  trim(event?.metadata?.tagName),
  trim(event?.targetName),
  trim(event?.targetId),
].join('\u0000');

const groupEventsByProtocolBlock = (events = []) => {
  const groups = [];
  const byKey = new Map();
  list(events).forEach((event) => {
    const key = getEventGroupKey(event);
    if (!byKey.has(key)) {
      const group = { key, events: [] };
      byKey.set(key, group);
      groups.push(group);
    }
    byKey.get(key).events.push(event);
  });
  return groups;
};

const buildPrivateRepairBlock = (events = [], fallbackTime = '') => {
  const first = events[0] || {};
  const tagName = trim(first?.metadata?.tagName) || (trim(first?.targetName) ? `我和${trim(first.targetName)}的私聊` : '');
  if (!tagName) return '';
  const lines = events.map(event => buildProtocolLine(event, fallbackTime)).filter(Boolean);
  if (!lines.length) return '';
  return [`<${tagName}>`, ...lines, `</${tagName}>`].join('\n');
};

const buildGroupRepairBlock = (events = [], fallbackTime = '') => {
  const first = events[0] || {};
  const tagName = trim(first?.metadata?.tagName) || (trim(first?.targetName) ? `群聊:${trim(first.targetName)}` : '');
  if (!tagName) return '';
  const members = normalizeStringList(first?.metadata?.members);
  const lines = events.map(event => buildProtocolLine(event, fallbackTime)).filter(Boolean);
  if (!lines.length) return '';
  return [
    `<${tagName}>`,
    ...(members.length ? [`<成员>${members.join(',')}</成员>`] : []),
    '<聊天内容>',
    ...lines,
    '</聊天内容>',
    `</${tagName}>`,
  ].join('\n');
};

export const buildChatFormatRepairCandidate = (result = {}, {
  fallbackTime = '',
  maxPreviewLength = 240,
} = {}) => {
  const events = list(result?.eventDrafts).map(normalizeChatFormatEventDraft);
  const errors = normalizeStringList(result?.errors);
  const warnings = normalizeStringList(result?.warnings);
  if (!events.length || !warnings.length) {
    return { available: false, reason: 'no_repair_needed' };
  }
  if (errors.length) {
    return { available: false, reason: 'has_errors', errors, warnings };
  }
  if (warnings.some(warning => warning !== 'time is missing')) {
    return { available: false, reason: 'unsupported_warnings', errors, warnings };
  }
  if (events.some(event => event.surface !== CHAT_SURFACE)) {
    return { available: false, reason: 'unsupported_surface', errors, warnings };
  }
  if (events.some(event => !trim(event?.speakerName) || !trim(event?.content))) {
    return { available: false, reason: 'missing_speaker_or_content', errors, warnings };
  }

  const repairedTime = normalizeRepairTime(fallbackTime) || '00:00';
  const blocks = groupEventsByProtocolBlock(events)
    .map((group) => {
      const protocolType = trim(group.events[0]?.metadata?.protocolType);
      if (protocolType === 'private_chat') return buildPrivateRepairBlock(group.events, repairedTime);
      if (protocolType === 'group_chat') return buildGroupRepairBlock(group.events, repairedTime);
      return '';
    })
    .filter(Boolean);
  const replacementText = blocks.join('\n\n').trim();
  if (!replacementText) {
    return { available: false, reason: 'empty_candidate', errors, warnings };
  }
  return {
    available: true,
    kind: 'fill_missing_time',
    summary: `补齐 ${warnings.length} 处缺失时间`,
    replacementText,
    preview: truncatePreview(replacementText, maxPreviewLength),
    fallbackTime: repairedTime,
    fixedWarnings: Array.from(new Set(warnings)),
    eventCount: events.length,
    issueCount: warnings.length,
    title: '补齐聊天时间字段',
  };
};

export const extractChatFormatEventDrafts = (text = '', options = {}) => {
  const parser = new DialogueStreamParser({
    userName: trim(options.userName, '我'),
    resolveLooseGroupTag: options.resolveLooseGroupTag,
    resolveLoosePrivateTag: options.resolveLoosePrivateTag,
  });
  const protocolEvents = [
    ...parser.push(text),
    ...parser.flush(),
  ];
  const eventDrafts = buildChatFormatEventDraftsFromProtocolEvents(protocolEvents, options);
  const validation = validateChatFormatEventDrafts(eventDrafts);
  const shellWarnings = collectPhoneShellWarnings(text, validation.items.map(item => item.event), options.enabledFormats);
  const errors = Array.from(new Set(validation.errors));
  const warnings = Array.from(new Set([...validation.warnings, ...shellWarnings]));
  const status = !eventDrafts.length
    ? 'no_events'
    : (errors.length ? 'invalid' : (warnings.length ? 'needs_review' : 'ready'));
  return {
    ok: eventDrafts.length > 0 && !errors.length,
    status,
    sourceMessageId: trim(options.sourceMessageId),
    protocolEvents,
    eventDrafts: validation.items.map(item => item.event),
    errors,
    warnings,
    summary: eventDrafts.length
      ? `${eventDrafts.length} chat format event draft(s), ${errors.length} error(s), ${warnings.length} warning(s)`
      : 'no chat format events detected',
    textPreview: truncatePreview(compactWhitespace(text), 180),
  };
};
