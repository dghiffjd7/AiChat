const STORAGE_PREFIX = 'chatapp_protocol_delivery_plans_v1';
const MAX_STORED_PLANS = 20;

const normalizeString = value => String(value || '').trim();

const clonePlainObject = value => {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value && typeof value === 'object' ? { ...value } : value;
  }
};

const getStorage = storage => (
  storage && typeof storage.getItem === 'function' && typeof storage.setItem === 'function'
    ? storage
    : null
);

const sanitizeMessageForPlanStorage = message => {
  if (!message || typeof message !== 'object') return message;
  const next = { ...message };
  delete next.avatar;
  return next;
};

const sanitizePlanForStorage = plan => ({
  ...plan,
  items: (Array.isArray(plan?.items) ? plan.items : []).map(item => ({
    ...item,
    message: sanitizeMessageForPlanStorage(item?.message),
  })),
});

const createDeliveryMessageId = ({ now = Date.now, random = Math.random } = {}) => {
  const ts = Number(now?.() || Date.now()) || Date.now();
  const suffix = String(random?.() ?? Math.random()).replace(/^0\./, '').slice(0, 8) || '0';
  return `protocol-delivery-${ts}-${suffix}`;
};

export const getProtocolDeliveryPlanStorageKey = (scopeId = 'default') => {
  const scope = normalizeString(scopeId) || 'default';
  return `${STORAGE_PREFIX}:${scope}`;
};

export const ensureProtocolDeliveryMessageIdentity = (
  message,
  {
    now = Date.now,
    random = Math.random,
  } = {},
) => {
  if (!message || typeof message !== 'object') return null;
  if (!message.id) message.id = createDeliveryMessageId({ now, random });
  if (!message.timestamp) message.timestamp = Number(now?.() || Date.now()) || Date.now();
  return message;
};

export const normalizeProtocolDeliveryItem = (
  item,
  {
    fallbackSessionId = '',
    now = Date.now,
    random = Math.random,
  } = {},
) => {
  if (!item || typeof item !== 'object') return null;
  const rawMessage = item.message && typeof item.message === 'object' ? item.message : null;
  if (!rawMessage) return null;
  const rawDelivery = item.delivery && typeof item.delivery === 'object' ? item.delivery : {};
  const targetSessionId = normalizeString(rawDelivery.targetSessionId || item.targetSessionId || fallbackSessionId);
  if (!targetSessionId) return null;
  const message = ensureProtocolDeliveryMessageIdentity(clonePlainObject(rawMessage), { now, random });
  if (!message) return null;
  const kind = normalizeString(rawDelivery.kind);
  return {
    message,
    delivery: {
      kind: kind === 'group' || kind === 'private' ? kind : '',
      targetSessionId,
      role: normalizeString(rawDelivery.role || message.role),
      isSystem: rawDelivery.isSystem === true || message.role === 'system',
      isMe: rawDelivery.isMe === true,
    },
  };
};

export const normalizeProtocolDeliveryPlan = (
  plan,
  {
    scopeId = 'default',
    now = Date.now,
    random = Math.random,
  } = {},
) => {
  if (!plan || typeof plan !== 'object') return null;
  const sessionId = normalizeString(plan.sessionId);
  const items = (Array.isArray(plan.items) ? plan.items : [])
    .map(item => normalizeProtocolDeliveryItem(item, { fallbackSessionId: sessionId, now, random }))
    .filter(Boolean);
  if (!sessionId || !items.length) return null;
  const rawCursor = Math.trunc(Number(plan.cursor || 0));
  const cursor = Number.isFinite(rawCursor) ? Math.min(Math.max(0, rawCursor), items.length) : 0;
  const createdAt = Number(plan.createdAt || 0) || Number(now?.() || Date.now()) || Date.now();
  const id = normalizeString(plan.id) || createDeliveryMessageId({ now, random });
  return {
    id,
    scopeId: normalizeString(plan.scopeId || scopeId) || 'default',
    sessionId,
    createdAt,
    cursor,
    items,
  };
};

export const readProtocolDeliveryPlans = ({
  storage = null,
  scopeId = 'default',
  logger = null,
} = {}) => {
  const targetStorage = getStorage(storage);
  if (!targetStorage) return [];
  try {
    const raw = targetStorage.getItem(getProtocolDeliveryPlanStorageKey(scopeId));
    const parsed = raw ? JSON.parse(raw) : null;
    const plans = Array.isArray(parsed?.plans) ? parsed.plans : [];
    return plans
      .map(plan => normalizeProtocolDeliveryPlan(plan, { scopeId }))
      .filter(Boolean)
      .slice(-MAX_STORED_PLANS);
  } catch (err) {
    logger?.warn?.('read protocol delivery plans failed', err);
    return [];
  }
};

export const writeProtocolDeliveryPlans = ({
  storage = null,
  scopeId = 'default',
  plans = [],
  logger = null,
} = {}) => {
  const targetStorage = getStorage(storage);
  if (!targetStorage) return false;
  const key = getProtocolDeliveryPlanStorageKey(scopeId);
  const normalized = (Array.isArray(plans) ? plans : [])
    .map(plan => normalizeProtocolDeliveryPlan(plan, { scopeId }))
    .filter(Boolean)
    .slice(-MAX_STORED_PLANS);
  try {
    if (!normalized.length) {
      if (typeof targetStorage.removeItem === 'function') targetStorage.removeItem(key);
      else targetStorage.setItem(key, JSON.stringify({ plans: [] }));
    } else {
      targetStorage.setItem(key, JSON.stringify({ plans: normalized.map(sanitizePlanForStorage) }));
    }
    return true;
  } catch (err) {
    logger?.warn?.('write protocol delivery plans failed', err);
    return false;
  }
};

export const upsertProtocolDeliveryPlan = ({
  storage = null,
  scopeId = 'default',
  plan = null,
  logger = null,
} = {}) => {
  const normalized = normalizeProtocolDeliveryPlan(plan, { scopeId });
  if (!normalized) return null;
  const plans = readProtocolDeliveryPlans({ storage, scopeId, logger })
    .filter(item => item.id !== normalized.id);
  plans.push(normalized);
  writeProtocolDeliveryPlans({ storage, scopeId, plans, logger });
  return normalized;
};

export const updateProtocolDeliveryPlanCursor = ({
  storage = null,
  scopeId = 'default',
  planId = '',
  cursor = 0,
  logger = null,
} = {}) => {
  const id = normalizeString(planId);
  if (!id) return false;
  const plans = readProtocolDeliveryPlans({ storage, scopeId, logger });
  let changed = false;
  const nextPlans = plans.map(plan => {
    if (plan.id !== id) return plan;
    const nextCursor = Math.min(Math.max(0, Math.trunc(Number(cursor || 0)) || 0), plan.items.length);
    changed = changed || nextCursor !== plan.cursor;
    return { ...plan, cursor: nextCursor };
  });
  if (!changed) return false;
  return writeProtocolDeliveryPlans({ storage, scopeId, plans: nextPlans, logger });
};

export const removeProtocolDeliveryPlan = ({
  storage = null,
  scopeId = 'default',
  planId = '',
  logger = null,
} = {}) => {
  const id = normalizeString(planId);
  if (!id) return false;
  const plans = readProtocolDeliveryPlans({ storage, scopeId, logger });
  const nextPlans = plans.filter(plan => plan.id !== id);
  if (nextPlans.length === plans.length) return false;
  return writeProtocolDeliveryPlans({ storage, scopeId, plans: nextPlans, logger });
};

export const deliverProtocolDeliveryItem = (
  item,
  {
    appendMessage = null,
    findMessage = null,
    isSessionActive = null,
    addUiMessage = null,
    autoMarkReadIfActive = null,
    emitPluginAfterReceive = null,
    maybeApplyGroupSystemOps = null,
    refreshChatAndContacts = null,
    renderActive = true,
    autoScroll = true,
    logger = null,
  } = {},
) => {
  const normalized = normalizeProtocolDeliveryItem(item);
  if (!normalized) return { appended: false, skipped: true, reason: 'invalid-item' };
  const { message, delivery } = normalized;
  const sessionId = delivery.targetSessionId;
  const messageId = normalizeString(message.id);
  let existing = null;
  if (messageId && typeof findMessage === 'function') {
    try {
      existing = findMessage(messageId, sessionId) || null;
    } catch (err) {
      logger?.debug?.('protocol delivery duplicate check failed', err);
    }
  }
  if (existing) {
    return { appended: false, skipped: true, reason: 'duplicate', sessionId, saved: existing };
  }

  const active = Boolean(typeof isSessionActive === 'function' && isSessionActive(sessionId));
  if (renderActive !== false && active && typeof addUiMessage === 'function') {
    addUiMessage(message, { autoScroll: Boolean(autoScroll) });
  }

  const saved = typeof appendMessage === 'function'
    ? (appendMessage(message, sessionId) || message)
    : message;
  const savedId = normalizeString(saved?.id || message.id);
  const isGroup = delivery.kind === 'group';
  const isSystem = Boolean(delivery.isSystem);
  const isAssistant = delivery.role === 'assistant' || saved?.role === 'assistant';
  const shouldMarkRead = active && ((isGroup && isAssistant) || (delivery.kind === 'private' && delivery.isMe !== true));

  if (shouldMarkRead && typeof autoMarkReadIfActive === 'function') {
    autoMarkReadIfActive(sessionId, savedId);
  }
  if (typeof emitPluginAfterReceive === 'function') {
    emitPluginAfterReceive(saved, sessionId);
  }
  if (isGroup && isSystem && typeof maybeApplyGroupSystemOps === 'function') {
    maybeApplyGroupSystemOps(saved?.content || message.content || '', sessionId);
  }
  if (typeof refreshChatAndContacts === 'function') {
    refreshChatAndContacts();
  }
  return { appended: true, skipped: false, sessionId, saved };
};

export const flushPersistedProtocolDeliveryPlans = async ({
  storage = null,
  scopeId = 'default',
  logger = null,
  ...deliveryOptions
} = {}) => {
  const plans = readProtocolDeliveryPlans({ storage, scopeId, logger });
  let appended = 0;
  let skipped = 0;
  let failed = 0;
  for (const plan of plans) {
    let planFailed = false;
    for (let i = plan.cursor; i < plan.items.length; i += 1) {
      try {
        const result = deliverProtocolDeliveryItem(plan.items[i], {
          ...deliveryOptions,
          renderActive: false,
          logger,
        });
        if (result.appended) appended += 1;
        else skipped += 1;
        updateProtocolDeliveryPlanCursor({
          storage,
          scopeId,
          planId: plan.id,
          cursor: i + 1,
          logger,
        });
      } catch (err) {
        failed += 1;
        planFailed = true;
        logger?.warn?.('flush protocol delivery plan item failed', err);
        break;
      }
    }
    if (!planFailed) {
      removeProtocolDeliveryPlan({ storage, scopeId, planId: plan.id, logger });
    }
  }
  return {
    plans: plans.length,
    appended,
    skipped,
    failed,
  };
};
