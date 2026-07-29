const trim = value => String(value ?? '').trim();

const normalizeLookup = value => trim(value).normalize('NFKC').toLowerCase();

const asArray = value => Array.isArray(value) ? value : [];

const matchesResource = (item, target = '') => {
  const needle = normalizeLookup(target);
  if (!needle) return false;
  if (typeof item === 'string' || typeof item === 'number') {
    return normalizeLookup(item) === needle;
  }
  return [
    item?.id,
    item?.name,
    item?.title,
    item?.displayName,
  ].some(value => normalizeLookup(value) === needle);
};

const foundStatus = found => ({ status: found ? 'found' : 'not_found' });

const readList = async (target, method, ...args) => {
  if (typeof target?.[method] !== 'function') return null;
  const value = await target[method](...args);
  return Array.isArray(value) ? value : null;
};

const waitReady = async (target) => {
  if (target?.ready && typeof target.ready.then === 'function') await target.ready;
};

export const createMaidSemanticResourceValidator = ({
  appBridge = null,
  chatStore = null,
  contactsStore = null,
  personaStore = null,
  userStore = null,
  presetStore = null,
  regexStore = null,
  scriptStore = null,
} = {}) => async (resourceRef = {}) => {
  const type = trim(resourceRef?.type).toLowerCase();
  const id = trim(resourceRef?.id);
  if (!type || !id) return { status: 'unavailable' };
  try {
    if (type === 'worldbook') {
      await appBridge?.waitForWorldStoreReady?.();
      const worlds = await readList(appBridge, 'listWorlds');
      return worlds ? foundStatus(worlds.some(item => matchesResource(item, id))) : { status: 'unavailable' };
    }
    if (type === 'session' || type === 'group') {
      await waitReady(chatStore);
      const sessions = await readList(chatStore, 'listSessions');
      if (!sessions) return { status: 'unavailable' };
      if (type === 'session' && sessions.some(item => matchesResource(item, id))) {
        return { status: 'found' };
      }
      const contacts = await readList(contactsStore, 'listContacts') || [];
      const matchedContact = contacts.find(item => matchesResource(item, id))
        || await contactsStore?.getContact?.(id)
        || null;
      if (type === 'group') {
        return foundStatus(Boolean(matchedContact?.isGroup && matchesResource(matchedContact, id)));
      }
      return foundStatus(Boolean(matchedContact) || sessions.some(item => matchesResource(item, id)));
    }
    if (type === 'persona' || type === 'user') {
      const store = type === 'persona' ? personaStore : userStore;
      await waitReady(store);
      const items = await readList(store, 'getAll');
      return items ? foundStatus(items.some(item => matchesResource(item, id))) : { status: 'unavailable' };
    }
    if (type === 'preset') {
      await waitReady(presetStore);
      if (typeof presetStore?.list !== 'function') return { status: 'unavailable' };
      const types = ['openai', 'sysprompt', 'context', 'instruct', 'reasoning'];
      const presets = [];
      for (const presetType of types) {
        presets.push(...asArray(await presetStore.list(presetType)));
      }
      return foundStatus(presets.some(item => matchesResource(item, id)));
    }
    if (type === 'regex') {
      await waitReady(regexStore);
      const sets = await readList(regexStore, 'listLocalSets');
      return sets ? foundStatus(sets.some(item => matchesResource(item, id))) : { status: 'unavailable' };
    }
    if (type === 'script') {
      await waitReady(scriptStore);
      if (typeof scriptStore?.getScripts !== 'function') return { status: 'unavailable' };
      const scripts = asArray(await scriptStore.getScripts('global'));
      const scopes = typeof scriptStore?.listScopes === 'function'
        ? await scriptStore.listScopes()
        : {};
      for (const scopeType of ['character', 'preset']) {
        for (const scopeId of asArray(scopes?.[scopeType])) {
          scripts.push(...asArray(await scriptStore.getScripts(scopeType, scopeId)));
        }
      }
      return foundStatus(scripts.some(item => matchesResource(item, id)));
    }
    // variable/moment/api 暂无稳定、廉价且可按 ID 查询的权威接口；保持未验证而非误标 stale。
    return { status: 'unavailable' };
  } catch {
    return { status: 'unavailable' };
  }
};
