import { BUILTIN_PHONE_FORMAT_WORLDBOOK_ID } from '../storage/builtin-worldbooks.js';
import { getGlobalWorldId, getGlobalWorldIds } from './world-session-runtime-utils.js';

const ensureArray = value => (Array.isArray(value) ? value : []);

export const buildTransferWorldIdList = ({
  sessionWorldIds = [],
  globalWorldId = '',
  globalWorldIds = [],
  normalizeSessionWorldIds = true,
} = {}) => {
  const normalizedSessionWorldIds = normalizeSessionWorldIds
    ? ensureArray(sessionWorldIds)
      .map(id => String(id || '').trim())
      .filter(id => id && id !== BUILTIN_PHONE_FORMAT_WORLDBOOK_ID)
    : ensureArray(sessionWorldIds);
  const sharedWorldIds = Array.from(new Set([
    globalWorldId,
    ...ensureArray(globalWorldIds),
  ].map(id => String(id || '').trim()).filter(Boolean)));
  return Array.from(new Set([
    ...normalizedSessionWorldIds,
    ...sharedWorldIds.filter(id => id !== BUILTIN_PHONE_FORMAT_WORLDBOOK_ID),
  ])).filter(id => id && id !== BUILTIN_PHONE_FORMAT_WORLDBOOK_ID);
};

export const collectTransferWorldbookBundle = async ({
  appBridge,
  sessionId = '',
  normalizeSessionWorldIds = true,
  cloneWorldbook = value => value,
  onError = null,
} = {}) => {
  const sid = String(sessionId || '').trim();
  const globalWorldId = getGlobalWorldId(appBridge);
  const globalWorldIds = getGlobalWorldIds(appBridge);
  const worldIds = buildTransferWorldIdList({
    sessionWorldIds: appBridge?.getWorldIdsForSession?.(sid),
    globalWorldId,
    globalWorldIds,
    normalizeSessionWorldIds,
  });
  const worldbooks = {};
  for (const id of worldIds) {
    try {
      const data = await appBridge?.getWorldInfo?.(id);
      if (data && typeof data === 'object') {
        const cloned = cloneWorldbook(data);
        if (cloned && typeof cloned === 'object') {
          worldbooks[id] = { ...cloned, name: String(data?.name || id) };
        }
      }
    } catch (err) {
      if (typeof onError === 'function') onError(err, id);
    }
  }
  return {
    worldIds,
    globalWorldId: globalWorldId && globalWorldId !== BUILTIN_PHONE_FORMAT_WORLDBOOK_ID ? globalWorldId : '',
    globalWorldIds: globalWorldIds.filter(id => id !== BUILTIN_PHONE_FORMAT_WORLDBOOK_ID),
    worldbooks,
  };
};
