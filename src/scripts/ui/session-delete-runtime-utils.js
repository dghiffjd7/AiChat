import { safeInvoke } from '../utils/tauri.js';
import {
  deleteWorldSessionMapEntry,
  getWorldSessionMap,
} from './world-session-runtime-utils.js';

const trim = value => String(value ?? '').trim();

const normalizeIds = value => (
  Array.isArray(value) ? value : (value ? [value] : [])
).map(trim).filter(Boolean);

const hasStoredSession = (sessionId, chatStore, contactsStore) => {
  const sid = trim(sessionId);
  if (!sid) return false;
  let checked = false;
  try {
    if (typeof contactsStore?.getContact === 'function') {
      checked = true;
      if (contactsStore.getContact(sid)) return true;
    }
  } catch {}
  try {
    if (typeof chatStore?.listSessions === 'function') {
      checked = true;
      const ids = chatStore.listSessions();
      if (Array.isArray(ids) && ids.some(id => trim(id) === sid)) return true;
    }
  } catch {}
  return checked ? false : true;
};

export const removeSessionCore = async ({
  sessionId = '',
  chatStore = null,
  contactsStore = null,
  appBridge = globalThis.window?.appBridge || null,
  invoke = safeInvoke,
  beforeDeleteSession = null,
  logger = console,
} = {}) => {
  const sid = trim(sessionId);
  if (!sid) return { ok: false, deleted: false, reason: 'missing_session_id' };
  if (!hasStoredSession(sid, chatStore, contactsStore)) {
    return { ok: true, deleted: false, reason: 'already_absent', sessionId: sid };
  }

  let deleteGuard = null;
  if (typeof beforeDeleteSession === 'function') {
    try {
      const guard = await beforeDeleteSession(sid);
      if (guard?.ok === false) {
        return {
          ok: false,
          deleted: false,
          reason: trim(guard.reason) || 'session_busy',
          sessionId: sid,
          guard,
        };
      }
      deleteGuard = guard;
    } catch (error) {
      return {
        ok: false,
        deleted: false,
        reason: 'session_delete_guard_failed',
        sessionId: sid,
        errorMessage: trim(error?.message || error),
      };
    }
  }

  const warnings = [];
  const releaseDeleteGuard = () => {
    try { deleteGuard?.release?.(); } catch {}
    deleteGuard = null;
  };
  const warn = (stage, error) => {
    warnings.push({
      stage,
      message: trim(error?.message || error) || 'cleanup_failed',
    });
    try { logger?.warn?.(`删除联系人时${stage}失败`, error); } catch {}
  };

  try {
    const settings = chatStore?.getSessionSettings?.(sid) || null;
    const path = trim(settings?.wallpaper?.path);
    if (path && typeof invoke === 'function') {
      try {
        await invoke('delete_wallpaper', { sessionId: sid, path });
      } catch (error) {
        warn('清理壁纸', error);
      }
    }
  } catch (error) {
    warn('读取壁纸', error);
  }

  const deletedDerivedWorldbookIds = [];
  try {
    const boundIds = normalizeIds(await appBridge?.getWorldIdsForSession?.(sid));
    const map = getWorldSessionMap(appBridge);
    const isUsedElsewhere = (worldId) => {
      const target = trim(worldId);
      if (!target) return false;
      return Object.entries(map).some(([otherSessionId, ids]) => (
        trim(otherSessionId) !== sid &&
        normalizeIds(ids).some(id => id === target)
      ));
    };
    for (const worldId of boundIds) {
      if (isUsedElsewhere(worldId)) continue;
      let data = null;
      try {
        data = await appBridge?.getWorldInfo?.(worldId);
      } catch {}
      if (data?.source !== 'world_entry') continue;
      try {
        await appBridge?.deleteWorldInfo?.(worldId);
        deletedDerivedWorldbookIds.push(worldId);
      } catch (error) {
        warn('清理引用世界书', error);
      }
    }
  } catch (error) {
    warn('读取引用世界书', error);
  }

  try {
    deleteWorldSessionMapEntry(appBridge, sid);
  } catch (error) {
    warn('清理世界书映射', error);
  }

  try {
    chatStore?.delete?.(sid);
  } catch (error) {
    warn('删除聊天室', error);
    releaseDeleteGuard();
    return {
      ok: false,
      deleted: false,
      reason: 'session_delete_failed',
      sessionId: sid,
      deletedDerivedWorldbookIds,
      warnings,
    };
  }

  try {
    await appBridge?.clearSessionTurnCheckpointState?.(sid);
  } catch (error) {
    warn('清理检查点', error);
  }

  try {
    contactsStore?.removeContact?.(sid);
  } catch (error) {
    warn('删除联系人', error);
  }

  releaseDeleteGuard();

  return {
    ok: true,
    deleted: true,
    sessionId: sid,
    deletedDerivedWorldbookIds,
    warnings,
  };
};
