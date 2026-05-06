export const applyChatModeAssistantRegex = (
  text,
  {
    depth = 0,
    promptUserName = '',
    sanitizeAssistantReplyText = value => String(value ?? ''),
    extractReasoningFromContent = value => ({
      content: String(value ?? ''),
      reasoning: '',
      reasoningDisplay: '',
    }),
    applyStoredRegex = value => String(value ?? ''),
    applyDisplayRegex = value => String(value ?? ''),
  } = {},
) => {
  const cleaned = sanitizeAssistantReplyText(text, promptUserName);
  const reasoningParsed = extractReasoningFromContent(cleaned, { depth, strict: true });
  const finalSource = String(reasoningParsed.content || '');
  let stored = finalSource;
  let display = finalSource;
  try {
    stored = applyStoredRegex(finalSource, { depth });
    display = applyDisplayRegex(stored, { depth });
  } catch {}
  return { cleaned, reasoningParsed, finalSource, stored, display };
};

export const buildAssistantMessageFromText = async (
  rawText,
  {
    sessionId = '',
    time = '',
    name = '',
    avatar = '',
    showName = false,
    depth = 0,
    speakerContactId = '',
    promptUserName = '',
    isGroupChat = false,
    maybePromptTemplateGate = null,
    skipTemplate = false,
    shouldRunTemplate = null,
    getTemplateInjections = null,
    renderTemplateText = null,
    applyChatModeAssistantRegex = null,
    parseSpecialMessage = null,
    getSessionContact = null,
    getContactById = null,
    resolveGroupSpeakerAvatar = null,
    resolveContactAvatar = null,
    getAssistantAvatarForSession = null,
    logger = null,
    templateContext = null,
    templateInjectionContext = null,
  } = {},
) => {
  const sessionKey = String(sessionId || '').trim();
  let displayText = String(rawText ?? '');
  let templateVars = null;

  if (typeof maybePromptTemplateGate === 'function') {
    await maybePromptTemplateGate({ sampleText: displayText });
  }

  const templateMeta = skipTemplate ? { templateEnabled: false } : undefined;
  const templateAllowed =
    typeof shouldRunTemplate === 'function'
      ? shouldRunTemplate({
        sessionId: sessionKey,
        meta: templateMeta,
        templateContext,
      }) === true
      : false;

  if (templateAllowed) {
    try {
      const inject =
        typeof getTemplateInjections === 'function'
          ? getTemplateInjections({
            sessionId: sessionKey,
            content: displayText,
            templateInjectionContext,
          })
          : null;
      const before = Array.isArray(inject?.before) ? inject.before.filter(Boolean).join('\n\n') : '';
      const after = Array.isArray(inject?.after) ? inject.after.filter(Boolean).join('\n\n') : '';
      if (before) displayText = `${before}\n\n${displayText}`;
      if (after) displayText = `${displayText}\n\n${after}`;
    } catch (err) {
      logger?.warn?.('template render injection failed', err);
    }

    try {
      const res =
        typeof renderTemplateText === 'function'
          ? await renderTemplateText(displayText, {
            sessionId: sessionKey,
            meta: templateMeta,
            templateContext,
          })
          : null;
      if (res && !res.error) {
        displayText = res.text;
        if (res.messageVars && Object.keys(res.messageVars).length) {
          templateVars = res.messageVars;
        }
      }
    } catch (err) {
      logger?.warn?.('template render (message) failed', err);
    }
  }

  const regexResult =
    typeof applyChatModeAssistantRegex === 'function'
      ? applyChatModeAssistantRegex(displayText, { depth })
      : {
        reasoningParsed: { content: displayText, reasoning: '', reasoningDisplay: '' },
        finalSource: displayText,
        stored: displayText,
        display: displayText,
      };
  const { reasoningParsed, finalSource, stored, display } = regexResult;
  const parsed =
    typeof parseSpecialMessage === 'function'
      ? parseSpecialMessage(display)
      : { type: 'text', content: display, meta: {} };
  const meta = { ...(parsed.meta || {}) };

  const resolvedSpeakerContactId = String(speakerContactId || '').trim();
  const sessionContact = typeof getSessionContact === 'function' ? getSessionContact(sessionKey) : null;
  const isGroupSession = sessionKey.startsWith('group:') || Boolean(sessionContact?.isGroup) || Boolean(isGroupChat);
  const resolvedSpeakerName = String(name || '').trim();
  if (showName) meta.showName = true;
  if (resolvedSpeakerContactId) meta.speakerContactId = resolvedSpeakerContactId;
  if (templateVars) meta.templateVars = templateVars;
  if (reasoningParsed.reasoning) {
    meta.reasoning = reasoningParsed.reasoning;
    meta.reasoningDisplay = reasoningParsed.reasoningDisplay;
  }

  let resolvedAvatar = '';
  if (isGroupSession && resolvedSpeakerName && typeof resolveGroupSpeakerAvatar === 'function') {
    resolvedAvatar = resolveGroupSpeakerAvatar({
      speakerName: resolvedSpeakerName,
      sessionId: sessionKey,
      speakerContactId: resolvedSpeakerContactId,
    }) || '';
  }
  if (resolvedSpeakerContactId && typeof getContactById === 'function' && typeof resolveContactAvatar === 'function') {
    const speakerContact = getContactById(resolvedSpeakerContactId);
    if (speakerContact && speakerContact.isGroup !== true) {
      resolvedAvatar = resolveContactAvatar(resolvedSpeakerContactId, speakerContact) || resolvedAvatar;
    }
  }
  if (!resolvedAvatar && (!isGroupSession || !resolvedSpeakerName) && typeof avatar === 'string' && avatar.trim()) {
    resolvedAvatar = avatar.trim();
  }
  if (!resolvedAvatar && (!isGroupSession || !resolvedSpeakerName) && typeof getAssistantAvatarForSession === 'function') {
    resolvedAvatar = getAssistantAvatarForSession(sessionKey) || '';
  }

  const next = {
    role: 'assistant',
    ...parsed,
    name: name || '助手',
    avatar: resolvedAvatar,
    sessionId: sessionKey,
    time: time || '',
  };
  const rawValue = String(rawText ?? '');
  if (rawValue) next.rawOriginal = rawValue;
  if (finalSource && finalSource !== rawValue) next.rawSource = finalSource;
  if (stored) next.raw = stored;
  if (Object.keys(meta).length) next.meta = meta;
  return next;
};
