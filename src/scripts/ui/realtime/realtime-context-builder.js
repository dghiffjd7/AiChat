import { containsTextProtocol } from '../../utils/text-protocol-marker-utils.js';
import { getLocalizedPromptText } from '../../i18n/prompt-locale.js';

const DEFAULT_MAX_INSTRUCTION_CHARS = 60000;

const contentToText = content => {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return String(content?.text || '');
  return content.map(part => {
    if (typeof part === 'string') return part;
    if (!part || typeof part !== 'object') return '';
    return String(part.text || part.input_text || part.transcript || '');
  }).filter(Boolean).join('\n');
};

const normalizeComparableText = value => String(value || '').replace(/\s+/g, ' ').trim();

const takeWithin = (value, maxChars) => {
  const text = String(value || '').trim();
  if (!text || maxChars <= 0) return '';
  if (text.length <= maxChars) return text;
  if (maxChars <= 1) return text.slice(0, maxChars);
  return `${text.slice(0, maxChars - 1)}…`;
};

const roleLabel = role => {
  if (role === 'assistant') return getLocalizedPromptText('realtime.context.role.assistant', '角色');
  if (role === 'user') return getLocalizedPromptText('realtime.context.role.user', '用户');
  return getLocalizedPromptText('realtime.context.role.system', '系统');
};

export const buildRealtimeSemanticSnapshotFromRequest = (request = {}, {
  currentInputText = '',
  maxChars = DEFAULT_MAX_INSTRUCTION_CHARS,
} = {}) => {
  const safeMaxChars = Math.max(800, Math.trunc(Number(maxChars) || DEFAULT_MAX_INSTRUCTION_CHARS));
  const currentInputComparable = normalizeComparableText(currentInputText);
  let excludedProtocolMessages = 0;
  const records = (Array.isArray(request?.messages) ? request.messages : []).map((message, index) => ({
    index,
    role: String(message?.role || 'system').trim().toLowerCase(),
    text: contentToText(message?.content).trim(),
  })).filter(record => {
    if (!record.text) return false;
    if (containsTextProtocol(record.text)) {
      excludedProtocolMessages += 1;
      return false;
    }
    return true;
  });

  if (currentInputComparable) {
    for (let index = records.length - 1; index >= 0; index -= 1) {
      const record = records[index];
      if (record.role !== 'user') continue;
      if (normalizeComparableText(record.text) === currentInputComparable) records.splice(index, 1);
      break;
    }
  }

  const preamble = [
    getLocalizedPromptText('realtime.context.preamble', '你正在进行自然、连续的语音通话。以下内容是当前角色与情境的语义上下文。'),
    getLocalizedPromptText('realtime.context.rules', '保持角色身份、关系、世界设定、记忆和最近对话的一致性；自然口语回答，不输出 JSON、工具协议、标签或界面控制文本。'),
  ].join('\n');
  const rules = records.filter(record => record.role === 'system' || record.role === 'developer');
  const history = records.filter(record => record.role === 'user' || record.role === 'assistant');
  const sections = [preamble];
  let used = preamble.length;
  const appendSection = (title, lines, budget) => {
    if (!lines.length || budget <= title.length + 2) return;
    const selected = [];
    let sectionUsed = title.length + 1;
    for (const line of lines) {
      const remaining = budget - sectionUsed;
      if (remaining <= 1) break;
      const next = takeWithin(line, remaining - 1);
      if (!next) continue;
      selected.push(next);
      sectionUsed += next.length + 1;
    }
    if (selected.length) {
      const section = `${title}\n${selected.join('\n')}`;
      sections.push(section);
      used += section.length + 2;
    }
  };

  const remaining = Math.max(0, safeMaxChars - used - 4);
  const ruleBudget = Math.max(0, Math.floor(remaining * 0.68));
  appendSection(
    getLocalizedPromptText('realtime.context.character', '【角色与当前情境】'),
    rules.map(record => record.text),
    ruleBudget,
  );

  const historyBudget = Math.max(0, safeMaxChars - used - 2);
  const recentHistory = [];
  const historyTitle = getLocalizedPromptText('realtime.context.history', '【最近对话】');
  let historyUsed = historyTitle.length + 1;
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const record = history[index];
    const line = `${roleLabel(record.role)}：${record.text}`;
    if (historyUsed + line.length + 1 > historyBudget) {
      if (!recentHistory.length) recentHistory.unshift(takeWithin(line, historyBudget - historyUsed - 1));
      break;
    }
    recentHistory.unshift(line);
    historyUsed += line.length + 1;
  }
  appendSection(historyTitle, recentHistory.filter(Boolean), historyBudget);

  const instructions = takeWithin(sections.join('\n\n'), safeMaxChars);
  return {
    instructions,
    excludedProtocolMessages,
    sourceMessageCount: records.length,
    truncated: instructions.length >= safeMaxChars,
  };
};
