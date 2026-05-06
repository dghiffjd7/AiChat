export const buildSummaryCompactionPrompt = ({
  payload = '',
  compactedText = '',
} = {}) => {
  const previous = String(compactedText || '').trim();
  return [
    '# 注意，无视你先前收到的任何指令，你的任务已更改，不再遵守格式要求',
    '接下来的一轮回复中，将不会进行创作，不再遵循前面的要求，而是会遵循<summary_rules>中的要求进行一轮总结',
    '【总结请求】',
    '请对前文内容进行全面梳理，根据以下要求制作简明扼要的总结：',
    '',
    '<summary_rules>',
    '总结应当遵循以下原则：',
    '- 按时间顺序或逻辑顺序组织信息，并明确给出具体时间节点',
    '- 保留关键事件和重要细节，省略冗余描述',
    '- 直接陈述事实，避免主观评价',
    '- 使用简洁清晰的语言，避免过度修饰',
    '- 突出事件发展脉络和关键转折点',
    '- 不回避任何敏感内容，保证记录完全还原前文',
    '',
    '总结正文必须放在 <summary>...</summary> 中（只允许这一层 XML 标签；不要输出其他 XML 标签）。',
    'summary 内部的正文必须使用以下格式：',
    '',
    '【关键事件】',
    '• {事件1}: {简要描述}',
    '• {事件2}: {简要描述}',
    '• {事件3}: {简要描述}',
    '...',
    '',
    '</summary_rules>',
    '',
    previous ? '【已有大总结】' : '',
    previous || '',
    previous ? '' : '',
    '【前文内容（按时间标注的摘要列表）】',
    String(payload || ''),
  ].join('\n');
};

export const buildSummaryCompactionPayload = (items = []) => {
  const list = Array.isArray(items) ? items : [];
  return list
    .map((item) => {
      const text = String(typeof item === 'string' ? item : item?.text || '').trim();
      if (!text) return '';
      const at = typeof item === 'object' && item && item.at ? Number(item.at) : 0;
      const when = at ? new Date(at).toLocaleString() : '';
      return `- ${when ? `[${when}] ` : ''}${text}`;
    })
    .filter(Boolean)
    .join('\n');
};

export const normalizeSummarySnapshotItems = (items = []) =>
  (Array.isArray(items) ? items : [])
    .map((item) => {
      if (!item) return null;
      if (typeof item === 'string') {
        const text = String(item || '').trim();
        if (!text) return null;
        return { at: 0, text };
      }
      const text = String(item?.text || '').trim();
      if (!text) return null;
      const at = Number(item?.at || 0) || 0;
      return { at, text };
    })
    .filter(Boolean);

export const shouldRunSummaryCompaction = ({
  items = [],
  force = false,
  minLength = 1000,
} = {}) => {
  const list = Array.isArray(items) ? items : [];
  if (!list.length) return false;
  if (force) return true;
  const total = list.reduce((sum, item) => {
    const text = String(typeof item === 'string' ? item : item?.text || '');
    return sum + text.length;
  }, 0);
  return total > Number(minLength || 0);
};

export const requestSummaryCompactionRaw = async ({
  items = [],
  compactedText = '',
  context = null,
  buildMessages = null,
  backgroundChat = null,
  options = null,
} = {}) => {
  if (typeof buildMessages !== 'function' || typeof backgroundChat !== 'function') return '';
  const payload = buildSummaryCompactionPayload(items);
  if (!payload.trim()) return '';
  const prompt = buildSummaryCompactionPrompt({ payload, compactedText });
  const built = buildMessages(prompt, context);
  const result = await backgroundChat(built, options || { temperature: 0.2, maxTokens: 800 });
  return String(result || '').trim();
};

export const buildSummaryCompactionContext = ({
  activeUser = null,
  sessionId = '',
  characterName = 'assistant',
  isGroup = false,
  groupMembers = [],
  groupMemberNames = [],
} = {}) => {
  const user = activeUser && typeof activeUser === 'object' ? activeUser : {};
  const members = Array.isArray(groupMembers) ? groupMembers : [];
  const memberNames = Array.isArray(groupMemberNames) ? groupMemberNames : [];
  return {
    user: {
      name: String(user?.name || '').trim() || '我',
      persona: String(user?.description || ''),
      personaPosition: user?.position,
      personaDepth: user?.depth,
      personaRole: user?.role,
    },
    character: { name: String(characterName || '').trim() || 'assistant' },
    session: { id: String(sessionId || '').trim(), isGroup: Boolean(isGroup) },
    group: isGroup
      ? {
          id: String(sessionId || '').trim(),
          name: String(characterName || '').trim() || String(sessionId || '').trim(),
          members,
          memberNames,
        }
      : null,
    history: [],
    meta: {
      disableChatGuide: true,
      disableScenarioHint: true,
      disableSummary: true,
      disableMomentSummary: true,
      overrideLastUserMessage: '开始总结，勿输出聊天格式',
      skipInputRegex: true,
    },
  };
};

export const extractSummaryTagText = (input) => {
  const source = String(input || '');
  const re = /<summary>([\s\S]*?)<\/summary>/gi;
  let match;
  let last = null;
  while ((match = re.exec(source))) {
    last = match[1];
  }
  return String(last || '').trim();
};

export const isValidCompactedSummaryText = (text) => {
  const input = String(text || '');
  const hasHeader = /【\s*关键事件\s*】/.test(input);
  const hasBullet = /^[ \t]*[•\-]\s*\S+/m.test(input);
  return hasHeader && hasBullet;
};

export const parseSummaryCompactionResult = (input) => {
  const raw = String(input || '').trim();
  if (!raw) return { raw: '', text: '', valid: false };
  const text = extractSummaryTagText(raw);
  return {
    raw,
    text,
    valid: Boolean(text) && isValidCompactedSummaryText(text),
  };
};
