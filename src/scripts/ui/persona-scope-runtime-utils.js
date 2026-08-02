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
      feature: String(item?.feature || item?.name || '资料').trim() || '资料',
      critical: item?.critical === true,
      store: item.store,
      isReady: typeof item?.isReady === 'function' ? item.isReady : null,
    }));
  const results = await Promise.allSettled(
    targets.map(item => Promise.resolve().then(() => item.store.setScope(scopeId))),
  );
  const failures = [];
  results.forEach((result, index) => {
    const target = targets[index];
    if (result.status === 'rejected') {
      failures.push({
        name: target.name,
        feature: target.feature,
        critical: target.critical,
        kind: 'rejected',
        error: result.reason instanceof Error ? result.reason : new Error(String(result.reason || 'scope failed')),
      });
      return;
    }
    if (!target.isReady) return;
    try {
      const verdict = target.isReady({
        result: result.value,
        store: target.store,
        scopeId,
      });
      const ready = verdict && typeof verdict === 'object'
        ? verdict.ok !== false
        : verdict !== false;
      if (ready) return;
      const reason = verdict && typeof verdict === 'object'
        ? String(verdict.reason || '').trim()
        : '';
      failures.push({
        name: target.name,
        feature: target.feature,
        critical: target.critical,
        kind: 'soft_failure',
        error: new Error(reason || `${target.name} scope is not ready`),
      });
    } catch (error) {
      failures.push({
        name: target.name,
        feature: target.feature,
        critical: target.critical,
        kind: 'health_check_failed',
        error: error instanceof Error ? error : new Error(String(error || 'scope health check failed')),
      });
    }
  });
  const criticalFailures = failures.filter(item => item.critical);
  const degradedFailures = failures.filter(item => !item.critical);
  return {
    ok: failures.length === 0,
    failures,
    criticalFailures,
    degradedFailures,
    results,
  };
};

const buildScopeAssignedHealth = (label = '资料') => ({ store, scopeId } = {}) => ({
  ok: normalizeScopeId(store?.scopeId || '') === normalizeScopeId(scopeId),
  reason: `${label}未切换到目标角色卡`,
});

export const buildPersonaScopeStoreTargets = ({
  chatStore = null,
  contactsStore = null,
  groupStore = null,
  momentsStore = null,
  momentSummaryStore = null,
  personaArchiveStore = null,
  rpSessionStore = null,
  memoryTableStore = null,
  contactProfileStore = null,
  memoryTemplateStore = null,
  memorySnapshotStore = null,
  variableSnapshotStore = null,
  turnCheckpointStore = null,
} = {}) => [
  {
    name: 'chatStore', feature: '聊天与联系人', critical: true, store: chatStore,
    isReady: buildScopeAssignedHealth('聊天记录'),
  },
  {
    name: 'contactsStore', feature: '聊天与联系人', critical: true, store: contactsStore,
    isReady: buildScopeAssignedHealth('联系人'),
  },
  {
    name: 'groupStore', feature: '联系人分组', store: groupStore,
    isReady: buildScopeAssignedHealth('联系人分组'),
  },
  {
    name: 'momentsStore', feature: '动态', store: momentsStore,
    isReady: context => {
      const assigned = buildScopeAssignedHealth('动态')(context);
      return assigned.ok && !context.store?.lastDiskError
        ? assigned
        : { ok: false, reason: context.store?.lastDiskError || assigned.reason };
    },
  },
  {
    name: 'momentSummaryStore', feature: '动态摘要', store: momentSummaryStore,
    isReady: buildScopeAssignedHealth('动态摘要'),
  },
  {
    name: 'personaArchiveStore', feature: '剧情存档', store: personaArchiveStore,
    isReady: context => {
      const assigned = buildScopeAssignedHealth('剧情存档')(context);
      return assigned.ok && context.store?.persistenceBlocked !== true
        ? assigned
        : { ok: false, reason: assigned.ok ? '剧情存档暂时无法读取' : assigned.reason };
    },
  },
  {
    name: 'rpSessionStore', feature: '创意写作会话', store: rpSessionStore,
    isReady: context => {
      const assigned = buildScopeAssignedHealth('创意写作会话')(context);
      return assigned.ok && context.store?.persistenceBlocked !== true
        ? assigned
        : { ok: false, reason: assigned.ok ? '创意写作会话暂时无法读取' : assigned.reason };
    },
  },
  {
    name: 'memoryTableStore', feature: '记忆表', store: memoryTableStore,
    isReady: context => ({
      ok: context.result === true && normalizeScopeId(context.store?.scopeId || '') === normalizeScopeId(context.scopeId),
      reason: '记忆数据库未就绪',
    }),
  },
  {
    name: 'contactProfileStore', feature: '联系人档案', store: contactProfileStore,
    isReady: buildScopeAssignedHealth('联系人档案'),
  },
  {
    name: 'memoryTemplateStore', feature: '记忆模板', store: memoryTemplateStore,
    isReady: context => ({
      ok: context.result === true && normalizeScopeId(context.store?.scopeId || '') === normalizeScopeId(context.scopeId),
      reason: '记忆模板数据库未就绪',
    }),
  },
  {
    name: 'memorySnapshotStore', feature: '记忆快照', store: memorySnapshotStore,
    isReady: buildScopeAssignedHealth('记忆快照'),
  },
  {
    name: 'variableSnapshotStore', feature: '变量快照', store: variableSnapshotStore,
    isReady: buildScopeAssignedHealth('变量快照'),
  },
  {
    name: 'turnCheckpointStore', feature: '轮次检查点', store: turnCheckpointStore,
    isReady: buildScopeAssignedHealth('轮次检查点'),
  },
];

export const createPersonaScopeApplyCoordinator = ({
  getRequestedScopeId = () => '',
} = {}) => {
  let latestToken = 0;
  let serial = Promise.resolve();
  const isCurrent = (token, scopeId = '') => (
    token === latestToken &&
    normalizeScopeId(getRequestedScopeId?.() || '') === normalizeScopeId(scopeId)
  );
  const enqueue = (run) => {
    const token = ++latestToken;
    serial = serial
      .catch(() => {})
      .then(() => {
        if (typeof run !== 'function') return false;
        return run({
          token,
          isCurrent: scopeId => isCurrent(token, scopeId),
          commit: (scopeId, apply) => {
            if (!isCurrent(token, scopeId)) return false;
            apply?.();
            return true;
          },
        });
      });
    return serial;
  };
  return {
    enqueue,
    isCurrent,
    getLatestToken: () => latestToken,
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

/**
 * 仅确认 chat/contacts 已被指派到目标 scope；不代表磁盘水合或所有非关键 store 均健康。
 */
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
