import { BUILTIN_PHONE_FORMAT_WORLDBOOK_ID } from '../storage/builtin-worldbooks.js';
import { normalizeWorldIdList } from './world-id-utils.js';

const ensureArray = value => (Array.isArray(value) ? value : []);

export const getCustomBundleSessionWorldIds = (runtime = null, sessionId = '') => {
  const sid = String(sessionId || '').trim();
  if (!sid) return [];
  const list = normalizeWorldIdList(runtime?.worldSessionMap?.[sid]);
  const globalWorldIds = normalizeWorldIdList([
    runtime?.globalWorldId,
    ...ensureArray(runtime?.globalWorldIds),
  ], { excludeBuiltin: BUILTIN_PHONE_FORMAT_WORLDBOOK_ID });
  list.push(...globalWorldIds);
  return normalizeWorldIdList(list, { excludeBuiltin: BUILTIN_PHONE_FORMAT_WORLDBOOK_ID });
};

export const getCustomBundleRoleWorldIds = (role = null) => {
  const source = role?.source && typeof role.source === 'object' ? role.source : {};
  const worldbookId = String(source?.worldbookId || '').trim();
  if (!worldbookId || worldbookId === BUILTIN_PHONE_FORMAT_WORLDBOOK_ID) return [];
  return [worldbookId];
};

export const mergeCustomBundleExportWorldIds = (...lists) => (
  normalizeWorldIdList(lists.flat(), { excludeBuiltin: BUILTIN_PHONE_FORMAT_WORLDBOOK_ID })
);

export const collectCustomBundleWorldbookRecords = async ({
  worldIds = [],
  worldStoreMap = {},
  getWorldInfo = null,
  cloneWorldbook = value => value,
  onError = null,
} = {}) => {
  const worldbooks = {};
  for (const worldId of ensureArray(worldIds)) {
    const id = String(worldId || '').trim();
    if (!id) continue;
    const fromStore = worldStoreMap?.[id];
    if (fromStore && typeof fromStore === 'object') {
      worldbooks[id] = cloneWorldbook(fromStore);
      continue;
    }
    try {
      const loaded = await getWorldInfo?.(id);
      if (loaded && typeof loaded === 'object') {
        worldbooks[id] = cloneWorldbook(loaded);
      }
    } catch (err) {
      if (typeof onError === 'function') onError(err, id);
    }
  }
  return worldbooks;
};
