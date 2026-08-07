import { extractJsonObjectText } from './chat-format-guardian-utils.js';

// 正文优化引擎（机制层，类 Claude Code：指示 -> 模型产出替换文本 -> diff 确认 -> 写回）。
// 只负责“按用户指示优化表达”；写作引导、大纲规划、质量审查等提示词体系另行规划。

const isPlainObject = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));

const trim = (value, fallback = '') => {
  const text = String(value ?? '').trim();
  return text || fallback;
};

const truncatePreview = (value = '', maxLength = 240) => {
  const text = trim(value);
  const limit = Math.max(20, Math.trunc(Number(maxLength) || 240));
  return text.length > limit ? `${text.slice(0, limit - 1)}...` : text;
};

export const DEFAULT_CHAT_BODY_OPTIMIZE_INSTRUCTION = '优化表达：让文字更流畅自然，删除重复语句，保持原有语气。';

export const buildChatBodyOptimizeModelPrompt = ({
  originalText = '',
  instruction = '',
  userName = '我',
  sessionLabel = '',
  surface = 'chat',
} = {}) => {
  const rawText = String(originalText ?? '').trim();
  const finalInstruction = trim(instruction, DEFAULT_CHAT_BODY_OPTIMIZE_INSTRUCTION);
  const system = [
    '你是正文优化 Agent。任务：按用户指示优化一段 AI 回复的文字表达。',
    '',
    '## 允许',
    '按指示精简重复、调整语序、改善流畅度、增强或收敛描写风格。',
    '',
    '## 禁止',
    '不得改变剧情事实、角色行为、说话人、时间线；不得改变任何数值、状态、日期。',
    '不得新增剧情内容或台词；不得删除承载剧情信息的段落（除非指示明确要求删减且内容重复）。',
    '原文中的协议/功能标签（如 <image_prompt>、<tableEdit>、状态块、HTML 结构标签）必须原样保留，只优化标签外或标签内的自然语言正文。',
    '',
    '## 输出',
    '输出必须是一个完整 JSON 对象。禁止 Markdown 代码块，禁止解释，禁止在 JSON 前后输出任何文字。',
    'JSON 字符串字段内部不要使用未转义的英文双引号；需要引用时使用中文引号。',
    'canOptimize=true 时，optimizedText 必须是完整的、可直接替换原文的优化后文本。',
    'canOptimize=false 时（原文为空、指示与正文无关、按指示无需修改），optimizedText 必须是空字符串，并在 summary 说明原因。',
  ].join('\n');
  const user = [
    [
      '# Task',
      'Optimize the assistant text per the instruction. Return only the JSON object defined below.',
    ].join('\n'),
    [
      '# Runtime Context',
      `userName: ${trim(userName, '我')}`,
      `sessionLabel: ${trim(sessionLabel) || 'N/A'}`,
      `surface: ${trim(surface, 'chat')}`,
    ].join('\n'),
    `# Instruction（用户优化指示）\n${finalInstruction}`,
    `# Original Text（待优化正文）\n${rawText || '（空）'}`,
    [
      '# Output Contract',
      'Return exactly one JSON object. Do not wrap it in Markdown code fences.',
      '{',
      '  "status": "ok | optimized | invalid",',
      '  "canOptimize": true | false,',
      '  "summary": "一句话说明改了什么或为何不改",',
      '  "optimizedText": "完整优化后文本；canOptimize=true 时必须非空"',
      '}',
    ].join('\n'),
  ].join('\n\n');
  return {
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    responseFormat: 'json_object',
    instruction: finalInstruction,
  };
};

export const normalizeChatBodyOptimizeModelResult = (raw = '', { originalText = '' } = {}) => {
  const sourceText = typeof raw === 'string' ? raw : JSON.stringify(raw || {});
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
    return {
      ok: false,
      status: 'invalid',
      canOptimize: false,
      summary: '',
      optimizedText: '',
      issues: [{
        severity: 'error',
        type: 'parse_error',
        message: '模型未返回可解析的 JSON',
        evidence: truncatePreview(sourceText, 160),
      }],
      rawPreview: truncatePreview(sourceText, 240),
    };
  }
  const optimizedText = String(parsed.optimizedText ?? '').trim();
  const canOptimize = parsed.canOptimize === true && Boolean(optimizedText);
  const unchanged = canOptimize && optimizedText === String(originalText ?? '').trim();
  return {
    ok: true,
    status: trim(parsed.status, canOptimize ? 'optimized' : 'ok'),
    canOptimize: canOptimize && !unchanged,
    summary: truncatePreview(parsed.summary, 200),
    optimizedText: canOptimize ? optimizedText : '',
    unchanged,
    issues: [],
    rawPreview: truncatePreview(sourceText, 240),
  };
};

export const resolveChatBodyOptimizeWritebackTarget = ({
  snapshotText = '',
  currentMessage = null,
  resolveInputText = null,
} = {}) => {
  if (!currentMessage || currentMessage.role !== 'assistant') {
    return {
      ok: false,
      reason: 'message_not_found',
      currentText: '',
      message: null,
    };
  }
  let resolved = null;
  try {
    resolved = typeof resolveInputText === 'function'
      ? resolveInputText(currentMessage)
      : null;
  } catch {}
  const currentText = String(
    resolved?.text
      ?? currentMessage.rawOriginal
      ?? currentMessage.rawSource
      ?? currentMessage.raw
      ?? currentMessage.content
      ?? '',
  ).trim();
  if (String(snapshotText ?? '').trim() !== currentText) {
    return {
      ok: false,
      reason: 'revision_expired',
      currentText,
      message: currentMessage,
    };
  }
  return {
    ok: true,
    reason: '',
    currentText,
    message: currentMessage,
  };
};
