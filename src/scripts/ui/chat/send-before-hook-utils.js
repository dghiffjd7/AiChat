const applyBeforeSendRuntimeHook = async ({
  runtime = null,
  runtimeLabel = '',
  text = '',
  sessionId = '',
  userName = '',
  isGroupChat = false,
  hasAttachments = false,
  allowTextOverride = true,
  logger = null,
} = {}) => {
  if (!runtime || typeof runtime.dispatchEvent !== 'function') return text;

  try {
    const payload = {
      content: text,
      sessionId,
      userName,
      isGroup: isGroupChat,
      hasAttachments,
    };
    const updated = await runtime.dispatchEvent('message.before_send', payload);
    if (
      allowTextOverride &&
      updated &&
      typeof updated.content === 'string' &&
      updated.content !== text
    ) {
      return updated.content;
    }
  } catch (err) {
    logger?.warn?.(`${runtimeLabel} message.before_send failed`, err);
  }

  return text;
};

export const applyBeforeSendHooks = async ({
  text = '',
  sessionId = '',
  userName = '',
  isGroupChat = false,
  hasAttachments = false,
  allowTextOverride = true,
  scriptRuntime = null,
  pluginRuntime = null,
  skipScripts = false,
  logger = null,
} = {}) => {
  let nextText = text;

  if (!skipScripts) {
    nextText = await applyBeforeSendRuntimeHook({
      runtime: scriptRuntime,
      runtimeLabel: 'script',
      text: nextText,
      sessionId,
      userName,
      isGroupChat,
      hasAttachments,
      allowTextOverride,
      logger,
    });
  }

  nextText = await applyBeforeSendRuntimeHook({
    runtime: pluginRuntime,
    runtimeLabel: 'plugin',
    text: nextText,
    sessionId,
    userName,
    isGroupChat,
    hasAttachments,
    allowTextOverride,
    logger,
  });

  return nextText;
};
