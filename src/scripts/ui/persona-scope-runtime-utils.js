import { makeScopedKey, normalizeScopeId } from '../storage/store-scope.js';

export const getPersonaScopeStorageSuffix = (scopeId = '') => normalizeScopeId(scopeId) || 'default';

export const buildPersonaScopedStorageKey = (baseKey = '', scopeId = '') => {
  const base = String(baseKey || '').trim();
  if (!base) return '';
  return makeScopedKey(base, getPersonaScopeStorageSuffix(scopeId));
};

export const getOwnRpSessionIdForScope = (scopeId = '') => `rp:${getPersonaScopeStorageSuffix(scopeId)}`;

export const settlePersonaScopeStores = async ({
  scopeId = '',
  stores = [],
} = {}) => {
  const targets = (Array.isArray(stores) ? stores : [])
    .filter(item => typeof item?.store?.setScope === 'function')
    .map(item => ({
      name: String(item?.name || 'store').trim() || 'store',
      store: item.store,
    }));
  const results = await Promise.allSettled(
    targets.map(item => Promise.resolve().then(() => item.store.setScope(scopeId))),
  );
  const failures = [];
  results.forEach((result, index) => {
    if (result.status !== 'rejected') return;
    failures.push({
      name: targets[index].name,
      error: result.reason instanceof Error ? result.reason : new Error(String(result.reason || 'scope failed')),
    });
  });
  return {
    ok: failures.length === 0,
    failures,
    results,
  };
};

export const isForeignRpSessionForScope = (sessionId = '', scopeId = '') => {
  const sid = String(sessionId || '').trim();
  if (!sid.startsWith('rp:')) return false;
  return sid !== getOwnRpSessionIdForScope(scopeId);
};

export const hasPersonaScopedSession = ({
  sessionId = '',
  scopeId = '',
  chatStore = null,
  contactsStore = null,
} = {}) => {
  const sid = String(sessionId || '').trim();
  if (!sid) return false;
  if (isForeignRpSessionForScope(sid, scopeId)) return false;
  try {
    if (chatStore?.hasSession?.(sid)) return true;
  } catch {}
  try {
    if (contactsStore?.getContact?.(sid)) return true;
  } catch {}
  return false;
};

export const arePersonaScopedStoresReady = ({
  scopeId = '',
  chatStore = null,
  contactsStore = null,
} = {}) => {
  const scope = normalizeScopeId(scopeId);
  const chatScope = normalizeScopeId(chatStore?.scopeId || '');
  const contactsScope = normalizeScopeId(contactsStore?.scopeId || '');
  return chatScope === scope && contactsScope === scope;
};

export const canReusePersonaScope = ({
  nextScopeId = '',
  activeScopeId = '',
  force = false,
  chatStore = null,
  contactsStore = null,
} = {}) => (
  force !== true &&
  normalizeScopeId(nextScopeId) === normalizeScopeId(activeScopeId) &&
  arePersonaScopedStoresReady({ scopeId: nextScopeId, chatStore, contactsStore })
);

export const canEnterPersonaScopedSession = ({
  sessionId = '',
  scopeId = '',
  chatStore = null,
  contactsStore = null,
} = {}) => {
  const sid = String(sessionId || '').trim();
  if (!sid) return { allowed: false, reason: 'empty-session' };
  if (!arePersonaScopedStoresReady({ scopeId, chatStore, contactsStore })) {
    return { allowed: false, reason: 'scope-mismatch' };
  }
  if (!hasPersonaScopedSession({ sessionId: sid, scopeId, chatStore, contactsStore })) {
    return { allowed: false, reason: 'unknown-session' };
  }
  return { allowed: true, reason: 'known-session' };
};

export const resolvePersonaScopedCurrentSession = ({
  scopeId = '',
  chatStore = null,
  contactsStore = null,
  allowRpSession = true,
} = {}) => {
  const sid = String(chatStore?.getCurrent?.() || '').trim();
  const foreignRp = isForeignRpSessionForScope(sid, scopeId);
  if (!sid || foreignRp) {
    return { sessionId: '', known: false, foreignRp, source: sid ? 'foreign-rp' : 'empty' };
  }
  if (allowRpSession !== true && sid.startsWith('rp:')) {
    return { sessionId: '', known: false, foreignRp: false, source: 'rp-excluded' };
  }
  let hasChat = false;
  let hasContact = false;
  try {
    hasChat = Boolean(chatStore?.hasSession?.(sid));
  } catch {}
  try {
    hasContact = Boolean(contactsStore?.getContact?.(sid));
  } catch {}
  if (hasChat || hasContact) {
    return {
      sessionId: sid,
      known: true,
      foreignRp: false,
      source: hasChat ? 'chat' : 'contact',
    };
  }
  return { sessionId: '', known: false, foreignRp: false, source: 'unknown' };
};
