/**
 * Character library store
 * - Load bundled characters.json
 * - Persist per-user dynamic state (show counts / last shown / added)
 * - Provide recommendation sections and fuzzy search
 */

import { logger } from '../utils/logger.js';
import { safeInvoke } from '../utils/tauri.js';
import { parseNameBadge } from '../utils/name-badges.js';
import { getCurrentLocale } from '../i18n/index.js';
import { localizeBundledCharacterLibrary } from '../i18n/builtin-character-locale.js';
import { makeScopedKey, normalizeScopeId } from './store-scope.js';

const LIBRARY_URL = './assets/data/characters.json';
const STATE_KEY_BASE = 'user_character_state_v1';

const readLocalState = (key) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const uniqueStrings = (list, { max = 2000 } = {}) => {
  const seen = new Set();
  const out = [];
  for (const item of list || []) {
    const text = String(item ?? '').trim();
    if (!text) continue;
    if (seen.has(text)) continue;
    seen.add(text);
    out.push(text);
    if (out.length >= max) break;
  }
  return out;
};

const normalizeText = (value) =>
  String(value ?? '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

const normalizeNameKey = (value) =>
  String(value ?? '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .trim();

const shuffle = (arr) => {
  const list = Array.isArray(arr) ? arr.slice() : [];
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = list[i];
    list[i] = list[j];
    list[j] = tmp;
  }
  return list;
};

const getCachedLibrary = () => {
  try {
    const g = typeof globalThis !== 'undefined' ? globalThis : window;
    return g.__characterLibraryCache || null;
  } catch {
    return null;
  }
};

const setCachedLibrary = (data) => {
  try {
    const g = typeof globalThis !== 'undefined' ? globalThis : window;
    g.__characterLibraryCache = data;
  } catch {}
};

const safeArray = (val) => (Array.isArray(val) ? val : []);

const defaultState = (scopeId) => ({
  version: 1,
  scopeId: normalizeScopeId(scopeId),
  characterStates: {},
  tagCycles: {},
  customCharacterNames: [],
  updatedAt: Date.now(),
});

const ensureStateShape = (state, scopeId) => {
  const scope = normalizeScopeId(scopeId);
  const base = state && typeof state === 'object' ? state : {};
  const next = {
    version: Number(base.version || 1) || 1,
    scopeId: scope,
    characterStates: base.characterStates && typeof base.characterStates === 'object' ? base.characterStates : {},
    tagCycles: base.tagCycles && typeof base.tagCycles === 'object' ? base.tagCycles : {},
    customCharacterNames: uniqueStrings(base.customCharacterNames || []),
    updatedAt: Number(base.updatedAt || Date.now()) || Date.now(),
  };
  return next;
};

const mergeCharacterWithState = (character, state) => {
  const st = state?.characterStates?.[character.id] || {};
  const parsed = parseNameBadge(character.name);
  return {
    ...character,
    baseName: parsed.baseName || character.name,
    nameBadge: parsed.badge || '',
    showCount: Number(st.showCount || 0) || 0,
    lastShownAt: Number(st.lastShownAt || 0) || 0,
    isAdded: Boolean(st.isAdded),
    addedAt: Number(st.addedAt || 0) || 0,
  };
};

const hasBadgeLike = (character) => Boolean(parseNameBadge(character?.name || '').badge);

export class CharacterLibraryStore {
  constructor({ scopeId = '' } = {}) {
    this.scopeId = normalizeScopeId(scopeId);
    this.stateKey = makeScopedKey(STATE_KEY_BASE, this.scopeId);
    this.state = ensureStateShape(readLocalState(this.stateKey), this.scopeId);
    this.ready = this._hydrateState();
    this.library = null;
    this.characters = [];
    this.tagsIndex = new Map();
    this.tagStats = new Map();
  }

  async _hydrateState() {
    const scope = this.scopeId;
    const key = this.stateKey;
    try {
      const disk = await safeInvoke('load_kv', { name: key });
      if (scope !== this.scopeId || key !== this.stateKey) return;
      if (disk && typeof disk === 'object' && !disk._tooLarge) {
        this.state = ensureStateShape(disk, this.scopeId);
        try {
          localStorage.setItem(this.stateKey, JSON.stringify(this.state));
        } catch {}
      }
    } catch (err) {
      logger.debug('character state hydrate skipped (可能非 Tauri)', err);
    }
  }

  async setScope(scopeId = '') {
    const nextScope = normalizeScopeId(scopeId);
    if (nextScope === this.scopeId) return this.ready;
    this.scopeId = nextScope;
    this.stateKey = makeScopedKey(STATE_KEY_BASE, this.scopeId);
    this.state = ensureStateShape(readLocalState(this.stateKey), this.scopeId);
    this.ready = this._hydrateState();
    return this.ready;
  }

  async loadLibrary() {
    const cached = getCachedLibrary();
    if (cached?.characters?.length) {
      this._setLibrary(cached);
      return cached;
    }
    try {
      const resp = await fetch(LIBRARY_URL, { cache: 'no-cache' });
      if (!resp.ok) throw new Error(`角色库加载失败：${resp.status}`);
      const data = await resp.json();
      this._setLibrary(data);
      setCachedLibrary(data);
      return data;
    } catch (err) {
      logger.error('加载角色库失败', err);
      this._setLibrary({ version: '0.0.0', fixedTags: [], characters: [] });
      return this.library;
    }
  }

  _setLibrary(data) {
    const source = data || { version: '0.0.0', fixedTags: [], characters: [] };
    this.library = localizeBundledCharacterLibrary(source, getCurrentLocale());
    this.characters = safeArray(this.library.characters);
    this._rebuildIndexes();
  }

  _rebuildIndexes() {
    this.tagsIndex = new Map();
    this.tagStats = new Map();
    for (const c of this.characters) {
      const tags = safeArray(c.tags);
      for (const tag of tags) {
        const t = String(tag || '').trim();
        if (!t) continue;
        if (!this.tagsIndex.has(t)) this.tagsIndex.set(t, []);
        this.tagsIndex.get(t).push(c);
        const prev = this.tagStats.get(t) || { count: 0, pop: 0 };
        prev.count += 1;
        prev.pop += Number(c.popularity || 0) || 0;
        this.tagStats.set(t, prev);
      }
    }
  }

  _persistState() {
    this.state.updatedAt = Date.now();
    try {
      localStorage.setItem(this.stateKey, JSON.stringify(this.state));
    } catch {}
    safeInvoke('save_kv', { name: this.stateKey, data: this.state }).catch((err) => {
      logger.debug('character state save_kv failed (可能非 Tauri)', err);
    });
  }

  _ensureCharState(id) {
    const key = String(id || '').trim();
    if (!key) return null;
    const prev = this.state.characterStates[key] || {};
    const next = {
      showCount: Number(prev.showCount || 0) || 0,
      lastShownAt: Number(prev.lastShownAt || 0) || 0,
      isAdded: Boolean(prev.isAdded),
      addedAt: Number(prev.addedAt || 0) || 0,
    };
    this.state.characterStates[key] = next;
    return next;
  }

  _ensureTagCycle(tag) {
    const key = String(tag || '').trim();
    if (!key) return { shownCharacterIds: [], lastCycleAt: 0 };
    const prev = this.state.tagCycles[key] || {};
    const next = {
      shownCharacterIds: uniqueStrings(prev.shownCharacterIds || [], { max: 20_000 }),
      lastCycleAt: Number(prev.lastCycleAt || 0) || 0,
    };
    this.state.tagCycles[key] = next;
    return next;
  }

  syncCustomNamesFromContacts(contactsStore) {
    const contacts = contactsStore?.listContacts?.() || [];
    const customNames = contacts
      .filter((c) => c && !c.isGroup && c.isUserCreated !== false)
      .map((c) => String(c?.name || c?.id || '').trim())
      .filter(Boolean);
    this.state.customCharacterNames = uniqueStrings(customNames);
    this._persistState();
    return this.state.customCharacterNames;
  }

  syncAddedFromContacts(contactsStore) {
    const contacts = contactsStore?.listContacts?.() || [];
    const addedIds = new Set(
      contacts
        .filter((c) => c && !c.isGroup && c.libraryCharacterId)
        .map((c) => String(c.libraryCharacterId || '').trim())
        .filter(Boolean),
    );
    // Mark present library contacts as added
    for (const id of addedIds) {
      const st = this._ensureCharState(id);
      if (!st) continue;
      st.isAdded = true;
      if (!st.addedAt) st.addedAt = Date.now();
    }
    // Unmark missing ones (so deleted contacts can be recommended again)
    for (const [id, st] of Object.entries(this.state.characterStates || {})) {
      if (!st?.isAdded) continue;
      if (!addedIds.has(id)) {
        st.isAdded = false;
        st.addedAt = 0;
      }
    }
    this._persistState();
  }

  markAdded(characterId, { addedAt = Date.now() } = {}) {
    const st = this._ensureCharState(characterId);
    if (!st) return;
    st.isAdded = true;
    st.addedAt = Number(addedAt || Date.now()) || Date.now();
    this._persistState();
  }

  markShown(characterId, { tag = '', shownAt = Date.now() } = {}) {
    const st = this._ensureCharState(characterId);
    if (!st) return;
    st.showCount = (Number(st.showCount || 0) || 0) + 1;
    st.lastShownAt = Number(shownAt || Date.now()) || Date.now();
    if (tag) {
      const cycle = this._ensureTagCycle(tag);
      if (!cycle.shownCharacterIds.includes(characterId)) {
        cycle.shownCharacterIds.push(characterId);
      }
    }
  }

  _shouldExcludeByCustomName(character) {
    const names = this.state.customCharacterNames || [];
    if (!names.length) return false;
    const customSet = new Set(names.map(normalizeNameKey));
    const nameKey = normalizeNameKey(character?.name || '');
    const baseKey = normalizeNameKey(parseNameBadge(character?.name || '').baseName);
    if (nameKey && customSet.has(nameKey)) return true;
    if (baseKey && customSet.has(baseKey)) return true;
    const aliases = safeArray(character?.aliases).map(normalizeNameKey);
    return aliases.some((a) => a && customSet.has(a));
  }

  _candidatesForTag(tag) {
    const list = this.tagsIndex.get(tag) || [];
    if (!list.length) return [];
    const cycle = this._ensureTagCycle(tag);
    const shownSet = new Set(cycle.shownCharacterIds || []);
    const merged = list
      .map((c) => mergeCharacterWithState(c, this.state))
      .filter((c) => !c.isAdded && !this._shouldExcludeByCustomName(c));
    if (!merged.length) return [];
    let available = merged.filter((c) => !shownSet.has(c.id));
    // If the whole tag has been shown, reset the cycle and start over
    if (!available.length) {
      cycle.shownCharacterIds = [];
      cycle.lastCycleAt = Date.now();
      available = merged.slice();
    }
    // Sorting priority:
    // 1) never shown
    // 2) lower show count
    // 3) older last shown
    // 4) higher popularity
    available.sort((a, b) => {
      const aNever = a.showCount === 0 ? 1 : 0;
      const bNever = b.showCount === 0 ? 1 : 0;
      if (aNever !== bNever) return bNever - aNever;
      if (a.showCount !== b.showCount) return a.showCount - b.showCount;
      if (a.lastShownAt !== b.lastShownAt) return a.lastShownAt - b.lastShownAt;
      return (Number(b.popularity || 0) || 0) - (Number(a.popularity || 0) || 0);
    });
    return available;
  }

  _computeTagWeights() {
    const weights = new Map();
    const now = Date.now();
    for (const c of this.characters) {
      const st = this.state.characterStates?.[c.id];
      if (!st?.isAdded) continue;
      const recencyBoost = st.addedAt ? Math.max(0, 1 - (now - st.addedAt) / (1000 * 60 * 60 * 24 * 30)) : 0;
      const baseWeight = 1 + recencyBoost * 2;
      for (const tag of safeArray(c.tags)) {
        const key = String(tag || '').trim();
        if (!key) continue;
        weights.set(key, (weights.get(key) || 0) + baseWeight);
      }
    }
    return weights;
  }

  _pickTags({ maxTags = 10 } = {}) {
    const fixedTags = uniqueStrings(this.library?.fixedTags || [], { max: 12 });
    const tagWeights = this._computeTagWeights();
    const allTags = Array.from(this.tagStats.keys());
    const pool = allTags.filter((t) => !fixedTags.includes(t));

    const scored = pool.map((tag) => {
      const stat = this.tagStats.get(tag) || { count: 0, pop: 0 };
      const avgPop = stat.count ? stat.pop / stat.count : 0;
      const weight = tagWeights.get(tag) || 0;
      return {
        tag,
        score: avgPop * 0.7 + stat.count * 0.6 + weight * 12,
      };
    });

    scored.sort((a, b) => b.score - a.score);
    const head = scored.slice(0, 40).map((x) => x.tag);
    const picked = shuffle(head).slice(0, Math.max(0, maxTags - fixedTags.length));
    return uniqueStrings([...fixedTags, ...picked], { max: maxTags });
  }

  async buildRecommendations({
    contactsStore,
    maxTags = 10,
    perTag = 3,
    limit = 8,
  } = {}) {
    await this.ready;
    await this.loadLibrary();
    if (!this.characters.length) return { tags: [], sections: [], characters: [] };
    if (contactsStore) {
      this.syncCustomNamesFromContacts(contactsStore);
      this.syncAddedFromContacts(contactsStore);
    }

    const tags = this._pickTags({ maxTags });
    const sections = [];
    const picked = [];
    const seen = new Set();
    const now = Date.now();
    for (const tag of tags) {
      const candidates = this._candidatesForTag(tag);
      if (!candidates.length) continue;
      const selected = [];
      for (const c of candidates) {
        if (seen.has(c.id)) continue;
        selected.push(c);
        seen.add(c.id);
        picked.push(c);
        this.markShown(c.id, { tag, shownAt: now });
        if (selected.length >= Math.max(1, perTag)) break;
        if (picked.length >= Math.max(3, limit)) break;
      }
      if (!selected.length) continue;
      sections.push({
        tag,
        characters: selected,
      });
      if (picked.length >= Math.max(3, limit)) break;
    }
    this._persistState();
    return {
      tags,
      sections,
      characters: picked.slice(0, Math.max(3, limit)),
    };
  }

  _calcNameMatchScore(character, query) {
    const q = normalizeText(query);
    if (!q) return 0;
    let score = 0;

    const name = normalizeText(character.name);
    const baseName = normalizeText(parseNameBadge(character.name).baseName);

    if (name === q || baseName === q) score += 120;
    else if (name.includes(q) || baseName.includes(q)) score += 96;

    const aliases = safeArray(character.aliases).map(normalizeText);
    if (aliases.some((a) => a === q)) score += 110;
    else if (aliases.some((a) => a.includes(q))) score += 82;

    return score;
  }

  _calcOtherMatchScore(character, query) {
    const q = normalizeText(query);
    if (!q) return 0;
    let score = 0;

    const badge = normalizeText(parseNameBadge(character.name).badge);
    if (badge && badge.includes(q)) score += 40;

    const source = normalizeText(character.source);
    if (source.includes(q)) score += 56;

    const sourceAliases = safeArray(character.sourceAliases).map(normalizeText);
    if (sourceAliases.some((a) => a.includes(q))) score += 52;

    const tags = [
      ...safeArray(character.tags),
      ...safeArray(character.originalTags),
    ].map(normalizeText);
    if (tags.some((t) => t.includes(q))) score += 34;

    // Small boost for badges (括号) so variants are easier to find
    if (hasBadgeLike(character)) score += 4;

    return score;
  }

  async search(query, { contactsStore, limit = 80 } = {}) {
    await this.ready;
    await this.loadLibrary();
    const q = String(query || '').trim();
    if (!q) return [];
    if (contactsStore) {
      this.syncCustomNamesFromContacts(contactsStore);
      this.syncAddedFromContacts(contactsStore);
    }
    const scored = this.characters
      .map((c) => {
        const merged = mergeCharacterWithState(c, this.state);
        const nameScore = this._calcNameMatchScore(merged, q);
        const otherScore = this._calcOtherMatchScore(merged, q);
        return { merged, nameScore, otherScore, score: nameScore + otherScore };
      })
      .filter((x) => x.score > 0)
      .filter((x) => !x.merged.isAdded)
      .filter((x) => !this._shouldExcludeByCustomName(x.merged));

    const hasNameMatches = scored.some((x) => x.nameScore > 0);
    const filtered = hasNameMatches ? scored.filter((x) => x.nameScore > 0) : scored;

    filtered.sort((a, b) => {
      if (b.nameScore !== a.nameScore) return b.nameScore - a.nameScore;
      if (b.otherScore !== a.otherScore) return b.otherScore - a.otherScore;
      return (Number(b.merged.popularity || 0) || 0) - (Number(a.merged.popularity || 0) || 0);
    });

    return filtered.slice(0, Math.max(1, limit)).map((x) => x.merged);
  }
}
