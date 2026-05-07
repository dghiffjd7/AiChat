const normalizeNameValue = (value) => String(value || '').trim();
const isPlainObject = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const normalizeTraceText = (value, fallback = '') => {
  const text = String(value ?? '').trim();
  return text || fallback;
};
const normalizeTraceDetails = (details) => {
  if (!isPlainObject(details)) return {};
  return Object.fromEntries(
    Object.entries(details).filter(([, value]) => value !== undefined),
  );
};

export const buildMomentLifecycleTraceEvent = ({
  phase = '',
  sessionId = '',
  momentId = '',
  status = 'info',
  summary = '',
  details = {},
} = {}) => ({
  category: 'moments',
  source: 'moments-runtime',
  phase: normalizeTraceText(phase, 'event'),
  sessionId: normalizeTraceText(sessionId, ''),
  momentId: normalizeTraceText(momentId, ''),
  status: normalizeTraceText(status, 'info'),
  summary: normalizeTraceText(summary, ''),
  details: normalizeTraceDetails(details),
});

const emitMomentLifecycleTrace = (recordTraceEvent, event) => {
  if (typeof recordTraceEvent !== 'function') return;
  try {
    recordTraceEvent(buildMomentLifecycleTraceEvent(event));
  } catch {}
};

export const resolvePrivateChatTargetSessionIdByName = (
  otherName,
  {
    contactsStore = null,
    normalizeName = normalizeNameValue,
    fallbackSessionId = null,
  } = {},
) => {
  const normalize = typeof normalizeName === 'function' ? normalizeName : normalizeNameValue;
  const other = normalize(otherName);
  if (!other) return fallbackSessionId;

  const byId = contactsStore?.getContact?.(other);
  if (byId?.id) return byId.id;

  try {
    const matches = (contactsStore?.listContacts?.() || []).filter(
      (contact) => normalize(contact?.name || contact?.id) === other,
    );
    if (matches.length === 1) return matches[0].id;
  } catch {}

  return fallbackSessionId;
};

export const resolveMomentReplyTarget = ({
  isReplyToComment = false,
  replyTo = null,
  authorName = '',
  originSessionId = '',
  resolvePrivateChatTargetSessionId = null,
  normalizeName = normalizeNameValue,
} = {}) => {
  const normalize = typeof normalizeName === 'function' ? normalizeName : normalizeNameValue;
  const resolveTarget = typeof resolvePrivateChatTargetSessionId === 'function'
    ? resolvePrivateChatTargetSessionId
    : (() => null);
  if (isReplyToComment) {
    const name = normalize(replyTo?.author);
    const sessionId = resolveTarget(name) || (name === normalize(authorName) ? String(originSessionId || '').trim() : null);
    return { name: name || String(authorName || '').trim() || '发布者', sessionId: String(sessionId || '').trim() };
  }
  const fallbackSessionId = String(originSessionId || '').trim() || resolveTarget(authorName) || '';
  return {
    name: normalize(authorName) || '发布者',
    sessionId: String(fallbackSessionId || '').trim(),
  };
};

export const buildMomentRecentCommentsText = (
  comments,
  {
    limit = 12,
    normalizeText = value => String(value ?? ''),
  } = {},
) => {
  const list = Array.isArray(comments) ? comments : [];
  const tail = list.slice(-Math.max(0, Math.trunc(Number(limit) || 0)));
  return tail
    .map((comment) => {
      const author = String(comment?.author || '').trim();
      const normalized = normalizeText(comment?.content || '');
      const content = String(normalized || '').replace(/\n/g, '<br>');
      const replyToAuthor = String(comment?.replyToAuthor || '').trim();
      const parts = [
        author ? `author::${author}` : '',
        replyToAuthor ? `reply_to_author::${replyToAuthor}` : '',
        content ? `content::${content}` : '',
      ].filter(Boolean);
      return parts.length ? `- ${parts.join(' | ')}` : '';
    })
    .filter(Boolean)
    .join('\n');
};

export const buildMomentCommentPromptData = ({
  authorName = '',
  content = '',
  time = '',
  userLine = '',
  isReplyToComment = false,
  replyTo = null,
  recentComments = '',
  contactList = '',
} = {}) => `
【QQ空间动态评论回复（数据）】
发布者: ${String(authorName || '').trim() || '发布者'}
动态内容: ${String(content || '').trim()}
动态时间: ${String(time || '').trim() || '（未知）'}

【用户评论】
${String(userLine || '').trim()}

${
  isReplyToComment
    ? `【回复上下文】
reply_to_author: ${String(replyTo?.author || '').trim()}
reply_to_content: ${String(replyTo?.content || '').trim()}
`
    : ''
}

${
  recentComments
    ? `【当前评论列表（最近12条）】
${String(recentComments || '').trim()}
`
    : ''
}

【可用联系人名单】
${String(contactList || '').trim() || '-（无）'}
`.trim();

export const buildMomentCommentContactList = (
  contacts,
  {
    authorName = '',
    maxItems = 16,
  } = {},
) => {
  const names = [];
  [String(authorName || '').trim(), ...(Array.isArray(contacts) ? contacts : [])].forEach((value) => {
    const name = String(value || '').trim();
    if (!name) return;
    if (names.includes(name)) return;
    names.push(name);
  });
  return names
    .slice(0, Math.max(0, Math.trunc(Number(maxItems) || 0)))
    .map((name) => `- ${name}`)
    .join('\n');
};

export const collectMomentCommentContactList = (
  contactsStore,
  {
    authorName = '',
    maxItems = 16,
  } = {},
) => {
  const contacts = (contactsStore?.listContacts?.() || [])
    .filter((contact) => contact && !contact.isGroup)
    .map((contact) => String(contact.name || contact.id || '').trim())
    .filter(Boolean)
    .filter((name) => name !== '我' && name !== '用户' && name.toLowerCase() !== 'user');
  return buildMomentCommentContactList(contacts, { authorName, maxItems });
};

export const buildMomentCommentTaskContext = ({
  userProfile = null,
  target = null,
  authorName = '',
  originSessionId = '',
  promptData = '',
  isReplyToComment = false,
  replyTo = null,
} = {}) => {
  const profile = userProfile && typeof userProfile === 'object' ? userProfile : {};
  const resolvedTarget = target && typeof target === 'object' ? target : {};
  const context = {
    user: {
      name: String(profile?.name || '').trim() || '我',
      persona: String(profile?.description || ''),
      personaPosition: profile?.position,
      personaDepth: profile?.depth,
      personaRole: profile?.role,
    },
    character: { name: String(resolvedTarget?.name || '').trim() || String(authorName || '').trim() || '发布者' },
    history: [],
    task: {
      type: 'moment_comment',
      targetSessionId: String(resolvedTarget?.sessionId || '').trim(),
      targetName: String(resolvedTarget?.name || '').trim(),
      promptData: String(promptData || ''),
    },
    session: { id: String(originSessionId || '').trim(), isGroup: false },
  };
  if (isReplyToComment) {
    context.task.isReplyToComment = true;
    context.task.replyToCommentId = String(replyTo?.id || '').trim();
    context.task.replyToAuthor = String(replyTo?.author || '').trim();
  }
  return context;
};

export const extractMomentSummaryText = (text) => {
  const raw = String(text ?? '');
  const re = /<details>\s*<summary>\s*摘要\s*<\/summary>\s*([\s\S]*?)<\/details>/gi;
  let match;
  let last = null;
  while ((match = re.exec(raw))) last = match[1];
  if (!last) return '';
  const plain = String(last || '').replace(/<[^>]+>/g, ' ');
  return plain
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[A-Za-z]+/g, '')
    .trim();
};

export const sanitizeThinkingForMomentReply = (text) => {
  const raw = String(text ?? '');
  const lower = raw.toLowerCase();
  const closeThinking = '</thinking>';
  const closeThink = '</think>';
  const i1 = lower.lastIndexOf(closeThinking);
  const i2 = lower.lastIndexOf(closeThink);
  const idx = Math.max(i1, i2);
  if (idx === -1) return raw;
  const cut = idx + (idx === i1 ? closeThinking.length : closeThink.length);
  return raw.slice(cut);
};

export const extractMomentReplySegments = (text) => {
  const raw = String(text ?? '');
  const lower = raw.toLowerCase();
  const startMark = 'moment_reply_start';
  const endMark = 'moment_reply_end';
  const chunks = [];
  let idx = 0;
  while (true) {
    const startIdx = lower.indexOf(startMark, idx);
    if (startIdx === -1) break;
    const endIdx = lower.indexOf(endMark, startIdx + startMark.length);
    if (endIdx === -1) break;
    chunks.push(raw.slice(startIdx, endIdx + endMark.length));
    idx = endIdx + endMark.length;
  }
  return chunks.join('\n');
};

export const patchMomentReplyComments = (
  comments,
  {
    isReplyToComment = false,
    replyTo = null,
    targetName = '',
    normalizeName = normalizeNameValue,
  } = {},
) => {
  const incoming = Array.isArray(comments) ? comments : [];
  if (!isReplyToComment || !replyTo?.id) return incoming;
  const normalize = typeof normalizeName === 'function' ? normalizeName : normalizeNameValue;
  return incoming.map((comment) => {
    if (!comment || typeof comment !== 'object') return comment;
    const author = String(comment.author || '').trim();
    const hasReplyTo = String(comment.replyTo || '').trim().length > 0;
    const isPrimaryReplier =
      author && (author === normalize(replyTo?.author) || author === normalize(targetName));
    if (hasReplyTo || !isPrimaryReplier) return comment;
    return {
      ...comment,
      replyTo: String(replyTo.id || ''),
      replyToAuthor: String(replyTo.author || ''),
    };
  });
};

export const resolveMomentReplyEventTarget = ({
  eventMomentId = '',
  currentMomentId = '',
  momentsStore = null,
  logger = null,
  incomingCount = 0,
} = {}) => {
  const requestedId = String(eventMomentId || '').trim();
  let momentId = requestedId || String(currentMomentId || '').trim();
  let targetMoment = momentsStore?.get?.(momentId);
  if (!targetMoment && currentMomentId && currentMomentId !== momentId) {
    const fallbackMoment = momentsStore?.get?.(currentMomentId);
    if (fallbackMoment) {
      try {
        logger?.warn?.(
          'moment_reply target not found; fallback to current',
          JSON.stringify({
            momentId,
            fallbackId: currentMomentId,
            commentCount: incomingCount,
          }),
        );
      } catch {}
      momentId = String(currentMomentId || '').trim();
      targetMoment = fallbackMoment;
    }
  }
  if (!targetMoment) {
    try {
      const list = (momentsStore?.list?.() || []).map((item) => String(item?.id || '')).filter(Boolean);
      logger?.warn?.(
        'moment_reply target not found',
        JSON.stringify({
          momentId,
          requestedId,
          commentCount: incomingCount,
          knownCount: list.length,
          knownSample: list.slice(0, 6),
        }),
      );
    } catch {}
  }
  return {
    requestedId,
    momentId,
    targetMoment,
  };
};

export const buildMomentPrivateChatMessages = (
  messages,
  {
    getActiveUserName = () => '我',
    normalizeName = normalizeNameValue,
    normalizeLooseName = normalizeNameValue,
    parseSpecialMessage = (content) => ({ type: 'text', content, meta: {} }),
    userAvatar = '',
    assistantAvatar = '',
    getTargetContact = () => null,
    formatNowTime = () => '',
  } = {},
) => {
  const list = Array.isArray(messages) ? messages : [];
  return list
    .map((message) => {
      const payload = message && typeof message === 'object' ? message : { content: message };
      const speakerRaw = String(payload?.speaker || '').trim();
      const content = String(payload?.content || '').trim();
      if (!content) return null;
      const userDisplayName = String(getActiveUserName?.() || '').trim();
      const speakerKey = normalizeName(speakerRaw).replace(/[：:]/g, '').trim();
      const userKey = normalizeName(userDisplayName).replace(/[：:]/g, '').trim();
      const isMe = Boolean(
        speakerKey &&
          userKey &&
          (speakerKey === userKey || normalizeLooseName(speakerKey) === normalizeLooseName(userKey)),
      );
      const time =
        String(payload?.time || '').trim() ||
        String(formatNowTime?.() || '').trim();
      if (isMe) {
        const parsed = parseSpecialMessage(content);
        return {
          role: 'user',
          message: {
            role: 'user',
            type: 'text',
            ...parsed,
            name: userDisplayName,
            avatar: userAvatar,
            time,
            meta: { ...(parsed.meta || {}), generatedByAssistant: true },
          },
        };
      }
      return {
        role: 'assistant',
        message: {
          role: 'assistant',
          type: 'text',
          ...parseSpecialMessage(content),
          name: '助手',
          avatar: assistantAvatar || getTargetContact?.()?.avatar || '',
          time,
        },
      };
    })
    .filter(Boolean);
};

export const applyMomentCommentEvents = (
  events,
  {
    currentMomentId = '',
    originSessionId = '',
    engagementCount = 0,
    momentsStore = null,
    logger = null,
    normalizeInitialMomentStats = value => value,
    normalizeMomentRecord = value => value,
    normalizeMomentComments = value => value,
    addMoments = () => {},
    addMomentComments = () => null,
    isReplyToComment = false,
    replyTo = null,
    targetName = '',
    normalizeName = normalizeNameValue,
    bumpMomentEngagement = () => {},
    resolvePrivateChatTargetSessionId = () => '',
    buildPrivateChatMessages = () => [],
    appendPrivateChatMessage = () => null,
    autoMarkReadIfActive = () => {},
    onTouchedChats = () => {},
    onTouchedMoments = () => {},
  } = {},
) => {
  let touchedMoments = false;
  let touchedChats = false;
  (Array.isArray(events) ? events : []).forEach((event) => {
    if (!event || typeof event !== 'object') return;
    if (event.type === 'moments') {
      const list = (event.moments || []).map((moment) => {
        const stats = normalizeInitialMomentStats({ views: moment?.views, likes: moment?.likes }, engagementCount);
        return normalizeMomentRecord(
          { ...(moment || {}), ...stats, originSessionId },
          { regexMode: 'output', depth: 0 },
        );
      });
      addMoments(list);
      touchedMoments = true;
      return;
    }
    if (event.type === 'moment_reply') {
      const incoming = Array.isArray(event.comments) ? event.comments : [];
      const { momentId, targetMoment } = resolveMomentReplyEventTarget({
        eventMomentId: event.momentId,
        currentMomentId,
        momentsStore,
        logger,
        incomingCount: incoming.length,
      });
      if (!targetMoment) return;
      const patched = patchMomentReplyComments(incoming, {
        isReplyToComment,
        replyTo,
        targetName,
        normalizeName,
      });
      const saved = addMomentComments(
        momentId,
        normalizeMomentComments(patched, { regexMode: 'output', depth: 0 }),
      );
      if (!saved) {
        try {
          logger?.warn?.(
            'moment_reply addComments failed',
            JSON.stringify({
              momentId,
              commentCount: patched.length,
            }),
          );
        } catch {}
        return;
      }
      try {
        bumpMomentEngagement(momentId, engagementCount);
      } catch {}
      touchedMoments = true;
      return;
    }
    if (event.type === 'private_chat') {
      const targetSessionId = resolvePrivateChatTargetSessionId(event.otherName);
      if (!targetSessionId) return;
      const messages = buildPrivateChatMessages(event.messages, targetSessionId);
      messages.forEach(({ role, message }) => {
        const saved = appendPrivateChatMessage(message, targetSessionId);
        if (role === 'assistant') {
          autoMarkReadIfActive(targetSessionId, saved?.id || message?.id || '');
        }
        touchedChats = true;
      });
    }
  });
  if (touchedChats) {
    try {
      onTouchedChats();
    } catch {}
  }
  if (touchedMoments) {
    try {
      onTouchedMoments();
    } catch {}
  }
  return { touchedMoments, touchedChats };
};

export const applyMomentSummaryFromRaw = async (
  raw,
  {
    addSummary = () => {},
    runCompaction = () => {},
    notifyUpdated = () => {},
  } = {},
) => {
  const summary = extractMomentSummaryText(raw);
  if (!summary) return '';
  try {
    await addSummary(summary);
  } catch {}
  try {
    await runCompaction();
  } catch {}
  try {
    await notifyUpdated();
  } catch {}
  return summary;
};

export const runMomentReplyRetry = async (
  fullRaw,
  {
    parseText = async () => false,
    logger = null,
  } = {},
) => {
  const source = String(fullRaw || '');
  if (!source) return false;
  const retryText = sanitizeThinkingForMomentReply(source);
  if (retryText && retryText !== source) {
    try {
      logger?.debug?.(
        'moment_reply retry: stripped thinking',
        JSON.stringify({
          originalLen: source.length,
          retryLen: retryText.length,
        }),
      );
    } catch {}
    if (await parseText(retryText)) return true;
  }
  const extracted = extractMomentReplySegments(retryText || source);
  try {
    logger?.debug?.(
      'moment_reply retry: extracted segments',
      JSON.stringify({
        extractedLen: String(extracted || '').length,
        hasStart: String(retryText || source || '').toLowerCase().includes('moment_reply_start'),
        hasEnd: String(retryText || source || '').toLowerCase().includes('moment_reply_end'),
      }),
    );
  } catch {}
  if (!extracted) return false;
  return (await parseText(extracted)) === true;
};

export const runMomentCommentGeneration = async (
  userComment,
  context,
  {
    stream = false,
    generate = async () => '',
    createParser = () => ({ push: () => [] }),
    normalizeChunk = (chunk) => chunk,
    applyEvents = () => ({ touchedMoments: false }),
    saveRaw = async () => {},
    retryUnhandledReply = null,
    logger = null,
  } = {},
) => {
  const parser = createParser();
  let sawMomentReply = false;
  let fullRaw = '';

  if (stream) {
    const streamResult = await generate(userComment, context);
    for await (const chunk of streamResult) {
      const normalizedChunk = normalizeChunk(chunk);
      if (!normalizedChunk?.content) continue;
      fullRaw += normalizedChunk.content;
      const events = parser.push(normalizedChunk.content);
      const result = applyEvents(events);
      if (result?.touchedMoments) sawMomentReply = true;
    }
  } else {
    const raw = await generate(userComment, context);
    fullRaw = String(raw ?? '');
    const events = parser.push(fullRaw);
    const result = applyEvents(events);
    if (result?.touchedMoments) sawMomentReply = true;
  }

  if (fullRaw) {
    try {
      await saveRaw(fullRaw);
    } catch {}
  }

  if (!sawMomentReply && fullRaw) {
    const retry = typeof retryUnhandledReply === 'function'
      ? retryUnhandledReply
      : (raw, parseText) => runMomentReplyRetry(raw, { parseText, logger });
    try {
      const parseMomentReplyFrom = async (text) => {
        if (!text) return false;
        const retryParser = createParser();
        const retryEvents = retryParser.push(text);
        const result = applyEvents(retryEvents);
        if (result?.touchedMoments) sawMomentReply = true;
        return Boolean(result?.touchedMoments);
      };
      const handled = await retry(fullRaw, parseMomentReplyFrom);
      if (handled) sawMomentReply = true;
    } catch {}
  }

  return { fullRaw, sawMomentReply };
};

export const createMomentSummaryCompactionRuntime = ({
  scopeKey = 'global',
  momentSummaryStore = null,
  getIsConfigured = () => true,
  buildMessages = null,
  backgroundChat = null,
  getActiveUserProfile = () => null,
  buildContext = () => null,
  requestCompactionRaw = async () => '',
  parseCompactionResult = () => ({ text: '', valid: false }),
  normalizeItems = (items) => (Array.isArray(items) ? items : []),
  shouldCompact = () => false,
  dispatchUpdated = () => {},
  logger = null,
  recordTraceEvent = null,
  setTimeoutFn = (fn, ms) => setTimeout(fn, ms),
  delayMs = 450,
} = {}) => {
  const compacting = new Set();
  return ({ force = false } = {}) => {
    if (compacting.has(scopeKey)) {
      emitMomentLifecycleTrace(recordTraceEvent, {
        phase: 'summary.compaction.skipped',
        status: 'skipped',
        summary: 'moment summary compaction skipped',
        details: { reason: 'already-compacting', scopeKey, force },
      });
      return Promise.resolve(false);
    }
    if (!momentSummaryStore?.getSummaries || !momentSummaryStore?.setCompactedSummary) {
      emitMomentLifecycleTrace(recordTraceEvent, {
        phase: 'summary.compaction.skipped',
        status: 'skipped',
        summary: 'moment summary compaction skipped',
        details: { reason: 'missing-store', scopeKey, force },
      });
      return Promise.resolve(false);
    }
    if (typeof buildMessages !== 'function' || typeof backgroundChat !== 'function') {
      emitMomentLifecycleTrace(recordTraceEvent, {
        phase: 'summary.compaction.skipped',
        status: 'skipped',
        summary: 'moment summary compaction skipped',
        details: { reason: 'missing-generation-runtime', scopeKey, force },
      });
      return Promise.resolve(false);
    }
    if (!getIsConfigured()) {
      emitMomentLifecycleTrace(recordTraceEvent, {
        phase: 'summary.compaction.skipped',
        status: 'skipped',
        summary: 'moment summary compaction skipped',
        details: { reason: 'not-configured', scopeKey, force },
      });
      return Promise.resolve(false);
    }

    const list = momentSummaryStore.getSummaries() || [];
    if (!shouldCompact({ items: list, force })) {
      emitMomentLifecycleTrace(recordTraceEvent, {
        phase: 'summary.compaction.skipped',
        status: 'skipped',
        summary: 'moment summary compaction skipped',
        details: {
          reason: 'threshold-not-met',
          scopeKey,
          force,
          itemCount: Array.isArray(list) ? list.length : 0,
        },
      });
      return Promise.resolve(false);
    }

    compacting.add(scopeKey);
    emitMomentLifecycleTrace(recordTraceEvent, {
      phase: 'summary.compaction.start',
      status: 'started',
      summary: 'moment summary compaction started',
      details: {
        scopeKey,
        force,
        itemCount: Array.isArray(list) ? list.length : 0,
      },
    });
    return new Promise((resolve) => {
      setTimeoutFn(async () => {
        try {
          const current = momentSummaryStore.getSummaries() || [];
          const arr = Array.isArray(current) ? current : [];
          const compactedPrev = momentSummaryStore.getCompactedSummary?.();
          const compactedText = String(compactedPrev?.text || '').trim();
          const context = buildContext({
            activeUser: getActiveUserProfile(),
            sessionId: 'moment_summary_global',
            characterName: '动态',
            isGroup: false,
          });
          const raw = await requestCompactionRaw({
            items: arr,
            compactedText,
            context,
            buildMessages,
            backgroundChat,
          });
          if (!raw) {
            emitMomentLifecycleTrace(recordTraceEvent, {
              phase: 'summary.compaction.finish',
              status: 'skipped',
              summary: 'moment summary compaction skipped',
              details: { reason: 'empty-raw', scopeKey, force, itemCount: arr.length },
            });
            return resolve(false);
          }
          try {
            momentSummaryStore.setCompactedSummaryRaw?.(raw);
          } catch {}

          const { text, valid } = parseCompactionResult(raw);
          if (!text || !valid) {
            emitMomentLifecycleTrace(recordTraceEvent, {
              phase: 'summary.compaction.finish',
              status: 'skipped',
              summary: 'moment summary compaction skipped',
              details: {
                reason: 'invalid-result',
                scopeKey,
                force,
                itemCount: arr.length,
                rawLength: String(raw || '').length,
              },
            });
            return resolve(false);
          }

          try {
            momentSummaryStore.setCompactedSummary(text, { raw });
          } catch {}
          try {
            const keep = normalizeItems(momentSummaryStore.getSummaries?.()).slice(-2);
            momentSummaryStore.setSummaries?.(keep);
          } catch {}
          try {
            dispatchUpdated();
          } catch {}
          emitMomentLifecycleTrace(recordTraceEvent, {
            phase: 'summary.compaction.finish',
            status: 'success',
            summary: 'moment summary compaction finished',
            details: {
              scopeKey,
              force,
              itemCount: arr.length,
              keptCount: normalizeItems(momentSummaryStore.getSummaries?.()).length,
              rawLength: String(raw || '').length,
              summaryLength: String(text || '').length,
            },
          });
          resolve(true);
        } catch (error) {
          try {
            logger?.debug?.('moment summary compaction failed', error);
          } catch {}
          emitMomentLifecycleTrace(recordTraceEvent, {
            phase: 'summary.compaction.finish',
            status: 'error',
            summary: error?.message || 'moment summary compaction failed',
            details: { scopeKey, force },
          });
          resolve(false);
        } finally {
          compacting.delete(scopeKey);
        }
      }, Number(delayMs || 0));
    });
  };
};
