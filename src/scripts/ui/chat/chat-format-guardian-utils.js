import { DialogueStreamParser } from './dialogue-stream-parser.js';
import {
  FORMAT_PATCH_MAX_CHANGED_LINES,
  FORMAT_PATCH_MAX_PATCHES,
  FORMAT_PATCH_PROTOCOL_VERSION,
  countFormatPatchSourceLines,
  normalizeFormatPatchModelResult,
} from './format-patch-transaction-utils.js';

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
    .map((line, index) => `${String(index + 1).padStart(width, ' ')} | ${line}`)
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
  variableUpdate: '变量更新格式',
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
  variableUpdate: [
    '<UpdateVariable>',
    '变量更新指令',
    '</UpdateVariable>',
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

const detectFunctionFormatIds = (text = '', parserResult = null) => {
  const raw = String(text ?? '');
  const reportText = [
    ...(Array.isArray(parserResult?.errors) ? parserResult.errors : []),
    ...(Array.isArray(parserResult?.warnings) ? parserResult.warnings : []),
    ...(Array.isArray(parserResult?.issues) ? parserResult.issues : []),
  ].map(item => (typeof item === 'string' ? item : JSON.stringify(item || {}))).join('\n');
  const combined = `${raw}\n${reportText}`;
  const ids = [];
  if (/<\s*\/?\s*image(?:_prompt)?\b/i.test(combined) || /\bimage_prompt\b/i.test(reportText)) {
    ids.push('imagePrompt');
  }
  if (/<\s*\/?\s*table(?:edit)?\b/i.test(combined) || /\btableEdit\b/i.test(reportText)) {
    ids.push('tableEdit');
  }
  if (
    /<\s*\/?\s*(?:update(?:variable)?|variableupdate)\b/i.test(combined) ||
    /\bUpdateVariable\b/i.test(reportText)
  ) {
    ids.push('variableUpdate');
  }
  return ids;
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
  const detectedFromParser = detectFormatTargetFromParserResult(parserResult);
  const normalizedSurface = trim(surface).toLowerCase();
  const normalizedUiMode = trim(uiMode).toLowerCase();
  const requestedIsFunctionTarget = [
    CHAT_FORMAT_GUARDIAN_TARGETS.imagePrompt,
    CHAT_FORMAT_GUARDIAN_TARGETS.memoryTableEdit,
  ].includes(requested);
  const resolvedTarget = requested !== CHAT_FORMAT_GUARDIAN_TARGETS.auto
    ? requested
    : (
      detectedFromParser ||
      (normalizedUiMode === 'rp' || normalizedSurface === 'creative'
        ? CHAT_FORMAT_GUARDIAN_TARGETS.creativeText
        : (normalizedSurface === MOMENTS_SURFACE
          ? CHAT_FORMAT_GUARDIAN_TARGETS.momentComment
          : (isGroupChat ? CHAT_FORMAT_GUARDIAN_TARGETS.groupChat : CHAT_FORMAT_GUARDIAN_TARGETS.privateChat)))
    );
  const wantedIds = selectFormatIdsForTarget(resolvedTarget);
  if (!requestedIsFunctionTarget) {
    detectFunctionFormatIds(assistantText, parserResult).forEach((id) => {
      if (!wantedIds.includes(id)) wantedIds.push(id);
    });
  }
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
    '对应的正确结构示例：',
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
      '对应的正确结构示例：',
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
      '对应的正确结构示例：',
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
      '对应的正确结构示例：',
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
      '对应的正确结构示例：',
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
      '对应的正确结构示例：',
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
  baseRevision = 'format-run:unbound',
  repairTarget = null,
} = {}) => {
  const rawAssistantText = String(assistantText ?? '');
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
  const hasFunctionFormat = formatEntries.some(entry => ['imagePrompt', 'tableEdit', 'variableUpdate'].includes(entry.id));
  const revisionToken = trim(baseRevision, 'format-run:unbound');
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
      : (customGuide
        ? '本地解析器没有发现聊天协议内容，但本次存在 Custom Format Guide：修复目标以该 Guide 为准——保留正文原样，按 Guide 补齐要求的结构（如状态块、结构标签），canRepair 应为 true；只有正文为空时才返回 canRepair=false。'
        : '本地解析器没有发现可提交的完整协议内容。若原始回复为空、完全没有有效聊天/动态内容，或修复必然需要编造正文，不要补写剧情；返回 status="cannot_repair"、linePatches=[]，并在 repairSummary 中建议用户重新生成。'))
    : '';
  const system = [
    '你是聊天回复格式修复 Agent。',
    `你必须遵守 ${FORMAT_PATCH_PROTOCOL_VERSION}：产物是最小行补丁，不是修复后的完整原文。`,
    '任务：独立检查一段 AI 完整原始回复，并只用最小行补丁修复格式。',
    '只修复格式，不评价剧情、修辞、角色一致性或用户意图。',
    '允许修复：补齐/移动/闭合协议标签，补齐 msg 外层，补齐缺失时间，移除末尾残缺半行，把“说话人: 正文”转换为“说话人--正文--HH:mm”。',
    '禁止修改：不得改写正文语义，不得新增剧情内容，不得扩写角色台词。',
    hasPrivateFormat ? '私聊标签遵循现有协议：<{{user}}和联系人名的私聊>...</{{user}}和联系人名的私聊>；{{user}} 经过宏替换后也可能表现为“我和联系人名的私聊”或“用户名和联系人名的私聊”。' : '',
    hasChatFormat ? '如果原始回复没有任何外层标签，但包含“说话人--正文”或“说话人--正文--HH:mm”聊天行，应视为可修复的标签缺漏，优先补齐标签而不是建议重新生成。' : '',
    customGuide ? '如果正文本身可读但不满足下方 Custom Format Guide 的要求（如缺少规定的状态块/结构标签），这同样属于可修复的格式缺失：保留正文并按 Custom Format Guide 补齐要求的结构，不要以“无协议内容”为由拒绝修复。' : '',
    '如果回复明显在末尾截断，不要补写新剧情；只保留已经完整成行的内容并补齐必要闭合标签，并在 issues 中使用 type="truncated_response" 标记。',
    '本地解析报告可能存在误判或漏判；必须以本次提供的完整格式规范和完整原始回复独立判断。',
    hasFunctionFormat ? '功能块（image_prompt、UpdateVariable、tableEdit）的载荷必须逐字保持不变；只允许修复其结构标签。载荷本身需要改写时返回 cannot_repair。' : '',
    '输出必须是一个完整 JSON 对象。禁止 Markdown 代码块，禁止解释，禁止省略号，禁止在 JSON 前后输出任何文字。',
    'JSON 字符串字段内部不要使用英文双引号；需要引用格式名时使用中文引号或直接写文字，避免破坏 JSON。',
    '禁止输出 correctedText、corrected_text 或任何完整修复全文字段。',
    'status=patch 时必须提供至少一个 linePatches；其他状态的 linePatches 必须为空。',
    `补丁数量不得超过 ${FORMAT_PATCH_MAX_PATCHES}，删除行数与新增行数合计不得超过 ${FORMAT_PATCH_MAX_CHANGED_LINES}。`,
    '每个补丁都必须提供 1-based startLine/endLine、与原文逐字一致的 originalLines、完整 replacementLines；多个补丁不得重叠。',
    hasChatFormat ? '聊天/动态修复不要在 MiPhone_end 之后追加额外段落或无关标签。' : '',
  ].filter(Boolean).join('\n');
  const targetSummary = repairTarget && typeof repairTarget === 'object'
    ? {
      sessionId: trim(repairTarget.sessionId || repairTarget.sourceSessionId),
      turnId: trim(repairTarget.turnId),
      sourceKind: trim(repairTarget.sourceKind),
      sourceMessageIds: normalizeStringList(repairTarget.sourceMessageIds),
    }
    : null;
  const user = [
    [
      '# Task',
      'Inspect and repair the assistant output format. Return only the patch-only JSON object defined below.',
    ].join('\n'),
    [
      '# Runtime Context',
      `userName: ${trim(userName, '我')}`,
      `sessionLabel: ${trim(sessionLabel, '') || 'N/A'}`,
      `surface: ${trim(surface, 'chat')}`,
      `formatTarget: ${normalizedTarget}`,
      `repairFallbackTime: ${repairFallbackTime}`,
      `protocolVersion: ${FORMAT_PATCH_PROTOCOL_VERSION}`,
      `baseRevision: ${revisionToken}`,
      `sourceLineCount: ${countFormatPatchSourceLines(rawAssistantText)}`,
    ].join('\n'),
    targetSummary ? `# Repair Target\n${JSON.stringify(targetSummary, null, 2)}` : '',
    formatSummary ? `# Required Format Examples\n${formatSummary}` : '',
    directRepairExample ? `# Correct Structure Example\n${directRepairExample}` : '',
    reminder ? `# Required Additional Format Rules\n${reminder}` : '',
    customGuide ? `# Custom Format Guide（从会话正则/世界书/角色卡提取的自定义格式规范，修复结果必须同时满足）\n${customGuide}` : '',
    compactReport ? `# Local Parser Report\n${JSON.stringify(compactReport, null, 2)}` : '',
    noEventsHint,
    [
      '# Current Invalid Model Output（待检测 AI 原始回复）',
      'The line numbers are for locating text only. Do not copy line numbers into replacementLines.',
      rawAssistantText.length ? numberedAssistantText : '（空）',
    ].join('\n'),
    [
      '# Output Contract',
      'Return exactly one JSON object. Do not wrap it in Markdown code fences. Do not use ellipsis or comments.',
      'Do not place unescaped double quotes inside JSON string values. Use Chinese quotes or plain text in message/repairSummary.',
      '{',
      `  "protocolVersion": "${FORMAT_PATCH_PROTOCOL_VERSION}",`,
      '  "status": "no_change | patch | needs_format_spec | cannot_repair",',
      `  "baseRevision": ${JSON.stringify(revisionToken)},`,
      '  "issues": [{"severity":"error | warning","type":"missing_tag | wrong_order | missing_field | unresolved_target | truncated_response | parse_error | other","message":"简短说明","evidence":"相关短片段"}],',
      '  "repairSummary": "一句话说明修复了什么；不可写长篇解释",',
      '  "linePatches": [{"startLine":1,"endLine":1,"originalLines":["原始行"],"replacementLines":["替换行"],"reason":"只说明格式修改"}]',
      '}',
      'Never return correctedText or a full corrected response.',
      'Use exact 1-based line ranges and exact originalLines. Never abbreviate replacementLines.',
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

export const normalizeChatFormatGuardianModelReview = (
  raw = '',
  {
    originalText = '',
    baseRevision = '',
  } = {},
) => normalizeFormatPatchModelResult(raw, {
  originalText,
  baseRevision,
});

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
