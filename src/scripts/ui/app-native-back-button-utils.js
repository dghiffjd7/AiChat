const getDefaultGlobalRef = () => {
  try {
    return typeof globalThis !== 'undefined' ? globalThis : window;
  } catch {
    return null;
  }
};

const warn = (logger, message, error) => {
  try {
    logger?.warn?.(message, error);
  } catch {}
};

export const createTauriPluginChannel = ({
  globalRef = getDefaultGlobalRef(),
  callback = null,
  logger = null,
} = {}) => {
  const transformCallback = globalRef?.__TAURI__?.core?.transformCallback
    || globalRef?.__TAURI_INTERNALS__?.transformCallback;
  if (typeof transformCallback !== 'function' || typeof callback !== 'function') return null;

  let channelId = null;
  let nextMessageIndex = 0;
  let messageEndIndex = null;
  const pendingMessages = [];
  const unregisterCallback = () => {
    try {
      globalRef?.__TAURI_INTERNALS__?.unregisterCallback?.(channelId);
    } catch {}
  };
  const maybeCleanup = () => {
    if (messageEndIndex !== null && nextMessageIndex === messageEndIndex) unregisterCallback();
  };
  const deliver = (message) => {
    try {
      callback(message);
    } catch (err) {
      warn(logger, 'android native back listener callback failed', err);
    }
  };

  channelId = transformCallback((rawMessage) => {
    const isIndexedMessage = rawMessage
      && typeof rawMessage === 'object'
      && Number.isFinite(Number(rawMessage.index));
    if (!isIndexedMessage) {
      deliver(rawMessage);
      return;
    }

    const index = Number(rawMessage.index);
    if ('end' in rawMessage) {
      messageEndIndex = index;
      maybeCleanup();
      return;
    }

    const message = rawMessage.message;
    if (index === nextMessageIndex) {
      deliver(message);
      nextMessageIndex += 1;
      while (Object.prototype.hasOwnProperty.call(pendingMessages, nextMessageIndex)) {
        const pending = pendingMessages[nextMessageIndex];
        delete pendingMessages[nextMessageIndex];
        deliver(pending);
        nextMessageIndex += 1;
      }
      maybeCleanup();
      return;
    }
    pendingMessages[index] = message;
  }, false);

  return {
    id: channelId,
    toJSON() {
      return `__CHANNEL__:${channelId}`;
    },
  };
};

const registerBackButtonWithInvoke = async ({
  handler,
  globalRef,
  safeInvokeFn,
  logger,
} = {}) => {
  if (typeof safeInvokeFn !== 'function') return null;
  const channel = createTauriPluginChannel({ globalRef, callback: handler, logger });
  if (!channel) return null;
  try {
    await safeInvokeFn('plugin:app|register_listener', {
      event: 'back-button',
      handler: channel,
    });
  } catch (err) {
    try {
      await safeInvokeFn('plugin:app|registerListener', {
        event: 'back-button',
        handler: channel,
      });
    } catch (fallbackErr) {
      warn(logger, 'install android native back listener failed', fallbackErr || err);
      return null;
    }
  }
  return () => safeInvokeFn('plugin:app|remove_listener', {
    event: 'back-button',
    channelId: channel.id,
  }).catch(() => safeInvokeFn('plugin:app|removeListener', {
    event: 'back-button',
    channelId: channel.id,
  }).catch(() => {}));
};

export const resolveTauriNativeBackButtonRegistrar = ({
  globalRef = getDefaultGlobalRef(),
  safeInvokeFn = null,
  isAndroid = false,
  logger = null,
} = {}) => {
  if (!isAndroid) return null;
  const onBackButtonPress = globalRef?.__TAURI__?.app?.onBackButtonPress;
  if (typeof onBackButtonPress === 'function') {
    return handler => onBackButtonPress(handler);
  }
  const addPluginListener = globalRef?.__TAURI__?.core?.addPluginListener;
  if (typeof addPluginListener === 'function') {
    return handler => addPluginListener('app', 'back-button', handler);
  }
  if (
    typeof safeInvokeFn === 'function'
    && typeof (globalRef?.__TAURI__?.core?.transformCallback || globalRef?.__TAURI_INTERNALS__?.transformCallback) === 'function'
  ) {
    return handler => registerBackButtonWithInvoke({ handler, globalRef, safeInvokeFn, logger });
  }
  return null;
};

export const requestTauriNativeExit = ({
  safeInvokeFn = null,
  logger = null,
} = {}) => {
  if (typeof safeInvokeFn !== 'function') return false;
  try {
    const result = safeInvokeFn('plugin:app|exit', {});
    if (result && typeof result.catch === 'function') {
      result.catch(err => warn(logger, 'android native back exit request failed', err));
    }
    return true;
  } catch (err) {
    warn(logger, 'android native back exit request failed', err);
    return false;
  }
};
